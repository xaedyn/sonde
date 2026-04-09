<!-- src/lib/components/TimelineCanvas.svelte -->
<!-- Three-layer canvas: data, effects, interaction. Subscribes to measurementStore  -->
<!-- and drives TimelineRenderer, EffectsRenderer, InteractionRenderer + RenderScheduler. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { TimelineRenderer } from '$lib/renderers/timeline-renderer';
  import { EffectsRenderer } from '$lib/renderers/effects-renderer';
  import { InteractionRenderer } from '$lib/renderers/interaction-renderer';
  import { RenderScheduler } from '$lib/renderers/render-scheduler';
  import { tokens } from '$lib/tokens';
  import { prepareFrame, computeXTicks } from '$lib/renderers/timeline-data-pipeline';
  import type { FrameData, MeasurementState, ScatterPoint, SonarPing } from '$lib/types';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  let container: HTMLDivElement;
  let dataCanvas: HTMLCanvasElement;
  let effectsCanvas: HTMLCanvasElement;
  let interactionCanvas: HTMLCanvasElement;

  // ── Renderer instances ──────────────────────────────────────────────────────
  let timelineRenderer: TimelineRenderer;
  let effectsRenderer: EffectsRenderer;
  let interactionRenderer: InteractionRenderer;
  let scheduler: RenderScheduler;

  // ── Tooltip state ───────────────────────────────────────────────────────────
  let tooltipVisible = false;
  let tooltipX = 0;
  let tooltipY = 0;
  let tooltipText = '';
  let tooltipColor = '';

  function showTooltip(pt: ScatterPoint, cx: number, cy: number): void {
    const endpoints = get(endpointStore);
    const ep = endpoints.find(e => e.id === pt.endpointId);
    const label = ep?.label || ep?.url || pt.endpointId;
    const latencyStr = pt.status === 'timeout' ? 'Timeout'
      : pt.status === 'error' ? 'Error'
      : pt.latency >= 1000 ? `${(pt.latency / 1000).toFixed(2)}s`
      : `${Math.round(pt.latency)}ms`;
    tooltipText = `${label} · Round ${pt.round} · ${latencyStr}`;
    tooltipColor = pt.color;
    tooltipX = cx;
    tooltipY = cy;
    tooltipVisible = true;
  }

  function hideTooltip(): void {
    tooltipVisible = false;
  }

  // ── FrameData state ─────────────────────────────────────────────────────────
  let currentFrameData: FrameData = {
    pointsByEndpoint: new Map(),
    ribbonsByEndpoint: new Map(),
    yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
    xTicks: [],
    maxRound: 0,
    freezeEvents: [],
    hasData: false,
  };
  let hasData = false;

  // Track known sample counts to detect new samples for sonar pings
  const sampleCounts = new Map<string, number>();

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function applyDpr(canvas: HTMLCanvasElement, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  function resizeCanvases(): void {
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    applyDpr(dataCanvas, w, h);
    applyDpr(effectsCanvas, w, h);
    applyDpr(interactionCanvas, w, h);

    timelineRenderer?.resize();

    // Recompute X ticks with actual canvas width
    if (currentFrameData.hasData) {
      const plotPaddingLeft = tokens.spacing.xxxl + tokens.spacing.xl;
      const plotPaddingRight = tokens.spacing.lg;
      const plotWidth = Math.max(w - plotPaddingLeft - plotPaddingRight, 100);
      currentFrameData = {
        ...currentFrameData,
        xTicks: computeXTicks(currentFrameData.maxRound, plotWidth),
      };
    }

    scheduler?.markDirty();
  }

  function latencyToTier(latency: number, status: string): SonarPing['tier'] {
    if (status === 'timeout') return 'timeout';
    if (latency < 50) return 'fast';
    if (latency < 200) return 'medium';
    return 'slow';
  }

  let pingIdCounter = 0;

  function recomputePoints(measureState: MeasurementState): void {
    const endpoints = get(endpointStore);

    // Compute actual plot width for X ticks
    const cssWidth = container?.getBoundingClientRect().width ?? 800;
    const plotPaddingLeft = tokens.spacing.xxxl + tokens.spacing.xl;
    const plotPaddingRight = tokens.spacing.lg;
    const plotWidth = Math.max(cssWidth - plotPaddingLeft - plotPaddingRight, 100);

    // Build FrameData via pipeline
    const frameData = prepareFrame(endpoints, measureState);

    // Recompute X ticks with actual plot width
    const xTicks = computeXTicks(frameData.maxRound, plotWidth);
    currentFrameData = { ...frameData, xTicks };

    hasData = frameData.hasData;

    // Update maxRound on renderer for toCanvasCoords to work (ping creation)
    timelineRenderer?.setMaxRound(frameData.maxRound);

    // Detect new samples → emit sonar pings
    for (const ep of endpoints) {
      const epState = measureState.endpoints[ep.id];
      if (!epState || epState.samples.length === 0) continue;

      const prevCount = sampleCounts.get(ep.id) ?? 0;
      const newCount = epState.samples.length;

      if (newCount > prevCount) {
        const latestSample = epState.samples[newCount - 1];
        const points = currentFrameData.pointsByEndpoint.get(ep.id);
        const latestPoint = points?.[newCount - 1];
        if (latestSample && latestPoint && timelineRenderer) {
          const { cx, cy } = timelineRenderer.toCanvasCoords(latestPoint);
          const ping: SonarPing = {
            id: `ping-${++pingIdCounter}`,
            x: cx,
            y: cy,
            color: ep.color,
            tier: latencyToTier(latestSample.latency, latestSample.status),
            startTime: performance.now(),
          };
          effectsRenderer?.addPing(ping);
        }
        sampleCounts.set(ep.id, newCount);
      }
    }

    scheduler?.markDirty();
  }

  // ── Zoom / Pan state ────────────────────────────────────────────────────────
  let zoomLevel = 1;
  let panOffsetX = 0;
  let panOffsetY = 0;

  // Drag tracking
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

  // Touch tracking
  let lastPinchDist = 0;

  function clampZoom(z: number): number {
    return Math.max(0.1, Math.min(10, z));
  }

  function resetZoomPan(): void {
    zoomLevel = 1;
    panOffsetX = 0;
    panOffsetY = 0;
    scheduler?.markDirty();
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const factor = Math.exp(delta * 2);

    if (e.shiftKey) {
      // Shift+wheel: Y-axis only
      panOffsetY += e.deltaY * 0.5;
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+wheel: X-axis only
      panOffsetX -= e.deltaX * 0.5;
      const newZoom = clampZoom(zoomLevel * factor);
      const scaleChange = newZoom / zoomLevel;
      panOffsetX = panOffsetX * scaleChange;
      zoomLevel = newZoom;
    } else {
      // Default: zoom both axes
      const newZoom = clampZoom(zoomLevel * factor);
      zoomLevel = newZoom;
    }
    scheduler?.markDirty();
  }

  // ── Pointer event helpers ───────────────────────────────────────────────────

  function canvasToLogical(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function findNearest(x: number, y: number): ScatterPoint | null {
    let nearest: ScatterPoint | null = null;
    let minDist = 20; // px hit radius

    for (const [, pts] of currentFrameData.pointsByEndpoint) {
      for (const pt of pts) {
        if (!timelineRenderer) break;
        const { cx, cy } = timelineRenderer.toCanvasCoords(pt);
        const dx = cx - x;
        const dy = cy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) {
          minDist = d;
          nearest = pt;
        }
      }
    }
    return nearest;
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panOffsetX;
    dragStartPanY = panOffsetY;
    interactionCanvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (isDragging) {
      panOffsetX = dragStartPanX + (e.clientX - dragStartX);
      panOffsetY = dragStartPanY + (e.clientY - dragStartY);
      scheduler?.markDirty();
      return;
    }

    const { x, y } = canvasToLogical(interactionCanvas, e);
    const pt = findNearest(x, y);

    if (pt) {
      const { cx, cy } = timelineRenderer.toCanvasCoords(pt);
      const hoverTarget = { endpointId: pt.endpointId, roundId: pt.round, x: cx, y: cy, latency: pt.latency, status: pt.status, timestamp: 0 };
      uiStore.setHover(hoverTarget);
      interactionRenderer?.drawHover(hoverTarget, false);
      showTooltip(pt, cx, cy);
    } else {
      uiStore.setHover(null);
      interactionRenderer?.clear();
      hideTooltip();
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (isDragging) {
      isDragging = false;
      interactionCanvas.releasePointerCapture(e.pointerId);
    }
  }

  function handlePointerLeave(): void {
    if (!isDragging) {
      uiStore.setHover(null);
      interactionRenderer?.clear();
      hideTooltip();
    }
  }

  function handleClick(e: PointerEvent): void {
    // Suppress click if we were dragging
    const movedX = Math.abs(e.clientX - dragStartX);
    const movedY = Math.abs(e.clientY - dragStartY);
    if (movedX > 4 || movedY > 4) return;

    // Click clears any selection
    uiStore.setSelected(null);
    interactionRenderer?.clear();
  }

  function handleDblClick(): void {
    resetZoomPan();
    uiStore.setSelected(null);
    uiStore.setHover(null);
    interactionRenderer?.clear();
  }

  // ── Touch handling ──────────────────────────────────────────────────────────

  function getTouchDist(t: TouchList): number {
    if (t.length < 2) return 0;
    const dx = (t[0]?.clientX ?? 0) - (t[1]?.clientX ?? 0);
    const dy = (t[0]?.clientY ?? 0) - (t[1]?.clientY ?? 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      lastPinchDist = getTouchDist(e.touches);
    }
  }

  function handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        zoomLevel = clampZoom(zoomLevel * factor);
        scheduler?.markDirty();
      }
      lastPinchDist = dist;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  let unsubscribeMeasurement: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    timelineRenderer = new TimelineRenderer(dataCanvas);
    effectsRenderer = new EffectsRenderer(effectsCanvas);
    interactionRenderer = new InteractionRenderer(interactionCanvas);
    scheduler = new RenderScheduler();

    scheduler.registerDataRenderer(() => {
      timelineRenderer.draw(currentFrameData);
    });

    scheduler.registerEffectsRenderer(() => {
      if (hasData) {
        effectsRenderer.draw([], performance.now());
      } else {
        effectsRenderer.drawEmptyState(performance.now());
      }
    });

    scheduler.registerInteractionRenderer(() => {
      const ui = get(uiStore);
      if (ui.selectedTarget) {
        interactionRenderer.drawSelection(ui.selectedTarget);
      } else if (ui.hoverTarget) {
        interactionRenderer.drawHover(ui.hoverTarget, ui.showCrosshairs);
      }
      // If neither, leave as-is (cleared on pointer leave)
    });

    resizeObserver = new ResizeObserver(() => resizeCanvases());
    resizeObserver.observe(container);
    resizeCanvases();

    // Subscribe to measurement store
    unsubscribeMeasurement = measurementStore.subscribe((state) => {
      recomputePoints(state);
    });

    // Pointer events on the top (interaction) canvas
    interactionCanvas.addEventListener('pointerdown', handlePointerDown);
    interactionCanvas.addEventListener('pointermove', handlePointerMove);
    interactionCanvas.addEventListener('pointerup', handlePointerUp);
    interactionCanvas.addEventListener('pointerleave', handlePointerLeave);
    interactionCanvas.addEventListener('click', handleClick as EventListener);
    interactionCanvas.addEventListener('dblclick', handleDblClick);
    interactionCanvas.addEventListener('wheel', handleWheel, { passive: false });
    interactionCanvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    interactionCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    scheduler.start();
  });

  onDestroy(() => {
    scheduler?.stop();
    resizeObserver?.disconnect();
    unsubscribeMeasurement?.();
    interactionCanvas?.removeEventListener('pointerdown', handlePointerDown);
    interactionCanvas?.removeEventListener('pointermove', handlePointerMove);
    interactionCanvas?.removeEventListener('pointerup', handlePointerUp);
    interactionCanvas?.removeEventListener('pointerleave', handlePointerLeave);
    interactionCanvas?.removeEventListener('click', handleClick as EventListener);
    interactionCanvas?.removeEventListener('dblclick', handleDblClick);
    interactionCanvas?.removeEventListener('wheel', handleWheel);
    interactionCanvas?.removeEventListener('touchstart', handleTouchStart);
    interactionCanvas?.removeEventListener('touchmove', handleTouchMove);
  });
