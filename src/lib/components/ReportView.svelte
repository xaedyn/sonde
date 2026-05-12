<!-- src/lib/components/ReportView.svelte -->
<!-- Read-only diagnostic report for shared result links.                      -->
<script lang="ts">
  import { get } from 'svelte/store';
  import { endpointStore } from '$lib/stores/endpoints';
  import { historyStore } from '$lib/stores/history';
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { statisticsStore } from '$lib/stores/statistics';
  import { uiStore } from '$lib/stores/ui';
  import { remoteVantageStore } from '$lib/stores/remote-vantage';
  import { buildShareURL } from '$lib/share/share-manager';
  import { buildResultsSharePayload, MAX_SHARE_URL_CHARS } from '$lib/share/share-payload-builder';
  import { buildDiagnosticReport, formatReportMetric } from '$lib/utils/diagnostic-report';
  import { buildHistoryBaselineInsight } from '$lib/utils/history-baseline';
  import { tokens } from '$lib/tokens';

  const endpoints = $derived($endpointStore);
  const measurements = $derived($measurementStore);
  const history = $derived($historyStore);
  const remoteVantage = $derived($remoteVantageStore);
  const settings = $derived($settingsStore);
  const stats = $derived($statisticsStore);
  const context = $derived($uiStore.sharedReportContext);

  const report = $derived(buildDiagnosticReport({
    endpoints,
    stats,
    measurements,
    settings,
    context,
  }));
  const additionalLimitations = $derived(
    report.diagnosis.limitations.filter((limit) => limit.id !== 'timing-visibility'),
  );
  const baselineInsight = $derived(buildHistoryBaselineInsight({
    endpoints,
    stats,
    history: history.sessions,
    currentStartedAt: measurements.startedAt,
  }));
  const baselineRows = $derived(
    baselineInsight.comparisons
      .filter((comparison) => comparison.status !== 'unready')
      .slice(0, 4),
  );

  let copiedSummary = $state(false);
  let copiedLink = $state(false);
  let copyError = $state<'summary' | 'link' | null>(null);

  function resetCopyState(): void {
    copiedSummary = false;
    copiedLink = false;
    copyError = null;
  }

  function copyText(text: string, onDone: () => void, onError: () => void): void {
    if (!navigator.clipboard) {
      onError();
      return;
    }
    void navigator.clipboard.writeText(text).then(() => {
      copyError = null;
      onDone();
      setTimeout(resetCopyState, 1800);
    }).catch(() => {
      onError();
      setTimeout(resetCopyState, 1800);
    });
  }

  function handleCopySummary(): void {
    copyText(report.copySummary, () => {
      copiedSummary = true;
    }, () => {
      copyError = 'summary';
    });
  }

  async function handleCopyLink(): Promise<void> {
    const settingsForReport = {
      ...get(settingsStore),
      healthThreshold: report.threshold,
      corsMode: report.corsMode,
    };
    const metadata = {
      createdAt: report.createdAt ?? Date.now(),
      healthThreshold: report.threshold,
      corsMode: report.corsMode,
      roundCount: report.roundCount,
      totalSampleCount: report.totalSampleCount,
      truncated: report.truncated,
    };
    const builtForHostedReport = buildResultsSharePayload(
      get(endpointStore),
      settingsForReport,
      get(measurementStore),
      100_000,
      Date.now(),
      metadata,
      get(remoteVantageStore).lastProbe,
    );
    const hostedUrl = await remoteVantageStore.createHostedReport(builtForHostedReport.payload);
    const fallbackPayload = hostedUrl === null
      ? buildResultsSharePayload(
          get(endpointStore),
          settingsForReport,
          get(measurementStore),
          MAX_SHARE_URL_CHARS,
          Date.now(),
          metadata,
          get(remoteVantageStore).lastProbe,
        ).payload
      : null;
    copyText(hostedUrl ?? buildShareURL(fallbackPayload ?? builtForHostedReport.payload), () => {
      copiedLink = true;
    }, () => {
      copyError = 'link';
    });
  }

  function handleInteractive(): void {
    uiStore.setSharedReportMode(false);
    const target = report.diagnosis.verdict.worstEpId;
    if (target) {
      uiStore.setFocusedEndpoint(target);
      uiStore.setActiveView('diagnose');
    } else {
      uiStore.setActiveView('overview');
    }
  }

  function handleRunOwn(): void {
    uiStore.clearSharedView();
    uiStore.setAutoStartSuppressionReason(null);
    measurementStore.reset();
  }
</script>

<section
  class="report"
  aria-label="Diagnostic report"
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-green={tokens.color.accent.green}
  style:--accent-amber={tokens.color.accent.amber}
  style:--accent-pink={tokens.color.accent.pink}
