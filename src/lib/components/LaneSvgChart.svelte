<!-- src/lib/components/LaneSvgChart.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import type { ScatterPoint, RibbonData, YRange, XTick } from '$lib/types';

  let {
    color,
    colorRgba06,
    totalRounds,
    currentRound = 0,
    points = [],
    ribbon = undefined,
    yRange,
    maxRound = 0,
    xTicks = [],
  }: {
    color: string;
    colorRgba06: string;
    totalRounds: number;
    currentRound?: number;
    points: readonly ScatterPoint[];
    ribbon: RibbonData | undefined;
    yRange: YRange;
    maxRound: number;
    xTicks: readonly XTick[];
  } = $props();

  const VB_W = 1000;
  const VB_H = 200;
  const PAD_Y_TOP = 10;
  const PAD_Y_BOT = 10;
  const PLOT_H = VB_H - PAD_Y_TOP - PAD_Y_BOT;

  const hasData: boolean = $derived(points.length > 0);
  const effectiveMaxRound: number = $derived(Math.max(totalRounds, maxRound, 1));

  function toX(round: number): number {
    return (round / effectiveMaxRound) * VB_W;
  }

  function toY(normalizedY: number): number {
    return PAD_Y_TOP + (1 - normalizedY) * PLOT_H;
  }

  interface SvgDot { cx: number; cy: number; round: number; latency: number; }

  const dots: SvgDot[] = $derived(
    points.map(pt => ({
      cx: toX(pt.round),
      cy: toY(pt.y),
      round: pt.round,
      latency: pt.latency,
    }))
  );

  const nowDot: SvgDot | null = $derived(dots.length > 0 ? (dots[dots.length - 1] ?? null) : null);
  const futureZoneX: number = $derived(nowDot ? nowDot.cx : 0);
  const showFutureZone: boolean = $derived(hasData && futureZoneX < VB_W);

  const tracePath: string = $derived.by(() => {
    if (dots.length === 0) return '';
    return dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.cx},${d.cy}`).join(' ');
  });

  const ribbonPath: string = $derived.by(() => {
    if (!ribbon || ribbon.p25Path.length === 0) return '';
    const top = ribbon.p75Path;
    const bot = ribbon.p25Path;
    if (top.length === 0 || bot.length === 0) return '';
    const topPts = top.map(([round, ny]) => `${toX(round)},${toY(ny)}`);
    const botPts = [...bot].reverse().map(([round, ny]) => `${toX(round)},${toY(ny)}`);
    return `M${topPts.join(' L')} L${botPts.join(' L')} Z`;
  });

  const medianPath: string = $derived.by(() => {
    if (!ribbon || ribbon.p50Path.length === 0) return '';
    return ribbon.p50Path.map(([round, ny], i) =>
      `${i === 0 ? 'M' : 'L'}${toX(round)},${toY(ny)}`
    ).join(' ');
  });

  const gridlineYs: number[] = [
    PAD_Y_TOP + PLOT_H * 0.25,
    PAD_Y_TOP + PLOT_H * 0.5,
    PAD_Y_TOP + PLOT_H * 0.75,
  ];
</script>

<svg
  class="lane-svg"
  viewBox="0 0 {VB_W} {VB_H}"
  preserveAspectRatio="none"
  aria-hidden="true"
  style:--ep-color={color}
  style:--ribbon-fill={colorRgba06}
  style:--grid-line={tokens.color.svg.gridLine}
  style:--future-zone={tokens.color.svg.futureZone}
>
  {#each gridlineYs as gy}
    <line class="grid-line" x1="0" y1={gy} x2={VB_W} y2={gy} />
  {/each}

  {#if showFutureZone}
    <rect class="future-zone" x={futureZoneX} y="0" width={VB_W - futureZoneX} height={VB_H} />
  {/if}

  {#if hasData}
    {#if ribbonPath}
      <path class="ribbon" d={ribbonPath} />
    {/if}
    {#if medianPath}
      <path class="median" d={medianPath} />
    {/if}
    {#if tracePath}
      <path class="trace" d={tracePath} />
    {/if}
    <g class="dots">
      {#each dots as dot (dot.round)}
        <circle
          class="dot"
          cx={dot.cx}
          cy={dot.cy}
          r={tokens.lane.dotRadius}
          aria-label="Round {dot.round}: {Math.round(dot.latency)}ms"
        />
      {/each}
    </g>
    {#if nowDot}
      <circle class="now-dot" cx={nowDot.cx} cy={nowDot.cy} r={tokens.lane.nowDotRadius} />
      <circle
        cx={nowDot.cx}
        cy={nowDot.cy}
        r={tokens.lane.ringInitialR}
        fill="none"
        stroke="var(--ep-color)"
        stroke-width="0.5"
        opacity="0.2"
      >
        <animate attributeName="r" values="{tokens.lane.ringInitialR};{tokens.lane.ringFinalR}" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".2;0" dur="2s" repeatCount="indefinite"/>
      </circle>
    {/if}
  {:else}
    <text
      class="empty-text"
      x={VB_W / 2}
      y={VB_H / 2}
      text-anchor="middle"
      dominant-baseline="middle"
    >Waiting for data</text>
  {/if}
</svg>

<style>
  .lane-svg { width: 100%; height: 100%; display: block; }
  .grid-line { stroke: var(--grid-line); stroke-width: 0.5; }
  .future-zone { fill: var(--future-zone); }
  .ribbon { fill: var(--ribbon-fill); }
  .median { fill: none; stroke: var(--ep-color); stroke-width: 1.8; stroke-dasharray: 6 5; opacity: 0.45; }
  .trace { fill: none; stroke: var(--ep-color); stroke-width: 1.5; opacity: 0.4; stroke-linecap: round; stroke-linejoin: round; }
  .dot { fill: var(--ep-color); opacity: 0.85; cursor: pointer; transition: r 0.1s ease, opacity 0.1s ease; }
  .dot:hover { r: 5.5; opacity: 1; filter: drop-shadow(0 0 8px var(--ep-color)); }
  .now-dot { fill: var(--ep-color); filter: drop-shadow(0 0 10px var(--ribbon-fill)) drop-shadow(0 0 3px var(--ep-color)); }
  .empty-text { font-family: var(--mono, 'Martian Mono', monospace); font-size: 14px; font-weight: 300; fill: rgba(255,255,255,.14); }
</style>
