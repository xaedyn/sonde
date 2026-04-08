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
  import type { ScatterPoint, SonarPing } from '$lib/types';

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

  // ── Current scatter points keyed by endpointId ─────────────────────────────
  let pointsByEndpoint = new Map<string, ScatterPoint[]>();

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
    effectsRenderer; // no resize method needed
    scheduler?.markDirty();
  }

  function latencyToTier(latency: number, status: string): SonarPing['tier'] {
    if (status === 'timeout') return 'timeout';
    if (latency < 50) return 'fast';
    if (latency < 200) return 'medium';
    return 'slow';
  }

  let pingIdCounter = 0;

  function recomputePoints(measureState: typeof $measurementStore): void {
    const endpoints = get(endpointStore);
    const newMap = new Map<string, ScatterPoint[]>();

    for (const ep of endpoints) {
      const epState = measureState.endpoints[ep.id];
      if (!epState || epState.samples.length === 0) {
        newMap.set(ep.id, []);
        continue;
      }

      const points = TimelineRenderer.computePoints(epState.samples, ep.id, ep.color);
      newMap.set(ep.id, points);

      // Detect new samples → emit sonar ping
      const prevCount = sampleCounts.get(ep.id) ?? 0;
      const newCount = epState.samples.length;
      if (newCount > prevCount) {
        const latestSample = epState.samples[newCount - 1];
        const latestPoint = points[newCount - 1];
        if (latestPoint) {
          const ping: SonarPing = {
            id: `ping-${++pingIdCounter}`,
            x: latestPoint.x,
            y: latestPoint.y,
            color: ep.color,
            tier: latencyToTier(latestSample.latency, latestSample.status),
            startTime: performance.now(),
          };
          effectsRenderer?.addPing(ping);
        }
        sampleCounts.set(ep.id, newCount);
      }
    }

    pointsByEndpoint = newMap;
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

    for (const [, pts] of pointsByEndpoint) {
      for (const pt of pts) {
        const dx = pt.x - x;
        const dy = pt.y - y;
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
      uiStore.setHover({
        endpointId: pt.endpointId,
        roundId: pt.round,
        x: pt.x,
        y: pt.y,
        latency: pt.latency,
        status: pt.status,
        timestamp: 0,
      });
      const ui = get(uiStore);
      interactionRenderer?.drawHover(
        { endpointId: pt.endpointId, roundId: pt.round, x: pt.x, y: pt.y, latency: pt.latency, status: pt.status, timestamp: 0 },
        ui.showCrosshairs,
      );
    } else {
      uiStore.setHover(null);
      interactionRenderer?.clear();
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
    }
  }

  function handleClick(e: PointerEvent): void {
    // Suppress click if we were dragging
    const movedX = Math.abs(e.clientX - dragStartX);
    const movedY = Math.abs(e.clientY - dragStartY);
    if (movedX > 4 || movedY > 4) return;

    const { x, y } = canvasToLogical(interactionCanvas, e);
    const pt = findNearest(x, y);

    if (pt) {
      const target = { endpointId: pt.endpointId, roundId: pt.round, x: pt.x, y: pt.y, latency: pt.latency, status: pt.status, timestamp: 0 };
      uiStore.setSelected(target);
      interactionRenderer?.drawSelection(target);
    } else {
      uiStore.setSelected(null);
      interactionRenderer?.clear();
    }
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
      timelineRenderer.draw(pointsByEndpoint);
    });

    scheduler.registerEffectsRenderer(() => {
      effectsRenderer.draw([], performance.now());
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
    cursor: crosshair;
    touch-action: none;
  }
</style>
