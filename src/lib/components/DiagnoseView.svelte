<!-- src/lib/components/DiagnoseView.svelte -->
<!-- Investigate view surface; internal diagnose route/component names remain. -->
<!-- For the rail-focused endpoint: horizontal phase-bar waterfall (dns /     -->
<!-- tcp / tls / ttfb / transfer) in P50 or P95 mode, a one-sentence phase    -->
<!-- hypothesis, and the last 8 samples as mini phase bars. Direct entry       -->
<!-- auto-selects an investigation target when focus is missing or stale.       -->
<script lang="ts">
  import { monitoredEndpointsStore } from '$lib/stores/derived';
  import { navigateTo, currentRoute, subscribeRoute, type RouteState } from '$lib/router';
  import { companionStore } from '$lib/stores/companion';
  import { ENDPOINT_TONE_PILL_LABEL, deriveEndpointTone } from '$lib/utils/endpoint-tone';
  import IntelligencePanel from '$lib/components/IntelligencePanel.svelte';
  import LocalProofPanel from '$lib/components/LocalProofPanel.svelte';
  import { bufferbloatStore } from '$lib/stores/bufferbloat';
  import { measurementStore } from '$lib/stores/measurements';
  import { networkContextStore } from '$lib/stores/network-context';
  import { remoteVantageStore } from '$lib/stores/remote-vantage';
  import { settingsStore } from '$lib/stores/settings';
  import { statisticsStore } from '$lib/stores/statistics';
  import { uiStore } from '$lib/stores/ui';
  import { buildRemoteVantageInsight } from '$lib/remote-vantage/insight';
  import { describeTimingVisibility, type DiagnosticConfidence } from '$lib/utils/diagnostic-narrative';
  import { phaseHypothesis, PHASE_LABELS, type PhaseBreakdown, type Tier2Phase } from '$lib/utils/verdict';
  import { buildDistributionEmptyMessage, buildHistogram, buildCorrelation } from '$lib/utils/diagnose-stats';
  import { fmt, compactUrlLabel, axisEdgeLabel, binLabel } from '$lib/utils/format';
  import { selectInvestigationEndpointId } from '$lib/utils/status-intent';
  import { tokens } from '$lib/tokens';
  import type { MeasurementSample } from '$lib/types';

  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const measurements = $derived($measurementStore);
  const settings = $derived($settingsStore);
  const bufferbloat = $derived($bufferbloatStore);
  const networkContext = $derived($networkContextStore);
  const remoteVantage = $derived($remoteVantageStore);
  const focusedId = $derived($uiStore.focusedEndpointId);

  const focusedEndpoint = $derived(
    focusedId === null ? null : monitored.find((ep) => ep.id === focusedId) ?? null,
  );
  const focusedEndpointUrlLabel = $derived(focusedEndpoint ? compactUrlLabel(focusedEndpoint.url) : '');

  // Track the router state so we can distinguish /investigate (landing) from
  // /endpoint/:id (focused deep-dive). The router only writes
  // focusedEndpointId when route is 'endpoint'; the landing surface lives
  // when route is 'investigate'. Subscribing so popstate / back-forward
  // updates re-render correctly.
  let route = $state<RouteState>(currentRoute());
  $effect(() => {
    const off = subscribeRoute((next) => { route = next; });
    return off;
  });
  const isEndpointRoute = $derived(route.name === 'endpoint');

  $effect(() => {
    // Auto-focus an endpoint only when the URL says /endpoint/* (PR 8 of
    // synthesis arc). On /investigate landing, leave focusedEndpointId null
    // so the two-column landing renders. The user explicitly opts into a
    // focused detail by clicking an endpoint card → navigateTo({
    //   name: 'endpoint', endpointId
    // }).
    if (!isEndpointRoute) return;
    if ($uiStore.activeView !== 'diagnose') return;
    const next = selectInvestigationEndpointId({
      monitored,
      stats,
      measurements,
      currentFocusedId: focusedId,
    });
    if (next !== null && next !== focusedId) {
      uiStore.setFocusedEndpoint(next);
    }
  });

  // Landing-view derivations (per endpoint card).
  interface LandingCard {
    readonly endpoint: typeof monitored[number];
    readonly tone: ReturnType<typeof deriveEndpointTone>;
    readonly pillLabel: string;
    readonly latencyMs: string;
    readonly jitterMs: string;
    readonly failPct: string;
    readonly visibilityLevel: 'none' | 'total-only' | 'mixed' | 'phase';
  }
  const landingCards: readonly LandingCard[] = $derived.by(() => (
    monitored.map((ep): LandingCard => {
      const epStats = stats[ep.id] ?? null;
      const epState = measurements.endpoints[ep.id];
      const lastStatus = epState?.lastStatus ?? null;
      const tone = deriveEndpointTone({
        stats: epStats,
        lastStatus,
        healthThreshold: settings.healthThreshold,
      });
      const allSamples = epState?.samples.toArray() ?? [];
      const vis = describeTimingVisibility(allSamples, settings.corsMode);
      return {
        endpoint: ep,
        tone,
        pillLabel: ENDPOINT_TONE_PILL_LABEL[tone],
        latencyMs: epStats?.ready ? `${fmt(epStats.p50)} ms` : '—',
        jitterMs: epStats?.ready ? `${fmt(epStats.stddev)} ms` : '—',
        failPct: epStats?.ready ? `${epStats.lossPercent.toFixed(1)}%` : '—',
        visibilityLevel: vis.level,
      };
    })
  ));

  const remoteVantageStatus = $derived($remoteVantageStore.status);
  const companionInstalled = $derived($companionStore.hasSecret === true);

  function handleEndpointCardClick(endpointId: string): void {
    navigateTo({ name: 'endpoint', endpointId });
  }

  function handleRunOutsideCheck(): void {
    // Defer to the existing remote-vantage flow — the spec wires this card
    // to the same probe the focused-detail Outside Check button uses.
    // The landing button runs the probe across ALL monitored endpoints
    // (the underlying API accepts a list), so the user gets a global check
    // rather than committing to one endpoint first.
    if (monitored.length > 0) {
      void remoteVantageStore.runProbe(monitored);
    }
  }

  const focusedStats = $derived(focusedEndpoint ? stats[focusedEndpoint.id] : undefined);
  const remoteInsight = $derived(buildRemoteVantageInsight({
    endpoint: focusedEndpoint,
    stats: focusedStats,
    threshold: settings.healthThreshold,
    probe: remoteVantage.lastProbe,
  }));
  const bufferbloatBusy = $derived(bufferbloat.status === 'running');
  const networkContextBusy = $derived(networkContext.status === 'running');
  const focusedHostname = $derived(focusedEndpoint ? hostnameFromUrl(focusedEndpoint.url) : null);
  const networkContextMatchesFocus = $derived(Boolean(
    focusedHostname && networkContext.hostname === focusedHostname,
  ));
  const networkContextDnsInsight = $derived(networkContextMatchesFocus ? networkContext.dnsInsight : null);
  const networkContextTopologyInsight = $derived(networkContextMatchesFocus ? networkContext.topologyInsight : null);
  const networkContextDnsError = $derived(networkContextMatchesFocus ? networkContext.dnsError : null);
  const networkContextTopologyError = $derived(networkContextMatchesFocus ? networkContext.topologyError : null);
  const networkContextError = $derived(networkContextMatchesFocus ? networkContext.error : null);
  const bufferbloatStatusLabel = $derived.by(() => {
    if (bufferbloat.status === 'running') return 'Running';
    if (bufferbloat.status === 'stopped') return 'Stopped';
    switch (bufferbloat.grade.grade) {
      case 'clean':
        return 'Clean';
      case 'watch':
        return 'Watch';
      case 'loaded-latency-high':
        return 'High';
      case 'insufficient-data':
        return bufferbloat.status === 'error' ? 'Needs data' : 'Not run';
    }
  });
  const remoteBusy = $derived(remoteVantage.status === 'checking' || remoteVantage.status === 'probing');

  // ── Mode toggle ──────────────────────────────────────────────────────────
  let mode = $state<'p50' | 'p95'>('p50');
  let localProofOpen = $state(false);

  // ── Phase breakdown (adapt EndpointStatistics field names → Diagnose phase
  // vocabulary). P50 uses tier2Averages (means); P95 uses tier2P95.
  const phases: PhaseBreakdown | null = $derived.by(() => {
    if (!focusedStats) return null;
    const src = mode === 'p50' ? focusedStats.tier2Averages : focusedStats.tier2P95;
    if (!src) return null;
    return {
      dns:      src.dnsLookup,
      tcp:      src.tcpConnect,
      tls:      src.tlsHandshake,
      ttfb:     src.ttfb,
      transfer: src.contentTransfer,
    };
  });
  const phaseTotal = $derived(
    phases === null ? 0 : phases.dns + phases.tcp + phases.tls + phases.ttfb + phases.transfer,
  );
  const hasVisiblePhases = $derived(phases !== null && phaseTotal > 0);
  const hypothesis = $derived(phases === null ? null : phaseHypothesis(phases));

  // ── Segments with computed widths for the hero bar ───────────────────────
  const PHASE_ORDER: readonly Tier2Phase[] = ['dns', 'tcp', 'tls', 'ttfb', 'transfer'];
  const PHASE_COLORS: Record<Tier2Phase, string> = {
    dns:      tokens.color.tier2.dns,
    tcp:      tokens.color.tier2.tcp,
    tls:      tokens.color.tier2.tls,
    ttfb:     tokens.color.tier2.ttfb,
    transfer: tokens.color.tier2.transfer,
  };
  const SHORT_LABELS: Record<Tier2Phase, string> = {
    dns:      'DNS',
    tcp:      'TCP',
    tls:      'TLS',
    ttfb:     'SERVER',
    transfer: 'TRANSFER',
  };

  interface Segment { phase: Tier2Phase; ms: number; pctWidth: number; color: string; short: string; pct: number; dominant: boolean; }
  const segments: readonly Segment[] = $derived.by(() => {
    if (phases === null || phaseTotal <= 0) return [];
    return PHASE_ORDER.map((phase) => {
      const ms = phases[phase];
      return {
        phase,
        ms,
        pctWidth: (ms / phaseTotal) * 100,
        color: PHASE_COLORS[phase],
        short: SHORT_LABELS[phase],
        pct: ms / phaseTotal,
        // Use dominantPhases set membership (not verdictPhase equality) so the
        // pair-dominance branch — which reports verdictPhase === 'mixed' — still
        // lights up both cited phases.
        dominant: hypothesis !== null && hypothesis.dominantPhases.includes(phase),
      };
    });
  });

  // ── Sample strip — last 8 samples, each a mini stacked bar ───────────────
  const recentSamples: readonly MeasurementSample[] = $derived.by(() => {
    if (!focusedEndpoint) return [];
    const m = measurements.endpoints[focusedEndpoint.id];
    if (!m) return [];
    return m.samples.toArray().slice(-8);
  });

  // ── Histogram of focused endpoint's recent latency distribution ───────────
  // Last 50 samples — long enough to be statistically meaningful, short enough
  // to reflect "current" behavior rather than the whole session.
  const focusedAllSamples: readonly MeasurementSample[] = $derived.by(() => {
    if (!focusedEndpoint) return [];
    const m = measurements.endpoints[focusedEndpoint.id];
    if (!m) return [];
    return m.samples.toArray().slice(-50);
  });
  const histogram = $derived(buildHistogram(focusedAllSamples));
  const distributionEmptyMessage = $derived(buildDistributionEmptyMessage(
    focusedAllSamples,
    settings.healthThreshold,
  ));

  // p50 / p95 / spread — recompute locally so the histogram and the readout
  // share a single source of truth (focusedStats may use a different window).
  const distroStats = $derived.by(() => {
    const oks: number[] = [];
    for (const s of focusedAllSamples) if (s.status === 'ok' && typeof s.latency === 'number') oks.push(s.latency);
    if (oks.length === 0) return null;
    const sorted = [...oks].sort((a, b) => a - b);
    const pickQ = (q: number): number => {
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
      // sorted is non-empty (checked above), and idx is clamped, so a default of 0 is unreachable.
      return sorted[idx] ?? 0;
    };
    const p50 = pickQ(0.5);
    const p95 = pickQ(0.95);
    return { p50, p95, spread: p50 > 0 ? p95 / p50 : 0, n: oks.length };
  });

  // ── Cross-endpoint correlation grid ─────────────────────────────────────
  // For each enabled endpoint, build a per-round comparison so the user can
  // see whether focused-endpoint spikes are limited to this browser-visible
  // row or occur at the same time as comparison endpoints.
  const correlation = $derived.by(() => {
    if (!focusedEndpoint) return null;
    const others = monitored
      .filter(ep => ep.id !== focusedEndpoint.id)
      .map(ep => ({
        id: ep.id,
        label: ep.label,
        samples: measurements.endpoints[ep.id]?.samples.toArray().slice(-16) ?? [],
      }));
    return buildCorrelation(
      {
        id: focusedEndpoint.id,
        label: focusedEndpoint.label,
        samples: measurements.endpoints[focusedEndpoint.id]?.samples.toArray().slice(-16) ?? [],
      },
      others,
      16,
      { slowThresholdMs: settings.healthThreshold },
    );
  });

  const timingVisibility = $derived(describeTimingVisibility(focusedAllSamples, settings.corsMode));

  // ── Browser Visibility ghost-rows panel (PR 3 of synthesis arc) ──────────
  // Per the synthesis design contract, the Browser Visibility panel renders
  // DNS / TCP / TLS / TTFB as visible rows even when the browser cannot give
  // us per-phase values. This makes the limit structural — "here are the rows
  // we would have shown, here is why each one is empty" — rather than only a
  // paragraph of prose.
  //
  // Chip-label and per-row state are driven by TimingVisibility.level:
  //   - 'none' (no successful samples yet) → COLLECTING chip, rows show
  //     "Collecting" at full opacity. No ghost treatment — we don't yet know
  //     whether visibility will land at hidden, partial, or full.
  //   - 'total-only' (samples exist, none expose phase data) → HIDDEN BY
  //     SERVER chip, rows show "Hidden" at 40% opacity (data-hidden="true").
  //   - 'mixed' and 'phase' do NOT reach this branch in DiagnoseView because
  //     hasVisiblePhases gates to the waterfall path above. The per-phase
  //     ghost-row treatment for 'mixed' lands in PR 7's dedicated
  //     EndpointDetail Browser Visibility panel.
  const VISIBILITY_PHASES: readonly { key: Tier2Phase; label: string }[] = [
    { key: 'dns', label: 'DNS Lookup' },
    { key: 'tcp', label: 'TCP Handshake' },
    { key: 'tls', label: 'TLS Negotiation' },
    { key: 'ttfb', label: 'Time to First Byte' },
  ];
  const visibilityChipLabel = $derived.by(() => {
    switch (timingVisibility.level) {
      case 'none': return 'COLLECTING';
      case 'total-only': return 'HIDDEN BY SERVER';
      case 'mixed': return 'PARTIAL VISIBILITY';
      case 'phase': return 'FULL VISIBILITY';
    }
  });
  const ghostRowsHidden = $derived(
    timingVisibility.level === 'total-only' || timingVisibility.level === 'mixed',
  );

  const diagnoseConfidence: DiagnosticConfidence = $derived.by(() => {
    if (!focusedEndpoint || !distroStats) return 'low';
    if (distroStats.n < 8) return 'low';
    if (monitored.length >= 3 && distroStats.n >= 16) return 'high';
    return 'medium';
  });
  const diagnoseConfidenceReason = $derived.by(() => {
    if (!focusedEndpoint || !distroStats) return 'Waiting for successful samples on the focused endpoint.';
    const comparatorCount = Math.max(0, monitored.length - 1);
    if (distroStats.n < 8) return `${distroStats.n} successful samples so far; spike comparison needs more history.`;
    if (comparatorCount < 2) return `Only ${comparatorCount} comparison endpoint${comparatorCount === 1 ? '' : 's'} enabled.`;
    return `${distroStats.n} focused samples with ${comparatorCount} comparison endpoints.`;
  });
  const browserFactSummary = $derived.by(() => {
    if (!focusedEndpoint) return 'Select an endpoint to see browser-measured facts.';
    if (!distroStats) return 'Chronoscope is waiting for successful browser samples on this endpoint.';
    return `Browser median is ${fmt(distroStats.p50)} ms and p95 is ${fmt(distroStats.p95)} ms over ${distroStats.n} successful sample${distroStats.n === 1 ? '' : 's'}.`;
  });
  const browserInterpretation = $derived(
    correlation?.verdict.headline ?? 'Collecting comparison data before interpreting this endpoint.',
  );

  interface SampleRow { round: number; total: number; segs: { phase: Tier2Phase; pctWidth: number; color: string; }[]; status: 'ok' | 'timeout' | 'error' | 'phase-unavailable'; }
  const sampleRows: readonly SampleRow[] = $derived.by(() => {
    return recentSamples.map((s) => {
      if (s.status !== 'ok') {
        return { round: s.round, total: s.latency ?? 0, segs: [], status: s.status };
      }
      const t2 = s.tier2;
      if (!t2 || s.timingFallback) {
        return { round: s.round, total: s.latency, segs: [], status: 'phase-unavailable' as const };
      }
      const total = t2.dnsLookup + t2.tcpConnect + t2.tlsHandshake + t2.ttfb + t2.contentTransfer;
      if (total <= 0) {
        return { round: s.round, total: s.latency, segs: [], status: 'phase-unavailable' as const };
      }
      const segs = PHASE_ORDER.map((phase) => {
        const ms = phase === 'dns' ? t2.dnsLookup
                 : phase === 'tcp' ? t2.tcpConnect
                 : phase === 'tls' ? t2.tlsHandshake
                 : phase === 'ttfb' ? t2.ttfb
                 : t2.contentTransfer;
        return { phase, pctWidth: (ms / total) * 100, color: PHASE_COLORS[phase] };
      });
      return { round: s.round, total, segs, status: 'ok' as const };
    });
  });

  function handleBack(): void {
    // Back-to-live: keep the focused endpoint but flip the view.
    navigateTo({ name: 'live', endpointId: null });
  }

  function handleBackToInvestigate(): void {
    // Back-to-Investigate-landing: leaves /endpoint/:id and lands on the
    // two-column landing view. Router clearing rule: focusedEndpointId is
    // NOT cleared by navigateTo when the new route isn't 'endpoint' — the
    // landing view picks its display state from the URL/route, not from
    // focusedEndpointId.
    navigateTo({ name: 'investigate', endpointId: null });
  }

  function handleSelectMode(next: 'p50' | 'p95'): void {
    mode = next;
  }

  async function handleRemoteCheck(): Promise<void> {
    await remoteVantageStore.runProbe(focusedEndpoint ? [focusedEndpoint] : monitored);
  }

  async function handleLoadedLatencyCheck(): Promise<void> {
    if (!focusedEndpoint) return;
    await bufferbloatStore.run({
      endpoint: focusedEndpoint,
      idleSamples: focusedAllSamples,
      settings: {
        corsMode: settings.corsMode,
        timeout: settings.timeout,
      },
    });
  }

  function handleLoadedLatencyStop(): void {
    bufferbloatStore.stop();
  }

  async function handleNetworkContextCheck(): Promise<void> {
    if (!focusedEndpoint) return;
    await networkContextStore.run(focusedEndpoint);
  }

  function handleOpenLocalProof(): void {
    localProofOpen = true;
  }

  function handleCloseLocalProof(): void {
    localProofOpen = false;
  }

  function handleOpenSettings(): void {
    uiStore.toggleSettings();
  }

  function hostnameFromUrl(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  function loadedLatencyMetric(value: number | null): string {
    return value === null ? '—' : `${fmt(value)} ms`;
  }

  // ── Accessibility summary for the hero bar ────────────────────────────────
  const heroAria = $derived(
    phases === null || !hasVisiblePhases
      ? 'Request waterfall — no tier-2 data available.'
      : `Request waterfall for ${focusedEndpoint?.label ?? 'focused endpoint'} at ${mode.toUpperCase()}: ${segments.map((s) => `${PHASE_LABELS[s.phase]} ${Math.round(s.ms)} ms`).join(', ')}. Total ${Math.round(phaseTotal)} ms.`
  );
</script>

<section class="diagnose diagnose-surface" aria-label="Investigate">
  <header class="diagnose-header diagnose-hero">
    <div class="diagnose-title-block">
      <div class="diagnose-kicker">Investigate · Distribution and correlation</div>
      <h1 class="diagnose-title">
        {#if focusedEndpoint}
          <span class="diagnose-title-pip" style:background={focusedEndpoint.color || tokens.color.endpoint[0]} aria-hidden="true"></span>
          <span class="diagnose-title-name">{focusedEndpoint.label}</span>
          <span
            class="diagnose-title-url"
            title={focusedEndpoint.url}
            aria-label={focusedEndpoint.url}
          >{focusedEndpointUrlLabel}</span>
        {:else}
          <span class="diagnose-title-placeholder">—</span>
        {/if}
      </h1>
    </div>

    {#if focusedEndpoint}
      <div class="diagnose-actions">
        <button
          type="button" class="diagnose-chip diagnose-chip-action"
          onclick={handleBackToInvestigate}
          aria-label="Back to Investigate"
        >← Back to Investigate</button>
        <button
          type="button" class="diagnose-chip diagnose-chip-action"
          onclick={handleBack}
          aria-label="Back to live"
        >← Back to Live</button>
      </div>
    {/if}
  </header>

  {#if monitored.length === 0}
    <div class="diagnose-empty" role="note">
      <p class="diagnose-empty-title">Enable an endpoint to investigate it closely.</p>
      <p class="diagnose-empty-hint">Chronoscope needs at least one monitored endpoint before it can compare distribution and correlation evidence.</p>
    </div>
  {:else if !focusedEndpoint}
    <!-- Investigate landing (PR 8 of synthesis arc).
         Two-column composition: left = "what we can see from this browser"
         per endpoint; right = "what needs outside validation". The user
         clicks an endpoint card to drill into /endpoint/:id (the focused
         detail surface owned by the existing focused-endpoint branch
         below). Wire matches the spec's anatomy table in Section 4. -->
    <div class="investigate-landing" role="region" aria-label="Investigate landing">
      <section class="measured-column" aria-label="Measured from your browser">
        <header class="landing-col-header">
          <p class="landing-kicker">MEASURED FROM YOUR BROWSER</p>
          <p class="landing-subtitle">What we can definitively see from your current environment.</p>
        </header>
        <ul class="endpoint-cards">
          {#each landingCards as card (card.endpoint.id)}
            <li>
              <button
                type="button"
                class="endpoint-card"
                data-endpoint-id={card.endpoint.id}
                data-tone={card.tone}
                aria-label="View {card.endpoint.label} details"
                onclick={() => handleEndpointCardClick(card.endpoint.id)}
              >
                <div class="endpoint-card-row">
                  <span class="endpoint-card-name">{card.endpoint.label}</span>
                  <span class="endpoint-card-pill">{card.pillLabel}</span>
                </div>
                <div class="endpoint-card-metrics">
                  <div class="endpoint-card-metric">
                    <span class="endpoint-card-metric-label">LATENCY</span>
                    <span class="endpoint-card-metric-value">{card.latencyMs}</span>
                  </div>
                  <div class="endpoint-card-metric">
                    <span class="endpoint-card-metric-label">JITTER</span>
                    <span class="endpoint-card-metric-value">{card.jitterMs}</span>
                  </div>
                  <div class="endpoint-card-metric">
                    <span class="endpoint-card-metric-label">FAILURES</span>
                    <span class="endpoint-card-metric-value">{card.failPct}</span>
                  </div>
                </div>
                <div class="endpoint-card-visibility" data-visibility-level={card.visibilityLevel}>
                  {#if card.visibilityLevel === 'none'}
                    COLLECTING
                  {:else if card.visibilityLevel === 'total-only'}
                    HIDDEN BY SERVER
                  {:else if card.visibilityLevel === 'mixed'}
                    PARTIAL VISIBILITY
                  {:else}
                    FULL VISIBILITY
                  {/if}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <section class="validation-column" aria-label="Needs outside validation">
        <header class="landing-col-header">
          <p class="landing-kicker">NEEDS OUTSIDE VALIDATION</p>
          <p class="landing-subtitle">Data required to prove whether the issue is local to you.</p>
        </header>
        <div class="validation-card">
          <h3 class="validation-card-title">Check from Outside Vantage Points</h3>
          <p class="validation-card-detail">
            Right now we only know what your specific browser is experiencing.
            An outside check will prove if this slowness happens to everyone
            globally, or just your local connection.
          </p>
          <button
            type="button"
            class="validation-card-cta"
            disabled={monitored.length === 0 || remoteVantageStatus === 'probing' || remoteVantageStatus === 'checking'}
            onclick={handleRunOutsideCheck}
          >
            {remoteVantageStatus === 'probing' ? 'Running…' : 'Run global test'}
          </button>
        </div>

        <div class="validation-card" data-state={companionInstalled ? 'installed' : 'not-installed'}>
          <h3 class="validation-card-title">
            Check with Local Agent
            {#if !companionInstalled}
              <span class="validation-card-flag">NOT INSTALLED</span>
            {/if}
          </h3>
          <p class="validation-card-detail">
            A desktop agent can bypass browser security limits to measure precise
            TCP / TLS times and network routing directly from your machine.
          </p>
        </div>

        <aside class="why-separate-callout" aria-label="Why we separate facts from interpretation">
          <p>
            <strong>Why do we separate this?</strong> We measure latency, but we
            never guess the root cause without proof. Separating facts from
            interpretation prevents falsely blaming your ISP or a specific server.
          </p>
        </aside>
      </section>
    </div>
  {:else}
    <section class="diagnose-answer diagnose-brief" aria-label="Diagnostic answer">
      <div class="diagnose-brief-score" aria-hidden="true">
        <span class="diagnose-brief-score-value">{distroStats ? fmt(distroStats.p50) : '—'}</span>
        <span class="diagnose-brief-score-label">ms p50</span>
      </div>
      <div class="diagnose-brief-copy">
        <div class="diagnose-section-kicker">Diagnostic answer</div>
        <div class="diagnose-answer-top">
          <span
            class="diagnose-confidence"
            class:low={diagnoseConfidence === 'low'}
            class:medium={diagnoseConfidence === 'medium'}
            class:high={diagnoseConfidence === 'high'}
            title={diagnoseConfidenceReason}
          >{diagnoseConfidence} confidence</span>
          <p class="diagnose-answer-headline">{browserInterpretation}</p>
        </div>
        <p class="diagnose-answer-fact"><strong>Measured fact:</strong> {browserFactSummary}</p>
        <p class="diagnose-answer-interpretation"><strong>Interpretation:</strong> {browserInterpretation}</p>
        <dl class="diagnose-answer-evidence">
          <div>
            <dt>Samples</dt>
            <dd>{distroStats?.n ?? 0}</dd>
          </div>
          <div>
            <dt>Comparators</dt>
            <dd>{Math.max(0, monitored.length - 1)}</dd>
          </div>
          <div>
            <dt>Visibility</dt>
            <dd>{timingVisibility.headline}</dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="diagnose-evidence-layout diagnose-proof-grid">
      <section class="diagnose-facts-stack" aria-label="Measured browser facts">
        <div class="diagnose-column-head">
          <div class="diagnose-section-kicker">Measured browser facts</div>
          <p>Facts Chronoscope can directly measure in this browser session.</p>
        </div>

        <section class="diagnose-distro" aria-label="Latency distribution">
          <div class="diagnose-section-kicker">Distribution</div>
          {#if distroStats && histogram.bins.length > 0}
            <div class="distro-stats">
              <span class="distro-stat"><span class="distro-stat-label">p50</span> {fmt(distroStats.p50)} ms</span>
              <span class="distro-stat"><span class="distro-stat-label">p95</span> {fmt(distroStats.p95)} ms</span>
              <span class="distro-stat"><span class="distro-stat-label">spread</span> {distroStats.spread.toFixed(1)}×</span>
              <span class="distro-stat-meta">over last {distroStats.n} samples</span>
            </div>
            <div
              class="distro-chart"
              role="img"
              aria-label="Latency histogram (log scale) across last {distroStats.n} samples"
            >
              {#each histogram.bins as bin, i (i)}
                <div
                  class="distro-bin"
                  title="{binLabel(bin)} · {bin.count} sample{bin.count === 1 ? '' : 's'}"
                >
                  <div
                    class="distro-bar"
                    style:height="{histogram.maxCount > 0 ? (bin.count / histogram.maxCount) * 100 : 0}%"
                  ></div>
                </div>
              {/each}
            </div>
            <div class="distro-axis" aria-hidden="true">
              {#if histogram.bins.length > 0}
                {@const firstBin = histogram.bins[0]}
                {@const lastBin = histogram.bins[histogram.bins.length - 1]}
                <span>
                  {#if firstBin && firstBin.fromMs <= 0}
                    &lt;{axisEdgeLabel(firstBin.toMs)}
                  {:else if firstBin}
                    {axisEdgeLabel(firstBin.fromMs)}
                  {/if}
                </span>
                <span>
                  {#if lastBin && !Number.isFinite(lastBin.toMs)}
                    ≥{axisEdgeLabel(lastBin.fromMs)}
                  {:else if lastBin}
                    {axisEdgeLabel(lastBin.toMs)}
                  {/if}
                </span>
              {/if}
            </div>
          {:else}
            <p class="distro-empty">{distributionEmptyMessage}</p>
          {/if}
        </section>

        <section class="diagnose-visibility" aria-label="Browser visibility">
          <div class="diagnose-section-kicker">Browser visibility</div>
          <p class="visibility-headline">{timingVisibility.headline}</p>
          <p class="visibility-detail">{timingVisibility.detail}</p>
          {#if timingVisibility.action}
            <p class="visibility-action">{timingVisibility.action}</p>
          {/if}
        </section>

        {#if correlation}
          <section class="diagnose-correlation" aria-label="Cross-endpoint comparison">
            <div class="diagnose-section-kicker">Compare with other endpoints</div>
            <p class="correlation-headline">{correlation.verdict.headline}</p>
            {#if correlation.rows[0]?.cells.length > 0}
              <div class="correlation-grid" role="table" aria-label="Per-round latency across endpoints">
                {#each correlation.rows as row, rowIdx (row.endpointId)}
                  <div class="correlation-row" class:focused={rowIdx === 0} role="row">
                    <span class="correlation-label" role="rowheader">{row.label}</span>
                    <div class="correlation-cells">
                      {#each row.cells as cell (cell.round)}
                        <span
                          class="correlation-cell"
                          class:spike={cell.isSpike}
                          class:missing={cell.latencyMs === null}
                          title="R{cell.round}{cell.latencyMs !== null ? ` · ${fmt(cell.latencyMs)} ms${cell.isSpike ? ' (spike)' : ''}` : ' · no data'}"
                          role="cell"
                        ></span>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
              <p class="correlation-legend" aria-hidden="true">
                <span class="correlation-legend-swatch correlation-legend-normal"></span> normal
                <span class="correlation-legend-swatch correlation-legend-spike"></span> spike (>1.5× this endpoint's median)
                <span class="correlation-legend-swatch correlation-legend-missing"></span> no data
              </p>
            {/if}
          </section>
        {/if}

        {#if phases !== null}
          <details class="diagnose-phases">
            <summary>
              <span class="diagnose-section-kicker">Phase breakdown (advanced)</span>
              <span class="phases-summary-hint">DNS · TCP · TLS · Server · Transfer</span>
            </summary>
            <div class="diagnose-segment" role="group" aria-label="Percentile mode">
              <button
                type="button" class="diagnose-chip"
                class:on={mode === 'p50'} aria-pressed={mode === 'p50'}
                onclick={() => handleSelectMode('p50')}
              >P50</button>
              <button
                type="button" class="diagnose-chip"
                class:on={mode === 'p95'} aria-pressed={mode === 'p95'}
                onclick={() => handleSelectMode('p95')}
              >P95</button>
            </div>
            {#if hasVisiblePhases}
              <div class="diagnose-waterfall" role="img" aria-label={heroAria}>
                <div class="diagnose-bar">
                  {#each segments as seg (seg.phase)}
                    <div
                      class="diagnose-bar-seg"
                      class:dominant={seg.dominant}
                      style:width="{seg.pctWidth}%"
                      style:background={seg.color}
                    >
                      {#if seg.pctWidth >= 8}
                        <span class="diagnose-bar-label" style:color={tokens.color.tier2.labelText}>
                          {seg.short} · {fmt(seg.ms)}<span class="diagnose-bar-ms">ms</span>
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
                <div class="diagnose-bar-scale">
                  {#each segments as seg (seg.phase)}
                    <span class="diagnose-bar-tick" style:flex="{seg.pctWidth}">
                      <span class="diagnose-bar-tick-label">{seg.short}</span>
                    </span>
                  {/each}
                </div>
              </div>
            {:else}
              <!-- Browser Visibility ghost-rows panel (PR 3 of synthesis arc).
                   Renders DNS / TCP / TLS / TTFB as visible rows even when the
                   browser cannot give us per-phase values. This makes the
                   limit structural — "here are the rows we would have shown,
                   here is why each one is empty" — rather than a paragraph of
                   prose. See synthesis design contract Section 5 and the PR 3
                   scope for the canonical chip labels. -->
              <div class="phase-unavailable-card" role="note" aria-label="Browser timing visibility">
                <div class="visibility-chip" data-visibility-level={timingVisibility.level}>
                  {visibilityChipLabel}
                </div>
                <p class="phase-unavailable-detail">{timingVisibility.detail}</p>
                {#if timingVisibility.action}
                  <p class="phase-unavailable-action">{timingVisibility.action}</p>
                {/if}
                <ul class="visibility-rows" aria-label="Per-phase timing visibility">
                  {#each VISIBILITY_PHASES as phase (phase.key)}
                    <li
                      class="timing-row"
                      data-phase={phase.key}
                      data-hidden={ghostRowsHidden ? 'true' : 'false'}
                    >
                      <span class="timing-row-label">{phase.label}</span>
                      <span class="timing-row-value">{ghostRowsHidden ? 'Hidden' : 'Collecting'}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if hypothesis && hasVisiblePhases}
              <ul class="diagnose-evidence">
                {#each segments as seg (seg.phase)}
                  <li class="diagnose-evidence-row" class:dominant={seg.dominant}>
                    <span class="diagnose-evidence-pip" style:background={seg.color} aria-hidden="true"></span>
                    <span class="diagnose-evidence-name">{PHASE_LABELS[seg.phase]}</span>
                    <span class="diagnose-evidence-ms">{fmt(seg.ms)} ms</span>
                    <span class="diagnose-evidence-bar" aria-hidden="true">
                      <span class="diagnose-evidence-fill" style:width="{seg.pctWidth}%" style:background={seg.color}></span>
                    </span>
                    <span class="diagnose-evidence-pct">{Math.round(seg.pct * 100)}%</span>
                  </li>
                {/each}
              </ul>
              <p class="phases-caveat">
                On warm-connection samples the browser reports zero for DNS/TCP/TLS — only TTFB and Transfer reflect per-request work. Cross-origin endpoints without <code>Timing-Allow-Origin</code> headers report only the total.
              </p>
            {/if}
          </details>
        {/if}

        {#if recentSamples.length > 0}
          <section class="diagnose-samples" aria-label="Recent samples">
            <div class="diagnose-hypothesis-kicker">Last {recentSamples.length} sample{recentSamples.length === 1 ? '' : 's'}</div>
            <table class="diagnose-sample-table">
              <thead class="sr-only">
                <tr><th>Round</th><th>Phase breakdown</th><th>Total</th></tr>
              </thead>
              <tbody>
                {#each sampleRows as row (row.round)}
                  <tr class="diagnose-sample-row">
                    <td class="diagnose-sample-round">R{row.round}</td>
                    <td class="diagnose-sample-bar-cell">
                      <div class="diagnose-sample-bar">
                        {#if row.status === 'ok' && row.segs.length > 0}
                          {#each row.segs as seg (seg.phase)}
                            <span class="diagnose-sample-seg" style:width="{seg.pctWidth}%" style:background={seg.color} aria-hidden="true"></span>
                          {/each}
                        {:else if row.status === 'phase-unavailable'}
                          <span class="diagnose-sample-neutral diagnose-sample-total-only" aria-label="Phase timing unavailable">TOTAL ONLY</span>
                        {:else if row.status === 'timeout'}
                          <span class="diagnose-sample-timeout" aria-label="Timeout">TIMEOUT</span>
                        {:else}
                          <span class="diagnose-sample-timeout" aria-label="Error">ERROR</span>
                        {/if}
                      </div>
                    </td>
                    <td class="diagnose-sample-total">{fmt(row.total)} ms</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}
      </section>

      <section class="diagnose-proof-stack" aria-label="Next proof actions">
        <div class="diagnose-column-head">
          <div class="diagnose-section-kicker">Next proof actions</div>
          <p>Checks that reduce uncertainty without changing the browser facts.</p>
        </div>

        <section
          class="diagnose-remote"
          class:local-path={remoteInsight.status === 'local-path'}
          class:remote-confirms={remoteInsight.status === 'remote-confirms' || remoteInsight.status === 'remote-error'}
          aria-label="Remote vantage"
        >
          <div class="remote-head">
            <div>
              <div class="diagnose-section-kicker">Remote vantage</div>
              <p class="remote-headline">{remoteInsight.headline}</p>
            </div>
            <button
              type="button"
              class="diagnose-chip diagnose-chip-action"
              disabled={remoteBusy}
              aria-disabled={remoteBusy}
              onclick={handleRemoteCheck}
            >
              {remoteBusy ? 'Checking…' : 'Check from Cloudflare'}
            </button>
          </div>
          <p class="remote-detail">{remoteInsight.detail}</p>
          <dl class="remote-evidence">
            <div>
              <dt>Edge</dt>
              <dd>{remoteInsight.edgeLabel}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{remoteInsight.result?.status ?? '—'}</dd>
            </div>
            <div>
              <dt>Remote time</dt>
              <dd>{remoteInsight.result ? `${fmt(remoteInsight.result.durationMs)} ms` : '—'}</dd>
            </div>
          </dl>
          {#if remoteVantage.error}
            <p class="remote-error">{remoteVantage.error}</p>
          {:else}
            <p class="remote-action">{remoteInsight.action}</p>
          {/if}
        </section>

        <section
          class="diagnose-loaded"
          class:clean={bufferbloat.grade.grade === 'clean'}
          class:watch={bufferbloat.grade.grade === 'watch'}
          class:high={bufferbloat.grade.grade === 'loaded-latency-high'}
          aria-label="Loaded latency"
        >
          <div class="loaded-head">
            <div>
              <div class="diagnose-section-kicker">Loaded latency</div>
              <p class="loaded-headline">Browser latency while the connection is busy</p>
            </div>
            {#if bufferbloatBusy}
              <button
                type="button"
                class="diagnose-chip diagnose-chip-action"
                onclick={handleLoadedLatencyStop}
              >Stop loaded check</button>
            {:else}
              <button
                type="button"
                class="diagnose-chip diagnose-chip-action"
                disabled={!distroStats}
                aria-disabled={!distroStats}
                onclick={handleLoadedLatencyCheck}
              >Run loaded check</button>
            {/if}
          </div>
          <p class="loaded-detail">
            This measures browser-visible latency while a download is running. It is loaded-latency evidence, not packet-level proof.
          </p>
          <dl class="loaded-evidence">
            <div>
              <dt>Idle median</dt>
              <dd>{loadedLatencyMetric(bufferbloat.idleMedianMs)}</dd>
            </div>
            <div>
              <dt>Loaded median</dt>
              <dd>{loadedLatencyMetric(bufferbloat.loadedMedianMs)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{bufferbloatStatusLabel}</dd>
            </div>
          </dl>
          {#if bufferbloat.error}
            <p class="loaded-error">{bufferbloat.error}</p>
          {:else if bufferbloat.status === 'running'}
            <p class="loaded-action">Downloading a bounded Cloudflare response and timing this endpoint from the browser.</p>
          {:else}
            <p class="loaded-action">{bufferbloat.grade.summary}</p>
          {/if}
        </section>

        <section class="diagnose-network-context" aria-label="Network context">
          <div class="network-context-head">
            <div>
              <div class="diagnose-section-kicker">Network context</div>
              <p class="network-context-headline">Outside resolver and public topology context</p>
            </div>
            <button
              type="button"
              class="diagnose-chip diagnose-chip-action"
              disabled={networkContextBusy}
              aria-disabled={networkContextBusy}
              onclick={handleNetworkContextCheck}
            >
              {networkContextBusy ? 'Checking…' : 'Run context check'}
            </button>
          </div>
          <p class="network-context-detail">
            This asks Cloudflare DNS-over-HTTPS and RIPEstat for the focused hostname{focusedHostname ? `, ${focusedHostname}` : ''}. It is not your local DNS path or active route proof.
          </p>
          <dl class="network-context-evidence">
            <div>
              <dt>Outside resolver</dt>
              <dd>{networkContextDnsInsight?.headline ?? networkContextDnsError ?? 'Not run'}</dd>
              {#if networkContextDnsInsight?.detail}
                <p>{networkContextDnsInsight.detail}</p>
              {/if}
            </div>
            <div>
              <dt>Public topology</dt>
              <dd>{networkContextTopologyInsight ?? networkContextTopologyError ?? 'Not run'}</dd>
            </div>
          </dl>
          {#if networkContextError}
            <p class="network-context-error">{networkContextError}</p>
          {:else if networkContext.status === 'complete' && networkContextMatchesFocus}
            <p class="network-context-action">Use this as context only; confirm path or resolver problems with local-agent evidence when needed.</p>
          {:else}
            <p class="network-context-action">No context captured for this endpoint yet.</p>
          {/if}
        </section>

        <section class="diagnose-local-proof" aria-label="Local companion proof">
          <div class="local-proof-cta-head">
            <div>
              <div class="diagnose-section-kicker">Local companion</div>
              <p class="local-proof-headline">DNS, route, TLS, and Wi-Fi evidence from this computer</p>
            </div>
            <button
              type="button"
              class="diagnose-chip diagnose-chip-action"
              aria-expanded={localProofOpen}
              onclick={localProofOpen ? handleCloseLocalProof : handleOpenLocalProof}
            >{localProofOpen ? 'Hide local companion' : 'Open local companion'}</button>
          </div>
          <p class="local-proof-detail">
            Local-only checks can capture DNS, route/MTR, TLS, and Wi-Fi evidence from this computer. Chronoscope talks to 127.0.0.1 with a signed pairing token; private Wi-Fi fields stay redacted unless enabled for a run.
          </p>
          {#if localProofOpen}
            <div class="local-proof-embed">
              <LocalProofPanel onOpenSettings={handleOpenSettings} onClose={handleCloseLocalProof} />
            </div>
          {/if}
        </section>
      </section>
    </div>

    <IntelligencePanel />
  {/if}
</section>

<style>
  .diagnose {
    width: min(100%, 1320px);
    margin: 0 auto;
    padding: clamp(24px, 4vw, 48px) clamp(16px, 4vw, 48px) 44px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-height: 0;
    overflow-y: auto;
    flex: 1;
  }

  .diagnose-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: clamp(20px, 3vw, 30px);
    border: 1px solid var(--shell-border-strong);
    border-radius: 18px;
    background:
      radial-gradient(circle at 12% 40%, var(--shell-bg-cyan), transparent 32%),
      linear-gradient(135deg, var(--shell-panel-raised), rgba(16, 23, 34, 0.72));
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.18);
  }
  .diagnose-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--accent-cyan);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  /* Section kicker — used by the Distribution / Compare / Phase breakdown
     section headers. Matches the diagnose-kicker visual rhythm but hangs off
     a sibling element rather than the title. */
  .diagnose-section-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  /* ── Distribution histogram ────────────────────────────────────────────── */
  .diagnose-distro {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: rgba(8, 14, 24, 0.62);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
  }
  .distro-stats {
    display: flex;
    align-items: baseline;
    gap: 18px;
    flex-wrap: wrap;
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t1);
  }
  .distro-stat-label {
    color: var(--t3);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    margin-right: 6px;
  }
  .distro-stat-meta {
    color: var(--t2);
    font-size: var(--ts-xs);
    margin-left: auto;
  }
  .distro-chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 96px;
    padding: 4px 0;
  }
  .distro-bin {
    flex: 1;
    display: flex;
    align-items: flex-end;
    height: 100%;
  }
  .distro-bar {
    width: 100%;
    background: linear-gradient(to top, color-mix(in srgb, var(--accent-cyan) 30%, transparent), color-mix(in srgb, var(--accent-cyan) 12%, transparent));
    border: 1px solid color-mix(in srgb, var(--accent-cyan) 40%, transparent);
    border-radius: 2px;
    min-height: 1px;
    transition: height 200ms ease;
  }
  .distro-axis {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t2);
  }
  .distro-empty {
    color: var(--t3);
    font-size: var(--ts-sm);
    margin: 0;
    padding: 8px 0;
  }

  /* ── Diagnostic answer + browser visibility ───────────────────────────── */
  .diagnose-answer,
  .diagnose-visibility,
  .diagnose-remote,
  .diagnose-loaded,
  .diagnose-network-context,
  .diagnose-local-proof {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: rgba(8, 14, 24, 0.62);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
  }
  .diagnose-brief {
    display: grid;
    grid-template-columns: minmax(138px, 0.18fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(18px, 3vw, 34px);
    padding: clamp(20px, 3vw, 30px);
    min-height: 220px;
    background:
      linear-gradient(135deg, rgba(103, 232, 249, 0.07), rgba(37, 99, 235, 0.035) 42%, rgba(255, 255, 255, 0.022)),
      var(--shell-panel-raised);
    border-color: color-mix(in srgb, var(--accent-cyan) 20%, var(--shell-border-strong));
    border-radius: 18px;
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.18);
  }
  .diagnose-brief-score {
    width: clamp(112px, 12vw, 148px);
    aspect-ratio: 1;
    justify-self: center;
    border-radius: 50%;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    color: var(--accent-cyan);
    background: rgba(103, 232, 249, 0.08);
    border: 2px solid color-mix(in srgb, var(--accent-cyan) 68%, transparent);
    box-shadow: inset 0 0 0 12px rgba(3, 7, 18, 0.88), 0 0 34px rgba(103, 232, 249, 0.16);
  }
  .diagnose-brief-score-value {
    color: var(--t1);
    font-family: var(--mono);
    font-size: 2.625rem;
    line-height: 0.95;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .diagnose-brief-score-label {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--accent-cyan);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .diagnose-brief-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .diagnose-answer-fact,
  .diagnose-answer-interpretation {
    margin: 0;
    color: var(--t2);
    font-size: var(--ts-base);
    line-height: 1.55;
  }
  .diagnose-answer-fact strong,
  .diagnose-answer-interpretation strong {
    color: var(--t1);
    font-weight: 650;
  }
  .diagnose-evidence-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.22fr) minmax(320px, 0.78fr);
    gap: 22px;
    align-items: start;
  }
  .diagnose-facts-stack,
  .diagnose-proof-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .diagnose-column-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 2px;
  }
  .diagnose-column-head .diagnose-section-kicker {
    margin-bottom: 0;
    color: var(--accent-cyan);
  }
  .diagnose-column-head p {
    margin: 0;
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }
  .diagnose-answer-top {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .diagnose-answer-headline,
  .visibility-headline,
  .visibility-detail,
  .visibility-action {
    margin: 0;
  }
  .diagnose-answer-headline {
    flex: 1 1 240px;
    min-width: 0;
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }
  .diagnose-confidence {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-mid);
    color: var(--t2);
    background: rgba(255, 255, 255, 0.035);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .diagnose-confidence.high {
    color: var(--accent-green);
    border-color: rgba(134, 239, 172, 0.24);
    background: rgba(134, 239, 172, 0.06);
  }
  .diagnose-confidence.medium {
    color: var(--accent-cyan);
    border-color: rgba(103, 232, 249, 0.24);
    background: rgba(103, 232, 249, 0.05);
  }
  .diagnose-confidence.low {
    color: var(--t3);
  }
  .diagnose-answer-evidence {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .diagnose-answer-evidence div {
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid var(--border-mid);
  }
  .diagnose-answer-evidence dt {
    margin: 0 0 3px;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }
  .diagnose-answer-evidence dd {
    margin: 0;
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .visibility-headline {
    color: var(--t1);
    font-size: var(--ts-md);
  }
  .visibility-detail,
  .visibility-action {
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }
  .visibility-action {
    color: var(--accent-cyan);
  }

  .diagnose-remote.local-path {
    border-color: rgba(103, 232, 249, 0.28);
    background: rgba(103, 232, 249, 0.04);
  }
  .diagnose-remote.remote-confirms {
    border-color: rgba(251, 191, 36, 0.28);
    background: rgba(251, 191, 36, 0.045);
  }
  .remote-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .remote-headline,
  .remote-detail,
  .remote-action,
  .remote-error {
    margin: 0;
  }
  .remote-headline {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }
  .remote-detail,
  .remote-action,
  .remote-error {
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }
  .remote-action {
    color: var(--accent-cyan);
  }
  .remote-error {
    color: var(--accent-amber);
  }
  .remote-evidence {
    margin: 0;
    display: grid;
    grid-template-columns: minmax(7.25rem, 1.2fr) minmax(4rem, 0.8fr) minmax(5rem, 1fr);
    gap: 10px;
  }
  .remote-evidence div {
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid var(--border-mid);
  }
  .remote-evidence dt {
    margin: 0 0 3px;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }
  .remote-evidence dd {
    margin: 0;
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diagnose-loaded.clean {
    border-color: rgba(134, 239, 172, 0.24);
    background: rgba(134, 239, 172, 0.035);
  }
  .diagnose-loaded.watch {
    border-color: rgba(251, 191, 36, 0.28);
    background: rgba(251, 191, 36, 0.04);
  }
  .diagnose-loaded.high {
    border-color: rgba(249, 168, 212, 0.3);
    background: rgba(249, 168, 212, 0.045);
  }
  .loaded-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .loaded-headline,
  .loaded-detail,
  .loaded-action,
  .loaded-error {
    margin: 0;
  }
  .loaded-headline {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }
  .loaded-detail,
  .loaded-action,
  .loaded-error {
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }
  .loaded-action {
    color: var(--accent-cyan);
  }
  .loaded-error {
    color: var(--accent-amber);
  }
  .loaded-evidence {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .loaded-evidence div {
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid var(--border-mid);
  }
  .loaded-evidence dt {
    margin: 0 0 3px;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }
  .loaded-evidence dd {
    margin: 0;
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .network-context-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .network-context-headline,
  .network-context-detail,
  .network-context-action,
  .network-context-error {
    margin: 0;
  }
  .network-context-headline {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }
  .network-context-detail,
  .network-context-action,
  .network-context-error,
  .network-context-evidence p {
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }
  .network-context-action {
    color: var(--accent-cyan);
  }
  .network-context-error {
    color: var(--accent-amber);
  }
  .network-context-evidence {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .network-context-evidence div {
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid var(--border-mid);
  }
  .network-context-evidence dt {
    margin: 0 0 3px;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }
  .network-context-evidence dd {
    margin: 0;
    color: var(--t1);
    font-size: var(--ts-sm);
    line-height: 1.4;
  }
  .network-context-evidence p {
    margin: 4px 0 0;
  }

  .local-proof-cta-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .local-proof-headline,
  .local-proof-detail {
    margin: 0;
  }
  .local-proof-headline {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }
  .local-proof-detail {
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }
  .local-proof-embed {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--border-mid);
  }
  .local-proof-embed :global(.local-proof-panel) {
    margin: 0;
  }

  /* ── Cross-endpoint correlation ────────────────────────────────────────── */
  .diagnose-correlation {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: rgba(8, 14, 24, 0.62);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
  }
  .correlation-headline {
    margin: 0;
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }
  .correlation-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .correlation-row {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  .correlation-label {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .correlation-row.focused .correlation-label {
    color: var(--accent-cyan);
    font-weight: 500;
  }
  .correlation-cells {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 2px;
  }
  .correlation-cell {
    height: 16px;
    background: color-mix(in srgb, var(--t1) 12%, transparent);
    border-radius: 2px;
  }
  .correlation-cell.spike {
    background: var(--accent-pink);
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent-pink) 50%, transparent);
  }
  .correlation-cell.missing {
    background: transparent;
    border: 1px dashed color-mix(in srgb, var(--t1) 12%, transparent);
  }
  .correlation-row.focused .correlation-cell:not(.spike):not(.missing) {
    background: color-mix(in srgb, var(--accent-cyan) 35%, transparent);
  }
  .correlation-legend {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 4px 0 0;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    flex-wrap: wrap;
  }
  .correlation-legend-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }
  .correlation-legend-normal { background: color-mix(in srgb, var(--t1) 12%, transparent); }
  .correlation-legend-spike { background: var(--accent-pink); }
  .correlation-legend-missing { background: transparent; border: 1px dashed color-mix(in srgb, var(--t1) 12%, transparent); }

  /* ── Phase breakdown (collapsed by default) ────────────────────────────── */
  .diagnose-phases {
    background: rgba(8, 14, 24, 0.62);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    padding: 16px;
  }
  .diagnose-phases summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .diagnose-phases summary::-webkit-details-marker { display: none; }
  .diagnose-phases summary::before {
    content: '▸';
    color: var(--t3);
    transition: transform 150ms ease;
    display: inline-block;
  }
  .diagnose-phases[open] summary::before {
    transform: rotate(90deg);
  }
  .phases-summary-hint {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
  }
  .diagnose-phases[open] > *:not(summary) {
    margin-top: 12px;
  }
  .phases-caveat {
    margin: 12px 0 0;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.025);
    border-left: 2px solid var(--t4);
    border-radius: 4px;
    color: var(--t3);
    font-size: var(--ts-xs);
    line-height: 1.5;
  }
  .phases-caveat code {
    font-family: var(--mono);
    font-size: 0.95em;
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }
  .phase-unavailable-card {
    border: 1px solid rgba(103, 232, 249, 0.16);
    border-radius: 10px;
    background: rgba(103, 232, 249, 0.055);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .phase-unavailable-detail,
  .phase-unavailable-action {
    margin: 0;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    line-height: 1.55;
    letter-spacing: 0.01em;
  }
  .phase-unavailable-action {
    color: var(--accent-cyan);
  }

  /* ── Browser Visibility chip + ghost rows (PR 3 of synthesis arc) ──────── */
  .visibility-chip {
    display: inline-flex;
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .visibility-chip[data-visibility-level='none'] {
    color: var(--accent-cyan);
    background: var(--shell-bg-cyan);
    border: 1px solid var(--shell-border-strong);
  }
  .visibility-chip[data-visibility-level='total-only'],
  .visibility-chip[data-visibility-level='mixed'] {
    color: var(--accent-amber);
    background: var(--shell-bg-amber);
    border: 1px solid var(--shell-stop-border);
  }
  .visibility-chip[data-visibility-level='phase'] {
    color: var(--accent-green);
    background: var(--shell-success-bg);
    border: 1px solid var(--shell-success-border);
  }
  .visibility-rows {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .timing-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--shell-bg-cyan);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    line-height: 1.4;
    transition: opacity 150ms ease;
  }
  .timing-row[data-hidden='true'] {
    opacity: 0.4;
  }
  .timing-row-label {
    color: var(--t2);
  }
  .timing-row-value {
    color: var(--t3);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    font-weight: 600;
  }
  .timing-row[data-hidden='false'] .timing-row-value {
    color: var(--accent-cyan);
  }
  @media (prefers-reduced-motion: reduce) {
    .timing-row { transition: none; }
  }
  .diagnose-title {
    margin: 0;
    font-size: clamp(30px, 3.6vw, 46px);
    line-height: 1.06;
    font-weight: 700;
    letter-spacing: var(--tr-tight);
    color: var(--t1);
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .diagnose-title-pip {
    width: 10px; height: 10px;
    border-radius: 50%;
    align-self: center;
    box-shadow: 0 0 6px currentColor;
  }
  .diagnose-title-url {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t3);
    font-weight: 400;
    letter-spacing: var(--tr-body);
  }
  .diagnose-title-placeholder { color: var(--t4); font-weight: 300; }

  .diagnose-actions { display: flex; align-items: center; gap: 10px; }
  .diagnose-segment {
    display: inline-flex;
    padding: 2px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 7px;
    border: 1px solid var(--border-mid);
    gap: 2px;
  }
  .diagnose-chip {
    padding: 6px 12px;
    border-radius: 5px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .diagnose-chip:hover { color: var(--t1); border-color: var(--border-bright); }
  .diagnose-chip.on {
    background: rgba(255, 255, 255, 0.08);
    color: var(--t1);
    border-color: transparent;
  }
  .diagnose-chip:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .diagnose-chip-action {
    background: rgba(8, 14, 24, 0.44);
    border: 1px solid var(--shell-border);
  }

  /* Empty states */
  .diagnose-empty {
    padding: 32px 24px;
    border: 1px dashed var(--border-mid);
    border-radius: 14px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--glass-bg-rail-hover);
  }
  .diagnose-empty-title {
    margin: 0;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-base);
    font-weight: 500;
  }
  .diagnose-empty-hint {
    margin: 0;
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    letter-spacing: 0.02em;
  }

  /* Hero waterfall */
  .diagnose-waterfall {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .diagnose-bar {
    display: flex;
    width: 100%;
    height: 80px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface-raised);
    border: 1px solid var(--border-mid);
  }
  .diagnose-bar-seg {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2px;
    position: relative;
    transition: filter 160ms ease;
  }
  .diagnose-bar-seg:hover { filter: brightness(1.1); }
  .diagnose-bar-seg.dominant {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
  }
  .diagnose-bar-label {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    white-space: nowrap;
  }
  .diagnose-bar-ms {
    font-weight: 400;
    margin-left: 2px;
    opacity: 0.8;
  }
  .diagnose-bar-scale {
    display: flex;
    gap: 0;
  }
  .diagnose-bar-tick {
    text-align: center;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
    color: var(--t4);
    text-transform: uppercase;
    min-width: 0;
  }

  .diagnose-hypothesis-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t4);
    text-transform: uppercase;
  }

  .diagnose-evidence {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .diagnose-evidence-row {
    display: grid;
    grid-template-columns: 10px 140px 80px 1fr 40px;
    gap: 10px;
    align-items: center;
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    font-variant-numeric: tabular-nums;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .diagnose-evidence-row.dominant {
    color: var(--t1);
    background: rgba(255, 255, 255, 0.03);
  }
  .diagnose-evidence-pip {
    width: 8px; height: 8px;
    border-radius: 50%;
    align-self: center;
  }
  .diagnose-evidence-name { color: inherit; }
  .diagnose-evidence-ms { color: var(--t1); }
  .diagnose-evidence-bar {
    position: relative;
    height: 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
    overflow: hidden;
  }
  .diagnose-evidence-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 3px;
  }
  .diagnose-evidence-pct {
    text-align: right;
    color: var(--t4);
    letter-spacing: var(--tr-label);
  }

  /* Samples */
  .diagnose-samples {
    background: rgba(8, 14, 24, 0.62);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .diagnose-sample-table {
    width: 100%;
    border-collapse: collapse;
  }
  .diagnose-sample-row td {
    padding: 3px 0;
    vertical-align: middle;
  }
  .diagnose-sample-round {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
    width: 58px;
  }
  .diagnose-sample-bar-cell { width: 100%; padding: 3px 10px; }
  .diagnose-sample-bar {
    display: flex;
    height: 14px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.03);
  }
  .diagnose-sample-seg { height: 100%; min-width: 1px; }
  .diagnose-sample-neutral {
    display: block;
    width: 100%; height: 100%;
    background: var(--t5, rgba(255, 255, 255, 0.07));
  }
  .diagnose-sample-total-only {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
  }
  .diagnose-sample-timeout {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%; height: 100%;
    background: rgba(249, 168, 212, 0.2);
    color: var(--accent-pink);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
  }
  .diagnose-sample-total {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t2);
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 80px;
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap; border: 0;
  }

  /* ── Investigate landing (PR 8 of synthesis arc) ─────────────────────── */
  .investigate-landing {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
    gap: 32px;
    align-items: start;
  }
  .landing-col-header {
    margin-bottom: 16px;
  }
  .landing-kicker {
    margin: 0;
    color: var(--t3);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .landing-subtitle {
    margin: 6px 0 0;
    color: var(--t2);
    font-family: var(--sans);
    font-size: var(--ts-sm);
    line-height: 1.5;
  }
  .endpoint-cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .endpoint-card {
    width: 100%;
    padding: 18px;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: var(--shell-panel);
    color: var(--t1);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .endpoint-card:hover { background: var(--shell-panel-hover); }
  .endpoint-card:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .endpoint-card-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .endpoint-card-name {
    font-family: var(--mono);
    font-size: var(--ts-md);
    font-weight: 700;
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .endpoint-card-pill {
    padding: 4px 10px;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    border: 1px solid var(--shell-border-strong);
    background: var(--shell-bg-cyan);
    color: var(--accent-cyan);
  }
  .endpoint-card[data-tone='good'] .endpoint-card-pill {
    color: var(--accent-green);
    background: var(--shell-success-bg);
    border-color: var(--shell-success-border);
  }
  .endpoint-card[data-tone='watch'] .endpoint-card-pill {
    color: var(--accent-amber);
    background: var(--shell-bg-amber);
    border-color: var(--shell-stop-border);
  }
  .endpoint-card[data-tone='bad'] .endpoint-card-pill {
    color: var(--accent-pink);
    background: var(--shell-stop-bg);
    border-color: var(--shell-stop-border);
  }
  .endpoint-card-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .endpoint-card-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--shell-base) 54%, transparent);
  }
  .endpoint-card-metric-label {
    color: var(--t4);
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .endpoint-card-metric-value {
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    font-weight: 700;
  }
  .endpoint-card-visibility {
    padding: 6px 10px;
    border-radius: 6px;
    align-self: flex-start;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .endpoint-card-visibility[data-visibility-level='none'] {
    color: var(--accent-cyan);
    background: var(--shell-bg-cyan);
  }
  .endpoint-card-visibility[data-visibility-level='total-only'],
  .endpoint-card-visibility[data-visibility-level='mixed'] {
    color: var(--accent-amber);
    background: var(--shell-bg-amber);
  }
  .endpoint-card-visibility[data-visibility-level='phase'] {
    color: var(--accent-green);
    background: var(--shell-success-bg);
  }

  .validation-card {
    padding: 18px;
    margin-bottom: 14px;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: var(--shell-panel);
  }
  .validation-card-title {
    margin: 0 0 8px;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-base);
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .validation-card-flag {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--shell-panel-hover);
    color: var(--t3);
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .validation-card-detail {
    margin: 0 0 12px;
    color: var(--t2);
    font-family: var(--sans);
    font-size: var(--ts-sm);
    line-height: 1.55;
  }
  .validation-card-cta {
    min-height: 36px;
    padding: 0 16px;
    border-radius: 8px;
    border: 0;
    background: var(--shell-bg-cyan);
    color: var(--accent-cyan);
    font-family: var(--sans);
    font-size: var(--ts-sm);
    font-weight: 700;
    cursor: pointer;
  }
  .validation-card-cta:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .validation-card[data-state='not-installed'] {
    opacity: 0.7;
  }

  .why-separate-callout {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid var(--shell-border-strong);
    border-radius: 14px;
    background: var(--shell-bg-cyan);
  }
  .why-separate-callout p {
    margin: 0;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-sm);
    line-height: 1.6;
  }
  .why-separate-callout strong {
    color: var(--accent-cyan);
  }

  @media (max-width: 1023px) {
    .investigate-landing {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .diagnose-chip, .diagnose-bar-seg { transition: none; }
    .endpoint-card { transition: none; }
  }

  @media (max-width: 767px) {
    .diagnose { width: 100%; padding: 16px; gap: 14px; }
    .diagnose-header { flex-direction: column; align-items: flex-start; gap: 14px; }
    .diagnose-brief {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      grid-template-columns: none;
      min-height: 350px;
      height: max-content;
      padding: 16px;
    }
    .diagnose-brief-score {
      display: none;
    }
    .diagnose-brief-copy {
      display: block;
    }
    .diagnose-brief-copy > * + * {
      margin-top: 10px;
    }
    .diagnose-brief .diagnose-answer-headline {
      display: none;
    }
    .diagnose-evidence-layout { grid-template-columns: 1fr; }
    .diagnose-answer-evidence { grid-template-columns: 1fr; }
    .remote-evidence { grid-template-columns: 1fr; }
    .loaded-evidence { grid-template-columns: 1fr; }
    .network-context-evidence { grid-template-columns: 1fr; }
    .diagnose-evidence-row { grid-template-columns: 10px 110px 70px 1fr 40px; }
  }
</style>
