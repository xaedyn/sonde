<!-- src/lib/components/OverviewView.svelte -->
<!-- Overview — Classic (Phase 2) or Enriched (Phase 2.5) gated by              -->
<!-- settings.overviewMode. The Enriched path composes the chronograph dial v2, -->
<!-- the CausalVerdictStrip, the RacingStrip, and the EventFeed — with          -->
<!-- score-history / baseline / events derived locally here. Classic and         -->
<!-- Enriched share the cross-store data spine; only the dial component and the -->
<!-- layout of the supporting cards differ.                                     -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { networkQualityStore, monitoredEndpointsStore } from '$lib/stores/derived';
  import { overviewVerdict, VERDICT_STYLES } from '$lib/utils/classify';
  import { computeCausalVerdict, type Verdict, type VerdictRow } from '$lib/utils/verdict';
  import { fmt, fmtParts, fmtCount } from '$lib/utils/format';
  import { tokens } from '$lib/tokens';
  import ChronographDial from './ChronographDial.svelte';
  import ChronographDialV2 from './ChronographDialV2.svelte';
  import CausalVerdictStrip from './CausalVerdictStrip.svelte';
  import RacingStrip from './RacingStrip.svelte';
  import EventFeed from './EventFeed.svelte';
  import type { Endpoint, MeasurementSample } from '$lib/types';
  import type { FeedEvent } from './EventFeed.svelte';

  // ── Shared spine (both Classic and Enriched) ──────────────────────────────
  // Cross-phase invariant — user-facing aggregates derive from
  // monitoredEndpointsStore so dial orbit / verdict / triptych / racing strip
  // can't disagree about who's being measured. See PATTERNS.md §3.
  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const measurements = $derived($measurementStore);
  const threshold = $derived($settingsStore.healthThreshold);
  const score = $derived($networkQualityStore);
  const overviewMode = $derived($settingsStore.overviewMode);
  const paused = $derived(
    measurements.lifecycle === 'stopped' || measurements.lifecycle === 'completed',
  );

  const lastLatencies = $derived.by(() => {
    const out: Record<string, number | null> = {};
    for (const ep of monitored) {
      out[ep.id] = measurements.endpoints[ep.id]?.lastLatency ?? null;
    }
    return out;
  });

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

  const classicVerdict = $derived(overviewVerdict(score));
  const classicVerdictStyle = $derived(VERDICT_STYLES[classicVerdict]);
  const liveMedianParts = $derived(fmtParts(liveMedian));

  function handleClassicDrill(): void {
    if (worst) uiStore.setFocusedEndpoint(worst.id);
    uiStore.setActiveView('atlas');
  }

  // ── Enriched-only spine ────────────────────────────────────────────────────
  // These derivations are opt-in — they require iteration over sample histories
  // and would waste CPU if Classic never reads them. Gated by overviewMode.
  const isEnriched = $derived(overviewMode === 'enriched');

  // Samples slice per endpoint, materialized once per render for the racing
  // strip sparkline. 40-sample tail is enough for the spec. Using toArray()
  // copies out of the ring buffer — acceptable at N<=20 endpoints.
  const samplesByEndpoint = $derived.by<Record<string, readonly MeasurementSample[]>>(() => {
    const out: Record<string, readonly MeasurementSample[]> = {};
    if (!isEnriched) return out;
    for (const ep of monitored) {
      const m = measurements.endpoints[ep.id];
      if (!m) { out[ep.id] = []; continue; }
      const all = m.samples.toArray();
      out[ep.id] = all.slice(-40);
    }
    return out;
  });

  // Score history ring buffer — one entry per round, max 60 entries. Driven
  // by roundCounter changes; append on every round. Svelte 5 $state arrays
  // are proxied, so push/shift notify subscribers directly — no re-assignment
  // needed.
  const HISTORY_MAX = 60;
  let scoreHistory = $state<number[]>([]);
  let lastSeenRound = -1;
  $effect(() => {
    if (!isEnriched) return;
    const round = measurements.roundCounter;
    if (round === lastSeenRound) return;
    lastSeenRound = round;
    // Only append when we have a valid score for this round.
    if (score === null) return;
    scoreHistory.push(score);
    while (scoreHistory.length > HISTORY_MAX) scoreHistory.shift();
  });

  // Event ring buffer — threshold crossings + p95 shifts. Per-endpoint
  // prev-state map tracks the comparison baseline across ticks.
  const EVENT_MAX = 12;
  const SHIFT_FRACTION = 0.35;
  interface PrevState { readonly over: boolean; readonly p95: number; }
  let prevByEp: Record<string, PrevState> = {};
  let events = $state<FeedEvent[]>([]);
  let lastSeenEventRound = -1;
  $effect(() => {
    if (!isEnriched) return;
    const round = measurements.roundCounter;
    if (round === lastSeenEventRound) return;
    const prevRound = lastSeenEventRound;
    lastSeenEventRound = round;

    const now = Date.now();
    const nextPrev: Record<string, PrevState> = {};
    const newEvents: FeedEvent[] = [];

    for (const ep of monitored) {
      const lat = measurements.endpoints[ep.id]?.lastLatency ?? null;
      const s = stats[ep.id];
      const p95 = s?.p95 ?? 0;
      const over = lat != null && lat > threshold;
      const prev = prevByEp[ep.id];

      if (prev !== undefined) {
        if (over && !prev.over) {
          newEvents.push({ t: now, epId: ep.id, kind: 'cross-up', value: lat ?? undefined, threshold });
        } else if (!over && prev.over) {
          newEvents.push({ t: now, epId: ep.id, kind: 'cross-down', value: lat ?? undefined, threshold });
        }
        // Shift event: only check every 8th round to avoid chatter.
        if (prevRound >= 0 && round % 8 === 0 && prev.p95 > 0) {
          const delta = Math.abs(p95 - prev.p95) / prev.p95;
          if (delta > SHIFT_FRACTION) {
            newEvents.push({ t: now, epId: ep.id, kind: 'shift', from: prev.p95, to: p95 });
          }
        }
      }
      nextPrev[ep.id] = { over, p95 };
    }

    prevByEp = nextPrev;
    if (newEvents.length > 0) {
      events = [...newEvents.reverse(), ...events].slice(0, EVENT_MAX);
    }
  });

  // Baseline — p25/median/p75 over last 120s of samples × monitored endpoints.
  // Recomputes every 5s on a setInterval, not every tick — stable band avoids
  // jitter on the dial.
  interface Baseline { p25: number; median: number; p75: number; }
  const BASELINE_WINDOW_MS = 120_000;
  const BASELINE_MIN_SAMPLES = 30;
  const BASELINE_REFRESH_MS = 5_000;
  let baseline = $state<Baseline | null>(null);
  function recomputeBaseline(): void {
    if (!isEnriched) return;
    const cutoff = Date.now() - BASELINE_WINDOW_MS;
    const pool: number[] = [];
    for (const ep of monitored) {
      const m = measurements.endpoints[ep.id];
      if (!m) continue;
      for (const s of m.samples) {
        if (s.status !== 'ok' || !Number.isFinite(s.latency)) continue;
        if (s.timestamp < cutoff) continue;
        pool.push(s.latency);
      }
    }
    if (pool.length < BASELINE_MIN_SAMPLES) {
      baseline = null;
      return;
    }
    pool.sort((a, b) => a - b);
    const at = (p: number): number => pool[Math.max(0, Math.min(pool.length - 1, Math.floor(p * pool.length)))];
    baseline = { p25: at(0.25), median: at(0.5), p75: at(0.75) };
  }
  let baselineTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (!isEnriched) {
      if (baselineTimer !== null) { clearInterval(baselineTimer); baselineTimer = null; }
      baseline = null;
      return;
    }
    // Kick immediately so the first render has something to work with, then
    // recompute every 5s.
    recomputeBaseline();
    if (baselineTimer !== null) clearInterval(baselineTimer);
    baselineTimer = setInterval(recomputeBaseline, BASELINE_REFRESH_MS);
  });
  onDestroy(() => {
    if (baselineTimer !== null) clearInterval(baselineTimer);
  });

  // Causal verdict (Enriched). Only rows with `ready` stats feed the tree —
  // unready endpoints haven't contributed enough samples for phase dominance
  // to be meaningful.
  const verdictRows: readonly VerdictRow[] = $derived.by(() => {
    const rows: VerdictRow[] = [];
    for (const ep of monitored) {
      const s = stats[ep.id];
      if (s && s.ready) rows.push({ ep, stats: s });
    }
    return rows;
  });
  const enrichedVerdict: Verdict = $derived(
    isEnriched ? computeCausalVerdict(verdictRows, threshold) : { tone: 'good', headline: '' }
  );

  // Average metrics for the verdict strip triptych (backing evidence).
  const avgP50 = $derived.by(() => {
    if (verdictRows.length === 0) return null;
    let sum = 0;
    for (const r of verdictRows) sum += r.stats.p50;
    return sum / verdictRows.length;
  });
  const avgJitter = $derived.by(() => {
    if (verdictRows.length === 0) return null;
    let sum = 0;
    for (const r of verdictRows) sum += r.stats.stddev;
    return sum / verdictRows.length;
  });
  const avgLoss = $derived.by(() => {
    if (verdictRows.length === 0) return null;
    let sum = 0;
    for (const r of verdictRows) sum += r.stats.lossPercent;
    return sum / verdictRows.length;
  });

  // Drill target for the verdict strip — worstEpId wins; fall back to the
  // overall worst-p95 endpoint. null when all-healthy (no drill shown).
  const drillEndpoint: Endpoint | null = $derived.by(() => {
    if (enrichedVerdict.tone !== 'warn') return null;
    const targetId = enrichedVerdict.worstEpId ?? worst?.id ?? null;
    if (targetId === null) return null;
    return monitored.find((ep) => ep.id === targetId) ?? null;
  });

  function handleEnrichedDrill(epId: string): void {
    uiStore.setFocusedEndpoint(epId);
    uiStore.setActiveView('atlas');
  }

  function handleEventDrill(epId: string): void {
    uiStore.setFocusedEndpoint(epId);
    uiStore.setActiveView('live');
  }

  // Rerender clock for the event feed's relative-time labels. Ticks every
  // second while enriched is active so labels age monotonically regardless of
  // measurement cadence — a round-counter-driven clock would freeze "N s ago"
  // between rounds or after lifecycle stops. The ticker is torn down when
  // mode flips back to classic and on component destroy.
  let nowTick = $state(Date.now());
  let nowTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (!isEnriched) {
      if (nowTimer !== null) { clearInterval(nowTimer); nowTimer = null; }
      return;
    }
    nowTick = Date.now();
    if (nowTimer !== null) clearInterval(nowTimer);
    nowTimer = setInterval(() => { nowTick = Date.now(); }, 1000);
  });
  onDestroy(() => {
    if (nowTimer !== null) clearInterval(nowTimer);
  });
  // Include the round counter as a secondary trigger so the feed also updates
  // on the measurement edge (not just on the 1s tick).
  const now = $derived.by(() => {
    void measurements.roundCounter;
    return nowTick;
  });
