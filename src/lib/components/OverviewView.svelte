<!-- src/lib/components/OverviewView.svelte -->
<!-- Overview — verdict-first Status layout. Composes the CausalVerdictStrip, -->
<!-- chronograph dial, RacingStrip, and RunStorylineCard. Score-history /      -->
<!-- baseline / storyline are derived locally here; the underlying stats + samples -->
<!-- flow through the monitoredEndpointsStore invariant.                        -->
<!-- The classic Overview mode was retired in v8; pre-v10 payloads that         -->
<!-- carried overviewMode are reset to defaults on load via persistence.ts.     -->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { measurementStore } from '$lib/stores/measurements';
  import { historyStore } from '$lib/stores/history';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { networkQualityStore, monitoredEndpointsStore } from '$lib/stores/derived';
  import { buildDiagnosticNarrative, type DiagnosticNarrative } from '$lib/utils/diagnostic-narrative';
  import { diagnosticAlignedScore } from '$lib/utils/classify';
  import { buildScoreExplanation } from '$lib/utils/score-explanation';
  import { buildHistoryBaselineInsight, type HistoryBaselineInsight } from '$lib/utils/history-baseline';
  import { buildRunStoryline, type RunStoryline } from '$lib/utils/run-storyline';
  import type { VerdictRow } from '$lib/utils/verdict';
  import { tokens } from '$lib/tokens';
  import ChronographDial from './ChronographDial.svelte';
  import CausalVerdictStrip from './CausalVerdictStrip.svelte';
  import RacingStrip from './RacingStrip.svelte';
  import RunStorylineCard from './RunStorylineCard.svelte';
  import OverviewSubtabStrip from './OverviewSubtabStrip.svelte';
  import type { Endpoint, MeasurementSample } from '$lib/types';

  let { onStart }: { onStart?: () => void } = $props();

  // ── Shared spine ──────────────────────────────────────────────────────────
  // Cross-phase invariant — user-facing aggregates derive from
  // monitoredEndpointsStore so dial orbit / verdict / racing strip can't
  // disagree about who's being measured. See PATTERNS.md §3.
  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const settings = $derived($settingsStore);

  // Cross-endpoint p99 — drives unified y-axis ceiling for Dial and RacingStrip.
  // Computed across ALL monitored endpoints (not just visible or focused).
  // Math.max(0, ...empty) === 0, which is the correct sentinel for "no data yet".
  const p99Across = $derived(Math.max(0, ...monitored.map((ep) => stats[ep.id]?.p99 ?? 0)));
  const measurements = $derived($measurementStore);
  const history = $derived($historyStore);
  const threshold = $derived(settings.healthThreshold);
  const rawScore = $derived($networkQualityStore);
  const paused = $derived(
    measurements.lifecycle === 'stopped' || measurements.lifecycle === 'completed',
  );
  const runContextLine = $derived.by(() => {
    const count = monitored.length;
    const plural = count === 1 ? 'endpoint' : 'endpoints';
    if (count === 0) return 'No endpoints are enabled.';
    if (measurements.lifecycle === 'running' || measurements.lifecycle === 'starting') {
      return `Measuring ${count} enabled ${plural} from this browser.`;
    }
    if (measurements.lifecycle === 'completed' || measurements.lifecycle === 'stopped') {
      return `Last run measured ${count} enabled ${plural} from this browser.`;
    }
    return `Ready to measure ${count} enabled ${plural} from this browser.`;
  });

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

  // ── Derived data for the dial / strip / storyline cards ──────────────────
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

  const STORYLINE_SOURCE_SAMPLE_CAP = 5_000;
  const storylineSamplesByEndpoint = $derived.by<Record<string, readonly MeasurementSample[]>>(() => {
    const out: Record<string, readonly MeasurementSample[]> = {};
    for (const ep of monitored) {
      const m = measurements.endpoints[ep.id];
      out[ep.id] = m ? m.samples.slice(-STORYLINE_SOURCE_SAMPLE_CAP) : [];
    }
    return out;
  });

  const HISTORY_MAX = 60;
  let scoreHistory = $state<number[]>([]);
  let lastSeenRound = -1;

  const runStoryline: RunStoryline = $derived(buildRunStoryline({
    endpoints: monitored,
    samplesByEndpoint: storylineSamplesByEndpoint,
    threshold,
    runStart: measurements.startedAt,
    focusedEndpointId: $uiStore.focusedEndpointId,
  }));

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
  const diagnosticNarrative: DiagnosticNarrative = $derived(buildDiagnosticNarrative({
    rows: verdictRows,
    threshold,
    corsMode: settings.corsMode,
    samplesByEndpoint,
    monitoredEndpointCount: monitored.length,
  }));
  const score = $derived(diagnosticAlignedScore(rawScore, diagnosticNarrative.severity));
  const scoreExplanation = $derived(buildScoreExplanation({
    rows: verdictRows,
    threshold,
    score,
    rawScore,
    capReason: diagnosticNarrative.primaryAnswer.text,
  }));
  // Score history ring buffer — one entry per round, max 60 entries. Driven by
  // roundCounter changes and aligned to the diagnostic narrative so the trace
  // never trends "healthy" while the answer says the run needs attention.
  $effect(() => {
    const round = measurements.roundCounter;
    if (round === lastSeenRound) return;
    lastSeenRound = round;
    // Only append when we have a valid score for this round.
    if (score === null) return;
    scoreHistory.push(score);
    while (scoreHistory.length > HISTORY_MAX) scoreHistory.shift();
  });
  const historyBaselineInsight: HistoryBaselineInsight = $derived(buildHistoryBaselineInsight({
    endpoints: monitored,
    stats,
    history: history.sessions,
    currentStartedAt: measurements.startedAt,
  }));

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
    if (diagnosticNarrative.verdict.tone !== 'warn') return null;
    const targetId = diagnosticNarrative.verdict.worstEpId ?? worst?.id ?? null;
    if (targetId === null) return null;
    return monitored.find((ep) => ep.id === targetId) ?? null;
  });

  function handleEnrichedDrill(epId: string): void {
    uiStore.setFocusedEndpoint(epId);
    uiStore.setActiveView('diagnose');
  }

  function handleStorylineDrill(epId: string): void {
    uiStore.setFocusedEndpoint(epId);
    uiStore.setActiveView('diagnose');
  }
