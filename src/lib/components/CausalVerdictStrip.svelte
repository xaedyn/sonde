<!-- src/lib/components/CausalVerdictStrip.svelte -->
<!-- Single-sentence diagnosis with backing triptych + drill CTA. Pure render  -->
<!-- — verdict is computed in the parent via verdict.ts and passed in whole.   -->
<script lang="ts">
  import type { Verdict } from '$lib/utils/verdict';
  import type { Endpoint } from '$lib/types';

  interface Props {
    verdict: Verdict;
    avgP50: number | null;
    avgJitter: number | null;
    avgLoss: number | null;
    drillEndpoint: Endpoint | null;
    onDrill: (epId: string) => void;
  }

  let { verdict, avgP50, avgJitter, avgLoss, drillEndpoint, onDrill }: Props = $props();

  const fmtInt = (n: number | null): string => (n == null ? '—' : String(Math.round(n)));
  const fmt1 = (n: number | null): string => (n == null ? '—' : n.toFixed(1));
</script>

<section
  class="verdict"
  class:warn={verdict.tone === 'warn'}
  class:good={verdict.tone === 'good'}
  aria-live="polite"
  aria-atomic="true"
>
  <div class="verdict-main">
    <span class="verdict-dot" aria-hidden="true"></span>
    <h2 class="verdict-headline">{verdict.headline}</h2>
  </div>

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
      aria-label="Diagnose {drillEndpoint.label}, route to diagnose view"
    >
      <span class="verdict-drill-text">Diagnose</span>
      <span class="verdict-drill-ep" style:color={drillEndpoint.color}>{drillEndpoint.label}</span>
      <span class="verdict-drill-arrow" aria-hidden="true">→</span>
    </button>
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

  .verdict-main {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 10px;
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
    color: var(--t4);
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

  /* Drill button: sans "Diagnose" + mono endpoint chip + cyan arrow. Matches
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

  @media (max-width: 767px) {
    .verdict { grid-template-columns: 1fr; }
    .verdict-metrics { flex-wrap: wrap; gap: 14px; }
    .verdict-drill {
      /* Reset the desktop placement (grid-column: 2; grid-row: 2;
         justify-self: end) so the button sits under the metrics row
         and stretches center rather than hugging the right edge. */
      grid-column: 1;
      grid-row: auto;
      justify-self: stretch;
      justify-content: center;
    }
  }
</style>