</script>

{#if isEnriched}
  <section class="overview enriched" aria-label="Overview · enriched">
    <div class="enriched-grid">
      <div class="enriched-left">
        <ChronographDialV2
          {score}
          {liveMedian}
          {threshold}
          endpoints={monitored}
          {lastLatencies}
          {paused}
          {scoreHistory}
          {baseline}
        />
        <CausalVerdictStrip
          verdict={enrichedVerdict}
          {avgP50}
          {avgJitter}
          {avgLoss}
          {drillEndpoint}
          onDrill={handleEnrichedDrill}
        />
      </div>
      <div class="enriched-right">
        <RacingStrip
          endpoints={monitored}
          {stats}
          {lastLatencies}
          {samplesByEndpoint}
          {threshold}
          focusedEndpointId={$uiStore.focusedEndpointId}
        />
        <EventFeed
          {events}
          endpoints={monitored}
          {now}
          onDrill={handleEventDrill}
        />
      </div>
    </div>
  </section>
{:else}
  <section class="overview classic" aria-label="Overview">
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
      style:--verdict-color={classicVerdictStyle.color}
      style:--verdict-glow={classicVerdictStyle.glow}
    >
      <div class="diag-verdict">
        <span class="diag-dot" aria-hidden="true"></span>
        <span class="diag-verdict-label">{classicVerdictStyle.label}</span>
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
        onclick={handleClassicDrill}
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
{/if}

<style>
  .overview {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 32px 28px 40px;
    min-height: 0;
    overflow-y: auto;
  }
  .overview.classic { align-items: center; }

  .dial-slot {
    width: 100%;
    max-width: 920px;
    display: flex;
    justify-content: center;
  }

  /* ── Enriched 2-column grid ──────────────────────────────────────────────── */
  .enriched-grid {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .enriched-left, .enriched-right {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
  @media (max-width: 1023px) {
    .enriched-grid { grid-template-columns: 1fr; }
  }

  /* ── Classic diagnosis strip ──────────────────────────────────────────────── */
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

  /* ── Classic metrics triptych ───────────────────────────────────────────── */
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
