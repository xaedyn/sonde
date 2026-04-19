<!-- src/lib/components/AtlasView.svelte -->
<!-- Phase 4 Atlas view. For the rail-focused endpoint: horizontal phase-bar -->
<!-- waterfall (dns / tcp / tls / ttfb / transfer) in P50 or P95 mode, a     -->
<!-- one-sentence phase hypothesis, and the last 8 samples as mini phase    -->
<!-- bars. Empty-state prompt when no endpoint is focused — the rail is     -->
<!-- the only endpoint picker (Phase 1 non-negotiable).                     -->
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

  // ── Phase breakdown (adapt EndpointStatistics field names → Atlas phase
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

<section class="atlas" aria-label="Atlas diagnose">
  <header class="atlas-header">
    <div class="atlas-title-block">
      <div class="atlas-kicker">Diagnose · Atlas · Request waterfall</div>
      <h1 class="atlas-title">
        {#if focusedEndpoint}
          <span class="atlas-title-pip" style:background={focusedEndpoint.color || tokens.color.endpoint[0]} aria-hidden="true"></span>
          <span class="atlas-title-name">{focusedEndpoint.label}</span>
          <span class="atlas-title-url">{focusedEndpoint.url}</span>
        {:else}
          <span class="atlas-title-placeholder">—</span>
        {/if}
      </h1>
    </div>

    {#if focusedEndpoint}
      <div class="atlas-actions">
        <div class="atlas-segment" role="group" aria-label="Percentile mode">
          <button
            type="button" class="atlas-chip"
            class:on={mode === 'p50'} aria-pressed={mode === 'p50'}
            onclick={() => handleSelectMode('p50')}
          >P50</button>
          <button
            type="button" class="atlas-chip"
            class:on={mode === 'p95'} aria-pressed={mode === 'p95'}
            onclick={() => handleSelectMode('p95')}
          >P95</button>
        </div>
        <button
          type="button" class="atlas-chip atlas-chip-action"
          onclick={handleBack}
          aria-label="Back to live"
        >← Back to Live</button>
      </div>
    {/if}
  </header>

  {#if !focusedEndpoint}
    <div class="atlas-empty" role="note">
      <p class="atlas-empty-title">Select an endpoint from the left rail to diagnose a specific link.</p>
      <p class="atlas-empty-hint">Atlas breaks one request into DNS · TCP · TLS · Server · Transfer phases and points at the slow one.</p>
    </div>
  {:else if phases === null}
    <div class="atlas-empty" role="note">
      {#if mode === 'p95' && focusedStats?.tier2Averages}
        <!-- P50 data exists, P95 hasn't been computed yet. Without this branch -->
        <!-- the view reads as a regression when the user toggles to P95.      -->
        <p class="atlas-empty-title">P95 phase breakdown not yet available.</p>
        <p class="atlas-empty-hint">Switch to P50 to view the current breakdown, or wait for more samples.</p>
      {:else}
        <p class="atlas-empty-title">Awaiting tier-2 samples…</p>
        <p class="atlas-empty-hint">Phase breakdown appears once the first tier-2 measurement lands.</p>
      {/if}
    </div>
  {:else}
    <!-- Hero waterfall -->
    <div class="atlas-waterfall" role="img" aria-label={heroAria}>
      <div class="atlas-bar">
        {#each segments as seg (seg.phase)}
          <div
            class="atlas-bar-seg"
            class:dominant={seg.dominant}
            style:width="{seg.pctWidth}%"
            style:background={seg.color}
          >
            {#if seg.pctWidth >= 8}
              <span class="atlas-bar-label" style:color={tokens.color.tier2.labelText}>
                {seg.short} · {fmt(seg.ms)}<span class="atlas-bar-ms">ms</span>
              </span>
            {/if}
          </div>
        {/each}
      </div>
      <div class="atlas-bar-scale">
        {#each segments as seg (seg.phase)}
          <span class="atlas-bar-tick" style:flex="{seg.pctWidth}">
            <span class="atlas-bar-tick-label">{seg.short}</span>
          </span>
        {/each}
      </div>
    </div>

    <!-- Hypothesis + evidence -->
    {#if hypothesis}
      <section class="atlas-hypothesis" aria-label="Phase hypothesis">
        <div class="atlas-hypothesis-kicker">Verdict</div>
        <p class="atlas-hypothesis-text">{hypothesis.text}</p>

        <div class="atlas-hypothesis-kicker">Evidence</div>
        <ul class="atlas-evidence">
          {#each segments as seg (seg.phase)}
            <li class="atlas-evidence-row" class:dominant={seg.dominant}>
              <span class="atlas-evidence-pip" style:background={seg.color} aria-hidden="true"></span>
              <span class="atlas-evidence-name">{PHASE_LABELS[seg.phase]}</span>
              <span class="atlas-evidence-ms">{fmt(seg.ms)} ms</span>
              <span class="atlas-evidence-bar" aria-hidden="true">
                <span class="atlas-evidence-fill" style:width="{seg.pctWidth}%" style:background={seg.color}></span>
              </span>
              <span class="atlas-evidence-pct">{Math.round(seg.pct * 100)}%</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Sample strip -->
    {#if recentSamples.length > 0}
      <section class="atlas-samples" aria-label="Recent samples">
        <div class="atlas-hypothesis-kicker">Last {recentSamples.length} sample{recentSamples.length === 1 ? '' : 's'}</div>
        <table class="atlas-sample-table">
          <thead class="sr-only">
            <tr><th>Round</th><th>Phase breakdown</th><th>Total</th></tr>
          </thead>
          <tbody>
            {#each sampleRows as row (row.round)}
              <tr class="atlas-sample-row">
                <td class="atlas-sample-round">R{row.round}</td>
                <td class="atlas-sample-bar-cell">
                  <div class="atlas-sample-bar">
                    {#if row.status === 'ok' && row.segs.length > 0}
                      {#each row.segs as seg (seg.phase)}
                        <span class="atlas-sample-seg" style:width="{seg.pctWidth}%" style:background={seg.color} aria-hidden="true"></span>
                      {/each}
                    {:else if row.status === 'no-tier2'}
                      <span class="atlas-sample-neutral" aria-label="No tier-2 breakdown available"></span>
                    {:else if row.status === 'timeout'}
                      <span class="atlas-sample-timeout" aria-label="Timeout">TIMEOUT</span>
                    {:else}
                      <span class="atlas-sample-timeout" aria-label="Error">ERROR</span>
                    {/if}
                  </div>
                </td>
                <td class="atlas-sample-total">{fmt(row.total)} ms</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  {/if}
</section>

<style>
  .atlas {
    padding: 18px 28px 40px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 0;
    overflow-y: auto;
    flex: 1;
  }

  .atlas-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    flex-wrap: wrap;
  }
  .atlas-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--accent-cyan);
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .atlas-title {
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
  .atlas-title-pip {
    width: 10px; height: 10px;
    border-radius: 50%;
    align-self: center;
    box-shadow: 0 0 6px currentColor;
  }
  .atlas-title-url {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t3);
    font-weight: 400;
    letter-spacing: var(--tr-body);
  }
  .atlas-title-placeholder { color: var(--t4); font-weight: 300; }

  .atlas-actions { display: flex; align-items: center; gap: 10px; }
  .atlas-segment {
    display: inline-flex;
    padding: 2px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 7px;
    border: 1px solid var(--border-mid);
    gap: 2px;
  }
  .atlas-chip {
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
  .atlas-chip:hover { color: var(--t1); border-color: var(--border-bright); }
  .atlas-chip.on {
    background: rgba(255, 255, 255, 0.08);
    color: var(--t1);
    border-color: transparent;
  }
  .atlas-chip:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .atlas-chip-action {
    background: transparent;
    border: 1px solid var(--border-mid);
  }

  /* Empty states */
  .atlas-empty {
    padding: 32px 24px;
    border: 1px dashed var(--border-mid);
    border-radius: 14px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--glass-bg-rail-hover);
  }
  .atlas-empty-title {
    margin: 0;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-base);
    font-weight: 500;
  }
  .atlas-empty-hint {
    margin: 0;
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    letter-spacing: 0.02em;
  }

  /* Hero waterfall */
  .atlas-waterfall {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .atlas-bar {
    display: flex;
    width: 100%;
    height: 80px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface-raised);
    border: 1px solid var(--border-mid);
  }
  .atlas-bar-seg {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2px;
    position: relative;
    transition: filter 160ms ease;
  }
  .atlas-bar-seg:hover { filter: brightness(1.1); }
  .atlas-bar-seg.dominant {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
  }
  .atlas-bar-label {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    white-space: nowrap;
  }
  .atlas-bar-ms {
    font-weight: 400;
    margin-left: 2px;
    opacity: 0.8;
  }
  .atlas-bar-scale {
    display: flex;
    gap: 0;
  }
  .atlas-bar-tick {
    text-align: center;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
    color: var(--t4);
    text-transform: uppercase;
    min-width: 0;
  }

  /* Hypothesis */
  .atlas-hypothesis {
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
  .atlas-hypothesis-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t4);
    text-transform: uppercase;
  }
  .atlas-hypothesis-text {
    margin: 0 0 8px;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-lg);
    font-weight: 500;
    letter-spacing: var(--tr-tight);
  }

  .atlas-evidence {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .atlas-evidence-row {
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
  .atlas-evidence-row.dominant {
    color: var(--t1);
    background: rgba(255, 255, 255, 0.03);
  }
  .atlas-evidence-pip {
    width: 8px; height: 8px;
    border-radius: 50%;
    align-self: center;
  }
  .atlas-evidence-name { color: inherit; }
  .atlas-evidence-ms { color: var(--t1); }
  .atlas-evidence-bar {
    position: relative;
    height: 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
    overflow: hidden;
  }
  .atlas-evidence-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 3px;
  }
  .atlas-evidence-pct {
    text-align: right;
    color: var(--t4);
    letter-spacing: var(--tr-label);
  }

  /* Samples */
  .atlas-samples {
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
  .atlas-sample-table {
    width: 100%;
    border-collapse: collapse;
  }
  .atlas-sample-row td {
    padding: 3px 0;
    vertical-align: middle;
  }
  .atlas-sample-round {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
    width: 58px;
  }
  .atlas-sample-bar-cell { width: 100%; padding: 3px 10px; }
  .atlas-sample-bar {
    display: flex;
    height: 14px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.03);
  }
  .atlas-sample-seg { height: 100%; min-width: 1px; }
  .atlas-sample-neutral {
    display: block;
    width: 100%; height: 100%;
    background: var(--t5, rgba(255, 255, 255, 0.07));
  }
  .atlas-sample-timeout {
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
  .atlas-sample-total {
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
    .atlas-chip, .atlas-bar-seg { transition: none; }
  }

  @media (max-width: 767px) {
    .atlas { padding: 12px; gap: 12px; }
    .atlas-header { flex-direction: column; align-items: flex-start; }
    .atlas-evidence-row { grid-template-columns: 10px 110px 70px 1fr 40px; }
  }
</style>
