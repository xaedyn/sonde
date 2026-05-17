<!-- src/lib/components/ReportView.svelte -->
<!-- Read-only diagnostic report for shared result links.                      -->
<script lang="ts">
  import { get } from 'svelte/store';
  import { endpointStore } from '$lib/stores/endpoints';
  import { navigateTo } from '$lib/router';
  import { historyStore } from '$lib/stores/history';
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { statisticsStore } from '$lib/stores/statistics';
  import { uiStore } from '$lib/stores/ui';
  import { companionStore } from '$lib/stores/companion';
  import { remoteVantageStore } from '$lib/stores/remote-vantage';
  import LocalProofPanel from './LocalProofPanel.svelte';
  import { sanitizeCompanionProbeForReport } from '$lib/companion/sanitize';
  import { buildShareURL } from '$lib/share/share-manager';
  import { buildResultsSharePayload, MAX_SHARE_URL_CHARS } from '$lib/share/share-payload-builder';
  import { buildDiagnosticReport, formatReportMetric } from '$lib/utils/diagnostic-report';
  import { buildEvidenceTrail } from '$lib/utils/evidence-trail';
  import { buildHistoryBaselineInsight } from '$lib/utils/history-baseline';
  import {
    buildProofActionState,
    isProofStale,
    summarizeLocalProof,
    summarizeRemoteProof,
  } from '$lib/utils/proof-flow';
  import { tokens } from '$lib/tokens';
  import type { DiagnosticTriageAction } from '$lib/utils/diagnostic-narrative';

  const endpoints = $derived($endpointStore);
  const measurements = $derived($measurementStore);
  const history = $derived($historyStore);
  const remoteVantage = $derived($remoteVantageStore);
  const companion = $derived($companionStore);
  const settings = $derived($settingsStore);
  const stats = $derived($statisticsStore);
  const context = $derived($uiStore.sharedReportContext);
  const sharedLocalCompanion = $derived($uiStore.sharedLocalCompanion);

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
  const evidenceTrail = $derived(buildEvidenceTrail({
    report,
    remoteVantage,
    companion,
    sharedLocalCompanion,
  }));
  const remoteBusy = $derived(remoteVantage.status === 'checking' || remoteVantage.status === 'probing');
  const companionBusy = $derived(companion.status === 'checking' || companion.status === 'probing');

  let copiedSummary = $state(false);
  let copiedLink = $state(false);
  let copyError = $state<'summary' | 'link' | null>(null);
  let localProofOpen = $state(false);
  let includeLocalProofInReport = $state(false);
  let browserVisibilityPanel = $state<HTMLElement | null>(null);
  const localProofExportAvailable = $derived(Boolean(companion.lastProbe));

  interface TriageOutcome {
    readonly label: string;
    readonly tone: 'good' | 'watch' | 'bad' | 'neutral';
    readonly disabled?: boolean;
  }

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
    const liveCompanion = get(companionStore);
    const localCompanion = includeLocalProofInReport && liveCompanion.lastProbe
      ? sanitizeCompanionProbeForReport(liveCompanion.lastProbe, { includePrivateWifi: false })
      : null;
    const builtForHostedReport = buildResultsSharePayload(
      get(endpointStore),
      settingsForReport,
      get(measurementStore),
      100_000,
      Date.now(),
      metadata,
      get(remoteVantageStore).lastProbe,
      localCompanion,
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
          localCompanion,
        ).payload
      : null;
    copyText(hostedUrl ?? buildShareURL(fallbackPayload ?? builtForHostedReport.payload), () => {
      copiedLink = true;
    }, () => {
      copyError = 'link';
    });
  }

  function openInteractive(targetEndpointId = report.diagnosis.verdict.worstEpId): void {
    // PR 9 of synthesis arc: route through the router so deep links update.
    // If an endpoint is named (worst-offender or click target), land on
    // /endpoint/:id; otherwise land on /.
    uiStore.setSharedReportMode(false);
    if (targetEndpointId) {
      navigateTo({ name: 'endpoint', endpointId: targetEndpointId });
    } else {
      navigateTo({ name: 'overview', endpointId: null });
    }
  }

  function handleInteractive(): void {
    openInteractive();
  }

  function handleRunOwn(): void {
    uiStore.clearSharedView();
    uiStore.setAutoStartSuppressionReason(null);
    measurementStore.reset();
  }

  function scrollToBrowserVisibility(): void {
    browserVisibilityPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    browserVisibilityPanel?.focus({ preventScroll: true });
  }

  function openFullSettings(): void {
    if (!get(uiStore).showSettings) uiStore.toggleSettings();
  }

  function localProofEndpointId(action: DiagnosticTriageAction): string | null {
    return action.endpointId
      ?? report.diagnosis.verdict.worstEpId
      ?? report.endpointRows.find((row) => row.implicated)?.endpointId
      ?? endpoints.find((endpoint) => endpoint.enabled)?.id
      ?? endpoints[0]?.id
      ?? null;
  }

  function openLocalProofWorkflow(action: DiagnosticTriageAction): void {
    uiStore.setFocusedEndpoint(localProofEndpointId(action));
    localProofOpen = true;
  }

  function openShareWorkflow(): void {
    if (!get(uiStore).showShare) uiStore.toggleShare();
  }

  async function handleTriageAction(action: DiagnosticTriageAction): Promise<void> {
    switch (action.id) {
      case 'review-browser-visibility':
        scrollToBrowserVisibility();
        return;
      case 'open-investigate':
        openInteractive(action.endpointId);
        return;
      case 'run-remote-check':
        await remoteVantageStore.runProbe(get(endpointStore));
        return;
      case 'run-local-agent':
        openLocalProofWorkflow(action);
        return;
      case 'share-support-report':
      case 'share-snapshot':
      case 'compare-another-network':
        openShareWorkflow();
        return;
      case 'collect-more-samples':
      case 'keep-running':
        handleRunOwn();
        return;
    }
  }

  function remoteOutcome(): TriageOutcome {
    const state = buildProofActionState({
      kind: 'remote',
      status: remoteVantage.status,
      hasProof: Boolean(remoteVantage.lastProbe),
      hasError: Boolean(remoteVantage.error),
      isStale: isProofStale({
        reportCreatedAt: report.createdAt,
        proofGeneratedAt: remoteVantage.lastProbe?.generatedAt ?? null,
      }),
    });
    if (remoteBusy || !remoteVantage.lastProbe || state.label === 'Stale') return state;
    return { ...state, tone: summarizeRemoteProof(remoteVantage.lastProbe).tone };
  }

  function localAgentOutcome(): TriageOutcome {
    const state = buildProofActionState({
      kind: 'local',
      status: companion.status,
      hasProof: Boolean(companion.lastProbe),
      hasError: Boolean(companion.error),
      hasSecret: companion.hasSecret,
      isStale: isProofStale({
        reportCreatedAt: report.createdAt,
        proofGeneratedAt: companion.lastProbe?.createdAt ?? null,
      }),
    });
    if (companionBusy || !companion.lastProbe) {
      if (companion.status === 'connected') return { label: 'Ready', tone: 'neutral' };
      return state;
    }
    if (state.label === 'Stale') return state;
    return { ...state, tone: summarizeLocalProof(companion.lastProbe).tone };
  }

  function triageOutcome(action: DiagnosticTriageAction): TriageOutcome {
    switch (action.id) {
      case 'review-browser-visibility':
        return { label: report.diagnosis.timingVisibility.level === 'phase' ? 'Detailed' : 'Review', tone: 'neutral' };
      case 'open-investigate':
        return { label: action.endpointId ? 'Ready' : 'No target', tone: action.endpointId ? 'good' : 'watch' };
      case 'run-remote-check':
        return remoteOutcome();
      case 'run-local-agent':
        return localAgentOutcome();
      case 'share-support-report':
      case 'share-snapshot':
        if (copiedLink) return { label: 'Link copied', tone: 'good' };
        if (copyError === 'link') return { label: 'Copy failed', tone: 'watch' };
        return { label: 'Share', tone: 'neutral' };
      case 'compare-another-network':
        return { label: 'Share config', tone: 'neutral' };
      case 'collect-more-samples':
      case 'keep-running':
        return { label: 'Run locally', tone: 'neutral' };
    }
  }