>
  <header class="report-hero">
    <div class="report-kicker">Shared diagnostic report</div>
    <div class="report-title-row">
      <h1>{report.diagnosis.primaryAnswer.text}</h1>
      <span
        class="confidence"
        class:low={report.diagnosis.confidence === 'low'}
        class:medium={report.diagnosis.confidence === 'medium'}
        class:high={report.diagnosis.confidence === 'high'}
        title={report.diagnosis.confidenceReason}
      >{report.diagnosis.confidenceLabel}</span>
    </div>
    <p class="report-lede">{report.diagnosis.supportingSummary}</p>

    <div class="report-actions" aria-label="Report actions">
      <button type="button" class="action action-primary" onclick={handleInteractive}>
        Open Interactive Analysis
      </button>
      <button type="button" class="action" onclick={handleCopySummary}>
        {copyError === 'summary' ? 'Copy Failed' : copiedSummary ? 'Summary Copied' : 'Copy Summary'}
      </button>
      <button type="button" class="action" onclick={handleCopyLink}>
        {copyError === 'link' ? 'Copy Failed' : copiedLink ? 'Link Copied' : 'Copy Report Link'}
      </button>
      <button type="button" class="action" onclick={handleRunOwn}>
        Run Your Own Test
      </button>
    </div>
  </header>

  <section class="report-strip" aria-label="Report metadata">
    <div>
      <span class="metric-label">Created</span>
      <strong>{report.createdLabel}</strong>
    </div>
    <div>
      <span class="metric-label">Threshold</span>
      <strong>{Math.round(report.threshold)} ms</strong>
      <span class="metric-note">{report.thresholdSource === 'shared' ? 'from sender' : 'local default'}</span>
    </div>
    <div>
      <span class="metric-label">Samples</span>
      <strong>{report.keptSampleCount}</strong>
      <span class="metric-note">{report.truncated ? `trimmed from ${report.totalSampleCount}` : `${report.roundCount} rounds`}</span>
    </div>
    <div>
      <span class="metric-label">Timing mode</span>
      <strong>{report.corsMode}</strong>
      <span class="metric-note">{report.corsModeSource === 'shared' ? 'from sender' : report.corsModeSource === 'payload-settings' ? 'legacy link' : 'local default'}</span>
    </div>
  </section>

  <section class="next-steps" aria-label="Recommended next steps">
    <div class="section-kicker">What to try next</div>
    <div class="triage-grid">
      {#each report.diagnosis.triageActions as action, i (action.id)}
        <article class="triage-card">
          <div class="triage-index">{i + 1}</div>
          <div>
            <h2>{action.label}</h2>
            <p class="triage-action">{action.action}</p>
            <p>{action.why}</p>
            <p class="triage-watch"><strong>Watch for:</strong> {action.watchFor}</p>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <div class="report-grid">
    <section class="report-panel verdict-panel" aria-label="Verdict evidence">
      <div class="section-kicker">Verdict evidence</div>
      <div class="evidence-grid">
        {#each report.diagnosis.evidence as item (item.label)}
          <div class="evidence-item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {#if item.detail}
              <small>{item.detail}</small>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="report-panel" aria-label="Browser visibility">
      <div class="section-kicker">Browser visibility</div>
      <h2>{report.diagnosis.timingVisibility.headline}</h2>
      <p>{report.diagnosis.timingVisibility.detail}</p>
      {#if report.diagnosis.timingVisibility.action}
        <p class="guidance">{report.diagnosis.timingVisibility.action}</p>
      {/if}
      {#if additionalLimitations.length > 0}
        <div class="limitations">
          {#each additionalLimitations as limit (limit.id)}
            <div class="limitation">
              <strong>{limit.headline}</strong>
              <span>{limit.detail}</span>
              {#if limit.action}
                <small>{limit.action}</small>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="report-panel baseline-panel" aria-label="Baseline context">
      <div class="section-kicker">Baseline context</div>
      <h2>{baselineInsight.headline}</h2>
      <p>{baselineInsight.detail}</p>
      <p class="privacy-note">{baselineInsight.privacyNote}</p>
      {#if baselineRows.length > 0}
        <div class="baseline-list">
          {#each baselineRows as comparison (comparison.endpointId)}
            <div
              class="baseline-row"
              class:hot={comparison.status === 'elevated' || comparison.status === 'severe'}
            >
              <strong>{comparison.label}</strong>
              <span>{comparison.summary}</span>
              <small>{comparison.priorSessionCount} prior local {comparison.priorSessionCount === 1 ? 'run' : 'runs'}</small>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="report-panel remote-panel" aria-label="Remote vantage">
      <div class="section-kicker">Remote vantage</div>
      {#if remoteVantage.lastProbe}
        <h2>{remoteVantage.lastProbe.edge.colo ?? 'Cloudflare edge'} outside check</h2>
        <p>{remoteVantage.lastProbe.edge.city || remoteVantage.lastProbe.edge.country
          ? [remoteVantage.lastProbe.edge.city, remoteVantage.lastProbe.edge.country].filter(Boolean).join(' · ')
          : 'Cloudflare checked these endpoints from outside the browser network.'}</p>
        <div class="remote-list">
          {#each remoteVantage.lastProbe.results.slice(0, 4) as result (result.endpointId)}
            <div class="remote-row" class:hot={result.verdict === 'slow' || result.verdict === 'http-error' || result.verdict === 'unreachable'}>
              <strong>{result.label}</strong>
              <span>{result.status ?? 'failed'} · {Math.round(result.durationMs)} ms</span>
              <small>{result.verdict}</small>
            </div>
          {/each}
        </div>
      {:else}
        <h2>Outside vantage not captured</h2>
        <p>Run a remote check in Investigate before sharing when you need evidence from beyond the local browser path.</p>
      {/if}
    </section>
  </div>

  <section class="report-panel endpoint-panel" aria-label="Endpoint comparison">
    <div class="section-kicker">Endpoint comparison</div>
    <div class="endpoint-table" role="table" aria-label="Endpoint report table">
      <div class="endpoint-head" role="row">
        <span role="columnheader">Endpoint</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">p50</span>
        <span role="columnheader">p95</span>
        <span role="columnheader">Loss</span>
        <span role="columnheader">Samples</span>
      </div>
      {#each report.endpointRows as row (row.endpointId)}
        <div class="endpoint-row" role="row" class:implicated={row.implicated}>
          <span class="endpoint-name" role="cell">
            <i style:background={row.color || tokens.color.endpoint[0]} aria-hidden="true"></i>
            <span>
              <strong>{row.label}</strong>
              <small>{row.url}</small>
            </span>
          </span>
          <span role="cell" class="status-pill" class:ok={row.status === 'ok'} class:slow={row.status === 'slow'} class:loss={row.status === 'loss'} class:muted={row.status === 'unready' || row.status === 'disabled'}>
            {row.statusLabel}
          </span>
          <span role="cell">{formatReportMetric(row.p50)}</span>
          <span role="cell">{formatReportMetric(row.p95)}</span>
          <span role="cell">{formatReportMetric(row.lossPercent, '%')}</span>
          <span role="cell">{row.okCount}/{row.sampleCount}</span>
        </div>
      {/each}
    </div>
  </section>

</section>

<style>
  .report {
    width: 100%;
    max-width: min(1120px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 22px 0 32px;
    color: var(--t1);
    font-family: var(--sans);
  }

  .report-hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px 0 18px;
    border-bottom: 1px solid var(--border-mid);
  }

  .report-kicker,
  .section-kicker,
  .metric-label,
  .metric-note {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }

  .report-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  h1 {
    margin: 0;
    max-width: 820px;
    font-size: 44px;
    line-height: 1.02;
    letter-spacing: 0;
  }

  h2 {
    margin: 8px 0 0;
    font-size: var(--ts-xl);
    letter-spacing: 0;
  }

  .report-lede {
    margin: 0;
    max-width: 820px;
    color: var(--t2);
    font-size: var(--ts-lg);
    line-height: 1.55;
  }

  .confidence,
  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .confidence.low { color: var(--accent-amber); border: 1px solid rgba(251,191,36,.34); background: rgba(251,191,36,.08); }
  .confidence.medium { color: var(--accent-cyan); border: 1px solid rgba(103,232,249,.32); background: rgba(103,232,249,.08); }
  .confidence.high { color: var(--accent-green); border: 1px solid rgba(74,222,128,.34); background: rgba(74,222,128,.08); }

  .report-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .action {
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid var(--border-mid);
    background: rgba(255,255,255,.025);
    color: var(--t2);
    padding: 0 13px;
    font-family: var(--sans);
    font-size: var(--ts-sm);
    cursor: pointer;
  }
  .action:hover {
    color: var(--t1);
    border-color: var(--border-bright);
  }
  .action-primary {
    color: var(--accent-cyan);
    border-color: rgba(103,232,249,.35);
    background: rgba(103,232,249,.08);
  }

  .report-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    margin: 18px 0;
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    overflow: hidden;
    background: var(--border-mid);
  }
  .report-strip > div {
    min-width: 0;
    padding: 13px 14px;
    background: rgba(12,10,20,.68);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .report-strip strong {
    font-size: var(--ts-lg);
    font-variant-numeric: tabular-nums;
  }

  .report-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 18px;
    margin-bottom: 18px;
  }

  .report-panel,
  .next-steps {
    border: 1px solid var(--border-mid);
    border-radius: 8px;
    background: rgba(12,10,20,.58);
    padding: 16px;
  }
  .next-steps {
    margin-bottom: 18px;
  }

  .evidence-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .evidence-item {
    min-width: 0;
    padding: 11px;
    border-radius: 7px;
    background: rgba(255,255,255,.035);
    border: 1px solid rgba(255,255,255,.055);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .evidence-item span,
  .evidence-item small,
  .limitations small,
  .endpoint-name small {
    color: var(--t3);
  }
  .evidence-item strong {
    font-size: var(--ts-xl);
    font-variant-numeric: tabular-nums;
  }

  .report-panel p {
    color: var(--t2);
    line-height: 1.5;
  }
  .baseline-panel {
    grid-column: 1 / -1;
  }
  .privacy-note {
    margin-top: 8px;
    color: var(--t3) !important;
    font-size: var(--ts-xs);
  }
  .baseline-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .baseline-row {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 7px;
    background: rgba(255,255,255,.035);
  }
  .baseline-row.hot {
    border-color: rgba(251,191,36,.2);
    background: rgba(251,191,36,.06);
  }
  .baseline-row span,
  .baseline-row small {
    color: var(--t3);
    line-height: 1.4;
  }
  .remote-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .remote-row {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px;
    border: 1px solid rgba(103,232,249,.16);
    border-radius: 7px;
    background: rgba(103,232,249,.045);
  }
  .remote-row.hot {
    border-color: rgba(251,191,36,.22);
    background: rgba(251,191,36,.06);
  }
  .remote-row span,
  .remote-row small {
    color: var(--t3);
    line-height: 1.4;
  }
  .guidance {
    padding-left: 10px;
    border-left: 2px solid var(--accent-cyan);
  }
  .limitations {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }
  .limitation {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px;
    border-radius: 7px;
    background: rgba(251,191,36,.06);
    border: 1px solid rgba(251,191,36,.16);
  }
  .limitation span {
    color: var(--t2);
  }

  .endpoint-panel {
    margin-bottom: 18px;
  }
  .endpoint-table {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255,255,255,.06);
    border-radius: 8px;
    overflow: hidden;
  }
  .endpoint-head,
  .endpoint-row {
    display: grid;
    grid-template-columns: minmax(220px, 1.7fr) .8fr .55fr .55fr .55fr .55fr;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }
  .endpoint-head {
    padding: 10px 12px;
    background: rgba(255,255,255,.035);
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    text-transform: uppercase;
  }
  .endpoint-row {
    padding: 12px;
    border-top: 1px solid rgba(255,255,255,.055);
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }
  .endpoint-row.implicated {
    background: rgba(249,168,212,.055);
  }
  .endpoint-name {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .endpoint-name i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .endpoint-name span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .endpoint-name strong,
  .endpoint-name small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-pill {
    justify-self: start;
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid rgba(255,255,255,.12);
    color: var(--t3);
    background: rgba(255,255,255,.035);
  }
  .status-pill.ok { color: var(--accent-green); border-color: rgba(74,222,128,.25); background: rgba(74,222,128,.07); }
  .status-pill.slow,
  .endpoint-row.implicated .status-pill { color: var(--accent-pink); border-color: rgba(249,168,212,.28); background: rgba(249,168,212,.08); }
  .status-pill.loss { color: var(--accent-amber); border-color: rgba(251,191,36,.28); background: rgba(251,191,36,.08); }
  .status-pill.muted { opacity: .75; }

  .triage-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .triage-card {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border-radius: 7px;
    border: 1px solid rgba(255,255,255,.07);
    background: rgba(255,255,255,.035);
  }
  .triage-index {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(103,232,249,.25);
    color: var(--accent-cyan);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    font-variant-numeric: tabular-nums;
  }
  .triage-card h2 {
    margin-top: 0;
    font-size: var(--ts-base);
  }
  .triage-card p {
    margin: 6px 0 0;
    color: var(--t3);
    line-height: 1.45;
  }
  .triage-action {
    color: var(--t1) !important;
  }
  .triage-watch strong {
    color: var(--t2);
  }

  @media (max-width: 900px) {
    .report {
      max-width: calc(100vw - 24px);
      padding-top: 16px;
    }
    .report-title-row {
      flex-direction: column;
    }
    .report-strip,
    .report-grid {
      grid-template-columns: 1fr;
    }
    .evidence-grid {
      grid-template-columns: 1fr;
    }
    .baseline-list {
      grid-template-columns: 1fr;
    }
    .triage-grid {
      grid-template-columns: 1fr;
    }
    .endpoint-table {
      overflow-x: auto;
    }
    .endpoint-head,
    .endpoint-row {
      min-width: 760px;
    }
  }

  @media (max-width: 520px) {
    .report-actions {
      flex-direction: column;
    }
    .action {
      width: 100%;
    }
    h1 {
      font-size: 32px;
    }
  }
</style>
