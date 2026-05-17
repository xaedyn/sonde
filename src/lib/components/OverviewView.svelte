<!-- src/lib/components/FigmaOverviewView.svelte -->
<!-- Figma-aligned Overview surface. Visual hierarchy follows the locked       -->
<!-- reference screenshots while all facts still come from Chronoscope stores. -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { networkQualityStore, monitoredEndpointsStore } from '$lib/stores/derived';
  import {
    buildDiagnosticNarrative,
    type DiagnosticNarrative,
  } from '$lib/utils/diagnostic-narrative';
  import { diagnosticAlignedScore } from '$lib/utils/classify';
  import {
    buildRunStoryline,
    type EndpointTimelineRow,
    type RunStoryline,
    type StoryBeat,
    type StoryBeatSeverity,
    type TimelinePoint,
  } from '$lib/utils/run-storyline';
  import type { Endpoint, EndpointStatistics, MeasurementSample } from '$lib/types';
  import type { VerdictRow } from '$lib/utils/verdict';
  import NetworkTopology from './NetworkTopology.svelte';
  import { navigateTo } from '$lib/router';

  const HISTORY_VIEWBOX_WIDTH = 180;
  const HISTORY_VIEWBOX_HEIGHT = 48;
  const HISTORY_BASELINE_Y = 40;
  const HISTORY_RANGE_Y = 32;

  interface EndpointSummary {
    readonly endpoint: Endpoint;
    readonly stats: EndpointStatistics | null;
    readonly samples: readonly MeasurementSample[];
    readonly timeline: EndpointTimelineRow | null;
    readonly latency: number | null;
    readonly delta: number | null;
    readonly status: string;
    readonly recent: string;
    readonly tone: 'good' | 'warn' | 'bad' | 'collecting';
  }

  interface EventLogItem {
    readonly id: string;
    readonly t: number | null;
    readonly time: string;
    readonly age: string;
    readonly label: string;
    readonly evidence: string;
    readonly tone: 'info' | 'good' | 'watch' | 'bad';
    readonly endpointIds: readonly string[];
  }

  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const settings = $derived($settingsStore);
  const measurements = $derived($measurementStore);
  const threshold = $derived(settings.healthThreshold);
  const rawScore = $derived($networkQualityStore);

  const samplesByEndpoint = $derived.by<Record<string, readonly MeasurementSample[]>>(() => {
    const out: Record<string, readonly MeasurementSample[]> = {};
    for (const ep of monitored) {
      const state = measurements.endpoints[ep.id];
      out[ep.id] = state ? state.samples.toArray().slice(-48) : [];
    }
    return out;
  });

  const storylineSamplesByEndpoint = $derived.by<Record<string, readonly MeasurementSample[]>>(() => {
    const out: Record<string, readonly MeasurementSample[]> = {};
    for (const ep of monitored) {
      const state = measurements.endpoints[ep.id];
      out[ep.id] = state ? state.samples.slice(-5_000) : [];
    }
    return out;
  });

  const verdictRows: readonly VerdictRow[] = $derived.by(() => {
    const rows: VerdictRow[] = [];
    for (const ep of monitored) {
      const rowStats = stats[ep.id];
      if (rowStats?.ready) rows.push({ ep, stats: rowStats });
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

  const runStoryline: RunStoryline = $derived(buildRunStoryline({
    endpoints: monitored,
    samplesByEndpoint: storylineSamplesByEndpoint,
    threshold,
    runStart: measurements.startedAt,
    focusedEndpointId: $uiStore.focusedEndpointId,
    maxVisibleRows: Math.max(monitored.length, 4),
  }));
  const timelineRowsByEndpoint = $derived.by<Record<string, EndpointTimelineRow>>(() => (
    Object.fromEntries(runStoryline.rows.map((row) => [row.endpointId, row]))
  ));
  const timelineWindowLabel = $derived(`Last ${durationLabel(timelineWindowSpan())} · Now on right`);
  const timelineTicks = $derived(buildTimelineTicks(runStoryline.windowStart, runStoryline.windowEnd));

  const score = $derived(diagnosticAlignedScore(rawScore, diagnosticNarrative.severity));
  const scoreDisplay = $derived(score === null ? '—' : (score / 10).toFixed(1));
  const scorePercent = $derived(score === null ? 0 : Math.max(0, Math.min(100, score)));
  const severityLabel = $derived.by(() => {
    if (diagnosticNarrative.kind === 'collecting') return 'Collecting';
    if (diagnosticNarrative.severity === 'healthy') return 'Good';
    if (diagnosticNarrative.severity === 'degraded') return 'Degraded';
    return 'Watch';
  });
  const severityTone = $derived.by(() => {
    if (diagnosticNarrative.kind === 'collecting') return 'collecting';
    if (diagnosticNarrative.severity === 'healthy') return 'good';
    if (diagnosticNarrative.severity === 'degraded') return 'warn';
    return 'watch';
  });
  const headline = $derived(diagnosticNarrative.primaryAnswer.text);
  const measuredFact = $derived(diagnosticNarrative.supportingSummary);
  const interpretation = $derived.by(() => {
    if (diagnosticNarrative.kind === 'collecting') {
      return 'Chronoscope needs a few successful checks before it can compare endpoints responsibly.';
    }
    return diagnosticNarrative.safeSummary.replace(/^This browser test:\s*/i, '');
  });
  const primaryActionText = $derived(diagnosticNarrative.primaryValidation.label);
  const primaryActionReason = $derived(diagnosticNarrative.primaryValidation.reason);
  const primaryActionDisabled = $derived(
    diagnosticNarrative.primaryValidation.id === 'collect-more-samples'
      && (measurements.lifecycle === 'running' || measurements.lifecycle === 'starting' || measurements.lifecycle === 'stopping'),
  );

  const endpointRows: readonly EndpointSummary[] = $derived.by(() => (
    monitored.map((endpoint) => {
      const rowStats = stats[endpoint.id] ?? null;
      const endpointState = measurements.endpoints[endpoint.id];
      const latency = endpointState?.lastLatency ?? rowStats?.p50 ?? null;
      const samples = samplesByEndpoint[endpoint.id] ?? [];
      const timeline = timelineRowsByEndpoint[endpoint.id] ?? null;
      const lastStatus = endpointState?.lastStatus ?? null;
      const delta = rowStats?.stddev ?? null;
      let tone: EndpointSummary['tone'] = 'collecting';
      let status = 'Collecting samples';

      if (lastStatus === 'timeout' || lastStatus === 'error') {
        tone = 'bad';
        status = 'Request failed in browser check';
      } else if (rowStats?.ready) {
        if (rowStats.lossPercent >= 1) {
          tone = 'bad';
          status = 'Failed requests detected';
        } else if (rowStats.p95 > threshold) {
          tone = 'warn';
          status = 'Latency spikes detected';
        } else if (rowStats.stddev >= 25) {
          tone = 'warn';
          status = 'Latency variation detected';
        } else {
          tone = 'good';
          status = 'Stable performance';
        }
      }

      return {
        endpoint,
        stats: rowStats,
        samples,
        timeline,
        latency,
        delta,
        status,
        recent: timeline?.summary ?? `${samples.length} recent browser samples`,
        tone,
      };
    })
  ));

  const eventRows: readonly EventLogItem[] = $derived.by(() => {
    const beats = runStoryline.beats.slice(-5);
    if (beats.length === 0) {
      return [{
        id: 'run-state',
        t: measurements.roundCounter > 0 ? runStoryline.windowEnd : null,
        time: measurements.roundCounter > 0 ? eventRunTime(runStoryline.windowEnd) : 'Ready',
        age: measurements.roundCounter > 0 ? 'now' : 'no run yet',
        label: measurements.roundCounter > 0 ? runStoryline.summary : 'Start a browser test to build an event trail',
        evidence: measurements.roundCounter > 0 ? `${runStoryline.sampleCount} samples in the current window` : 'No measurements captured yet',
        tone: 'info',
        endpointIds: [],
      }];
    }
    return beats.map((beat: StoryBeat) => ({
      id: beat.id,
      t: beat.t,
      time: eventRunTime(beat.t),
      age: timeAgoLabel(beat.t),
      label: beat.label,
      evidence: beat.evidence,
      tone: toneForBeat(beat.severity),
      endpointIds: beat.endpointIds,
    }));
  });

  function toneForBeat(severity: StoryBeatSeverity): EventLogItem['tone'] {
    if (severity === 'good') return 'good';
    if (severity === 'bad') return 'bad';
    if (severity === 'watch') return 'watch';
    return 'info';
  }

  function timelineWindowSpan(): number {
    return Math.max(1, runStoryline.windowEnd - runStoryline.windowStart);
  }

  function durationLabel(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 90) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }

  function buildTimelineTicks(start: number, end: number): readonly { readonly pct: number; readonly label: string }[] {
    const span = Math.max(1, end - start);
    const seconds = span / 1000;
    const positions = seconds < 20 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
    return positions.map((position) => ({
      pct: position * 100,
      label: position === 1 ? 'Now' : `-${durationLabel(span * (1 - position))}`,
    }));
  }

  function timelinePct(timestamp: number): number {
    const span = timelineWindowSpan();
    return Math.max(0, Math.min(100, ((timestamp - runStoryline.windowStart) / span) * 100));
  }

  function historyPointY(point: Pick<TimelinePoint, 'normalizedLatency' | 'status'>): number {
    if (point.status === 'failed' || point.normalizedLatency == null) return 48;
    const y = HISTORY_BASELINE_Y - Math.min(HISTORY_RANGE_Y, Math.max(0, point.normalizedLatency) * HISTORY_RANGE_Y);
    return (y / HISTORY_VIEWBOX_HEIGHT) * 100;
  }

  function historyPath(row: EndpointTimelineRow): string {
    let d = '';
    let prevWasGap = true;
    for (const point of row.points) {
      if (point.status === 'failed' || point.normalizedLatency == null) {
        prevWasGap = true;
        continue;
      }
      const x = (timelinePct(point.t) / 100) * HISTORY_VIEWBOX_WIDTH;
      const y = HISTORY_BASELINE_Y - Math.min(HISTORY_RANGE_Y, Math.max(0, point.normalizedLatency) * HISTORY_RANGE_Y);
      d += `${prevWasGap ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
      prevWasGap = false;
    }
    return d.trim();
  }

  function historyMarkers(row: EndpointTimelineRow): readonly TimelinePoint[] {
    return row.points.filter((point) => (
      point.status === 'failed' || point.status === 'slow' || point.status === 'elevated'
    ));
  }

  function timeAgoLabel(timestamp: number): string {
    const age = Math.max(0, runStoryline.windowEnd - timestamp);
    return age <= 999 ? 'now' : `${durationLabel(age)} ago`;
  }

  function eventRunTime(timestamp: number): string {
    if (!Number.isFinite(timestamp)) return 'Now';
    if (measurements.startedAt !== null) {
      const elapsed = Math.max(0, Math.round((timestamp - measurements.startedAt) / 1000));
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatLatency(value: number | null): string {
    return value === null || !Number.isFinite(value) ? '—' : String(Math.round(value));
  }

  function formatDelta(value: number | null): string {
    return value === null || !Number.isFinite(value) ? '±—' : `±${Math.round(value)}`;
  }

  function handlePrimaryAction(): void {
    const action = diagnosticNarrative.primaryValidation;
    const target = action.endpointId;
    if (target) uiStore.setFocusedEndpoint(target);

    switch (action.id) {
      case 'collect-more-samples':
        if (
          measurements.lifecycle === 'idle'
          || measurements.lifecycle === 'stopped'
          || measurements.lifecycle === 'completed'
        ) {
          measurementStore.setLifecycle('starting');
        }
        return;
      case 'share-snapshot':
      case 'share-support-report':
        uiStore.toggleShare();
        return;
      case 'explain-browser-visibility':
      case 'open-investigate':
      case 'run-remote-check':
      case 'compare-network':
        // If the action carries an endpoint context, deep-link directly to
        // the EndpointDetail page; otherwise go to the Investigate landing.
        if (target) {
          navigateTo({ name: 'endpoint', endpointId: target });
        } else {
          navigateTo({ name: 'investigate', endpointId: null });
        }
        return;
    }
  }

  function handleEvidenceAction(): void {
    navigateTo({ name: 'investigate', endpointId: null });
  }

  // PR 7 of synthesis arc: route all drill-in navigation through the router
  // so URLs stay in sync. Per the design contract, drilling into an endpoint
  // navigates to /endpoint/:id (the EndpointDetail surface). Drilling into
  // Live keeps the user on /live; the focused endpoint is recorded on
  // uiStore.focusedEndpointId for solo-mode trace highlighting on Live —
  // the router does not own that mutation when route !== 'endpoint'.
  function handleEndpointDrill(endpointId: string, destination: 'live' | 'diagnose'): void {
    if (destination === 'diagnose') {
      navigateTo({ name: 'endpoint', endpointId });
    } else {
      uiStore.setFocusedEndpoint(endpointId);
      navigateTo({ name: 'live', endpointId: null });
    }
  }

  function handleEventDrill(item: EventLogItem): void {
    const endpointId = item.endpointIds[0] ?? null;
    if (endpointId) {
      navigateTo({ name: 'endpoint', endpointId });
    } else {
      navigateTo({ name: 'investigate', endpointId: null });
    }
  }
</script>

<section class="figma-overview" aria-label="Overview">
  <div class="overview-inner">
    <div class="hero-row">
    <section class="verdict-card" aria-label="Connection verdict">
      <div class="score-ring" style:--score-percent={`${scorePercent}%`} aria-label={`Score ${scoreDisplay} out of 10`}>
        <div class="score-ring-inner">
          <strong>{scoreDisplay}</strong>
          <span>Score</span>
        </div>
        <small>Based on aggregate latency</small>
      </div>

      <div class="verdict-copy">
        <div class="verdict-kickers">
          <span class="severity-pill" data-tone={severityTone}>{severityLabel}</span>
          {#if measurements.lifecycle === 'running' || measurements.lifecycle === 'starting'}
            <span class="measuring-pill"><span aria-hidden="true"></span>Measuring</span>
          {/if}
        </div>
        <h1>{headline}</h1>
        <p><strong>Measured Fact:</strong> {measuredFact}</p>
        <p class="interpretation"><strong>Interpretation:</strong> {interpretation}</p>
        <div class="verdict-actions">
          <button
            type="button"
            class="primary-action"
            title={primaryActionReason}
            disabled={primaryActionDisabled}
            aria-disabled={primaryActionDisabled}
            onclick={handlePrimaryAction}
          >
            <span aria-hidden="true">◇</span>
            {primaryActionText}
          </button>
          <button type="button" class="secondary-action" onclick={handleEvidenceAction}>
            View full evidence <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>

      <aside class="network-topology-wrap" aria-label="Network topology">
        <NetworkTopology />
      </aside>
    </div>

    <div class="lower-grid">
      <section class="measured-panel" aria-label="Measured endpoints">
        <header class="panel-header">
          <div>
            <h2>Measured Endpoints</h2>
            <p class="overview-time-window">{timelineWindowLabel}</p>
          </div>
          <button type="button" onclick={() => navigateTo({ name: 'live', endpointId: null })}>Live chart <span aria-hidden="true">›</span></button>
        </header>
        <div class="overview-time-axis" aria-hidden="true">
          {#each timelineTicks as tick (tick.pct)}
            <span style:left="{tick.pct}%">{tick.label}</span>
          {/each}
        </div>
        <div class="endpoint-list">
          {#each endpointRows as row (row.endpoint.id)}
            <button
              type="button"
              class="endpoint-row"
              data-endpoint-id={row.endpoint.id}
              data-tone={row.tone}
              aria-label="{row.endpoint.label}. {row.status}. {row.recent}. Latest {formatLatency(row.latency)} milliseconds."
              onclick={() => handleEndpointDrill(row.endpoint.id, 'live')}
              onkeydown={(event) => {
                if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  handleEndpointDrill(row.endpoint.id, 'diagnose');
                }
              }}
            >
              <span class="endpoint-state" aria-hidden="true"></span>
              <span class="endpoint-main">
                <strong>{row.endpoint.label}</strong>
                <small>{row.status}</small>
                <em>{row.recent}</em>
              </span>
              <span class="endpoint-history" aria-hidden="true">
                {#if row.timeline}
                  <svg
                    class="endpoint-trace"
                    viewBox="0 0 {HISTORY_VIEWBOX_WIDTH} {HISTORY_VIEWBOX_HEIGHT}"
                    preserveAspectRatio="none"
                  >
                    <path d={historyPath(row.timeline)} />
                  </svg>
                  {#each historyMarkers(row.timeline) as point, markerIndex (`${row.endpoint.id}-${point.round}-${point.t}-${point.status}-${markerIndex}`)}
                    <span
                      class="endpoint-history-marker"
                      data-status={point.status}
                      style:left="{timelinePct(point.t)}%"
                      style:top="{historyPointY(point)}%"
                    ></span>
                  {/each}
                {:else}
                  <span class="endpoint-history-empty"></span>
                {/if}
              </span>
              <span class="endpoint-metric">
                <strong>{formatLatency(row.latency)} <small>ms</small></strong>
                <em>{formatDelta(row.delta)} ms</em>
              </span>
            </button>
          {/each}
        </div>
      </section>

      <section class="event-panel" aria-label="Event log">
        <header class="panel-header">
          <div>
            <h2>Event Log</h2>
          </div>
        </header>
        <div class="event-timeline" aria-label="Event timeline">
          <p class="overview-time-window event-timeline-window">{timelineWindowLabel}</p>
          <div class="overview-time-axis" aria-hidden="true">
            {#each timelineTicks as tick (tick.pct)}
              <span style:left="{tick.pct}%">{tick.label}</span>
            {/each}
          </div>
          <div class="event-track" aria-hidden="true">
            {#each eventRows as item (item.id)}
              {#if item.t !== null}
                <span
                  class="event-pin"
                  data-tone={item.tone}
                  style:left="{timelinePct(item.t)}%"
                ></span>
              {/if}
            {/each}
          </div>
        </div>
        <ol class="event-list">
          {#each eventRows as item (item.id)}
            <li data-tone={item.tone}>
              <button
                type="button"
                class="event-entry"
                data-tone={item.tone}
                onclick={() => handleEventDrill(item)}
              >
                <time>{item.time}</time>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.evidence}</small>
                </span>
                <em>{item.age}</em>
              </button>
            </li>
          {/each}
        </ol>
        <button type="button" class="event-more" onclick={handleEvidenceAction}>View evidence trail</button>
      </section>
    </div>
  </div>
</section>

<style>
  .figma-overview {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: clamp(32px, 5vw, 72px) clamp(16px, 4vw, 48px) 48px;
  }

  .overview-inner {
    width: min(100%, 1320px);
    margin: 0 auto;
    display: grid;
    gap: 32px;
  }

  .hero-row {
    display: grid;
    /* Per synthesis design contract Section 2: verdict-card 880-1040 wide
       at 1440 viewport. Track sizing here lands the card in that envelope
       while leaving the topology panel at ~280-360px on the right. */
    grid-template-columns: minmax(0, 1040px) minmax(260px, 360px);
    gap: 24px;
    align-items: stretch;
  }

  .network-topology-wrap {
    min-width: 0;
    display: flex;
    align-items: stretch;
  }
  .network-topology-wrap :global(.network-topology) {
    flex: 1;
  }

  .verdict-card {
    min-height: 360px;
    max-height: 460px;
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: clamp(20px, 3vw, 40px);
    align-items: center;
    padding: clamp(24px, 3vw, 40px);
    border: 1px solid var(--shell-border-strong);
    border-radius: 18px;
    background:
      radial-gradient(circle at 18% 45%, var(--shell-bg-cyan), transparent 34%),
      linear-gradient(135deg, var(--shell-panel-raised), color-mix(in srgb, var(--shell-panel-raised) 72%, transparent));
    box-shadow: 0 28px 90px color-mix(in srgb, black 18%, transparent);
  }

  .score-ring {
    --score-percent: 0%;
    width: 172px;
    justify-self: center;
    display: grid;
    justify-items: center;
    gap: 12px;
    text-align: center;
    color: var(--accent-cyan);
  }

  .score-ring::before {
    content: '';
    width: 154px;
    height: 154px;
    grid-area: 1 / 1;
    border-radius: 50%;
    background: conic-gradient(var(--accent-cyan) var(--score-percent), rgba(103, 232, 249, 0.12) 0);
    box-shadow: 0 0 32px rgba(103, 232, 249, 0.18);
  }

  .score-ring-inner {
    width: 126px;
    height: 126px;
    margin-top: 14px;
    grid-area: 1 / 1;
    border-radius: 50%;
    display: grid;
    place-content: center;
    gap: 4px;
    background: var(--shell-panel);
    color: var(--t1);
  }

  .score-ring strong {
    font-size: clamp(36px, 4vw, 48px);
    line-height: 1;
    letter-spacing: var(--tr-body);
  }

  .score-ring span,
  .score-ring small {
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
    color: var(--accent-cyan);
  }

  .score-ring span { font-size: var(--ts-xs); font-weight: 700; }
  .score-ring small { max-width: 150px; font-size: 10px; color: var(--t4); }

  .verdict-copy {
    min-width: 0;
    display: grid;
    gap: 16px;
  }

  .verdict-kickers {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .severity-pill,
  .measuring-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    min-height: 28px;
    padding: 0 14px;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: var(--ts-sm);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
  }

  .severity-pill[data-tone='good'] {
    color: var(--accent-green);
    border: 1px solid var(--shell-success-border);
    background: var(--shell-success-bg);
  }

  .severity-pill[data-tone='warn'],
  .severity-pill[data-tone='watch'] {
    color: var(--accent-amber);
    border: 1px solid var(--shell-stop-border);
    background: var(--shell-bg-amber);
  }

  .severity-pill[data-tone='collecting'],
  .measuring-pill {
    color: var(--accent-cyan);
    border: 1px solid var(--shell-border-strong);
    background: var(--shell-bg-cyan);
  }

  .measuring-pill span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-cyan);
    box-shadow: 0 0 12px var(--glow-cyan);
  }

  h1 {
    margin: 0;
    max-width: 900px;
    font-size: clamp(30px, 4.2vw, 52px);
    line-height: 1.08;
    letter-spacing: var(--tr-tight);
    color: var(--t1);
  }

  p {
    margin: 0;
    max-width: 820px;
    color: var(--t2);
    font-size: clamp(15px, 1.6vw, 19px);
    line-height: 1.65;
  }

  p strong {
    color: var(--t1);
    font-weight: 800;
  }

  .interpretation {
    color: var(--t3);
  }

  .verdict-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 18px;
    padding-top: 10px;
  }

  .primary-action,
  .secondary-action,
  .panel-header button,
  .event-more {
    min-height: 44px;
    border-radius: 8px;
    font-family: var(--sans);
    font-weight: 800;
    cursor: pointer;
  }

  .primary-action {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 28px;
    border: 1px solid transparent;
    background: linear-gradient(135deg, var(--accent-cyan), color-mix(in srgb, var(--accent-cyan), black 70%));
    color: var(--shell-bg);
    box-shadow: 0 0 28px rgba(103, 232, 249, 0.26);
  }

  .primary-action:disabled {
    cursor: default;
    opacity: 0.72;
    box-shadow: none;
  }

  .secondary-action {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--t2);
  }

  .secondary-action:hover,
  .panel-header button:hover,
  .event-more:hover {
    color: var(--accent-cyan);
  }

  .lower-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
    gap: 32px;
    align-items: start;
  }

  .measured-panel,
  .event-panel {
    min-width: 0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 54px;
    border-bottom: 1px solid var(--shell-border);
  }

  .panel-header h2 {
    margin: 0;
    font-family: var(--mono);
    font-size: clamp(16px, 1.7vw, 22px);
    text-transform: uppercase;
    letter-spacing: var(--tr-kicker);
    color: var(--t2);
  }

  .panel-header p {
    margin: 5px 0 0;
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1.2;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    color: var(--t4);
  }

  .panel-header button {
    border: 0;
    background: transparent;
    color: var(--accent-cyan);
  }

  .overview-time-axis {
    position: relative;
    height: 24px;
    margin-top: 12px;
    color: var(--t4);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }

  .overview-time-axis::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 11px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--shell-border-strong), transparent);
  }

  .overview-time-axis span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .overview-time-axis span:first-child { transform: translateX(0); }
  .overview-time-axis span:last-child { transform: translateX(-100%); color: var(--accent-cyan); }

  .endpoint-list,
  .event-list {
    margin-top: 10px;
    border: 1px solid var(--shell-border);
    border-radius: 18px;
    background: color-mix(in srgb, var(--shell-panel) 74%, transparent);
    overflow: hidden;
  }

  .endpoint-row {
    width: 100%;
    display: grid;
    grid-template-columns: 20px minmax(190px, 0.9fr) minmax(220px, 1.15fr) minmax(76px, auto);
    gap: 16px;
    align-items: center;
    min-height: 102px;
    padding: 18px 20px;
    border: 0;
    border-bottom: 1px solid var(--shell-border);
    background: transparent;
    color: var(--t1);
    text-align: left;
    cursor: pointer;
  }

  .endpoint-row:last-child { border-bottom: 0; }
  .endpoint-row:hover { background: var(--shell-panel-hover); }

  .endpoint-state {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid currentColor;
    color: var(--t4);
  }

  .endpoint-row[data-tone='good'] .endpoint-state { color: var(--accent-green); }
  .endpoint-row[data-tone='warn'] .endpoint-state { color: var(--accent-amber); }
  .endpoint-row[data-tone='bad'] .endpoint-state { color: var(--accent-pink); }
  .endpoint-row[data-tone='collecting'] .endpoint-state { color: var(--accent-cyan); }

  .endpoint-main {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .endpoint-main strong {
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid var(--shell-border-strong);
    font-family: var(--mono);
    font-size: clamp(15px, 1.6vw, 18px);
    color: var(--t1);
  }

  .endpoint-main small,
  .endpoint-main em,
  .endpoint-metric em,
  .event-list small {
    font-style: normal;
    color: var(--t3);
  }

  .endpoint-main em {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ts-xs);
    color: var(--t4);
  }

  .endpoint-history {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 54px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--shell-base) 54%, transparent);
    overflow: hidden;
  }

  .endpoint-history::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 10px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent);
  }

  .endpoint-trace {
    position: absolute;
    inset: 7px 8px;
    width: calc(100% - 16px);
    height: calc(100% - 14px);
    overflow: visible;
  }

  .endpoint-trace path {
    fill: none;
    stroke: currentColor;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    color: var(--accent-green);
    filter: drop-shadow(0 0 8px rgba(44, 245, 169, 0.18));
  }

  .endpoint-row[data-tone='warn'] .endpoint-trace path { color: var(--accent-amber); }
  .endpoint-row[data-tone='bad'] .endpoint-trace path { color: var(--accent-pink); }
  .endpoint-row[data-tone='collecting'] .endpoint-trace path { color: var(--accent-cyan); }

  .endpoint-history-marker {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: var(--accent-amber);
    border: 2px solid rgba(8, 14, 24, 0.92);
    box-shadow: 0 0 14px rgba(250, 204, 21, 0.35);
  }

  .endpoint-history-marker[data-status='slow'] {
    background: var(--accent-pink);
    box-shadow: 0 0 16px rgba(251, 113, 133, 0.36);
  }

  .endpoint-history-marker[data-status='failed'] {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: var(--accent-pink);
    box-shadow: 0 0 16px rgba(251, 113, 133, 0.42);
  }

  .endpoint-metric {
    display: grid;
    justify-items: end;
    gap: 4px;
    font-family: var(--mono);
  }

  .endpoint-metric strong {
    font-size: clamp(18px, 1.8vw, 24px);
    color: var(--t1);
  }

  .endpoint-metric small {
    font-size: var(--ts-xs);
    color: var(--t2);
  }

  .event-timeline {
    margin-top: 12px;
    padding: 12px 14px 14px;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--shell-base) 62%, transparent);
  }

  .event-timeline-window {
    margin: 0 0 8px;
    max-width: none;
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1.2;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    color: var(--t4);
  }

  .event-timeline .overview-time-axis {
    margin-top: 0;
  }

  .event-track {
    position: relative;
    height: 36px;
    margin-top: 4px;
  }

  .event-track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 17px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(103, 232, 249, 0.12), rgba(103, 232, 249, 0.38), rgba(103, 232, 249, 0.12));
  }

  .event-pin {
    position: absolute;
    top: 17px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: var(--accent-cyan);
    border: 2px solid rgba(8, 14, 24, 0.95);
    box-shadow: 0 0 18px rgba(103, 232, 249, 0.4);
  }

  .event-pin[data-tone='good'] {
    background: var(--accent-green);
    box-shadow: 0 0 18px rgba(44, 245, 169, 0.34);
  }

  .event-pin[data-tone='watch'] {
    background: var(--accent-amber);
    box-shadow: 0 0 18px rgba(250, 204, 21, 0.34);
  }

  .event-pin[data-tone='bad'] {
    background: var(--accent-pink);
    box-shadow: 0 0 18px rgba(251, 113, 133, 0.38);
  }

  .event-list {
    list-style: none;
    padding: 18px;
    display: grid;
    gap: 10px;
  }

  .event-list li {
    min-width: 0;
  }

  .event-entry {
    width: 100%;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 58px;
    gap: 12px;
    align-items: start;
    min-height: 54px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    font-family: var(--mono);
    cursor: pointer;
  }

  .event-list time {
    color: var(--t4);
    font-size: var(--ts-sm);
  }

  .event-entry span {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .event-list strong {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.45;
  }

  .event-entry em {
    justify-self: end;
    font-style: normal;
    font-size: var(--ts-xs);
    color: var(--t4);
    white-space: nowrap;
  }

  .event-entry:hover strong,
  .event-entry:focus-visible strong {
    color: var(--accent-cyan);
  }

  .event-list li[data-tone='good'] strong { color: var(--accent-green); }
  .event-list li[data-tone='watch'] strong { color: var(--accent-amber); }
  .event-list li[data-tone='bad'] strong { color: var(--accent-pink); }

  .event-more {
    width: 100%;
    margin-top: 14px;
    border: 1px solid var(--shell-border);
    background: transparent;
    color: var(--t2);
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
    font-family: var(--mono);
    font-size: var(--ts-xs);
  }

  button:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 3px;
  }

  @media (max-width: 1100px) {
    .hero-row {
      /* Collapse to single column below ~tablet width. The synthesis arc's
         desktop 2-col verdict + topology layout squashes the verdict card
         to almost nothing without this — verified at 600px viewport
         post-PR 6 deploy: verdict-card was 184px wide. */
      grid-template-columns: 1fr;
    }
    .verdict-card {
      grid-template-columns: 170px minmax(0, 1fr);
      gap: 28px;
    }
    .lower-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 700px) {
    .figma-overview {
      padding: 16px 16px 32px;
    }
    .overview-inner {
      gap: 24px;
    }
    .verdict-card {
      grid-template-columns: 1fr;
      justify-items: start;
      padding: 20px 24px 22px;
      min-height: 0;
      gap: 16px;
    }
    .score-ring {
      justify-self: center;
      width: 132px;
      order: -1;
    }
    .score-ring::before {
      width: 118px;
      height: 118px;
    }
    .score-ring-inner {
      width: 94px;
      height: 94px;
      margin-top: 12px;
    }
    .score-ring small { display: none; }
    .score-ring strong { font-size: 34px; }
    h1 { font-size: 31px; line-height: 1.08; }
    p { font-size: 15px; line-height: 1.55; }
    .endpoint-row {
      grid-template-columns: 18px minmax(0, 1fr) minmax(86px, 120px);
      gap: 12px;
      min-height: 128px;
      padding: 14px;
    }
    .endpoint-main em {
      white-space: normal;
    }
    .endpoint-history {
      grid-column: 2 / -1;
      grid-row: 2;
      height: 52px;
    }
    .endpoint-metric {
      align-self: start;
    }
    .event-entry {
      grid-template-columns: 68px minmax(0, 1fr);
    }
    .event-entry em {
      grid-column: 2;
      justify-self: start;
    }
    .verdict-actions {
      width: 100%;
    }
    .primary-action,
    .secondary-action {
      width: 100%;
      justify-content: center;
    }
  }
</style>
