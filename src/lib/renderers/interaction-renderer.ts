// src/lib/renderers/interaction-renderer.ts
// NOTE: This renderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead.
// This file is kept for potential future use.
//
// Hover and selection highlight rendering on the interaction canvas layer.
// Draws a ring around the hovered/selected point, and optional crosshairs.

import { tokens } from '$lib/tokens';
import type { HoverTarget } from '$lib/types';

const HOVER_RING_RADIUS = tokens.canvas.pointRadiusHover + 3;
const SELECTION_RING_RADIUS = tokens.canvas.pointRadiusHover + 5;
const RING_LINE_WIDTH = tokens.canvas.pointOutlineWidth;

export class InteractionRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Clear the interaction overlay. */
  clear(): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  /**
   * Draw a translucent ring around the hovered point.
   * Optionally draw crosshairs spanning the full canvas.
   */
  drawHover(target: HoverTarget, showCrosshairs = false): void {
    const { ctx, canvas } = this;
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // Hover ring
    ctx.save();
    // eslint-disable-next-line local/no-raw-visual-values -- retired renderer, util tokens removed
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = RING_LINE_WIDTH;
    ctx.beginPath();
    ctx.arc(target.x, target.y, HOVER_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (showCrosshairs) {
      this.drawCrosshairs(target.x, target.y);
    }
  }

  /**
   * Draw a persistent accent-colored ring around a selected point.
   */
  drawSelection(target: HoverTarget): void {
    const { ctx, canvas } = this;
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    ctx.save();
    ctx.strokeStyle = tokens.color.chrome.accent;
    ctx.lineWidth = RING_LINE_WIDTH + 0.5;
    ctx.beginPath();
    ctx.arc(target.x, target.y, SELECTION_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private drawCrosshairs(x: number, y: number): void {
    const { ctx, canvas } = this;
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = tokens.color.chrome.accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = tokens.canvas.sweepLineOpacity;
    ctx.setLineDash([tokens.spacing.xs, tokens.spacing.sm]);

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.clientWidth, y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.clientHeight);
    ctx.stroke();

    ctx.restore();
  }
}
