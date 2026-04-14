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

  // When total is 0, distribute equally (20% each) to avoid division by zero
  function flexBasis(value: number): string {
    if (tier2Total === 0) return '20%';
    return `${(value / tier2Total) * 100}%`;
  }

  const ariaLabel = $derived(
    phases.map((p) => `${p.label}: ${p.value}ms`).join(', ')
  );
</script>

<div
  class="wf-root"
  style:--wf-label-color={tokens.color.tier2.labelText}
>
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
        <span class="wf-label">{phase.label} {phase.value}ms</span>
      {/if}
    {/each}
  </div>
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
    gap: 4px 8px;
    margin-top: 4px;
  }

  .wf-label {
    font-size: 6px;
    font-family: 'Martian Mono', monospace;
    color: var(--wf-label-color);
    white-space: nowrap;
  }
</style>
