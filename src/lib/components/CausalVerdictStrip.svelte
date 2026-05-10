<!-- src/lib/components/CausalVerdictStrip.svelte -->
<!-- Single-sentence diagnosis with backing triptych + drill CTA. Pure render  -->
<!-- — diagnosis is computed in the parent and passed in whole.                -->
<script lang="ts">
  import type { DiagnosticNarrative } from '$lib/utils/diagnostic-narrative';
  import type { HistoryBaselineInsight } from '$lib/utils/history-baseline';
  import type { AutoStartSuppressionReason, Endpoint } from '$lib/types';

  interface Props {
    diagnosis: DiagnosticNarrative;
    avgP50: number | null;
    avgJitter: number | null;
    avgLoss: number | null;
    drillEndpoint: Endpoint | null;
    baselineInsight?: HistoryBaselineInsight | null;
    autoStartSuppressionReason?: AutoStartSuppressionReason | null;
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
    autoStartSuppressionReason = null,
    variant = 'normal',
    onDrill,
    onStart,
  }: Props = $props();
  const verdict = $derived(diagnosis.verdict);
  const primaryLimitation = $derived(diagnosis.limitations[0] ?? null);
  const primaryNextStep = $derived(diagnosis.nextSteps[0] ?? null);
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

  const fmtInt = (n: number | null): string => (n == null ? '—' : String(Math.round(n)));
  const fmt1 = (n: number | null): string => (n == null ? '—' : n.toFixed(1));
</script>

<section
  class="verdict"
  class:hero={variant === 'hero'}
  class:warn={verdict.tone === 'warn'}
  class:good={verdict.tone === 'good'}
  aria-live="polite"
  aria-atomic="true"
>
  <div class="verdict-main">
    <span class="verdict-dot" aria-hidden="true"></span>
    <h2 class="verdict-headline">{verdict.headline}</h2>
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
    <p class="verdict-explanation">{diagnosis.explanation}</p>
  {/if}

  <dl class="verdict-metrics">
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
        <span class="verdict-metric-unit">σ</span>
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

  {#if drillEndpoint && verdict.tone === 'warn'}
    <button
      type="button"
      class="verdict-drill"
      onclick={() => onDrill(drillEndpoint.id)}
      aria-label="Investigate {drillEndpoint.label}, route to investigation view"
    >
      <span class="verdict-drill-text">Investigate</span>
      <span class="verdict-drill-ep" style:color={drillEndpoint.color}>{drillEndpoint.label}</span>
      <span class="verdict-drill-arrow" aria-hidden="true">→</span>
    </button>
  {/if}

  {#if autoStartSuppressionReason && diagnosis.kind === 'collecting'}
    <button type="button" class="verdict-drill verdict-start" onclick={() => onStart?.()}>
      <span class="verdict-drill-text">Start Measuring</span>
      <span class="verdict-drill-arrow" aria-hidden="true">→</span>
    </button>
  {/if}

  {#if diagnosis.kind !== 'collecting'}
    <div class="verdict-extra">
      {#if primaryLimitation}
        <p class="verdict-limit">
          <span class="verdict-extra-label">Limit</span>
          <span>{primaryLimitation.headline}</span>
        </p>
      {/if}
      {#if primaryNextStep}
        <p class="verdict-next">
          <span class="verdict-extra-label">Next</span>
          <span>{primaryNextStep}</span>
        </p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .verdict {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px 22px;
    align-items: center;
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 14px 18px;
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
    padding: 16px 20px;
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
    gap: 10px;
    flex-wrap: wrap;
  }
  .verdict-dot {
    width: 8px; height: 8px;
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
    margin: -4px 0 0 18px;
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.35;
  }

  .verdict-metrics {
    grid-column: 1;
    margin: 0;
    padding-top: 10px;
    border-top: 1px solid var(--border-mid);
    display: flex;
    gap: 22px;
    align-items: baseline;
  }
  .verdict-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
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
    font-size: var(--ts-xl);
    font-weight: 300;
    color: var(--t1);
    letter-spacing: var(--tr-tight);
  }
  .verdict-metric-unit {
    font-size: var(--ts-sm);
    color: var(--t3);
    letter-spacing: var(--tr-label);
  }

  /* Drill button: sans "Investigate" + mono endpoint chip + cyan arrow. Matches
     v2 prototype .v2-verdict-drill — mixed typography (sans label, mono name)
     signals "act on this specific endpoint" without shouting. */
  .verdict-drill {
    grid-column: 2;
    grid-row: 2;
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
  .verdict-start { white-space: nowrap; }

  .verdict-extra {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding-top: 9px;
    border-top: 1px solid var(--border-mid);
  }
  .verdict-limit,
  .verdict-next {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    color: var(--t3);
    font-size: var(--ts-xs);
    line-height: 1.35;
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
    .verdict { grid-template-columns: 1fr; padding: 10px 12px; gap: 8px 14px; }
    .verdict-main { gap: 8px; }
    .verdict-confidence { padding: 2px 6px; }
    .verdict-explanation {
      margin-left: 0;
      font-size: var(--ts-xs);
      line-height: 1.25;
    }
    .verdict-metrics { flex-wrap: wrap; gap: 10px 14px; padding-top: 6px; }
    .verdict-metric-num { font-size: var(--ts-lg); }
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
</style>