</script>

<div
  bind:this={container}
  class="timeline-container"
  tabindex="0"
  role="application"
  aria-roledescription="interactive latency chart"
  style:background={tokens.color.surface.canvas}
>
  <canvas bind:this={dataCanvas} class="canvas-layer canvas-data" aria-hidden="true"></canvas>
  <canvas bind:this={effectsCanvas} class="canvas-layer canvas-effects" aria-hidden="true"></canvas>
  <canvas bind:this={interactionCanvas} class="canvas-layer canvas-interaction" aria-hidden="true"></canvas>

  {#if tooltipVisible}
    <div
      class="tooltip"
      style:left="{tooltipX}px"
      style:top="{tooltipY - 32}px"
      style:border-left-color={tooltipColor}
    >
      {tooltipText}
    </div>
  {/if}

  <div class="ribbon-legend" aria-hidden="true">
    <span class="ribbon-legend-band"></span>
    <span class="ribbon-legend-label">P25–P75 variance</span>
    <span class="ribbon-legend-line"></span>
    <span class="ribbon-legend-label">P50 median</span>
  </div>
</div>

<style>
  .timeline-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
  }

  .canvas-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .canvas-data {
    z-index: 1;
  }

  .canvas-effects {
    z-index: 2;
  }

  .canvas-interaction {
    z-index: 3;
    cursor: default;
    touch-action: none;
  }

  .tooltip {
    position: absolute;
    z-index: 10;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 4px;
    background: rgba(20, 24, 33, 0.92);
    border-left: 3px solid;
    color: rgba(255, 255, 255, 0.9);
    font-size: 11px;
    font-family: 'Inter', system-ui, sans-serif;
    white-space: nowrap;
    pointer-events: none;
    line-height: 1.4;
  }

  .ribbon-legend {
    position: absolute;
    bottom: 6px;
    right: 12px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-family: 'Inter', system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.4);
    pointer-events: none;
  }

  .ribbon-legend-band {
    display: inline-block;
    width: 16px;
    height: 8px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
  }

  .ribbon-legend-line {
    display: inline-block;
    width: 16px;
    height: 0;
    border-top: 1.5px dashed rgba(255, 255, 255, 0.45);
    margin-left: 6px;
  }

  .ribbon-legend-label {
    opacity: 0.7;
  }
</style>
