// src/lib/renderers/timeline-renderer.ts
// NOTE: This renderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead.
// This file is kept for potential future use.
//
// Canvas 2D scatter plot with dynamic Y-axis, ribbon bands, and X-axis ticks.
// Accepts a single FrameData argument from the timeline-data-pipeline.

import { tokens } from '$lib/tokens';
import { STATUS_COLORS } from '$lib/renderers/color-map';
import type { ScatterPoint, FreezeEvent, FrameData, YRange, RibbonData, XTick } from '$lib/types';

interface CanvasLayout {
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  plotWidth: number;
  plotHeight: number;
}

export class TimelineRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private layout: CanvasLayout;
  private maxRound = 1;

  // Halo cache: color hex → OffscreenCanvas or ImageData pattern
  private readonly haloCache = new Map<string, CanvasPattern | null>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = this.computeLayout();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  draw(frameData: FrameData): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    this.maxRound = Math.max(frameData.maxRound, 1);
    this.layout = this.computeLayout();

    this.drawBackground();
    this.drawGridlines(frameData.yRange);

    // Freeze gap markers (before points so they sit behind)
    if (frameData.freezeEvents.length > 0) {
      this.drawFreezeMarkers(frameData.freezeEvents);
    }

    // Ribbons (behind points)
    this.drawRibbons(frameData.ribbonsByEndpoint, frameData.pointsByEndpoint);

    // Phase 1: glow halos (additive compositing)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const [, points] of frameData.pointsByEndpoint) {
      for (const pt of points) {
        if (pt.status === 'ok') {
          this.drawHalo(pt);
        }
      }
    }
    ctx.restore();

    // Phase 2: point shapes (normal compositing)
    for (const [, points] of frameData.pointsByEndpoint) {
      for (const pt of points) {
        this.drawPoint(pt);
      }
    }

    // X-axis on top
    this.drawXAxis(frameData.xTicks);
  }

  resize(): void {
    this.layout = this.computeLayout();
    this.haloCache.clear();
  }

  /** Convert a ScatterPoint to canvas pixel coordinates. Call after draw() which refreshes layout. */
  toCanvasCoords(pt: ScatterPoint): { cx: number; cy: number } {
    return this.pointToCanvas(pt);
  }

  /** Update maxRound externally (e.g. during recomputePoints, before draw). */
  setMaxRound(value: number): void {
    this.maxRound = Math.max(value, 1);
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private computeLayout(): CanvasLayout {
    const paddingLeft   = tokens.spacing.xxxl + tokens.spacing.xl; // room for Y labels
    const paddingRight  = tokens.spacing.lg;
    const paddingTop    = tokens.spacing.md;
    const paddingBottom = tokens.canvas.xAxis.paddingBottom;
    return {
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      plotWidth:  this.canvas.clientWidth  - paddingLeft - paddingRight,
      plotHeight: this.canvas.clientHeight - paddingTop  - paddingBottom,
    };
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.fillStyle = tokens.color.surface.mid;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  private drawGridlines(yRange: YRange): void {
    const { ctx } = this;
    if (!ctx) return;
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

    ctx.save();
    ctx.strokeStyle = tokens.color.chrome.border;
    ctx.globalAlpha = tokens.canvas.gridLineOpacity;
    ctx.setLineDash(tokens.canvas.gridLineDash as unknown as number[]);
    ctx.lineWidth = 1;

    const labelFont = `${tokens.typography.labelSize}px ${tokens.typography.mono.fontFamily}`;
    ctx.font = labelFont;
    ctx.fillStyle = tokens.color.text.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const gridline of yRange.gridlines) {
      const y = paddingTop + (1 - gridline.normalizedY) * plotHeight;

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(paddingLeft + plotWidth, y);
      ctx.stroke();

      ctx.globalAlpha = tokens.canvas.axisLineOpacity;
      ctx.fillText(gridline.label, paddingLeft - tokens.spacing.xs, y);
      ctx.globalAlpha = tokens.canvas.gridLineOpacity;
    }

    // Scale indicator at bottom-left
    ctx.globalAlpha = tokens.canvas.axisLineOpacity;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(yRange.isLog ? 'log' : 'linear', paddingLeft, paddingTop + plotHeight + tokens.spacing.xs);

    ctx.restore();
  }

  private drawFreezeMarkers(events: readonly FreezeEvent[]): void {
    const { ctx } = this;
    if (!ctx) return;
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

    ctx.save();
    // eslint-disable-next-line local/no-raw-visual-values -- retired renderer, no token equivalent
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const ev of events) {
      const norm = ev.round / this.maxRound;
      const x = paddingLeft + norm * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, paddingTop + plotHeight);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawRibbons(
    ribbonsByEndpoint: ReadonlyMap<string, RibbonData>,
    pointsByEndpoint: ReadonlyMap<string, readonly ScatterPoint[]>,
  ): void {
    const { ctx } = this;
    if (!ctx) return;
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

    for (const [endpointId, ribbon] of ribbonsByEndpoint) {
      // Get color from the first point of this endpoint
      const points = pointsByEndpoint.get(endpointId);
      const color = points?.[0]?.color ?? tokens.color.endpoint[0];

      // P25-P75 filled band
      if (ribbon.p25Path.length > 0 && ribbon.p75Path.length > 0) {
        ctx.save();
        ctx.globalAlpha = tokens.canvas.ribbon.fillOpacity;
        ctx.fillStyle = color;
        ctx.beginPath();

        // Forward along P75 (top edge)
        for (let i = 0; i < ribbon.p75Path.length; i++) {
          const pt = ribbon.p75Path[i];
          if (!pt) continue;
          const x = paddingLeft + (pt[0] / this.maxRound) * plotWidth;
          const y = paddingTop + (1 - pt[1]) * plotHeight;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // Backward along P25 (bottom edge)
        for (let i = ribbon.p25Path.length - 1; i >= 0; i--) {
          const pt = ribbon.p25Path[i];
          if (!pt) continue;
          const x = paddingLeft + (pt[0] / this.maxRound) * plotWidth;
          const y = paddingTop + (1 - pt[1]) * plotHeight;
          ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // P50 median dashed line
      if (ribbon.p50Path.length > 0) {
        ctx.save();
        ctx.globalAlpha = tokens.canvas.ribbon.medianOpacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = tokens.canvas.ribbon.medianLineWidth;
        ctx.setLineDash(tokens.canvas.ribbon.medianLineDash as unknown as number[]);
        ctx.beginPath();

        for (let i = 0; i < ribbon.p50Path.length; i++) {
          const pt = ribbon.p50Path[i];
          if (!pt) continue;
          const x = paddingLeft + (pt[0] / this.maxRound) * plotWidth;
          const y = paddingTop + (1 - pt[1]) * plotHeight;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawXAxis(xTicks: readonly XTick[]): void {
    const { ctx } = this;
    if (!ctx) return;
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

    const axisY = paddingTop + plotHeight;

    ctx.save();

    // 1px axis line
    ctx.strokeStyle = tokens.color.chrome.border;
    ctx.globalAlpha = tokens.canvas.axisLineOpacity;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, axisY);
    ctx.lineTo(paddingLeft + plotWidth, axisY);
    ctx.stroke();

    // Tick labels
    const labelFont = `${tokens.typography.labelSize}px ${tokens.typography.mono.fontFamily}`;
    ctx.font = labelFont;
    ctx.fillStyle = tokens.color.text.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const tick of xTicks) {
      const x = paddingLeft + tick.normalizedX * plotWidth;
      ctx.fillText(tick.label, x, axisY + tokens.canvas.xAxis.labelOffsetY);
    }

    // "Round" axis label centered below (only when plotWidth >= 200)
    if (plotWidth >= 200) {
      ctx.fillText('Round', paddingLeft + plotWidth / 2, axisY + tokens.canvas.xAxis.labelOffsetY + tokens.typography.labelSize + 2);
    }

    ctx.restore();
  }

  private pointToCanvas(pt: ScatterPoint): { cx: number; cy: number } {
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;
    const cx = paddingLeft + (pt.x / this.maxRound) * plotWidth;
    const cy = paddingTop + (1 - pt.y) * plotHeight;
    return { cx, cy };
  }

  private drawHalo(pt: ScatterPoint): void {
    const { ctx } = this;
    if (!ctx) return;
    const { cx, cy } = this.pointToCanvas(pt);
    const r = tokens.canvas.haloRadius;

    // Check cache for a gradient created from this color
    let cachedGrad = this.haloCache.get(pt.color);
    // CanvasPattern is stored as null-sentinel when it failed; undefined = uncached
    if (cachedGrad === undefined) {
      // Build offscreen gradient
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = r * 2;
        offscreen.height = r * 2;
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          const grad = offCtx.createRadialGradient(r, r, 0, r, r, r);
          grad.addColorStop(0, pt.color);
          grad.addColorStop(1, 'transparent');
          offCtx.fillStyle = grad;
          offCtx.globalAlpha = tokens.canvas.haloOpacity;
          offCtx.fillRect(0, 0, r * 2, r * 2);
          cachedGrad = ctx.createPattern(offscreen, 'no-repeat');
          this.haloCache.set(pt.color, cachedGrad);
        } else {
          this.haloCache.set(pt.color, null);
        }
      } catch {
        this.haloCache.set(pt.color, null);
        cachedGrad = null;
      }
    }

    if (cachedGrad) {
      ctx.save();
      ctx.translate(cx - r, cy - r);
      ctx.fillStyle = cachedGrad;
      ctx.fillRect(0, 0, r * 2, r * 2);
      ctx.restore();
    } else {
      // Fallback: direct radial gradient when offscreen canvas unavailable (e.g. jsdom)
      ctx.save();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, pt.color);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = tokens.canvas.haloOpacity;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPoint(pt: ScatterPoint): void {
    const { cx, cy } = this.pointToCanvas(pt);

    switch (pt.status) {
      case 'timeout':
        this.drawTimeoutPoint(cx, cy);
        break;
      case 'error':
        this.drawErrorPoint(cx, cy);
        break;
      default:
        this.drawOkPoint(cx, cy, pt.color);
    }
  }

  private drawOkPoint(cx: number, cy: number, color: string): void {
    const { ctx } = this;
    if (!ctx) return;
    const r = tokens.canvas.pointRadius;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawTimeoutPoint(cx: number, cy: number): void {
    const { ctx } = this;
    if (!ctx) return;
    const r = tokens.canvas.pointRadius;
    const color = STATUS_COLORS.timeout;

    // Hollow circle
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = tokens.canvas.pointOutlineWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // X mark
    const d = r * 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
    ctx.stroke();
    ctx.restore();
  }

  private drawErrorPoint(cx: number, cy: number): void {
    const { ctx } = this;
    if (!ctx) return;
    const r = tokens.canvas.pointRadius;
    const color = STATUS_COLORS.error;

    // Triangle warning
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx - r, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
