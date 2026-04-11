<!-- src/lib/components/LanesView.svelte -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { prepareFrame, computeRibbonsPerLane, computeHeatmapCells } from '$lib/renderers/timeline-data-pipeline';
  import { tokens } from '$lib/tokens';
  import { deriveLayoutMode } from '$lib/layout';
  import type { LayoutMode } from '$lib/layout';
  import type { HeatmapCellData, RibbonData } from '$lib/types';
  import Lane from './Lane.svelte';
  import LaneSvgChart from './LaneSvgChart.svelte';

  let {
    visibleStart = 1,
    visibleEnd = 60,
  }: {
    visibleStart?: number;
    visibleEnd?: number;
  } = $props();

  const endpoints = $derived($endpointStore.filter(ep => ep.enabled));

  // ── Layout mode derivation ────────────────────────────────────────────────────
  let containerHeight = $state(0);
  let isMobile = $state(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  $effect(() => {
    const ro = new ResizeObserver(([entry]) => {
      containerHeight = entry.contentRect.height;
    });
    ro.observe(lanesEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent): void => { isMobile = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  const layoutMode: LayoutMode = $derived(
    deriveLayoutMode(endpoints.length, containerHeight, isMobile),
  );

  const isCompact: boolean = $derived(layoutMode !== 'full');

  // Call prepareFrame() with skipRibbons=true for fast per-frame updates
  // Ribbons are throttled separately below (once every other round ≈ 1Hz)
  const baseFrame = $derived(prepareFrame(endpoints, $measurementStore, true));

  // Throttled ribbon computation — recompute every N new samples instead of every frame
  let lastRibbonSampleCount = 0;
  let cachedRibbons: ReadonlyMap<string, RibbonData> = new Map();

  const frameData = $derived.by(() => {
    const base = baseFrame;
    if (!base.hasData) return { ...base, ribbonsByEndpoint: new Map() as ReadonlyMap<string, RibbonData> };

    // Count total samples across all endpoints
    const totalSamples = Object.values($measurementStore.endpoints)
      .reduce((sum, ep) => sum + ep.samples.length, 0);

    // Recompute ribbons every other round (≈ endpoints.length * 2 new samples)
    // or immediately when not running (final state accuracy)
    const threshold = Math.max(endpoints.length * 2, 1);
    const isRunning = $measurementStore.lifecycle === 'running';
    if (!isRunning || totalSamples - lastRibbonSampleCount >= threshold) {
      cachedRibbons = computeRibbonsPerLane($measurementStore, base.yRangesByEndpoint);
      lastRibbonSampleCount = totalSamples;
    }

    return { ...base, ribbonsByEndpoint: cachedRibbons };
  });

  // Compute heatmap cells per endpoint (all samples, not windowed)
  const heatmapCellsByEndpoint: ReadonlyMap<string, readonly HeatmapCellData[]> = $derived.by(() => {
    const map = new Map<string, readonly HeatmapCellData[]>();
    const startedAt = $measurementStore.startedAt;
    for (const ep of endpoints) {
      const epState = $measurementStore.endpoints[ep.id];
      const stats = $statisticsStore[ep.id];
      if (!epState || !stats) {
        map.set(ep.id, []);
        continue;
      }
      map.set(ep.id, computeHeatmapCells(epState.samples, stats, startedAt, ep.color));
    }
    return map;
  });

  function colorToRgba06(hex: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return 'rgba(103,232,249,.06)';
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},.06)`;
  }

  let lanesEl: HTMLDivElement;

  function handleMouseMove(e: MouseEvent): void {
    const lane = (e.target as HTMLElement).closest('.lane');
    const chartEl = lane?.querySelector('.lane-chart') as HTMLElement | null;
    if (!chartEl) {
      uiStore.clearLaneHover();
      return;
    }
    const chartRect = chartEl.getBoundingClientRect();
    const x = e.clientX - chartRect.left;
    const chartW = chartRect.width;
    if (chartW <= 0 || x < 0 || x > chartW) {
      uiStore.clearLaneHover();
      return;
    }
    const pct = x / chartW;
    const span = visibleEnd - visibleStart;
    const round = Math.round(pct * span + visibleStart);
    const clamped = Math.max(visibleStart, Math.min($measurementStore.roundCounter, round));
    if (clamped < visibleStart || clamped > $measurementStore.roundCounter) {
      uiStore.clearLaneHover();
      return;
    }
    uiStore.setLaneHover(clamped, e.clientX, e.clientY);
  }

  function handleMouseLeave(): void {
    uiStore.clearLaneHover();
  }

  function getLaneProps(endpointId: string) {
    const stats = $statisticsStore[endpointId];
    const epState = $measurementStore.endpoints[endpointId];
    const samples = epState?.samples ?? [];
    if (!stats || !stats.ready) {
      const lastLatency = epState?.lastLatency ?? 0;
      return { p50: lastLatency, p95: lastLatency, p99: lastLatency, jitter: 0, lossPercent: 0, ready: false };
    }
    const totalSamples = samples.length;
    const lossSamples = samples.filter(s => s.status !== 'ok').length;
    const lossPercent = totalSamples > 0 ? (lossSamples / totalSamples) * 100 : 0;
    return { p50: stats.p50, p95: stats.p95, p99: stats.p99, jitter: stats.stddev, lossPercent, ready: true };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="lanes"
  id="lanes"
  role="region"
  aria-label="Endpoint lanes"
  bind:this={lanesEl}
  class:grid-2col={layoutMode === 'compact-2col'}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  style:--lanes-gap="{tokens.lane.gapPx}px"
  style:--lanes-pad-x="{tokens.lane.paddingX}px"
  style:--lanes-pad-y="{tokens.lane.paddingY}px"
>
  {#if endpoints.length === 0}
    <div class="no-endpoints">
      <span>Add an endpoint to begin</span>
    </div>
  {:else}
    {#each endpoints as ep (ep.id)}
      {@const laneProps = getLaneProps(ep.id)}
      {@const lastLatency = $measurementStore.endpoints[ep.id]?.lastLatency ?? null}
      <Lane
        endpointId={ep.id}
        color={ep.color}
        url={ep.label || ep.url}
        p50={laneProps.p50}
        p95={laneProps.p95}
        p99={laneProps.p99}
        jitter={laneProps.jitter}
        lossPercent={laneProps.lossPercent}
        ready={laneProps.ready}
        {lastLatency}
        compact={isCompact}
      >
        {#snippet children()}
          {@const allPoints = frameData.pointsByEndpoint.get(ep.id) ?? []}
          {@const windowedPoints = allPoints.filter(p => p.round >= visibleStart && p.round <= visibleEnd)}
          <LaneSvgChart
            color={ep.color}
            colorRgba06={colorToRgba06(ep.color)}
            {visibleStart}
            {visibleEnd}
            currentRound={$measurementStore.roundCounter}
            points={windowedPoints}
            ribbon={frameData.ribbonsByEndpoint.get(ep.id)}
            yRange={frameData.yRangesByEndpoint.get(ep.id) ?? frameData.yRange}
            maxRound={frameData.maxRound}
            xTicks={frameData.xTicks}
            heatmapCells={heatmapCellsByEndpoint.get(ep.id) ?? []}
            timeoutMs={$settingsStore.timeout}
          />
        {/snippet}
      </Lane>
    {/each}
  {/if}
</div>

<style>
  .lanes {
    flex: 1; display: flex; flex-direction: column;
    padding: var(--lanes-pad-y) var(--lanes-pad-x) 4px;
    gap: var(--lanes-gap);
    overflow: auto;
    min-height: 0;
  }

  /* 2-column grid mode (AC3) */
  .lanes.grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-flow: row;
    gap: var(--lanes-gap);
    align-content: start;
  }

  /* Mobile override: force 2-col back to single column */
  @media (max-width: 767px) {
    .lanes.grid-2col {
      grid-template-columns: 1fr;
    }
  }

  .no-endpoints {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-family: 'Martian Mono', monospace;
    font-size: 13px; font-weight: 300;
    color: rgba(255,255,255,.14);
  }
</style>
