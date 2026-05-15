<!-- src/lib/components/CausalVerdictStrip.svelte -->
<!-- Single-sentence diagnosis with backing triptych + drill CTA. Pure render  -->
<!-- — diagnosis is computed in the parent and passed in whole.                -->
<script lang="ts">
  import type { DiagnosticNarrative } from '$lib/utils/diagnostic-narrative';
  import type { HistoryBaselineInsight } from '$lib/utils/history-baseline';
  import type { ScoreExplanation } from '$lib/utils/score-explanation';
  import type { AutoStartSuppressionReason, Endpoint } from '$lib/types';

  interface Props {
    diagnosis: DiagnosticNarrative;
    avgP50: number | null;
    avgJitter: number | null;
    avgLoss: number | null;
    drillEndpoint: Endpoint | null;
    baselineInsight?: HistoryBaselineInsight | null;
    scoreExplanation?: ScoreExplanation | null;
    autoStartSuppressionReason?: AutoStartSuppressionReason | null;
    contextLine?: string | null;
    variant?: 'normal' | 'hero';
    onDrill: (epId: string) => void;
    onStart?: () => void;
  }

  let {
    diagnosis,
    avgP50,
    avgJitter,
    avgLoss,
    drillEndpoint,
    baselineInsight = null,
    scoreExplanation = null,
    autoStartSuppressionReason = null,
    contextLine = null,
    variant = 'normal',
    onDrill,
    onStart,
  }: Props = $props();
  const verdict = $derived(diagnosis.verdict);
  const primaryHeadline = $derived(diagnosis.primaryAnswer.text);
  const primaryAction = $derived(diagnosis.primaryValidation);
  const triageActions = $derived(diagnosis.triageActions ?? []);
  const primaryTriageAction = $derived(triageActions[0] ?? null);
  const primaryLimitation = $derived(diagnosis.limitations[0] ?? null);
  const primaryNextStep = $derived(primaryTriageAction?.action ?? primaryAction?.reason ?? diagnosis.nextSteps[0] ?? null);
  const statusLabel = $derived.by(() => {
    if (diagnosis.kind === 'collecting') return 'Collecting';
    if (verdict.tone === 'good') return 'Good';
    if (diagnosis.severity === 'degraded') return 'Needs attention';
    return 'Watch';
  });
  const drillActionLabel = $derived(primaryAction?.endpointId === drillEndpoint?.id
    ? (primaryAction.id === 'run-remote-check' ? 'Open Investigate' : primaryAction.label)
    : 'Investigate');
  const baselineChip = $derived.by(() => {
    if (baselineInsight === null || diagnosis.kind === 'collecting') return null;
    if (baselineInsight.status === 'collecting') return null;
    if (baselineInsight.status === 'no-history') return 'No baseline';
    if (baselineInsight.status === 'normal') return 'Baseline normal';

    const comparison = baselineInsight.comparisons.find((item) => (
      item.status === 'severe' || item.status === 'elevated'
    ));
    const ratio = Math.max(comparison?.p50Ratio ?? 0, comparison?.p95Ratio ?? 0);
    return ratio > 0 ? `${ratio.toFixed(1)}x baseline` : 'Baseline high';
  });
  const suppressionMessage = $derived.by(() => {
    if (diagnosis.kind !== 'collecting') return null;
    switch (autoStartSuppressionReason) {
      case 'local-endpoint':
        return 'Ready to measure. Start when you want Chronoscope to probe your local or private endpoints.';
      case 'pending-share':
        return 'Review the shared setup first, or start measuring your saved endpoints.';
      case 'no-enabled-endpoints':
        return 'No endpoints are enabled. Enable an endpoint before Chronoscope can measure anything.';
      case 'shared-report':
        return 'This is a shared snapshot. Run your own test to measure from your location.';
      default:
        return null;
    }
  });
  const canStartSuppressedRun = $derived(
    diagnosis.kind === 'collecting' &&
    onStart !== undefined &&
    (autoStartSuppressionReason === 'local-endpoint' || autoStartSuppressionReason === 'pending-share'),
  );
  const showMetrics = $derived(suppressionMessage === null);
  const scoreContributions = $derived(scoreExplanation?.contributions.slice(0, 4) ?? []);
  const hiddenScoreContributions = $derived(Math.max(0, (scoreExplanation?.contributions.length ?? 0) - scoreContributions.length));

  const fmtInt = (n: number | null): string => (n == null ? '—' : String(Math.round(n)));
  const fmt1 = (n: number | null): string => (n == null ? '—' : n.toFixed(1));
</script>

<section
  class="verdict"
  class:hero={variant === 'hero'}
  class:warn={verdict.tone === 'warn'}
  class:good={verdict.tone === 'good'}
  class:collecting={diagnosis.kind === 'collecting'}
  aria-live="polite"
  aria-atomic="true"
  aria-label="Status answer"
