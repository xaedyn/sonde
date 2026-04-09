<!-- src/lib/components/LanesView.svelte -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { prepareFrame } from '$lib/renderers/timeline-data-pipeline';
  import { tokens } from '$lib/tokens';
  import Lane from './Lane.svelte';
  import LaneSvgChart from './LaneSvgChart.svelte';

  const endpoints = $derived($endpointStore.filter(ep => ep.enabled));
  const totalRounds = $derived($settingsStore.cap > 0 ? $settingsStore.cap : 30);

  // Call prepareFrame() ONCE for all enabled endpoints
  const frameData = $derived(prepareFrame(endpoints, $measurementStore));

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
  const PANEL_W = tokens.lane.panelWidth + tokens.lane.paddingX; // 260

  function handleMouseMove(e: MouseEvent): void {
    const rect = lanesEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PANEL_W) {
      uiStore.clearLaneHover();
      return;
    }
    const chartW = rect.width - PANEL_W;
    if (chartW <= 0) return;
    const pct = (x - PANEL_W) / chartW;
    const round = Math.round(pct * (totalRounds - 1)) + 1;
    const clamped = Math.max(1, Math.min($measurementStore.roundCounter, round));
    if (clamped < 1 || clamped > $measurementStore.roundCounter) {
      uiStore.clearLaneHover();
      return;
    }
    uiStore.setLaneHover(clamped, e.clientX);
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
      >
        {#snippet children()}
          <LaneSvgChart
            color={ep.color}
            colorRgba06={colorToRgba06(ep.color)}
            {totalRounds}
            currentRound={$measurementStore.roundCounter}
            points={frameData.pointsByEndpoint.get(ep.id) ?? []}
            ribbon={frameData.ribbonsByEndpoint.get(ep.id)}
            yRange={frameData.yRange}
            maxRound={frameData.maxRound}
            xTicks={frameData.xTicks}
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
  .no-endpoints {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-family: 'Martian Mono', monospace;
    font-size: 13px; font-weight: 300;
    color: rgba(255,255,255,.14);
  }
</style>
