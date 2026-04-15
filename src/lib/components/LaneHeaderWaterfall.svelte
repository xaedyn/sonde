<!-- src/lib/components/LaneHeaderWaterfall.svelte -->
<!-- 6px-tall horizontal stacked bar showing 5 timing phases as proportional flex segments. -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    tier2Averages,
  }: {
    tier2Averages: {
      dnsLookup: number;
      tcpConnect: number;
      tlsHandshake: number;
      ttfb: number;
      contentTransfer: number;
    };
  } = $props();

  // ── Phase definitions ────────────────────────────────────────────────────────
  const phases = $derived([
    { key: 'dns',      label: 'DNS',      value: tier2Averages.dnsLookup,      color: tokens.color.tier2.dns },
    { key: 'tcp',      label: 'TCP',      value: tier2Averages.tcpConnect,     color: tokens.color.tier2.tcp },
    { key: 'tls',      label: 'TLS',      value: tier2Averages.tlsHandshake,   color: tokens.color.tier2.tls },
    { key: 'ttfb',     label: 'TTFB',     value: tier2Averages.ttfb,           color: tokens.color.tier2.ttfb },
    { key: 'transfer', label: 'Transfer', value: tier2Averages.contentTransfer, color: tokens.color.tier2.transfer },
  ]);

  const tier2Total = $derived(phases.reduce((sum, p) => sum + p.value, 0));

  function flexBasis(value: number): string {
    return `${(value / tier2Total) * 100}%`;
  }

  const ariaLabel = $derived(
    phases.map((p) => `${p.label}: ${Math.round(p.value)}ms`).join(', ')
  );
</script>

<div
  class="wf-root"
  style:--wf-label-color={tokens.color.tier2.labelText}
>
  {#if tier2Total === 0}
    <div
      class="wf-fallback"
      role="status"
      aria-label="Timing decomposition unavailable in this browser"
    >
      <span class="wf-fallback-text">Timing data limited</span>
    </div>
  {:else}
    <!-- Stacked timing bar -->
    <div
      class="waterfall-bar"
      role="img"
      aria-label={ariaLabel}
    >
      {#each phases as phase (phase.key)}
        <div
          class="wf-segment"
          style:flex-basis={flexBasis(phase.value)}
          style:min-width="2px"
          style:background={phase.color}
        ></div>
      {/each}
    </div>

    <!-- Phase labels — only show phases with value > 0 -->
    <div class="wf-labels" aria-hidden="true">
      {#each phases as phase (phase.key)}
        {#if phase.value > 0}
          <span class="wf-label">{phase.label} {Math.round(phase.value)}ms</span>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .wf-root {
    margin-top: 12px;
  }

  .waterfall-bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    gap: 0.5px;
  }

  .wf-segment {
    transition: flex-basis 400ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .wf-segment {
      transition: none;
    }
  }

  .wf-labels {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs) var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .wf-label {
    font-size: 9px;
    font-family: var(--mono);
    color: var(--wf-label-color);
    white-space: nowrap;
    letter-spacing: 0.04em;
  }

  .wf-fallback {
    height: 6px;
    display: flex;
    align-items: center;
    margin-top: 0;
  }

  .wf-fallback-text {
    font-size: 9px;
    font-family: var(--mono);
    color: var(--wf-label-color);
    opacity: 0.6;
  }
</style>
