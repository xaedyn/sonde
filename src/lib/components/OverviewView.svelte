<!-- src/lib/components/OverviewView.svelte -->
<!-- Phase 2 Overview — chronograph dial, diagnosis strip, metrics triptych.    -->
<!-- This view is "ambient" — one dial says everything's fine or it isn't, the  -->
<!-- strip below points where to look. No interactive controls beyond the       -->
<!-- "Diagnose →" CTA.                                                          -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { networkQualityStore, monitoredEndpointsStore } from '$lib/stores/derived';
  import { overviewVerdict, VERDICT_STYLES } from '$lib/utils/classify';
  import { fmt, fmtParts, fmtCount } from '$lib/utils/format';
  import { tokens } from '$lib/tokens';
  import ChronographDial from './ChronographDial.svelte';

  // Cross-phase invariant — every user-facing aggregate (live median, worst
  // endpoint, over-threshold count, sample total, dial orbit) routes through
  // monitoredEndpointsStore so the score, verdict, and per-endpoint chrome on
  // this view can never disagree about who's being measured. See
  // PATTERNS.md §3.
  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const measurements = $derived($measurementStore);
  const threshold = $derived($settingsStore.healthThreshold);
  const score = $derived($networkQualityStore);
  // PAUSED only when the user explicitly stopped a running test — never on
  // first load (idle) or while transitioning. Score being non-null isn't a
  // sufficient signal because we can have stats from a previous session.
  const paused = $derived(
    measurements.lifecycle === 'stopped' || measurements.lifecycle === 'completed',
  );

  // ── Per-endpoint last latency map (for the dial's orbit ring) ──────────────
  const lastLatencies = $derived.by(() => {
    const out: Record<string, number | null> = {};
    for (const ep of monitored) {
      out[ep.id] = measurements.endpoints[ep.id]?.lastLatency ?? null;
    }
    return out;
  });

  // ── Live median across monitored endpoints' lastLatency (skip nulls) ───────
  const liveMedian = $derived.by(() => {
    const vals: number[] = [];
    for (const ep of monitored) {
      const lat = measurements.endpoints[ep.id]?.lastLatency;
      if (lat != null && Number.isFinite(lat)) vals.push(lat);
    }
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  });

  // ── Worst endpoint by p95 among ready monitored stats ──────────────────────
  const worst = $derived.by(() => {
    let worstEp: { id: string; label: string; color: string; p95: number } | null = null;
    for (const ep of monitored) {
      const s = stats[ep.id];
      if (!s || !s.ready) continue;
      if (!worstEp || s.p95 > worstEp.p95) {
        worstEp = {
          id: ep.id,
          label: ep.label,
          color: ep.color || tokens.color.endpoint[0],
          p95: s.p95,
        };
      }
    }
    return worstEp;
  });

  // ── Triptych metrics — monitored only ──────────────────────────────────────
  const overCount = $derived.by(() => {
    let n = 0, total = 0;
    for (const ep of monitored) {
      const lat = measurements.endpoints[ep.id]?.lastLatency;
      if (lat == null) continue;
      total++;
      if (lat > threshold) n++;
    }
    return { n, total };
  });
  const totalSamples = $derived.by(() => {
    let n = 0;
    for (const ep of monitored) {
      n += measurements.endpoints[ep.id]?.samples.length ?? 0;
    }
    return n;
  });

  const verdict = $derived(overviewVerdict(score));
  const verdictStyle = $derived(VERDICT_STYLES[verdict]);

  const liveMedianParts = $derived(fmtParts(liveMedian));

  function handleDrill(): void {
    if (worst) uiStore.setFocusedEndpoint(worst.id);
    // Phase 2 fallback: drill to Lanes since Atlas (Phase 4) isn't built yet.
    // Swap to 'atlas' once Phase 4 lands.
    uiStore.setActiveView('lanes');
  }
</script>

