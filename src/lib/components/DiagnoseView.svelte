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
  import { buildHistogram, buildCorrelation } from '$lib/utils/diagnose-stats';
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

  // ── Histogram of focused endpoint's recent latency distribution ───────────
  // Last 50 samples — long enough to be statistically meaningful, short enough
  // to reflect "current" behavior rather than the whole session.
  const focusedAllSamples: readonly MeasurementSample[] = $derived.by(() => {
    if (!focusedEndpoint) return [];
    const m = measurements.endpoints[focusedEndpoint.id];
    if (!m) return [];
    return m.samples.toArray().slice(-50);
  });
  const histogram = $derived(buildHistogram(focusedAllSamples, 10));

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
  // see whether the focused endpoint's spikes are isolated (likely the site)
  // or shared with others (likely the network).
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
    );
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
      <div class="diagnose-kicker">Diagnose · Distribution and correlation</div>
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
      <p class="diagnose-empty-title">Pick an endpoint from the left rail to look at it closely.</p>
      <p class="diagnose-empty-hint">Detail shows you the latency distribution and whether spikes line up across other endpoints.</p>
    </div>
  {:else}
    <!-- Distribution histogram — answers "what's this endpoint's typical latency,
         and how much does it vary?" -->
    <section class="diagnose-distro" aria-label="Latency distribution">
      <div class="diagnose-section-kicker">Distribution</div>
      {#if distroStats && histogram.bins.length > 0}
        <div class="distro-stats">
          <span class="distro-stat"><span class="distro-stat-label">p50</span> {fmt(distroStats.p50)} ms</span>
          <span class="distro-stat"><span class="distro-stat-label">p95</span> {fmt(distroStats.p95)} ms</span>
          <span class="distro-stat"><span class="distro-stat-label">spread</span> {distroStats.spread.toFixed(1)}×</span>
          <span class="distro-stat-meta">over last {distroStats.n} samples</span>
        </div>
        <div class="distro-chart" role="img" aria-label="Latency histogram across last {distroStats.n} samples">
          {#each histogram.bins as bin, i (i)}
            <div class="distro-bin" title="{Math.round(bin.fromMs)}–{Math.round(bin.toMs)} ms · {bin.count} samples">
              <div class="distro-bar" style:height="{histogram.maxCount > 0 ? (bin.count / histogram.maxCount) * 100 : 0}%"></div>
            </div>
          {/each}
        </div>
        <div class="distro-axis" aria-hidden="true">
          <span>{fmt(histogram.bins[0]?.fromMs ?? 0)} ms</span>
          <span>{fmt(histogram.bins[histogram.bins.length - 1]?.toMs ?? 0)} ms</span>
        </div>
      {:else}
        <p class="distro-empty">Need at least 2 samples with different latencies before a distribution chart is meaningful. Run for a few more rounds.</p>
      {/if}
    </section>

    <!-- Cross-endpoint correlation — answers "is this slowness specific to this
         site, or shared across multiple sites at once (likely my network)?" -->
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

    <!-- Phase breakdown — only meaningful for endpoints that send Timing-Allow-Origin
         (or are same-origin). Collapsed by default since it's frequently empty
         for cross-origin endpoints and can be tautological for same-origin
         endpoints over warm QUIC connections. -->
    {#if phases !== null}
      <details class="diagnose-phases">
        <summary>
          <span class="diagnose-section-kicker">Phase breakdown (advanced)</span>
          <span class="phases-summary-hint">DNS · TCP · TLS · Server · Transfer</span>
        </summary>
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
        {#if hypothesis}
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
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
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
    color: var(--t4);
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
    color: var(--t4);
  }
  .distro-empty {
    color: var(--t3);
    font-size: var(--ts-sm);
    margin: 0;
    padding: 8px 0;
  }

  /* ── Cross-endpoint correlation ────────────────────────────────────────── */
  .diagnose-correlation {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
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
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
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