</script>

<section
  class="report report-surface"
  aria-label="Diagnostic report"
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-green={tokens.color.accent.green}
  style:--accent-amber={tokens.color.accent.amber}
  style:--accent-pink={tokens.color.accent.pink}
>
  <header class="report-hero" data-report-kind={report.reportKind}>
    <div class="report-hero-grid">
      <div class="report-copy">
        <div class="report-kicker">{report.modeKicker}</div>
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
        <p class="report-lede">{report.modeLede}</p>

        <div class="report-actions" aria-label="Report actions">
          <button type="button" class="action action-primary" onclick={handleInteractive}>
            Open Interactive Analysis
          </button>
          <button type="button" class="action" onclick={handleCopySummary}>
            {copyError === 'summary' ? 'Copy Failed' : copiedSummary ? 'Summary Copied' : report.copySummaryLabel}
          </button>
          <button type="button" class="action" onclick={handleCopyLink}>
            {copyError === 'link' ? 'Copy Failed' : copiedLink ? 'Link Copied' : 'Copy Report Link'}
          </button>
          <button type="button" class="action" onclick={handleRunOwn}>
            Run Your Own Test
          </button>
        </div>

        {#if localProofExportAvailable}
          <label class="local-proof-export">
            <input type="checkbox" bind:checked={includeLocalProofInReport} />
            <span>
              <strong>Include redacted local proof</strong>
              <small>Shares local-agent status only. WiFi names and raw route details stay out.</small>
            </span>
          </label>
        {/if}
      </div>

      <aside class="report-fact-card" aria-label="Report evidence summary">
        <span>Measured facts</span>
        <strong>{report.keptSampleCount} samples</strong>
        <p>{report.endpointRows.length} endpoints, {report.roundCount} rounds, threshold {Math.round(report.threshold)} ms.</p>
        <div class="fact-card-divider"></div>
        <span>Browser visibility</span>
        <p>{report.diagnosis.timingVisibility.headline}</p>
      </aside>
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

  <section class="evidence-trail" aria-label="Evidence trail">
    <div class="section-kicker">Evidence trail</div>
    <div class="trail-list">
      {#each evidenceTrail as item (item.id)}
        <article class="trail-item" class:good={item.tone === 'good'} class:watch={item.tone === 'watch'} class:bad={item.tone === 'bad'}>
          <div class="trail-source">{item.source}</div>
          <p>{item.fact}</p>
          <span>{item.status}</span>
        </article>
      {/each}
    </div>
  </section>

  <section class="report-panel timeline-panel" aria-label="Timeline summary">
    <div class="section-kicker">Timeline summary</div>
    <h2>{report.timelineSummary}</h2>
    {#if report.timelineEvents.length > 0}
      <div class="timeline-events">
        {#each report.timelineEvents as event (event.id)}
          <article
            class="timeline-event"
            class:good={event.severity === 'good'}
            class:watch={event.severity === 'watch'}
            class:bad={event.severity === 'bad'}
          >
            <span>{event.timeLabel}</span>
            <strong>{event.label}</strong>
            <p>{event.detail}</p>
          </article>
        {/each}
      </div>
    {:else}
      <p>No distinct event marker appeared in the captured window. Keep the run active if you need a stronger before-and-after timeline.</p>
    {/if}
  </section>

  <section class="next-steps" aria-label="Recommended next steps">
    <div class="section-kicker">What to try next</div>
    <div class="triage-grid">
      {#each report.diagnosis.triageActions as action, i (action.id)}
        {@const outcome = triageOutcome(action)}
        <article class="triage-card">
          <div class="triage-index">{i + 1}</div>
          <div class="triage-body">
            <div class="triage-head">
              <h2>{action.label}</h2>
              <span class="triage-status" class:good={outcome.tone === 'good'} class:watch={outcome.tone === 'watch'} class:bad={outcome.tone === 'bad'}>{outcome.label}</span>
            </div>
            <p class="triage-action">{action.action}</p>
            <p>{action.why}</p>
            <p class="triage-watch"><strong>Watch for:</strong> {action.watchFor}</p>
            <button
              type="button"
              class="triage-button"
              disabled={outcome.disabled}
              aria-disabled={outcome.disabled}
              onclick={() => handleTriageAction(action)}
            >{action.label}</button>
          </div>
        </article>
      {/each}
    </div>
  </section>

  {#if localProofOpen}
    <LocalProofPanel onOpenSettings={openFullSettings} onClose={() => { localProofOpen = false; }} />
  {/if}

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

    <section
      class="report-panel"
      aria-label="Browser visibility"
      bind:this={browserVisibilityPanel}
      tabindex="-1"
    >
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
    <div class="endpoint-cards" role="region" aria-label="Compact endpoint comparison">
      {#each report.endpointRows as row (row.endpointId)}
        <article class="endpoint-card" class:implicated={row.implicated}>
          <header>
            <span class="endpoint-name compact">
              <i style:background={row.color || tokens.color.endpoint[0]} aria-hidden="true"></i>
              <span>
                <strong>{row.label}</strong>
                <small>{row.url}</small>
              </span>
            </span>
            <span class="status-pill" class:ok={row.status === 'ok'} class:slow={row.status === 'slow'} class:loss={row.status === 'loss'} class:muted={row.status === 'unready' || row.status === 'disabled'}>
              {row.statusLabel}
            </span>
          </header>
          <div class="endpoint-card-metrics">
            <span>
              <small>Median</small>
              <strong>{formatReportMetric(row.p50)}</strong>
            </span>
            <span>
              <small>95% under</small>
              <strong>{formatReportMetric(row.p95)}</strong>
            </span>
            <span>
              <small>Failed</small>
              <strong>{formatReportMetric(row.lossPercent, '%')}</strong>
            </span>
            <span>
              <small>Success</small>
              <strong>{row.okCount}/{row.sampleCount}</strong>
            </span>
          </div>
        </article>
      {/each}
    </div>
    <div class="endpoint-table" role="table" aria-label="Endpoint report table">
      <div class="endpoint-head" role="row">
        <span role="columnheader">Endpoint</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Median</span>
        <span role="columnheader">95% under</span>
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
    max-width: min(1320px, calc(100vw - 32px));
    margin: 0 auto;
    padding: clamp(24px, 4vw, 48px) 0 44px;
    color: var(--t1);
    font-family: var(--sans);
  }

  .report-hero {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--shell-border-strong);
    border-radius: 18px;
    background:
      radial-gradient(circle at 12% 40%, var(--shell-bg-cyan), transparent 32%),
      linear-gradient(135deg, var(--shell-panel-raised), rgba(16, 23, 34, 0.72));
    box-shadow: 0 28px 90px rgba(0,0,0,.18);
  }
  .report-hero::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(103,232,249,.42), transparent);
  }
  .report-hero-grid {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
    gap: 24px;
    padding: clamp(22px, 3vw, 34px);
  }
  .report-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
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
    gap: 14px;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    max-width: 820px;
    font-size: clamp(32px, 4.1vw, 52px);
    line-height: 1.06;
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

  .report-fact-card {
    align-self: stretch;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: rgba(7,11,18,.62);
  }
  .report-fact-card span {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
  }
  .report-fact-card strong {
    font-size: 30px;
    line-height: 1;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .report-fact-card p {
    margin: 0;
    color: var(--t2);
    line-height: 1.45;
  }
  .fact-card-divider {
    height: 1px;
    margin: 4px 0;
    background: rgba(255,255,255,.08);
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
    border: 1px solid var(--shell-border);
    background: rgba(255,255,255,.025);
    color: var(--t2);
    padding: 0 13px;
    font-family: var(--sans);
    font-size: var(--ts-sm);
    cursor: pointer;
  }
  .action:hover {
    color: var(--t1);
    border-color: var(--shell-border-strong);
  }
  .action-primary {
    color: var(--accent-cyan);
    border-color: rgba(103,232,249,.35);
    background: rgba(103,232,249,.08);
  }

  .local-proof-export {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    max-width: 620px;
    padding: 10px 12px;
    border: 1px solid rgba(134,239,172,.22);
    border-radius: 8px;
    background: rgba(134,239,172,.055);
    color: var(--t2);
    font-size: var(--ts-sm);
  }
  .local-proof-export input {
    margin-top: 2px;
    accent-color: var(--accent-green);
  }
  .local-proof-export span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .local-proof-export strong {
    color: var(--t1);
    font-size: var(--ts-sm);
    font-weight: 600;
  }
  .local-proof-export small {
    color: var(--t3);
    font-size: var(--ts-xs);
    line-height: 1.45;
  }

  .report-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    margin: 18px 0;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--shell-border);
  }
  .report-strip > div {
    min-width: 0;
    padding: 13px 14px;
    background: rgba(8, 14, 24, 0.68);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .report-strip strong {
    font-size: var(--ts-lg);
    font-variant-numeric: tabular-nums;
  }

  .evidence-trail {
    margin-bottom: 18px;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: rgba(8, 14, 24, 0.62);
    padding: 14px;
  }

  .timeline-panel {
    margin-bottom: 18px;
  }
  .timeline-events {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .timeline-event {
    min-width: 0;
    padding: 12px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 7px;
    background: rgba(255,255,255,.035);
  }
  .timeline-event.good {
    border-color: rgba(74,222,128,.2);
    background: rgba(74,222,128,.055);
  }
  .timeline-event.watch {
    border-color: rgba(251,191,36,.2);
    background: rgba(251,191,36,.055);
  }
  .timeline-event.bad {
    border-color: rgba(249,168,212,.22);
    background: rgba(249,168,212,.065);
  }
  .timeline-event span {
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    text-transform: uppercase;
  }
  .timeline-event strong {
    display: block;
    margin-top: 6px;
    color: var(--t1);
    font-size: var(--ts-base);
  }
  .timeline-event p {
    margin: 6px 0 0;
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.4;
  }
  .trail-list {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  .trail-item {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(42px, auto) auto;
    gap: 6px;
    padding: 10px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 7px;
    background: rgba(255,255,255,.03);
  }
  .trail-item.good {
    border-color: rgba(74,222,128,.18);
    background: rgba(74,222,128,.045);
  }
  .trail-item.watch {
    border-color: rgba(251,191,36,.18);
    background: rgba(251,191,36,.045);
  }
  .trail-item.bad {
    border-color: rgba(249,168,212,.2);
    background: rgba(249,168,212,.05);
  }
  .trail-source {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    text-transform: uppercase;
  }
  .trail-item p {
    margin: 0;
    color: var(--t2);
    font-size: var(--ts-sm);
    line-height: 1.35;
  }
  .trail-item span {
    justify-self: start;
    padding: 3px 7px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 999px;
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    white-space: nowrap;
  }

  .report-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 18px;
    margin-bottom: 18px;
  }

  .report-panel,
  .next-steps {
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: rgba(8, 14, 24, 0.62);
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
  .endpoint-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .endpoint-card {
    /* Arc C C9: harmonise endpoint-card geometry with DiagnoseView's
       landing cards — same border-radius family (12px here vs 14px on
       Diagnose's larger card) and a stronger border so the cards read as
       the same family across the three surfaces. Token sweep for the
       remaining raw rgba values lands in the PR η tokenization pass. */
    min-width: 0;
    padding: 14px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 12px;
    background: rgba(255,255,255,.035);
  }
  .endpoint-card.implicated {
    border-color: rgba(249,168,212,.23);
    background:
      linear-gradient(135deg, rgba(249,168,212,.08), transparent 58%),
      rgba(255,255,255,.035);
  }
  .endpoint-card header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }
  .endpoint-name.compact {
    flex: 1 1 auto;
  }
  .endpoint-card-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  }
  .endpoint-card-metrics span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,.06);
  }
  .endpoint-card-metrics small {
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    text-transform: uppercase;
  }
  .endpoint-card-metrics strong {
    color: var(--t1);
    font-size: var(--ts-base);
    font-variant-numeric: tabular-nums;
  }
  .endpoint-table {
    margin-top: 14px;
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
  .triage-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .triage-head {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
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
  .triage-status {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.1);
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    white-space: nowrap;
  }
  .triage-status.good {
    color: var(--accent-green);
    border-color: rgba(74,222,128,.25);
    background: rgba(74,222,128,.07);
  }
  .triage-status.watch {
    color: var(--accent-amber);
    border-color: rgba(251,191,36,.25);
    background: rgba(251,191,36,.07);
  }
  .triage-status.bad {
    color: var(--accent-pink);
    border-color: rgba(249,168,212,.28);
    background: rgba(249,168,212,.08);
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
  .triage-button {
    align-self: flex-start;
    min-height: 34px;
    margin-top: 12px;
    border-radius: 7px;
    border: 1px solid rgba(103,232,249,.24);
    background: rgba(103,232,249,.07);
    color: var(--accent-cyan);
    padding: 0 11px;
    font-family: var(--sans);
    font-size: var(--ts-sm);
    cursor: pointer;
  }
  .triage-button:hover:not(:disabled) {
    border-color: rgba(103,232,249,.42);
    color: var(--t1);
  }
  .triage-button:disabled {
    cursor: not-allowed;
    opacity: .55;
  }

  [aria-label="Browser visibility"]:focus {
    outline: 1px solid rgba(103,232,249,.45);
    outline-offset: 3px;
  }

  @media (max-width: 900px) {
    .report {
      max-width: calc(100vw - 24px);
      padding-top: 16px;
    }
    .report-hero-grid {
      grid-template-columns: 1fr;
      padding: 20px;
    }
    .report-title-row {
      flex-direction: column;
    }
    .report-strip,
    .report-grid {
      grid-template-columns: 1fr;
    }
    .trail-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .timeline-events,
    .endpoint-cards {
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
      display: none;
    }
  }

  @media (max-width: 520px) {
    .report-hero-grid {
      padding: 16px;
    }
    .report-actions {
      flex-direction: column;
    }
    .action {
      width: 100%;
    }
    .trail-list {
      grid-template-columns: 1fr;
    }
    .triage-head {
      flex-direction: column;
    }
    .triage-button {
      width: 100%;
    }
    h1 {
      font-size: 32px;
    }
  }
</style>
