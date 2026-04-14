<!-- src/lib/components/LaneSvgChart.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { uiStore } from '$lib/stores/ui';
  import type { ScatterPoint, RibbonData, YRange, HeatmapCellData } from '$lib/types';
  import { normalizeLatency, formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let {
    color,
    colorRgba06,
    visibleStart = 1,
    visibleEnd = 60,
    points = [],
    ribbon = undefined,
    yRange,
    heatmapCells = [],
    timeoutMs = 5000,
    ttfbPoints = undefined,
  }: {
    color: string;
    colorRgba06: string;
    visibleStart?: number;
    visibleEnd?: number;
    points: readonly ScatterPoint[];
    ribbon: RibbonData | undefined;
    yRange: YRange;
    heatmapCells?: readonly HeatmapCellData[];
    timeoutMs?: number;
    ttfbPoints?: readonly { round: number; ttfb: number }[];
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

  // Fixed per-round width in viewBox units — dots stay in place, the group translates.
  const roundWidth: number = $derived.by(() => {
    const span = visibleEnd - visibleStart;
    return span > 0 ? VB_W / span : VB_W;
  });

  // Translate offset: slide the content group so visibleStart aligns to x=0.
  const slideX: number = $derived(-visibleStart * roundWidth);

  function toX(round: number): number {
    return round * roundWidth;
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

  // ── TTFB overlay ─────────────────────────────────────────────────────────
  interface TtfbDot { cx: number; cy: number; }

  const ttfbDots: TtfbDot[] = $derived.by(() => {
    if (!ttfbPoints || ttfbPoints.length < 2) return [];
    return ttfbPoints.map(pt => ({
      cx: toX(pt.round),
      cy: toY(normalizeLatency(pt.ttfb, yRange)),
    }));
  });

  const ttfbOverlayPath: string = $derived.by(() => {
    if (ttfbDots.length < 2) return '';
    return ttfbDots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.cx},${d.cy}`).join(' ');
  });

  // Area fill between total-latency dots and TTFB dots
  const ttfbAreaPath: string = $derived.by(() => {
    if (ttfbDots.length < 2 || dots.length < 2) return '';
    if (!ttfbPoints) return '';
    const ttfbMap = new Map(ttfbDots.map((d, i) => {
      const pt = ttfbPoints[i];
      return [pt ? pt.round : -1, d.cy];
    }));
    const sharedDots = dots.filter(d => ttfbMap.has(d.round));
    if (sharedDots.length < 2) return '';
    const topEdge = sharedDots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.cx},${d.cy}`).join(' ');
    const botEdge = [...sharedDots].reverse().map(d => `L${d.cx},${ttfbMap.get(d.round) ?? 0}`).join(' ');
    return `${topEdge} ${botEdge} Z`;
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

  // ── Reduced-motion preference ──────────────────────────────────────────────
  let reducedMotion = $state(false);
  $effect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mql.matches;
    const handler = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  });
</script>

<div class="lane-svg-wrap" onmousemove={handleSvgMouseMove} onmouseleave={handleSvgMouseLeave}>
<svg
  bind:this={svgEl}
  class="lane-svg"
  viewBox="0 0 {VB_W} {VB_H}"
  preserveAspectRatio="none"
  role="img"
  aria-label="Latency scatter chart"
  style:--ep-color={color}
  style:--ribbon-fill={colorRgba06}
  style:--ttfb-stroke="color-mix(in srgb, var(--ep-color) 40%, transparent)"
  style:--ttfb-fill="color-mix(in srgb, var(--ep-color) 4%, transparent)"
  style:--empty-fill={tokens.color.text.emptyFill}
  style:--grid-line={tokens.color.svg.gridLine}
  style:--future-zone={tokens.color.svg.futureZone}
  style:--timeout-stroke={tokens.color.svg.thresholdStroke}
  style:--tooltip-bg={tokens.color.tooltip.bg}
>
  <!-- Grid lines -->
  {#each gridlineYs as gy (gy)}
    <line class="grid-line" x1="0" y1={gy} x2={VB_W} y2={gy} />
  {/each}

  <!-- Future zone (translated with data so it tracks the nowDot) -->
  {#if showFutureZone}
    <rect class="future-zone slide-group" transform="translate({slideX}, 0)" x={futureZoneX} y="0" width={VB_W * 2} height={PLOT_H + PAD_Y_TOP} />
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
    <g class="slide-group" transform="translate({slideX}, 0)">
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
    </g>
  {:else}
    <g class="empty-state">
      <circle
        class="empty-ring"
        cx={VB_W / 2}
        cy={(PLOT_H + PAD_Y_TOP) / 2}
        r="40"
        stroke="var(--ep-color)"
        fill="none"
        opacity="0.06"
        stroke-width="0.5"
      >
        {#if !reducedMotion}
          <animate attributeName="r" values="38;42" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.04;0.08" dur="3s" repeatCount="indefinite" />
        {/if}
      </circle>
      <text
        class="empty-text"
        x={VB_W / 2}
        y={(PLOT_H + PAD_Y_TOP) / 2 + 56}
        text-anchor="middle"
        dominant-baseline="middle"
      >Waiting for data</text>
    </g>
  {/if}

  <!-- TTFB overlay (independent of scatter data) -->
  {#if ttfbAreaPath || ttfbOverlayPath}
    <g class="slide-group" transform="translate({slideX}, 0)">
      {#if ttfbAreaPath}
        <path class="ttfb-area" d={ttfbAreaPath} />
      {/if}
      {#if ttfbOverlayPath}
        <path class="ttfb-overlay" d={ttfbOverlayPath} stroke-dasharray="3 4" />
      {/if}
    </g>
  {/if}

  <!-- Heatmap strip -->
  {#each cellRects as rect (rect.x)}
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
  .lane-svg-wrap { width: 100%; height: 100%; overflow: hidden; }
  .lane-svg { width: 100%; height: 100%; display: block; overflow: hidden; }
  .slide-group { transition: transform 300ms cubic-bezier(0.0, 0.0, 0.2, 1); }
  .grid-line { stroke: var(--grid-line); stroke-width: 0.5; }
  .future-zone { fill: var(--future-zone); }
  .ribbon { fill: var(--ribbon-fill); }
  .median { fill: none; stroke: var(--ep-color); stroke-width: 1.8; stroke-dasharray: 6 5; opacity: 0.45; }
  .trace { fill: none; stroke: var(--ep-color); stroke-width: 1.5; opacity: 0.4; stroke-linecap: round; stroke-linejoin: round; }
  .dot { fill: var(--ep-color); opacity: 0.85; cursor: pointer; transition: r 0.1s ease, opacity 0.1s ease; }
  .dot:hover { r: 5.5; opacity: 1; filter: drop-shadow(0 0 8px var(--ep-color)); }
  .now-dot { fill: var(--ep-color); filter: drop-shadow(0 0 10px var(--ribbon-fill)) drop-shadow(0 0 3px var(--ep-color)); }
  .empty-text { font-family: var(--mono, 'Martian Mono', monospace); font-size: 10px; font-weight: 300; fill: var(--empty-fill); }
  /* Timeout line */
  .timeout-line { stroke: var(--timeout-stroke); stroke-width: 0.8; stroke-dasharray: 6 4; opacity: 0.4; }
  .timeout-label { font-family: 'Martian Mono', monospace; font-size: 5px; font-weight: 400; fill: var(--timeout-stroke); opacity: 0.5; }
  /* TTFB overlay */
  .ttfb-overlay {
    fill: none;
    stroke: var(--ttfb-stroke);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ttfb-area {
    fill: var(--ttfb-fill);
    stroke: none;
  }
  /* Heatmap */
  .heatmap-cell { cursor: default; }
  @media (prefers-reduced-motion: reduce) {
    .slide-group { transition: none; }
  }
</style>
