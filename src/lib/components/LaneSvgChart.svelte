<!-- src/lib/components/LaneSvgChart.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { uiStore } from '$lib/stores/ui';
  import type { ScatterPoint, RibbonData, YRange, XTick, HeatmapCellData } from '$lib/types';
  import { normalizeLatency, formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let {
    color,
    colorRgba06,
    visibleStart = 1,
    visibleEnd = 60,
    currentRound = 0,
    points = [],
    ribbon = undefined,
    yRange,
    maxRound = 0,
    xTicks = [],
    heatmapCells = [],
    timeoutMs = 5000,
  }: {
    color: string;
    colorRgba06: string;
    visibleStart?: number;
    visibleEnd?: number;
    currentRound?: number;
    points: readonly ScatterPoint[];
    ribbon: RibbonData | undefined;
    yRange: YRange;
    maxRound: number;
    xTicks: readonly XTick[];
    heatmapCells?: readonly HeatmapCellData[];
    timeoutMs?: number;
  } = $props();

  // ── ViewBox dimensions ───────────────────────────────────────────────────
  const VB_W = 1000;
  const VB_H = 210;
  const PAD_Y_TOP = 6;
  const PAD_Y_BOT = 4;
  const HEATMAP_H = 14;      // px in viewBox units — visible at compact lane heights
  const HEATMAP_GAP = 2;     // tight gap between scatter area and strip
  const PLOT_H = VB_H - PAD_Y_TOP - PAD_Y_BOT - HEATMAP_H - HEATMAP_GAP; // 190

  const HEATMAP_Y = VB_H - PAD_Y_BOT - HEATMAP_H; // y-origin of strip

  const hasData: boolean = $derived(points.length > 0);

  function toX(round: number): number {
    const span = visibleEnd - visibleStart;
    if (span <= 0) return VB_W;
    return ((round - visibleStart) / span) * VB_W;
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

  // ── Timeout line ─────────────────────────────────────────────────────────
  // Check raw value before clamping — normalizeLatency clamps to [0,1],
  // so we must detect out-of-range before calling it.
  const timeoutNormY: number | null = $derived.by(() => {
    if (timeoutMs < yRange.min || timeoutMs > yRange.max) return null;
    const n = normalizeLatency(timeoutMs, yRange);
    return n;
  });
  const timeoutLineY: number | null = $derived(
    timeoutNormY !== null ? toY(timeoutNormY) : null
  );

  // ── Heatmap cells ─────────────────────────────────────────────────────────
  // Map each HeatmapCellData to SVG rect x/width using the FULL round range
  // (all history, not windowed) — heatmap always shows full run.
  const cellRects: Array<{ x: number; w: number; color: string; cell: HeatmapCellData }> = $derived.by(() => {
    if (heatmapCells.length === 0) return [];
    const totalCells = heatmapCells.length;
    const cellW = VB_W / totalCells;
    return heatmapCells.map((cell, i) => ({
      x: i * cellW,
      w: Math.max(1, cellW - 0.5),  // 0.5px gap between cells
      color: cell.color,
      cell,
    }));
  });

  // ── Heatmap tooltip state ────────────────────────────────────────────────
  let svgEl: SVGSVGElement;

  function handleSvgMouseMove(e: MouseEvent) {
    if (!svgEl || cellRects.length === 0) return;
    const svgRect = svgEl.getBoundingClientRect();
    const pctY = (e.clientY - svgRect.top) / svgRect.height;
    const vbY = pctY * VB_H;
    if (vbY >= HEATMAP_Y && vbY <= HEATMAP_Y + HEATMAP_H) {
      const pctX = (e.clientX - svgRect.left) / svgRect.width;
      const idx = Math.floor(pctX * cellRects.length);
      if (idx >= 0 && idx < cellRects.length) {
        const rect = cellRects[idx];
        if (rect) {
          const { cell } = rect;
          const isSingle = cell.startRound === cell.endRound;
          const latencyStr = `${Math.round(cell.worstLatency)}ms`;
          const startEl = formatElapsed(cell.startElapsed);
          const endEl = formatElapsed(cell.endElapsed);
          const text = isSingle
            ? `Round ${cell.startRound} · ${latencyStr} · ${startEl}`
            : `Rounds ${cell.startRound}–${cell.endRound} · worst: ${latencyStr} · ${startEl}–${endEl}`;
          uiStore.setHeatmapTooltip(text, e.clientX, e.clientY);
          return;
        }
      }
    }
    uiStore.clearHeatmapTooltip();
  }

  function handleSvgMouseLeave() {
    uiStore.clearHeatmapTooltip();
  }
</script>

<div class="lane-svg-wrap" onmousemove={handleSvgMouseMove} onmouseleave={handleSvgMouseLeave}>
<svg
  bind:this={svgEl}
  class="lane-svg"
  viewBox="0 0 {VB_W} {VB_H}"
  preserveAspectRatio="none"
  aria-hidden="true"
  style:--ep-color={color}
  style:--ribbon-fill={colorRgba06}
  style:--grid-line={tokens.color.svg.gridLine}
  style:--future-zone={tokens.color.svg.futureZone}
  style:--timeout-stroke={tokens.color.svg.thresholdStroke}
  style:--tooltip-bg={tokens.color.tooltip.bg}
>
  <!-- Grid lines -->
  {#each gridlineYs as gy}
    <line class="grid-line" x1="0" y1={gy} x2={VB_W} y2={gy} />
  {/each}

  <!-- Future zone -->
  {#if showFutureZone}
    <rect class="future-zone" x={futureZoneX} y="0" width={VB_W - futureZoneX} height={PLOT_H + PAD_Y_TOP} />
  {/if}

  <!-- Timeout threshold line (between gridlines and data) -->
  {#if timeoutLineY !== null}
    <line
      class="timeout-line"
      x1="0" y1={timeoutLineY}
      x2={VB_W} y2={timeoutLineY}
    />
    <text
      class="timeout-label"
      x={VB_W - 4}
      y={timeoutLineY - 4}
      text-anchor="end"
    >timeout</text>
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
      y={(PLOT_H + PAD_Y_TOP) / 2}
      text-anchor="middle"
      dominant-baseline="middle"
    >Waiting for data</text>
  {/if}

  <!-- Heatmap strip -->
  {#each cellRects as rect, i}
    <rect
      class="heatmap-cell"
      x={rect.x}
      y={HEATMAP_Y}
      width={rect.w}
      height={HEATMAP_H}
      fill={rect.color}
      rx="1"
      role="img"
      aria-label="Round {rect.cell.startRound}{rect.cell.endRound !== rect.cell.startRound ? `–${rect.cell.endRound}` : ''}: {Math.round(rect.cell.worstLatency)}ms"
    />
  {/each}


</svg>
</div>


<style>
  .lane-svg-wrap { width: 100%; height: 100%; }
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
  /* Timeout line */
  .timeout-line { stroke: var(--timeout-stroke); stroke-width: 0.8; stroke-dasharray: 6 4; opacity: 0.4; }
  .timeout-label { font-family: 'Martian Mono', monospace; font-size: 5px; font-weight: 400; fill: var(--timeout-stroke); opacity: 0.5; }
  /* Heatmap */
  .heatmap-cell { cursor: default; }
</style>