<section class="overview" aria-label="Overview">
  <div class="dial-slot">
    <ChronographDial
      {score}
      {liveMedian}
      {threshold}
      endpoints={monitored}
      {lastLatencies}
      {paused}
    />
  </div>

  <div
    class="diagnosis-strip"
    style:--verdict-color={verdictStyle.color}
    style:--verdict-glow={verdictStyle.glow}
  >
    <div class="diag-verdict">
      <span class="diag-dot" aria-hidden="true"></span>
      <span class="diag-verdict-label">{verdictStyle.label}</span>
    </div>

    <div class="diag-worst">
      <div class="diag-worst-kicker">Worst endpoint</div>
      {#if worst}
        <div class="diag-worst-row">
          <span class="diag-worst-pip" style:background={worst.color} aria-hidden="true"></span>
          <span class="diag-worst-label">{worst.label}</span>
          <span class="diag-worst-metric">
            <span class="diag-metric-num">{fmt(worst.p95)}</span>
            <span class="diag-metric-unit">p95 ms</span>
          </span>
        </div>
      {:else}
        <div class="diag-worst-row diag-worst-empty">
          <span class="diag-worst-label">—</span>
          <span class="diag-worst-metric"><span class="diag-metric-unit">awaiting samples</span></span>
        </div>
      {/if}
    </div>

    <button
      type="button"
      class="diag-drill"
      disabled={worst == null}
      aria-label={worst ? `Diagnose ${worst.label}` : 'Diagnose worst endpoint (none yet)'}
      onclick={handleDrill}
    >
      <span class="diag-drill-text">Diagnose</span>
      <span class="diag-drill-arrow" aria-hidden="true">→</span>
    </button>
  </div>

  <dl class="metrics-triptych" aria-label="Live metrics">
    <div class="metric-cell">
      <dt class="metric-kicker">Live median</dt>
      <dd class="metric-value">
        <span class="metric-num">{liveMedianParts.num}</span>
        <span class="metric-unit">{liveMedianParts.unit}</span>
      </dd>
    </div>

    <div class="metric-cell">
      <dt class="metric-kicker">Over threshold</dt>
      <dd class="metric-value">
        <span class="metric-num">{overCount.n}<span class="metric-num-sep">/</span>{overCount.total}</span>
        <span class="metric-unit">endpoints</span>
      </dd>
    </div>

    <div class="metric-cell">
      <dt class="metric-kicker">Samples</dt>
      <dd class="metric-value">
        <span class="metric-num">{fmtCount(totalSamples)}</span>
        <span class="metric-unit">total</span>
      </dd>
    </div>
  </dl>
</section>

<style>
  .overview {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 32px 28px 40px;
    min-height: 0;
    overflow-y: auto;
  }

  .dial-slot {
    width: 100%;
    max-width: 920px;
    display: flex;
    justify-content: center;
  }

  /* ── Diagnosis strip ─────────────────────────────────────────────────────── */
  .diagnosis-strip {
    width: 100%;
    max-width: 920px;
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 14px 18px;
    display: grid;
    grid-template-columns: 1.2fr 2fr auto;
    gap: 20px;
    align-items: center;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .diag-verdict { display: flex; align-items: center; gap: 10px; color: var(--verdict-color); }
  .diag-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--verdict-color);
    box-shadow: 0 0 10px var(--verdict-glow);
  }
  .diag-verdict-label {
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-base);
    font-weight: 500;
  }

  .diag-worst { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .diag-worst-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t4);
    text-transform: uppercase;
  }
  .diag-worst-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .diag-worst-pip {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }
  .diag-worst-label {
    flex: 1;
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .diag-worst-metric {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .diag-worst-empty .diag-worst-label { color: var(--t4); }
  .diag-metric-num {
    font-size: var(--ts-xl);
    font-weight: 300;
    color: var(--t1);
    letter-spacing: var(--tr-tight);
  }
  .diag-metric-unit {
    font-size: var(--ts-sm);
    color: var(--t3);
    letter-spacing: var(--tr-label);
  }

  .diag-drill {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 8px;
    background: var(--cyan-bg-subtle, rgba(103, 232, 249, 0.08));
    border: 1px solid var(--cyan-border-subtle, rgba(103, 232, 249, 0.25));
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-md);
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .diag-drill:hover:not(:disabled) {
    background: var(--cyan25);
    border-color: var(--cyan-border-subtle);
  }
  .diag-drill:disabled { opacity: 0.5; cursor: not-allowed; }
  .diag-drill:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .diag-drill-arrow { color: var(--accent-cyan); }

  /* ── Metrics triptych ────────────────────────────────────────────────────── */
  .metrics-triptych {
    width: 100%;
    max-width: 920px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
    margin: 0;
  }
  .metric-cell {
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .metric-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    text-transform: uppercase;
    margin: 0;
  }
  .metric-value {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .metric-num {
    font-family: var(--mono);
    font-size: var(--ts-xxl);
    font-weight: 200;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tr-tight);
  }
  .metric-num-sep { color: var(--t4); margin: 0 1px; }
  .metric-unit {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t3);
    letter-spacing: var(--tr-label);
  }

  @media (max-width: 767px) {
    .overview { padding: 16px 12px 28px; gap: 16px; }
    .diagnosis-strip {
      grid-template-columns: 1fr;
      gap: 14px;
      padding: 14px;
    }
    .diag-drill { justify-content: center; }
    .metrics-triptych { grid-template-columns: 1fr; gap: 10px; }
    .metric-cell { padding: 12px 14px; }
  }
</style>
