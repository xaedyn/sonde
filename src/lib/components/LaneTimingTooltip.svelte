<!-- src/lib/components/LaneTimingTooltip.svelte -->
<!-- Floating tooltip showing tier2 timing decomposition for a scatter dot hover. -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import type { MeasurementSample } from '$lib/types';

  let { sample, x, y, color }: {
    sample: MeasurementSample;
    x: number;
    y: number;
    color: string;
  } = $props();

  // CRITICAL: tier2Total must be defined BEFORE hasTier2
  const tier2Total = $derived.by(() => {
    if (!sample.tier2) return 0;
    const t = sample.tier2;
    return (t.dnsLookup ?? 0) + (t.tcpConnect ?? 0) + (t.tlsHandshake ?? 0) + (t.ttfb ?? 0) + (t.contentTransfer ?? 0);
  });

  const hasTier2 = $derived(sample.tier2 !== undefined && tier2Total > 0);

  interface Phase {
    key: string;
    label: string;
    value: number;
    color: string;
  }

  const phases: Phase[] = $derived.by(() => {
    if (!hasTier2 || !sample.tier2) return [];
    const t = sample.tier2;
    return [
      { key: 'dns',      label: 'DNS',      value: t.dnsLookup ?? 0,      color: tokens.color.tier2.dns },
      { key: 'tcp',      label: 'TCP',      value: t.tcpConnect ?? 0,     color: tokens.color.tier2.tcp },
      { key: 'tls',      label: 'TLS',      value: t.tlsHandshake ?? 0,   color: tokens.color.tier2.tls },
      { key: 'ttfb',     label: 'TTFB',     value: t.ttfb ?? 0,           color: tokens.color.tier2.ttfb },
      { key: 'transfer', label: 'Transfer', value: t.contentTransfer ?? 0, color: tokens.color.tier2.transfer },
    ].filter(p => p.value > 0);
  });

  // All 5 segments for mini waterfall (including zero-value ones for proportional display)
  const allSegments: Phase[] = $derived.by(() => {
    if (!hasTier2 || !sample.tier2) return [];
    const t = sample.tier2;
    return [
      { key: 'dns',      label: 'DNS',      value: t.dnsLookup ?? 0,      color: tokens.color.tier2.dns },
      { key: 'tcp',      label: 'TCP',      value: t.tcpConnect ?? 0,     color: tokens.color.tier2.tcp },
      { key: 'tls',      label: 'TLS',      value: t.tlsHandshake ?? 0,   color: tokens.color.tier2.tls },
      { key: 'ttfb',     label: 'TTFB',     value: t.ttfb ?? 0,           color: tokens.color.tier2.ttfb },
      { key: 'transfer', label: 'Transfer', value: t.contentTransfer ?? 0, color: tokens.color.tier2.transfer },
    ];
  });

  function segmentBasis(value: number): string {
    if (tier2Total <= 0) return '20%';
    return `${(value / tier2Total) * 100}%`;
  }

  const VIEWPORT_MARGIN = 8;

  let tooltipEl: HTMLDivElement | undefined = $state();
  let posX = $state(x);
  let posY = $state(y);

  // Reposition after layout so offsetHeight is accurate
  $effect(() => {
    if (!tooltipEl) { posX = x; posY = y; return; }
    // Read layout dimensions
    const w = tooltipEl.offsetWidth;
    const h = tooltipEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // X clamping
    let nx = x;
    if (nx + w > vw - VIEWPORT_MARGIN) nx = vw - w - VIEWPORT_MARGIN;
    if (nx < VIEWPORT_MARGIN) nx = VIEWPORT_MARGIN;

    // Y: prefer below the dot, flip above if it overflows
    let ny = y;
    if (ny + h > vh - VIEWPORT_MARGIN) {
      const flipped = y - h - 16;
      ny = flipped >= VIEWPORT_MARGIN ? flipped : VIEWPORT_MARGIN;
    }

    posX = nx;
    posY = ny;
  });
</script>

<div
  class="lt-tooltip"
  bind:this={tooltipEl}
  style:left="{posX}px"
  style:top="{posY}px"
  style:--tooltip-bg={tokens.color.tooltip.bg}
  style:--shadow-low={tokens.shadow.low}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--radius-md="{tokens.radius.md}px"
  style:--protocol-bg={tokens.color.glass.bgHover}
  style:--t2={tokens.color.text.t2}
  style:--t4={tokens.color.tier2.labelText}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--ep-color={color}
  aria-live="polite"
>
  <div class="lt-total">{Math.round(sample.latency)}ms</div>

  {#if hasTier2}
    <div class="lt-mini-bar" role="img" aria-label="Timing breakdown waterfall">
      {#each allSegments as seg (seg.key)}
        <div
          class="lt-bar-seg"
          style:flex-basis={segmentBasis(seg.value)}
          style:min-width="2px"
          style:background={seg.color}
        ></div>
      {/each}
    </div>

    <div class="lt-phases">
      {#each phases as phase (phase.key)}
        <div class="lt-phase-row">
          <span class="lt-phase-dot" style:background={phase.color}></span>
          <span class="lt-phase-label">{phase.label}</span>
          <span class="lt-phase-value">{Math.round(phase.value)}ms</span>
        </div>
      {/each}
    </div>

    {#if sample.tier2?.protocol}
      <div class="lt-protocol">{sample.tier2.protocol}</div>
    {/if}
  {/if}
</div>

<style>
  .lt-tooltip {
    position: fixed;
    pointer-events: none;
    z-index: 100;
    background: var(--tooltip-bg);
    box-shadow: var(--shadow-low);
    border-radius: var(--radius-sm);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding: 10px 12px;
    max-width: 220px;
  }

  .lt-total {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ep-color);
    margin-bottom: 6px;
  }

  .lt-mini-bar {
    display: flex;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 8px;
    gap: 1px;
  }

  .lt-bar-seg {
    height: 100%;
    border-radius: 1px;
  }

  .lt-phases {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .lt-phase-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .lt-phase-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .lt-phase-label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 400;
    color: var(--t4);
    flex: 1;
  }

  .lt-phase-value {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--t2);
  }

  .lt-protocol {
    display: inline-block;
    margin-top: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--protocol-bg);
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 400;
    color: var(--t4);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  @media (max-width: 767px) {
    .lt-tooltip {
      position: fixed;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      top: auto !important;
      max-width: none;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }

    .lt-phases {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
