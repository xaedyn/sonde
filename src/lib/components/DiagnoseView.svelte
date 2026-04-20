<!-- src/lib/components/DiagnoseView.svelte -->
<!-- Diagnose view (renamed from Atlas at v9 to match the v2 prototype).       -->
<!-- For the rail-focused endpoint: horizontal phase-bar waterfall (dns /     -->
<!-- tcp / tls / ttfb / transfer) in P50 or P95 mode, a one-sentence phase    -->
<!-- hypothesis, and the last 8 samples as mini phase bars. Empty-state       -->
<!-- prompt when no endpoint is focused — the rail is the only endpoint       -->
<!-- picker (Phase 1 non-negotiable).                                          -->
<script lang="ts">
  import { monitoredEndpointsStore } from '$lib/stores/derived';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { uiStore } from '$lib/stores/ui';
  import { phaseHypothesis, PHASE_LABELS, type PhaseBreakdown, type Tier2Phase } from '$lib/utils/verdict';
  import { fmt } from '$lib/utils/format';
  import { tokens } from '$lib/tokens';
  import type { MeasurementSample } from '$lib/types';

  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const measurements = $derived($measurementStore);
  const focusedId = $derived($uiStore.focusedEndpointId);

  const focusedEndpoint = $derived(
    focusedId === null ? null : monitored.find((ep) => ep.id === focusedId) ?? null,
  );
  const focusedStats = $derived(focusedEndpoint ? stats[focusedEndpoint.id] : undefined);

  // ── Mode toggle ──────────────────────────────────────────────────────────
  let mode = $state<'p50' | 'p95'>('p50');

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

  interface SampleRow { round: number; total: number; segs: { phase: Tier2Phase; pctWidth: number; color: string; }[]; status: 'ok' | 'timeout' | 'error' | 'no-tier2'; }
  const sampleRows: readonly SampleRow[] = $derived.by(() => {
    return recentSamples.map((s) => {
      if (s.status !== 'ok') {
        return { round: s.round, total: s.latency ?? 0, segs: [], status: s.status };
      }
      const t2 = s.tier2;
      if (!t2) {
        return { round: s.round, total: s.latency, segs: [], status: 'no-tier2' as const };
      }
      const total = t2.dnsLookup + t2.tcpConnect + t2.tlsHandshake + t2.ttfb + t2.contentTransfer;
      const segs = total <= 0 ? [] : PHASE_ORDER.map((phase) => {
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
    uiStore.setActiveView('live');
  }

  function handleSelectMode(next: 'p50' | 'p95'): void {
    mode = next;
  }

  // ── Accessibility summary for the hero bar ────────────────────────────────
  const heroAria = $derived(
    phases === null
      ? 'Request waterfall — no tier-2 data available.'
      : `Request waterfall for ${focusedEndpoint?.label ?? 'focused endpoint'} at ${mode.toUpperCase()}: ${segments.map((s) => `${PHASE_LABELS[s.phase]} ${Math.round(s.ms)} ms`).join(', ')}. Total ${Math.round(phaseTotal)} ms.`
  );
</script>

<section class="diagnose" aria-label="Diagnose">
  <header class="diagnose-header">
    <div class="diagnose-title-block">
      <div class="diagnose-kicker">Diagnose · Request waterfall</div>
      <h1 class="diagnose-title">
        {#if focusedEndpoint}
          <span class="diagnose-title-pip" style:background={focusedEndpoint.color || tokens.color.endpoint[0]} aria-hidden="true"></span>
          <span class="diagnose-title-name">{focusedEndpoint.label}</span>
          <span class="diagnose-title-url">{focusedEndpoint.url}</span>
        {:else}
          <span class="diagnose-title-placeholder">—</span>
        {/if}
      </h1>
    </div>

    {#if focusedEndpoint}
      <div class="diagnose-actions">
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
        <button
          type="button" class="diagnose-chip diagnose-chip-action"
          onclick={handleBack}
          aria-label="Back to live"
        >← Back to Live</button>
      </div>
    {/if}
  </header>

  {#if !focusedEndpoint}
    <div class="diagnose-empty" role="note">
      <p class="diagnose-empty-title">Select an endpoint from the left rail to diagnose a specific link.</p>
      <p class="diagnose-empty-hint">Diagnose breaks one request into DNS · TCP · TLS · Server · Transfer phases and points at the slow one.</p>
    </div>
  {:else if phases === null}
    <div class="diagnose-empty" role="note">
      {#if mode === 'p95' && focusedStats?.tier2Averages}
        <!-- P50 data exists, P95 hasn't been computed yet. Without this branch -->
        <!-- the view reads as a regression when the user toggles to P95.      -->
        <p class="diagnose-empty-title">P95 phase breakdown not yet available.</p>
        <p class="diagnose-empty-hint">Switch to P50 to view the current breakdown, or wait for more samples.</p>
      {:else}
        <p class="diagnose-empty-title">Awaiting tier-2 samples…</p>
        <p class="diagnose-empty-hint">Phase breakdown appears once the first tier-2 measurement lands.</p>
      {/if}
    </div>
  {:else}
    <!-- Hero waterfall -->
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

    <!-- Hypothesis + evidence -->
    {#if hypothesis}
      <section class="diagnose-hypothesis" aria-label="Phase hypothesis">
        <div class="diagnose-hypothesis-kicker">Verdict</div>
        <p class="diagnose-hypothesis-text">{hypothesis.text}</p>

        <div class="diagnose-hypothesis-kicker">Evidence</div>
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
      </section>
    {/if}

    <!-- Sample strip -->
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
                    {:else if row.status === 'no-tier2'}
                      <span class="diagnose-sample-neutral" aria-label="No tier-2 breakdown available"></span>
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
  {/if}
</section>

<style>
  .diagnose {
    padding: 18px 28px 40px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 0;
    overflow-y: auto;
    flex: 1;
  }

  .diagnose-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    flex-wrap: wrap;
  }
  .diagnose-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--accent-cyan);
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .diagnose-title {
    margin: 0;
    font-size: var(--ts-2xl);
    font-weight: 500;
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
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .diagnose-chip-action {
    background: transparent;
    border: 1px solid var(--border-mid);
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

  /* Hypothesis */
  .diagnose-hypothesis {
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .diagnose-hypothesis-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t4);
    text-transform: uppercase;
  }
  .diagnose-hypothesis-text {
    margin: 0 0 8px;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-lg);
    font-weight: 500;
    letter-spacing: var(--tr-tight);
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
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
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

  @media (prefers-reduced-motion: reduce) {
    .diagnose-chip, .diagnose-bar-seg { transition: none; }
  }

  @media (max-width: 767px) {
    .diagnose { padding: 12px; gap: 12px; }
    .diagnose-header { flex-direction: column; align-items: flex-start; }
    .diagnose-evidence-row { grid-template-columns: 10px 110px 70px 1fr 40px; }
  }
</style>
