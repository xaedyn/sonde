// src/lib/renderers/timeline-renderer.ts
// Canvas 2D scatter plot with logarithmic Y-axis (latency) and linear X-axis (round).
// Pre-renders glow halos cached by color. Handles ok/timeout/error point shapes.

import { tokens } from '$lib/tokens';
import { STATUS_COLORS } from '$lib/renderers/color-map';
import type { ScatterPoint, MeasurementSample, FreezeEvent } from '$lib/types';

// Gridline latencies to mark on the Y-axis
const Y_GRID_MS = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000] as const;

// Log scale helper: maps latency ms → [0, 1] within our display range
const LOG_MIN = Math.log10(1);
const LOG_MAX = Math.log10(10000);

function latencyToNorm(ms: number): number {
  const clamped = Math.max(1, ms);
  return (Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

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

  // Halo cache: color hex → OffscreenCanvas or ImageData pattern
  private readonly haloCache = new Map<string, CanvasPattern | null>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = this.computeLayout();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  draw(pointsByEndpoint: Map<string, ScatterPoint[]>, freezeEvents?: FreezeEvent[]): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.drawBackground();
    this.drawGridlines();

    // Freeze gap markers (before points so they sit behind)
    if (freezeEvents && freezeEvents.length > 0) {
      this.drawFreezeMarkers(freezeEvents);
    }

    // Phase 1: glow halos (additive compositing)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const [, points] of pointsByEndpoint) {
      for (const pt of points) {
        if (pt.status === 'ok') {
          this.drawHalo(pt);
        }
      }
    }
    ctx.restore();

    // Phase 2: point shapes (normal compositing)
    for (const [, points] of pointsByEndpoint) {
      for (const pt of points) {
        this.drawPoint(pt);
      }
    }
  }

  private drawFreezeMarkers(events: FreezeEvent[]): void {
    const { ctx } = this;
    if (!ctx) return;
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

    // Determine total rounds from the latest freeze event round
    const maxRound = Math.max(...events.map(e => e.round), 1);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const ev of events) {
      const norm = ev.round / maxRound;
      const x = paddingLeft + norm * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, paddingTop + plotHeight);
      ctx.stroke();
    }

    ctx.restore();
  }

  resize(): void {
    this.layout = this.computeLayout();
    this.haloCache.clear();
  }

  // ── Static conversion ──────────────────────────────────────────────────────

  static computePoints(
    samples: MeasurementSample[],
    endpointId: string,
    color: string,
  ): ScatterPoint[] {
    return samples.map((s) => ({
      x: s.round,
      y: latencyToNorm(Math.max(1, s.latency)),
      latency: s.latency,
      status: s.status,
      endpointId,
      round: s.round,
      color,
    }));
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private computeLayout(): CanvasLayout {
    const paddingLeft   = tokens.spacing.xxxl + tokens.spacing.xl; // room for Y labels
    const paddingRight  = tokens.spacing.lg;
    const paddingTop    = tokens.spacing.md;
    const paddingBottom = tokens.spacing.xl;
    return {
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      plotWidth:  this.canvas.width  - paddingLeft - paddingRight,
      plotHeight: this.canvas.height - paddingTop  - paddingBottom,
    };
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.fillStyle = tokens.color.surface.canvas;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private drawGridlines(): void {
    const { ctx } = this;
    if (!ctx) return;
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

    ctx.save();
    ctx.strokeStyle = tokens.color.chrome.border;
    ctx.globalAlpha = tokens.canvas.gridLineOpacity;
    ctx.setLineDash(tokens.canvas.gridLineDash as number[]);
    ctx.lineWidth = 1;

    const labelFont = `${tokens.typography.caption.fontSize}px ${tokens.typography.caption.fontFamily}`;
    ctx.font = labelFont;
    ctx.fillStyle = tokens.color.text.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const ms of Y_GRID_MS) {
      const norm = latencyToNorm(ms);
      // Y=0 at top, so invert: high latency → low y
      const y = paddingTop + (1 - norm) * plotHeight;

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(paddingLeft + plotWidth, y);
      ctx.stroke();

      const label = ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`;
      ctx.globalAlpha = tokens.canvas.axisLineOpacity;
      ctx.fillText(label, paddingLeft - tokens.spacing.xs, y);
      ctx.globalAlpha = tokens.canvas.gridLineOpacity;
    }

    ctx.restore();
  }

  private pointToCanvas(pt: ScatterPoint): { cx: number; cy: number } {
    const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;
    const cx = paddingLeft + (pt.x / Math.max(pt.x, 1)) * plotWidth;
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