</script>

<section class="overview status-view" aria-label="Status">
  <div class="status-shell">
    <CausalVerdictStrip
      diagnosis={diagnosticNarrative}
      {avgP50}
      {avgJitter}
      {avgLoss}
      {drillEndpoint}
      baselineInsight={historyBaselineInsight}
      {scoreExplanation}
      autoStartSuppressionReason={$uiStore.autoStartSuppressionReason}
      contextLine={runContextLine}
      onDrill={handleEnrichedDrill}
      onStart={onStart}
      variant="hero"
    />

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
          {p99Across}
        />
      </div>
      <div
        class="overview-right"
        data-has-events={runStoryline.markers.length > 0 ? 'true' : 'false'}
        data-subtab={$uiStore.overviewSubtab}
      >
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
            {p99Across}
          />
        </div>
        <div
          class="card-slot card-slot--events"
          id="overview-panel-events"
          role="tabpanel"
          aria-labelledby="overview-subtab-events"
        >
          <RunStorylineCard
            storyline={runStoryline}
            onDrill={handleStorylineDrill}
          />
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .overview {
    --status-shell-gap: 14px;
    --status-verdict-h: 138px;
    --status-dial-pad-y: 16px;
    --status-mobile-dial-size: 300px;
    --status-mobile-dial-row-h: calc(var(--status-mobile-dial-size) + var(--status-dial-pad-y));
    --status-mobile-detail-row-h: 167px;
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 12px 24px 16px;
    min-height: 0;
    overflow: hidden;
  }

  .status-shell {
    width: 100%;
    max-width: min(92vw, var(--content-max-w));
    margin: 0 auto;
    display: grid;
    grid-template-rows: var(--status-verdict-h) minmax(0, 1fr);
    gap: var(--status-shell-gap);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .status-shell :global(.verdict.hero) {
    height: var(--status-verdict-h);
    min-height: 0;
    overflow: hidden;
  }

  /* Verdict-first Status: answer on top, live dial as the left instrument,
     endpoint comparison and event feed on the right. Collapses to one column
     below 1024 px. Fluid above 1440 up to the --content-max-w ceiling so
     ultrawide monitors use their real estate instead of floating the grid in a
     centered 1440 box. */
  .overview-grid {
    width: 100%;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    gap: 20px;
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
  }
  /* container-type lets the dial size against this column's actual width via
     `cqi`, so it grows with the column on wide viewports without having to
     know about the rail, gutters, or viewport directly. */
  .overview-left {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    height: 100%;
    container-type: size;
  }
  .overview-right {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }
  .card-slot {
    min-width: 0;
    min-height: 0;
  }
  /* Desktop: both racing and events live side-by-side in the right column
     (the 2-col grid above stacks them vertically). The subtab strip is
     hidden — it only exists as a mobile affordance. */
  .overview-subtab-strip { display: none; }

  @media (max-width: 1023px) {
    .overview-grid {
      grid-template-columns: 1fr;
      grid-template-rows: var(--status-mobile-dial-row-h) var(--status-mobile-detail-row-h);
      gap: 10px;
      align-content: start;
    }
    .overview-left {
      height: var(--status-mobile-dial-row-h);
    }
    .overview-right {
      height: var(--status-mobile-detail-row-h);
      overflow: hidden;
    }
    .card-slot {
      flex: 1 1 0;
      overflow: hidden;
    }
    /* Narrow viewports: expose the subtab strip and render only the active
       card. The inactive card stays mounted in the DOM via CSS hide so its
       store subscriptions persist (no resubscribe jitter when toggling). */
    .overview-subtab-strip { display: block; }
    .overview-right[data-subtab="racing"] .card-slot--events { display: none; }
    .overview-right[data-subtab="events"] .card-slot--racing { display: none; }
  }
  @media (max-width: 767px) {
    .overview { --status-dial-pad-y: 8px; }
    .overview {
      padding: 8px 12px;
      overflow-x: hidden;
      overflow-y: hidden;
    }
    .status-shell { gap: 6px; }
    .overview-grid { grid-template-columns: 1fr; gap: 6px; align-content: start; }
    .overview-left, .overview-right { gap: 8px; }
  }

  @media (max-height: 900px) and (min-width: 768px) {
    .overview { --status-shell-gap: 10px; }
    .overview { padding-block: 10px; }
    .overview-grid { gap: 16px; }
    .overview-subtab-strip { display: block; }
    .overview-right[data-subtab="racing"] .card-slot--events { display: none; }
    .overview-right[data-subtab="events"] .card-slot--racing { display: none; }
  }

  @media (max-width: 767px) and (max-height: 860px) {
    .overview {
      --status-mobile-dial-size: 300px;
      --status-mobile-detail-row-h: 167px;
    }
    .overview { padding-block: 6px; }
    .status-shell,
    .overview-grid,
    .overview-left,
    .overview-right { gap: 6px; }
  }

  @media (max-width: 375px) {
    .overview {
      --status-mobile-dial-size: 280px;
    }
  }

  @media (max-width: 767px) and (max-height: 760px) {
    .overview {
      --status-dial-pad-y: 4px;
      --status-mobile-dial-size: 270px;
      --status-mobile-detail-row-h: 144px;
    }
  }

  @media (max-width: 375px) and (max-height: 760px) {
    .overview {
      --status-mobile-dial-size: 252px;
    }
  }
</style>
