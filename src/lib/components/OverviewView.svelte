<!-- src/lib/components/FigmaOverviewView.svelte -->
<!-- Figma-aligned Overview surface. Visual hierarchy follows the locked       -->
<!-- reference screenshots while all facts still come from Chronoscope stores. -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { monitoredEndpointsStore } from '$lib/stores/derived';
  import {
    buildDiagnosticNarrative,
    type DiagnosticNarrative,
  } from '$lib/utils/diagnostic-narrative';
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
  // Interpretation paragraph — distinct from the headline by design. Each
  // diagnostic kind gets a sentence that says what the headline implies
  // *for the user*, never restating it verbatim. Previously every kind
  // fell back to safeSummary, which is just the headline with a prefix
  // stripped — making the second paragraph a duplicate of the first
  // (verified on production 2026-05-17 healthy state).
  const interpretation = $derived.by(() => {
    const kind = diagnosticNarrative.kind;
    switch (kind) {
      case 'collecting':
        return 'Chronoscope needs a few successful checks before it can compare endpoints responsibly.';
      case 'healthy':
        return 'Chronoscope has not seen a meaningful slowdown or failure in this window.';
      case 'isolated-endpoint':
        return "That points to either your browser's route to that one endpoint, or the endpoint itself. An outside check can confirm whether the slowness follows the endpoint from other networks.";
      case 'shared-network':
        return 'Multiple endpoints slowing in the same window typically points to a shared link between your browser and them — most often local network or upstream ISP.';
      case 'multiple-slow':
        return 'Several endpoints over the threshold without a shared slow phase — likely either a shared upstream issue or coincident endpoint-side slowness. An outside check helps separate the two.';
      case 'packet-loss':
        return 'Failed requests in the browser can come from the endpoint, the route to it, or a CORS block. An outside check separates these without changing your local network.';
      case 'jitter':
        return "Bouncing latency without a clear failure pattern usually points to congestion somewhere on the path. The path's not down — it's noisy.";
    }
  });
  const primaryActionText = $derived(diagnosticNarrative.primaryValidation.label);
  const primaryActionReason = $derived(diagnosticNarrative.primaryValidation.reason);
  const primaryActionId = $derived(diagnosticNarrative.primaryValidation.id);
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

  // Per synthesis design contract Section 2 / Arc C C4: when the verdict
  // implicates a single endpoint, render its label as a tone-coloured chip
  // inline within the headline. Splits the headline on the label so the chip
  // can be styled while still being readable as a sentence.
  const highlightedEndpoint = $derived(diagnosticNarrative.highlightedEndpoint);
  const highlightedTone = $derived.by(() => {
    if (highlightedEndpoint === undefined) return null;
    const row = endpointRows.find((r) => r.endpoint.id === highlightedEndpoint.id);
    return row?.tone ?? null;
  });
  const headlineSegments = $derived.by(() => {
    if (highlightedEndpoint === undefined) return null;
    const label = highlightedEndpoint.label;
    const index = headline.indexOf(label);
    if (index < 0) return null;
    return {
      before: headline.slice(0, index),
      chip: label,
      after: headline.slice(index + label.length),
    };
  });

  // v2-style inline endpoint highlight inside body paragraphs (not just the
  // headline). Splits on any monitored endpoint label that appears in the
  // text and emits a span sequence the template renders as styled chips.
  function highlightEndpoints(text: string): readonly { readonly text: string; readonly tone: EndpointSummary['tone'] | null }[] {
    if (text.length === 0) return [{ text: '', tone: null }];
    const matchableLabels = endpointRows
      .map((row) => ({ label: row.endpoint.label, tone: row.tone }))
      .filter(({ label }) => label.length >= 2)
      .sort((a, b) => b.label.length - a.label.length); // longest-first so overlapping labels prefer the longer match
    if (matchableLabels.length === 0) return [{ text, tone: null }];

    const segments: { text: string; tone: EndpointSummary['tone'] | null }[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      let best: { label: string; tone: EndpointSummary['tone']; index: number } | null = null;
      for (const candidate of matchableLabels) {
        const index = text.indexOf(candidate.label, cursor);
        if (index < 0) continue;
        if (best === null || index < best.index) best = { ...candidate, index };
      }
      if (best === null) {
        segments.push({ text: text.slice(cursor), tone: null });
        break;
      }
      if (best.index > cursor) segments.push({ text: text.slice(cursor, best.index), tone: null });
      segments.push({ text: best.label, tone: best.tone });
      cursor = best.index + best.label.length;
    }
    return segments;
  }

  const measuredFactSegments = $derived(highlightEndpoints(measuredFact));
  const interpretationSegments = $derived(highlightEndpoints(interpretation));

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
      <div class="verdict-copy">
        <div class="verdict-kickers">
          <span class="severity-pill" data-tone={severityTone}>
            <span class="severity-pill-icon" aria-hidden="true">
              {#if severityTone === 'good'}
                <svg viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M5.2 8.2l2 2 3.6-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else if severityTone === 'collecting'}
                <svg viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/>
                </svg>
              {:else}
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  <path d="M8 6.5V9.5M8 11.2V11.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
              {/if}
            </span>
            {severityLabel}
          </span>
          {#if measurements.lifecycle === 'running' || measurements.lifecycle === 'starting'}
            <span class="measuring-pill" aria-label="Measuring">
              <span class="measuring-dot" aria-hidden="true">
                <span class="measuring-dot-ping"></span>
                <span class="measuring-dot-core"></span>
              </span>
              Live
            </span>
          {/if}
        </div>
        <h1>
          {#if headlineSegments !== null}
            {headlineSegments.before}<span
              class="headline-endpoint-name"
              data-tone={highlightedTone ?? 'collecting'}
            >{headlineSegments.chip}</span>{headlineSegments.after}
          {:else}
            {headline}
          {/if}
        </h1>
        <div class="verdict-body">
          <p>
            {#each measuredFactSegments as seg, i (i)}
              {#if seg.tone}<span class="body-endpoint-name" data-tone={seg.tone}>{seg.text}</span>{:else}{seg.text}{/if}
            {/each}
          </p>
          <p class="interpretation">
            {#each interpretationSegments as seg, i (i)}
              {#if seg.tone}<span class="body-endpoint-name" data-tone={seg.tone}>{seg.text}</span>{:else}{seg.text}{/if}
            {/each}
          </p>
        </div>
        <div class="verdict-actions">
          <button
            type="button"
            class="primary-action"
            title={primaryActionReason}
            disabled={primaryActionDisabled}
            aria-disabled={primaryActionDisabled}
            onclick={handlePrimaryAction}
          >
            <span class="primary-action-icon" aria-hidden="true">
              {#if primaryActionId === 'share-snapshot' || primaryActionId === 'share-support-report'}
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M11 9v3.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1H7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
              {:else if primaryActionId === 'run-remote-check' || primaryActionId === 'compare-network'}
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5l5.5 2v4.4c0 3-2.3 5.8-5.5 6.6-3.2-.8-5.5-3.6-5.5-6.6V3.5L8 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  <path d="M5.6 8.2l1.7 1.7 3.3-3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else if primaryActionId === 'collect-more-samples'}
                <svg viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M8 4.5V8L10.3 9.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else}
                <svg viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M10.2 10.2 14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
              {/if}
            </span>
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
          <h2>
            <span class="panel-header-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M2 8h2.6l1.4-4 2.2 8 2-5 1.2 3h2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            Measured Endpoints
          </h2>
          <p class="overview-time-window">{timelineWindowLabel}</p>
          <button type="button" class="panel-link" onclick={() => navigateTo({ name: 'live', endpointId: null })}>Live chart <span aria-hidden="true">›</span></button>
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
              <span class="endpoint-chevron" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </button>
          {/each}
        </div>
      </section>

      <section class="event-panel" aria-label="Event log">
        <header class="panel-header">
          <h2>
            <span class="panel-header-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            Event Log
          </h2>
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

  /* Verdict card — v2 alignment. Single-column composition (no score
     ring), flat panel surface (no radial-gradient), larger radius (24px
     ≈ v2's rounded-3xl), and a soft drop shadow. The cyan/amber radial
     "atmosphere" that the prior card carried as a background gradient is
     dropped here; the page-wide atmospheric pass lands in v2 PR 3 with
     a pre-dithered raster that won't band on dark. */
  .verdict-card {
    min-height: 360px;
    max-height: 460px;
    padding: clamp(28px, 3.4vw, 44px);
    border: 1px solid var(--shell-border);
    border-radius: 24px;
    background: var(--shell-panel);
    box-shadow: 0 25px 50px -12px color-mix(in srgb, black 35%, transparent);
    overflow: hidden;
    position: relative;
  }

  .verdict-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .verdict-kickers {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  /* Severity + Live pills — v2 sizing: smaller font, lighter weight,
     subtler tone tints. The Chronoscope tone vocabulary survives;
     only the visual weight changes. */
  .severity-pill,
  .measuring-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding: 4px 12px 4px 10px;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
  }

  /* v2 severity pill icon — small SVG glyph that takes the pill's
     currentColor so it tints with the severity tone automatically. */
  .severity-pill-icon {
    display: inline-grid;
    place-items: center;
    width: 13px;
    height: 13px;
    color: currentColor;
  }
  .severity-pill-icon svg {
    width: 100%;
    height: 100%;
  }

  .severity-pill[data-tone='good'] {
    color: var(--accent-green);
    border: 1px solid color-mix(in srgb, var(--accent-green) 20%, transparent);
    background: color-mix(in srgb, var(--accent-green) 10%, transparent);
  }
  .severity-pill[data-tone='warn'],
  .severity-pill[data-tone='watch'] {
    color: var(--accent-amber);
    border: 1px solid color-mix(in srgb, var(--accent-amber) 20%, transparent);
    background: color-mix(in srgb, var(--accent-amber) 10%, transparent);
  }
  .severity-pill[data-tone='collecting'] {
    color: var(--accent-cyan);
    border: 1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--accent-cyan) 10%, transparent);
  }

  /* Live affordance — v2's pinging-dot pattern. Less chrome than the
     prior Measuring pill; the dot itself carries the live-state signal. */
  .measuring-pill {
    color: var(--accent-cyan);
    border: 0;
    background: transparent;
    padding-left: 0;
  }
  .measuring-dot {
    position: relative;
    display: inline-flex;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
  }
  .measuring-dot-ping {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--accent-cyan);
    opacity: 0.55;
    animation: measuring-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
  .measuring-dot-core {
    position: relative;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-cyan);
  }
  @keyframes measuring-ping {
    0% { transform: scale(1); opacity: 0.6; }
    75%, 100% { transform: scale(2.2); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .measuring-dot-ping { animation: none; opacity: 0.45; }
  }

  h1 {
    margin: 0;
    max-width: 820px;
    font-family: var(--sans);
    font-size: clamp(28px, 3.6vw, 44px);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: var(--tr-tight);
    color: var(--t1);
  }

  /* Inline endpoint name highlight — v2 pattern: same typographic size as
     the surrounding sentence, just a tone-coloured weight bump (no
     background, no border, no chip box). Reads as a name, not a button.
     The body variant is slightly heavier (weight 600 vs 500 surrounding
     prose) so the name pops without enlarging. */
  .headline-endpoint-name,
  .body-endpoint-name {
    color: var(--t1);
    font-weight: 600;
  }
  .headline-endpoint-name[data-tone='good'],
  .body-endpoint-name[data-tone='good']      { color: var(--accent-green); }
  .headline-endpoint-name[data-tone='warn'],
  .headline-endpoint-name[data-tone='watch'],
  .body-endpoint-name[data-tone='warn'],
  .body-endpoint-name[data-tone='watch']     { color: var(--accent-amber); }
  .headline-endpoint-name[data-tone='bad'],
  .body-endpoint-name[data-tone='bad']       { color: var(--accent-pink); }
  .headline-endpoint-name[data-tone='collecting'],
  .body-endpoint-name[data-tone='collecting']{ color: var(--accent-cyan); }

  /* Body paragraphs — v2 drops the "Measured Fact:" / "Interpretation:"
     labels. Sentence separation survives through typography (slightly
     dimmer second paragraph) and the gap between paragraphs. */
  .verdict-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 760px;
  }
  .verdict-body p {
    margin: 0;
    color: var(--t2);
    font-family: var(--sans);
    font-size: clamp(14px, 1.4vw, 17px);
    font-weight: 500;
    line-height: 1.6;
  }
  .verdict-body .interpretation {
    color: var(--t3);
  }

  .verdict-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 8px;
  }

  /* v2 primary action — white-on-black pill with a soft white halo.
     Replaces the prior cyan-gradient button so the primary CTA reads as
     "the thing you do next" rather than an extension of the verdict's
     tone colour. */
  .primary-action {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 18px 0 16px;
    border: 0;
    border-radius: 12px;
    background: var(--t1);
    color: var(--shell-bg);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 160ms ease, background 160ms ease;
    box-shadow: 0 0 20px color-mix(in srgb, var(--t1) 15%, transparent);
  }

  /* v2 primary-action icon — small SVG glyph that inherits the button's
     color (shell-bg, i.e. black on the white pill). Sized to match the
     action label's optical weight at 14 px. */
  .primary-action-icon {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    color: currentColor;
  }
  .primary-action-icon svg {
    width: 100%;
    height: 100%;
  }
  .primary-action:hover {
    background: color-mix(in srgb, var(--t1) 88%, transparent);
    transform: translateY(-1px);
  }
  .primary-action:disabled {
    cursor: default;
    opacity: 0.6;
    box-shadow: none;
    transform: none;
  }

  /* v2 secondary action — quiet text link. No border, no background;
     hover lifts to t1 + faint surface tint. */
  .secondary-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--t3);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease;
  }
  .secondary-action:hover {
    color: var(--t1);
    background: color-mix(in srgb, var(--t1) 5%, transparent);
  }
  .panel-header button:hover,
  .event-more:hover {
    color: var(--accent-cyan);
  }
  @media (prefers-reduced-motion: reduce) {
    .primary-action,
    .secondary-action { transition: none; }
    .primary-action:hover { transform: none; }
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

  /* v2 panel headers — small icon + 12px mono-uppercase kicker + optional
     time-window subtitle + Live chart link on the right. The whole header
     fits in a single row; no border-bottom separator (the cards below
     carry their own borders, so a separator here just stacks lines). */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
    margin-bottom: 8px;
  }

  .panel-header h2 {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
    color: var(--t3);
  }

  .panel-header-icon {
    width: 14px;
    height: 14px;
    color: var(--t3);
    display: inline-grid;
    place-items: center;
  }
  .panel-header-icon svg {
    width: 100%;
    height: 100%;
  }

  /* Time-window subtitle — sits flush in the middle of the header row,
     muted enough not to compete with the kicker. */
  .panel-header .overview-time-window {
    margin: 0;
    flex: 1;
    text-align: left;
    padding-left: 4px;
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    color: var(--t4);
  }

  /* Live chart link — quieter cyan, single line, hover lifts brightness. */
  .panel-header .panel-link {
    border: 0;
    background: transparent;
    color: var(--accent-cyan);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 160ms ease;
  }
  .panel-header .panel-link:hover {
    background: color-mix(in srgb, var(--accent-cyan) 8%, transparent);
  }

  /* v2 polish: smaller, more recessive time axis. Was 24 px tall + bright
     gradient baseline; now 16 px + zinc-500 tone so it reads as a hint,
     not a chart axis competing with the panel kicker. */
  .overview-time-axis {
    position: relative;
    height: 16px;
    margin-top: 4px;
    color: var(--t4);
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    opacity: 0.65;
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

  /* v2 endpoint stack — each row is its own rounded card inside the
     panel. No outer border or background; the panel container above
     already carries the surface treatment. Rows sit in a vertical stack
     with gaps between them. */
  .endpoint-list,
  .event-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 0;
    background: transparent;
    overflow: visible;
  }

  .endpoint-row {
    width: 100%;
    display: grid;
    /* v2 row geometry: status + name stack + sparkline + value + chevron.
       Last column is a 16-px gutter for the chevron right-edge cue (v2
       pattern: tells the user the row is clickable). */
    grid-template-columns: 36px minmax(180px, 0.9fr) minmax(200px, 1.1fr) minmax(76px, auto) 16px;
    gap: 14px;
    align-items: center;
    min-height: 76px;
    padding: 12px 16px;
    border: 1px solid color-mix(in srgb, var(--t1) 4%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, black 40%, transparent);
    color: var(--t1);
    text-align: left;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .endpoint-row:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }

  /* v2 status indicator — small tinted square (rounded full) with a
     tone-coloured border + bg. Replaces the prior bare 16 px ring. */
  .endpoint-state {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid currentColor;
    background: color-mix(in srgb, currentColor 12%, transparent);
    color: var(--t4);
    display: grid;
    place-items: center;
  }
  .endpoint-state::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  .endpoint-row[data-tone='good'] .endpoint-state { color: var(--accent-green); }
  .endpoint-row[data-tone='warn'] .endpoint-state { color: var(--accent-amber); }
  .endpoint-row[data-tone='bad'] .endpoint-state { color: var(--accent-pink); }
  .endpoint-row[data-tone='collecting'] .endpoint-state { color: var(--accent-cyan); }

  /* v2 endpoint metadata stack — mono name, smaller status descriptor,
     no underline under the name. The recent-samples summary collapses
     onto the same line as the status so the row stays compact. */
  .endpoint-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .endpoint-main strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    color: var(--t1);
  }

  .endpoint-main small,
  .endpoint-main em,
  .endpoint-metric em,
  .event-list small {
    font-style: normal;
    color: var(--t4);
  }

  .endpoint-main small {
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
  }
  .endpoint-main em {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--sans);
    font-size: 11px;
    color: var(--t4);
  }

  /* v2-quieted sparkline — half the height, no inset baseline line, no
     drop-shadow glow. The sparkline is supporting evidence, not the
     row's primary signal. */
  .endpoint-history {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 36px;
    border-radius: 8px;
    background: color-mix(in srgb, black 30%, transparent);
    overflow: hidden;
  }

  .endpoint-trace {
    position: absolute;
    inset: 4px 6px;
    width: calc(100% - 12px);
    height: calc(100% - 8px);
    overflow: visible;
  }

  .endpoint-trace path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    color: var(--accent-green);
    opacity: 0.75;
  }

  .endpoint-row[data-tone='warn'] .endpoint-trace path { color: var(--accent-amber); }
  .endpoint-row[data-tone='bad'] .endpoint-trace path { color: var(--accent-pink); }
  .endpoint-row[data-tone='collecting'] .endpoint-trace path { color: var(--accent-cyan); }

  .endpoint-history-marker {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: var(--accent-amber);
    border: 1px solid color-mix(in srgb, black 60%, transparent);
  }
  .endpoint-history-marker[data-status='slow'] {
    background: var(--accent-pink);
  }
  .endpoint-history-marker[data-status='failed'] {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--accent-pink);
  }

  /* v2 endpoint metric — right-aligned latency value with units in a
     muted suffix, jitter below in zinc-500. Less heavy than the prior
     clamp(18-24) mono treatment. */
  .endpoint-metric {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-family: var(--mono);
  }

  .endpoint-metric strong {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: 17px;
    font-weight: 500;
    color: var(--t1);
  }
  .endpoint-metric strong small {
    font-size: 11px;
    font-weight: 500;
    color: var(--t4);
  }
  .endpoint-metric em {
    font-style: normal;
    font-size: 11px;
    color: var(--t4);
  }

  /* v2 chevron — right-edge cue that the row is clickable. Dim by default,
     brightens on hover/focus of the parent endpoint-row so the affordance
     reads as "this row" not "this glyph". */
  .endpoint-chevron {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    color: var(--t4);
    transition: color 160ms ease, transform 160ms ease;
  }
  .endpoint-chevron svg {
    width: 100%;
    height: 100%;
  }
  .endpoint-row:hover .endpoint-chevron,
  .endpoint-row:focus-visible .endpoint-chevron {
    color: var(--t2);
    transform: translateX(2px);
  }
  @media (prefers-reduced-motion: reduce) {
    .endpoint-chevron { transition: none; }
    .endpoint-row:hover .endpoint-chevron,
    .endpoint-row:focus-visible .endpoint-chevron { transform: none; }
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

  /* v2 event list — same card pattern as endpoint rows: each entry is
     its own rounded-card with quiet typography. Compact heights, sans-
     serif body, mono timestamps. */
  .event-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-list li {
    min-width: 0;
  }

  .event-entry {
    width: 100%;
    display: grid;
    grid-template-columns: 60px minmax(0, 1fr) 50px;
    gap: 12px;
    align-items: center;
    min-height: 48px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--t1) 4%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, black 30%, transparent);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 160ms ease;
  }
  .event-entry:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }

  .event-list time {
    color: var(--t4);
    font-family: var(--mono);
    font-size: 11px;
  }

  .event-entry span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .event-list strong {
    color: var(--t1);
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.35;
  }

  .event-entry em {
    justify-self: end;
    font-style: normal;
    font-family: var(--mono);
    font-size: 11px;
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
      padding: 24px;
      min-height: 0;
    }
    .verdict-copy { gap: 20px; }
    h1 { font-size: 28px; line-height: 1.1; }
    .verdict-body p { font-size: 15px; line-height: 1.55; }
    .endpoint-row {
      /* Mobile collapses to 3 effective tracks (status + content + value);
         hide the chevron since the tap target is the whole row. */
      grid-template-columns: 18px minmax(0, 1fr) minmax(86px, 120px);
      gap: 12px;
      min-height: 128px;
      padding: 14px;
    }
    .endpoint-row .endpoint-chevron { display: none; }
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
