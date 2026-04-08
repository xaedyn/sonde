<!-- src/lib/components/HeatmapCanvas.svelte -->
<!-- Single-canvas heatmap. Subscribes to measurementStore and endpointStore.    -->
<!-- Builds HeatmapCell[] and drives HeatmapRenderer. Handles hover/click.       -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { HeatmapRenderer } from '$lib/renderers/heatmap-renderer';
  import { latencyToColor } from '$lib/renderers/color-map';
  import { STATUS_COLORS } from '$lib/renderers/color-map';
  import { tokens } from '$lib/tokens';
  import type { HeatmapCell } from '$lib/types';

  const CELL_SIZE = tokens.canvas.heatmapCellSize; // 8
  const LABEL_WIDTH = tokens.spacing.xxxl + tokens.spacing.xl;
  const ROW_GAP = 1;

  // ── DOM refs ────────────────────────────────────────────────────────────────
  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  // ── Renderer ────────────────────────────────────────────────────────────────
  let renderer: HeatmapRenderer;

  // ── State ───────────────────────────────────────────────────────────────────
  let cells: HeatmapCell[] = [];
  let endpointLabels: string[] = [];
  let hoveredCell: HeatmapCell | null = null;

  // ── Build cells from stores ─────────────────────────────────────────────────

  function buildCells(measureState: typeof $measurementStore): void {
    const endpoints = get(endpointStore);
    const newCells: HeatmapCell[] = [];
    const labels: string[] = [];

    for (let row = 0; row < endpoints.length; row++) {
      const ep = endpoints[row];
      labels.push(ep.label || ep.url);
      const epState = measureState.endpoints[ep.id];
      if (!epState) continue;

      for (let i = 0; i < epState.samples.length; i++) {
        const sample = epState.samples[i];
        const col = sample.round;
        const color = sample.status === 'ok'
          ? latencyToColor(sample.latency)
          : sample.status === 'timeout'
            ? STATUS_COLORS.timeout
            : STATUS_COLORS.error;

        newCells.push({
          col,
          row,
          color,
          latency: sample.latency,
          status: sample.status,
          endpointId: ep.id,
          round: sample.round,
        });
      }
    }

    cells = newCells;
    endpointLabels = labels;
    renderer?.draw(cells, endpointLabels);
    drawHoverHighlight();
  }

  // ── Hover highlight ─────────────────────────────────────────────────────────

  function drawHoverHighlight(): void {
    if (!hoveredCell) return;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const cx = colToX(hoveredCell.col);
    const cy = rowToY(hoveredCell.row);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
    ctx.restore();
  }

  // ── Canvas resize ───────────────────────────────────────────────────────────

  function applyDpr(c: HTMLCanvasElement, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  function resizeCanvas(): void {
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;
    applyDpr(canvas, w, h);
    renderer?.resize();
    renderer?.draw(cells, endpointLabels);
  }

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  function canvasPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function colToX(col: number): number {
    return LABEL_WIDTH + col * CELL_SIZE;
  }

  function rowToY(row: number): number {
    return tokens.spacing.sm + row * (CELL_SIZE + ROW_GAP);
  }

  function findCell(x: number, y: number): HeatmapCell | null {
    for (const cell of cells) {
      const cx = colToX(cell.col);
      const cy = rowToY(cell.row);
      if (x >= cx && x < cx + CELL_SIZE && y >= cy && y < cy + CELL_SIZE) {
        return cell;
      }
    }
    return null;
  }

  // ── Pointer events ──────────────────────────────────────────────────────────

  function handlePointerMove(e: PointerEvent): void {
    const { x, y } = canvasPos(e);
    const cell = findCell(x, y);
    if (cell) {
      hoveredCell = cell;
      uiStore.setHover({
        endpointId: cell.endpointId,
        roundId: cell.round,
        x,
        y,
        latency: cell.latency,
        status: cell.status,
        timestamp: 0,
      });
      // Redraw with hover highlight
      renderer?.draw(cells, endpointLabels);
      drawHoverHighlight();
    } else {
      if (hoveredCell !== null) {
        hoveredCell = null;
        renderer?.draw(cells, endpointLabels);
      }
      uiStore.setHover(null);
    }
  }

  function handlePointerLeave(): void {
    if (hoveredCell !== null) {
      hoveredCell = null;
      renderer?.draw(cells, endpointLabels);
    }
    uiStore.setHover(null);
  }

  function handleClick(e: PointerEvent): void {
    const { x, y } = canvasPos(e);
    const cell = findCell(x, y);
    if (cell) {
      uiStore.setSelected({
        endpointId: cell.endpointId,
        roundId: cell.round,
        x,
        y,
        latency: cell.latency,
        status: cell.status,
        timestamp: 0,
      });
    } else {
      uiStore.setSelected(null);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  let unsubscribe: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    renderer = new HeatmapRenderer(canvas);

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(container);
    resizeCanvas();

    unsubscribe = measurementStore.subscribe((state) => {
      buildCells(state);
    });

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('click', handleClick as EventListener);
  });

  onDestroy(() => {
    unsubscribe?.();
    resizeObserver?.disconnect();
    canvas?.removeEventListener('pointermove', handlePointerMove);
    canvas?.removeEventListener('pointerleave', handlePointerLeave);
    canvas?.removeEventListener('click', handleClick as EventListener);
  });
</script>

<div
  bind:this={container}
  class="heatmap-container"
  tabindex="0"
  role="application"
  aria-roledescription="interactive latency heatmap"
  style:background={tokens.color.surface.canvas}
>
  <canvas bind:this={canvas} class="heatmap-canvas" aria-hidden="true"></canvas>
</div>

<style>
  .heatmap-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
  }

  .heatmap-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
</style>
