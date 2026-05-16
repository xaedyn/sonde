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
  import { buildRunStoryline, type RunStoryline, type StoryBeatSeverity } from '$lib/utils/run-storyline';
  import type { Endpoint, EndpointStatistics, MeasurementSample } from '$lib/types';
  import type { VerdictRow } from '$lib/utils/verdict';

  interface EndpointSummary {
    readonly endpoint: Endpoint;
    readonly stats: EndpointStatistics | null;
    readonly samples: readonly MeasurementSample[];
    readonly latency: number | null;
    readonly delta: number | null;
    readonly status: string;
    readonly tone: 'good' | 'warn' | 'bad' | 'collecting';
  }

  interface EventLogItem {
    readonly id: string;
    readonly time: string;
    readonly label: string;
    readonly evidence: string;
    readonly tone: 'info' | 'good' | 'watch' | 'bad';
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
  }));

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

      return { endpoint, stats: rowStats, samples, latency, delta, status, tone };
    })
  ));

  const eventRows: readonly EventLogItem[] = $derived.by(() => {
    const beats = runStoryline.beats.slice(-4);
    if (beats.length === 0) {
      return [{
        id: 'run-state',
        time: measurements.roundCounter > 0 ? `T+${String(measurements.roundCounter).padStart(4, '0')}` : 'Ready',
        label: measurements.roundCounter > 0 ? runStoryline.summary : 'Start a browser test to build an event trail',
        evidence: measurements.roundCounter > 0 ? `${runStoryline.sampleCount} samples in the current window` : 'No measurements captured yet',
        tone: 'info',
      }];
    }
    return beats.map((beat) => ({
      id: beat.id,
      time: eventTime(beat.t),
      label: beat.label,
      evidence: beat.evidence,
      tone: toneForBeat(beat.severity),
    }));
  });

  function toneForBeat(severity: StoryBeatSeverity): EventLogItem['tone'] {
    if (severity === 'good') return 'good';
    if (severity === 'bad') return 'bad';
    if (severity === 'watch') return 'watch';
    return 'info';
  }

  function eventTime(timestamp: number): string {
    if (!Number.isFinite(timestamp)) return 'Now';
    if (measurements.startedAt !== null) {
      const elapsed = Math.max(0, Math.round((timestamp - measurements.startedAt) / 1000));
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

  function sparklinePoints(samples: readonly MeasurementSample[], rowStats: EndpointStatistics | null): string {
    const okSamples = samples
      .filter((sample) => sample.status === 'ok' && Number.isFinite(sample.latency))
      .slice(-24);
    if (okSamples.length === 0) return '0,22 120,22';
    const ceiling = Math.max(threshold, rowStats?.p95 ?? 0, ...okSamples.map((sample) => sample.latency), 1);
    return okSamples.map((sample, index) => {
      const x = okSamples.length === 1 ? 120 : (index / (okSamples.length - 1)) * 120;
      const y = 28 - Math.max(0, Math.min(1, sample.latency / ceiling)) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
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
        uiStore.setActiveView('diagnose');
        return;
    }
  }

  function handleEvidenceAction(): void {
    uiStore.setActiveView('diagnose');
  }

  function handleEndpointDrill(endpointId: string, destination: 'live' | 'diagnose'): void {
    uiStore.setFocusedEndpoint(endpointId);
    uiStore.setActiveView(destination);
  }
</script>

<section class="figma-overview" aria-label="Overview">
  <div class="overview-inner">
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

    <div class="lower-grid">
      <section class="measured-panel" aria-label="Measured endpoints">
        <header class="panel-header">
          <h2>Measured Endpoints</h2>
          <button type="button" onclick={() => uiStore.setActiveView('live')}>Live chart <span aria-hidden="true">›</span></button>
        </header>
        <div class="endpoint-list">
          {#each endpointRows as row (row.endpoint.id)}
            <button
              type="button"
              class="endpoint-row"
              data-tone={row.tone}
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
              </span>
              <svg class="sparkline" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={sparklinePoints(row.samples, row.stats)} />
              </svg>
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
          <h2>Event Log</h2>
        </header>
        <ol class="event-list">
          {#each eventRows as item (item.id)}
            <li data-tone={item.tone}>
              <time>{item.time}</time>
              <span>
                <strong>{item.label}</strong>
                <small>{item.evidence}</small>
              </span>
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

  .verdict-card {
    min-height: 330px;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: clamp(28px, 4vw, 56px);
    align-items: center;
    padding: clamp(28px, 4vw, 56px);
    border: 1px solid var(--shell-border-strong);
    border-radius: 18px;
    background:
      radial-gradient(circle at 18% 45%, var(--shell-bg-cyan), transparent 34%),
      linear-gradient(135deg, var(--shell-panel-raised), rgba(16, 23, 34, 0.72));
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.18);
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
    background: linear-gradient(135deg, var(--accent-cyan), #2f80ff);
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
    min-height: 44px;
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

  .panel-header button {
    border: 0;
    background: transparent;
    color: var(--accent-cyan);
  }

  .endpoint-list,
  .event-list {
    margin-top: 22px;
    border: 1px solid var(--shell-border);
    border-radius: 18px;
    background: rgba(11, 17, 27, 0.74);
    overflow: hidden;
  }

  .endpoint-row {
    width: 100%;
    display: grid;
    grid-template-columns: 20px minmax(210px, 1fr) minmax(140px, 190px) minmax(76px, auto);
    gap: 16px;
    align-items: center;
    min-height: 86px;
    padding: 16px 20px;
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
    gap: 6px;
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
  .endpoint-metric em,
  .event-list small {
    font-style: normal;
    color: var(--t3);
  }

  .sparkline {
    width: 100%;
    height: 36px;
  }

  .sparkline polyline {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    color: var(--accent-green);
  }

  .endpoint-row[data-tone='warn'] .sparkline polyline { color: var(--accent-amber); }
  .endpoint-row[data-tone='bad'] .sparkline polyline { color: var(--accent-pink); }
  .endpoint-row[data-tone='collecting'] .sparkline polyline { color: var(--accent-cyan); }

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

  .event-list {
    list-style: none;
    padding: 18px;
    display: grid;
    gap: 18px;
  }

  .event-list li {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 14px;
    font-family: var(--mono);
  }

  .event-list time {
    color: var(--t4);
    font-size: var(--ts-sm);
  }

  .event-list span {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .event-list strong {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.45;
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
      min-height: 76px;
      padding: 14px;
    }
    .sparkline {
      grid-column: 2 / -1;
      grid-row: 2;
      height: 30px;
    }
    .endpoint-metric {
      align-self: start;
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