>
  <div class="verdict-main">
    <span class="verdict-status-pill">
      <span class="verdict-dot" aria-hidden="true"></span>
      {statusLabel}
    </span>
    <h2 class="verdict-headline">{primaryHeadline}</h2>
    <span
      class="verdict-confidence"
      class:low={diagnosis.confidence === 'low'}
      class:medium={diagnosis.confidence === 'medium'}
      class:high={diagnosis.confidence === 'high'}
      title={diagnosis.confidenceReason}
    >{diagnosis.confidenceLabel}</span>
    {#if baselineChip && baselineInsight}
      <span
        class="verdict-baseline-chip"
        class:hot={baselineInsight.status === 'elevated' || baselineInsight.status === 'severe'}
        class:normal={baselineInsight.status === 'normal'}
        title={`${baselineInsight.detail} ${baselineInsight.privacyNote}`}
      >{baselineChip}</span>
    {/if}
  </div>
  {#if diagnosis.kind !== 'collecting'}
    <p class="verdict-explanation">{diagnosis.supportingSummary}</p>
  {:else if suppressionMessage}
    <p class="verdict-explanation verdict-suppression">{suppressionMessage}</p>
  {/if}

  {#if showMetrics}
    <dl class="verdict-facts verdict-metrics" aria-label="Measured facts">
      <div class="verdict-facts-heading" aria-hidden="true">Measured facts</div>
      <div class="verdict-metric">
        <dt class="verdict-metric-label">Median</dt>
        <dd class="verdict-metric-value">
          <span class="verdict-metric-num">{fmtInt(avgP50)}</span>
          <span class="verdict-metric-unit">ms</span>
        </dd>
      </div>
      <div class="verdict-metric">
        <dt class="verdict-metric-label">Jitter</dt>
        <dd class="verdict-metric-value">
          <span class="verdict-metric-num">{fmt1(avgJitter)}</span>
          <span class="verdict-metric-unit">ms</span>
        </dd>
      </div>
      <div class="verdict-metric">
        <dt class="verdict-metric-label">Loss</dt>
        <dd class="verdict-metric-value">
          <span class="verdict-metric-num">{fmt1(avgLoss)}</span>
          <span class="verdict-metric-unit">%</span>
        </dd>
      </div>
    </dl>
  {/if}

  {#if drillEndpoint && verdict.tone === 'warn'}
    <button
      type="button"
      class="verdict-drill"
      onclick={() => onDrill(drillEndpoint.id)}
      aria-label="{drillActionLabel} {drillEndpoint.label}, route to investigation view"
    >
      <span class="verdict-drill-text">{drillActionLabel}</span>
      <span class="verdict-drill-ep" style:color={drillEndpoint.color}>{drillEndpoint.label}</span>
      <span class="verdict-drill-arrow" aria-hidden="true">→</span>
    </button>
  {/if}

  {#if diagnosis.kind !== 'collecting'}
    <div class="verdict-extra verdict-proof-rows">
      {#if primaryLimitation}
        <p class="verdict-limit" aria-label="Browser limitation">
          <span class="verdict-extra-label">Browser limit</span>
          <span>{primaryLimitation.headline}</span>
        </p>
      {/if}
      {#if primaryNextStep}
        <p
          class="verdict-next"
          aria-label="Next useful check"
          title={primaryTriageAction ? `${primaryTriageAction.why} ${primaryTriageAction.watchFor}` : undefined}
        >
          <span class="verdict-extra-label">Next check</span>
          <span>{primaryNextStep}</span>
        </p>
      {/if}
    </div>
  {/if}

  {#if scoreExplanation}
    <div
      class="verdict-score-explainer"
      title={scoreExplanation.detail}
      aria-label="Quality score explanation"
    >
      <span class="verdict-score-headline">{scoreExplanation.headline}</span>
      <span class="verdict-score-summary">{scoreExplanation.summary}</span>
      <span class="verdict-score-chips" aria-hidden="true">
        {#each scoreContributions as contribution (contribution.endpointId)}
          <span
            class="verdict-score-chip"
            class:healthy={contribution.bucket === 'healthy'}
            class:degraded={contribution.bucket === 'degraded'}
            class:unhealthy={contribution.bucket === 'unhealthy'}
          >{contribution.label} {contribution.points}</span>
        {/each}
        {#if hiddenScoreContributions > 0}
          <span class="verdict-score-chip muted">+{hiddenScoreContributions}</span>
        {/if}
      </span>
    </div>
  {:else if contextLine}
    <p class="verdict-context">{contextLine}</p>
  {/if}

  {#if canStartSuppressedRun}
    <button type="button" class="verdict-drill verdict-start" onclick={() => onStart?.()}>
      <span class="verdict-drill-text">Start Measuring</span>
      <span class="verdict-drill-arrow" aria-hidden="true">→</span>
    </button>
  {/if}
</section>

<style>
  .verdict {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 18px;
    align-items: center;
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 12px;
    padding: 12px 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  /* Warn: amber-tinted border + subtle top-to-bottom gradient. Matches
     v2 prototype .v2-verdict-warn — the gradient carries warmth into the
     headline area then fades back into the neutral surface. */
  .verdict.warn {
    border-color: rgba(251, 191, 36, 0.3);
    background: linear-gradient(180deg, rgba(251, 191, 36, 0.03), var(--glass-bg-rail-hover));
  }
  .verdict.good { border-color: rgba(134, 239, 172, 0.25); }
  .verdict.hero {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 11px 16px;
    border-radius: 12px;
  }
  .verdict.hero .verdict-headline {
    font-size: var(--ts-xl);
  }
  .verdict.hero .verdict-explanation {
    font-size: var(--ts-md);
  }

  .verdict-main {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .verdict-status-pill {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid var(--border-mid);
    background: rgba(255, 255, 255, 0.04);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .verdict.good .verdict-status-pill {
    color: var(--accent-green);
    border-color: rgba(134, 239, 172, 0.24);
    background: rgba(134, 239, 172, 0.055);
  }
  .verdict.warn .verdict-status-pill {
    color: var(--accent-amber);
    border-color: rgba(251, 191, 36, 0.26);
    background: rgba(251, 191, 36, 0.065);
  }
  .verdict-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .verdict.good .verdict-dot {
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--green-glow);
  }
  .verdict.warn .verdict-dot {
    background: var(--accent-amber);
    box-shadow: 0 0 8px var(--accent-amber-glow);
    animation: verdictPulse 1.8s ease-in-out infinite;
  }
  @keyframes verdictPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  @media (prefers-reduced-motion: reduce) {
    .verdict.warn .verdict-dot { animation: none; }
  }
  .verdict-headline {
    margin: 0;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-base);
    font-weight: 500;
    letter-spacing: var(--tr-tight);
    flex: 1 1 220px;
    min-width: 0;
  }
  .verdict-confidence {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-mid);
    color: var(--t2);
    background: rgba(255, 255, 255, 0.035);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .verdict-confidence.high {
    color: var(--accent-green);
    border-color: rgba(134, 239, 172, 0.24);
    background: rgba(134, 239, 172, 0.06);
  }
  .verdict-confidence.medium {
    color: var(--accent-cyan);
    border-color: rgba(103, 232, 249, 0.24);
    background: rgba(103, 232, 249, 0.05);
  }
  .verdict-confidence.low {
    color: var(--t3);
  }
  .verdict-baseline-chip {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-mid);
    color: var(--t3);
    background: rgba(255, 255, 255, 0.03);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .verdict-baseline-chip.hot {
    color: var(--accent-amber);
    border-color: rgba(251, 191, 36, 0.24);
    background: rgba(251, 191, 36, 0.06);
  }
  .verdict-baseline-chip.normal {
    color: var(--accent-green);
    border-color: rgba(134, 239, 172, 0.22);
    background: rgba(134, 239, 172, 0.05);
  }
  .verdict-explanation {
    grid-column: 1 / -1;
    margin: -2px 0 0;
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .verdict-context {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
  }
  .verdict-score-explainer {
    grid-column: 1 / -1;
    margin: 0;
    padding-top: 6px;
    border-top: 1px solid var(--border-mid);
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
    white-space: nowrap;
  }
  .verdict-score-headline {
    flex: 0 0 auto;
    color: var(--t1);
    font-weight: 600;
  }
  .verdict-score-summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .verdict-score-chips {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
    flex: 0 1 auto;
  }
  .verdict-score-chip {
    flex: 0 0 auto;
    padding: 2px 5px;
    border-radius: 999px;
    border: 1px solid var(--border-mid);
    color: var(--t3);
    background: rgba(255, 255, 255, 0.03);
    font-variant-numeric: tabular-nums;
  }
  .verdict-score-chip.healthy {
    color: var(--accent-green);
    border-color: rgba(134, 239, 172, 0.2);
    background: rgba(134, 239, 172, 0.045);
  }
  .verdict-score-chip.degraded {
    color: var(--accent-amber);
    border-color: rgba(251, 191, 36, 0.22);
    background: rgba(251, 191, 36, 0.05);
  }
  .verdict-score-chip.unhealthy {
    color: var(--accent-pink);
    border-color: rgba(249, 168, 212, 0.22);
    background: rgba(249, 168, 212, 0.05);
  }
  .verdict-score-chip.muted {
    color: var(--t4);
  }

  .verdict-metrics {
    grid-column: 1;
    margin: 0;
    padding-top: 7px;
    border-top: 1px solid var(--border-mid);
    display: flex;
    gap: 14px;
    align-items: center;
    min-width: 0;
  }
  .verdict-facts-heading {
    flex: 0 0 auto;
    color: var(--t4);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }
  .verdict-metric {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
  }
  .verdict-metric-label {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t2);
    text-transform: uppercase;
    margin: 0;
  }
  .verdict-metric-value {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .verdict-metric-num {
    font-size: var(--ts-md);
    font-weight: 500;
    color: var(--t1);
    letter-spacing: var(--tr-tight);
  }
  .verdict-metric-unit {
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-label);
  }

  /* Drill button: sans "Investigate" + mono endpoint chip + cyan arrow. Matches
     v2 prototype .v2-verdict-drill — mixed typography (sans label, mono name)
     signals "act on this specific endpoint" without shouting. */
  .verdict-drill {
    grid-column: 2;
    grid-row: 3;
    align-self: center;
    justify-self: end;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(103, 232, 249, 0.08);
    border: 1px solid rgba(103, 232, 249, 0.25);
    color: var(--t1);
    font-family: var(--sans);
    font-size: 11.5px;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .verdict-drill:hover { background: rgba(103, 232, 249, 0.15); }
  .verdict-drill:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .verdict-drill-ep {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    letter-spacing: var(--tr-label);
    font-variant-numeric: tabular-nums;
  }
  .verdict-drill-arrow { color: var(--accent-cyan); }
  .verdict-start {
    min-height: 44px;
    white-space: nowrap;
  }
  .verdict:not(.collecting) .verdict-drill:not(.verdict-start) {
    grid-row: 3;
  }

  .verdict-extra {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px 14px;
    align-items: center;
    min-width: 0;
    padding-top: 6px;
    border-top: 1px solid var(--border-mid);
  }
  .verdict-limit,
  .verdict-next {
    flex: 1 1 0;
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    color: var(--t3);
    font-size: var(--ts-xs);
    line-height: 1.25;
  }
  .verdict-limit span:last-child,
  .verdict-next span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .verdict-extra-label {
    flex: 0 0 auto;
    font-family: var(--mono);
    color: var(--t4);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }

  @media (max-width: 767px) {
    .verdict { grid-template-columns: 1fr; padding: 8px 10px; gap: 5px 12px; }
    .verdict-main { gap: 6px; }
    .verdict-status-pill,
    .verdict-confidence {
      padding: 2px 6px;
      font-size: 9px;
    }
    .verdict-explanation {
      margin-left: 0;
      font-size: var(--ts-xs);
      line-height: 1.25;
    }
    .verdict-context { margin-left: 0; }
    .verdict-score-explainer {
      margin-left: 0;
      gap: 6px;
      font-size: 10px;
    }
    .verdict-score-chips { display: none; }
    .verdict-metrics { flex-wrap: nowrap; gap: 8px; padding-top: 5px; overflow: hidden; }
    .verdict-facts-heading { display: none; }
    .verdict-metric { gap: 3px; }
    .verdict-metric-label,
    .verdict-metric-unit { font-size: 9px; }
    .verdict-metric-num { font-size: var(--ts-sm); }
    .verdict-extra { display: none; }
    .verdict-drill {
      /* Reset the desktop placement (grid-column: 2; grid-row: 2;
         justify-self: end) so the button sits under the metrics row
         and stretches center rather than hugging the right edge. */
      grid-column: 1;
      grid-row: auto;
      justify-self: stretch;
      justify-content: center;
      padding: 6px 10px;
    }
  }

  @media (max-height: 900px) and (min-width: 768px) {
    .verdict.hero {
      padding: 9px 14px;
      gap: 6px 14px;
    }
    .verdict.hero .verdict-metrics {
      padding-top: 5px;
    }
    .verdict.hero .verdict-extra,
    .verdict.hero .verdict-score-explainer {
      padding-top: 5px;
    }
    .verdict.hero .verdict-score-chips {
      display: none;
    }
  }

  @media (max-width: 767px) and (max-height: 860px) {
    .verdict.hero {
      padding: 6px 10px;
      gap: 4px;
    }
    .verdict-main { gap: 6px; }
    .verdict.hero .verdict-headline {
      font-size: var(--ts-lg);
    }
    .verdict-confidence,
    .verdict-baseline-chip {
      padding: 1px 5px;
      font-size: 9px;
    }
    .verdict.hero .verdict-explanation,
    .verdict.hero .verdict-context,
    .verdict.hero .verdict-score-explainer {
      display: none;
    }
    .verdict-metrics {
      gap: 8px 12px;
      padding-top: 4px;
    }
    .verdict-metric-num {
      font-size: var(--ts-md);
    }
    .verdict-drill {
      padding: 5px 8px;
    }
  }
</style>
