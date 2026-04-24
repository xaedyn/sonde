<!-- src/lib/components/OverviewView.svelte -->
<!-- Overview — single layout. Composes the chronograph dial, the              -->
<!-- CausalVerdictStrip, the RacingStrip, and the EventFeed. Score-history /    -->
<!-- baseline / events are derived locally here; the underlying stats + samples -->
<!-- flow through the monitoredEndpointsStore invariant.                        -->
<!-- The classic Overview mode was retired in v8; pre-v10 payloads that         -->
<!-- carried overviewMode are reset to defaults on load via persistence.ts.     -->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { networkQualityStore, monitoredEndpointsStore } from '$lib/stores/derived';
  import { computeCausalVerdict, type Verdict, type VerdictRow } from '$lib/utils/verdict';
  import { tokens } from '$lib/tokens';
  import ChronographDial from './ChronographDial.svelte';
  import CausalVerdictStrip from './CausalVerdictStrip.svelte';
  import RacingStrip from './RacingStrip.svelte';
  import EventFeed from './EventFeed.svelte';
  import OverviewSubtabStrip from './OverviewSubtabStrip.svelte';
  import type { Endpoint, MeasurementSample } from '$lib/types';
  import type { FeedEvent } from './EventFeed.svelte';

  // ── Shared spine ──────────────────────────────────────────────────────────
  // Cross-phase invariant — user-facing aggregates derive from
  // monitoredEndpointsStore so dial orbit / verdict / racing strip can't
  // disagree about who's being measured. See PATTERNS.md §3.
  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const measurements = $derived($measurementStore);
  const threshold = $derived($settingsStore.healthThreshold);
  const score = $derived($networkQualityStore);
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

  // ── Derived data for the dial / strip / feed cards ───────────────────────
  // Samples slice per endpoint, materialized once per render for the racing
  // strip sparkline. 40-sample tail is enough for the spec. Using toArray()
  // copies out of the ring buffer — acceptable at N<=20 endpoints.
  const samplesByEndpoint = $derived.by<Record<string, readonly MeasurementSample[]>>(() => {
    const out: Record<string, readonly MeasurementSample[]> = {};
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
    // Kick immediately so the first render has something to work with, then
    // recompute every 5s. Both calls run inside `untrack` because
    // recomputeBaseline reads `monitored` and `measurements` — without it,
    // the effect re-runs on every measurement update, clearing and recreating
    // the interval before its 5s fire window, defeating the cadence entirely.
    untrack(() => recomputeBaseline());
    if (baselineTimer !== null) clearInterval(baselineTimer);
    baselineTimer = setInterval(() => untrack(() => recomputeBaseline()), BASELINE_REFRESH_MS);
  });
  onDestroy(() => {
    if (baselineTimer !== null) clearInterval(baselineTimer);
  });

  // Causal verdict. Only rows with `ready` stats feed the tree — unready
  // endpoints haven't contributed enough samples for phase dominance to be
  // meaningful.
  const verdictRows: readonly VerdictRow[] = $derived.by(() => {
    const rows: VerdictRow[] = [];
    for (const ep of monitored) {
      const s = stats[ep.id];
      if (s && s.ready) rows.push({ ep, stats: s });
    }
    return rows;
  });
  const enrichedVerdict: Verdict = $derived(computeCausalVerdict(verdictRows, threshold));

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
    uiStore.setActiveView('diagnose');
  }

  function handleEventDrill(epId: string): void {
    uiStore.setFocusedEndpoint(epId);
    uiStore.setActiveView('live');
  }

  // Rerender clock for the event feed's relative-time labels. Ticks every
  // second so labels age monotonically regardless of measurement cadence —
  // a round-counter-driven clock would freeze "N s ago" between rounds or
  // after lifecycle stops. Torn down on component destroy.
  let nowTick = $state(Date.now());
  let nowTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
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

<section class="overview" aria-label="Overview">
  <div class="overview-grid">
    <div class="overview-left">
      <ChronographDial
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
    <div class="overview-right" data-subtab={$uiStore.overviewSubtab}>
      <div class="overview-subtab-strip">
        <OverviewSubtabStrip
          selected={$uiStore.overviewSubtab}
          onSelect={(t) => uiStore.setOverviewSubtab(t)}
        />
      </div>
      <div
        class="card-slot card-slot--racing"
        id="overview-panel-racing"
        role="tabpanel"
        aria-labelledby="overview-subtab-racing"
      >
        <RacingStrip
          endpoints={monitored}
          {stats}
          {lastLatencies}
          {samplesByEndpoint}
          {threshold}
          focusedEndpointId={$uiStore.focusedEndpointId}
        />
      </div>
      <div
        class="card-slot card-slot--events"
        id="overview-panel-events"
        role="tabpanel"
        aria-labelledby="overview-subtab-events"
      >
        <EventFeed
          {events}
          endpoints={monitored}
          {now}
          onDrill={handleEventDrill}
        />
      </div>
    </div>
  </div>
</section>

<style>
  .overview {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 24px 16px;
    min-height: 0;
    overflow: hidden;
  }

  /* Two-column grid: dial + causal verdict on the left, racing strip + event
     feed on the right. Collapses to one column below 1024 px. Centered with
     max-width so wide viewports don't stretch the grid. */
  .overview-grid {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .overview-left {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .overview-right {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  /* Desktop: both racing and events live side-by-side in the right column
     (the 2-col grid above stacks them vertically). The subtab strip is
     hidden — it only exists as a mobile affordance. */
  .overview-subtab-strip { display: none; }

  @media (max-width: 1023px) {
    .overview-grid { grid-template-columns: 1fr; }
    /* Narrow viewports: expose the subtab strip and render only the active
       card. The inactive card stays mounted in the DOM via CSS hide so its
       store subscriptions persist (no resubscribe jitter when toggling). */
    .overview-subtab-strip { display: block; }
    .overview-right[data-subtab="racing"] .card-slot--events { display: none; }
    .overview-right[data-subtab="events"] .card-slot--racing { display: none; }
  }
  @media (max-width: 767px) {
    .overview { padding: 6px 12px 6px; gap: 10px; }
    .overview-left, .overview-right { gap: 8px; }
  }
</style>
