// src/lib/renderers/heatmap-renderer.ts
// NOTE: This renderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead.
// This file is kept for potential future use.
//
// Canvas 2D color-encoded temporal heatmap.
// 8x8px cells with 1px row gap. Renders timeout/error pattern overlays.
// Viewport culling skips cells outside the visible clip region.

import { tokens } from '$lib/tokens';
import type { HeatmapCell } from '$lib/types';

const CELL_SIZE = tokens.canvas.heatmapCellSize; // 8px
const ROW_GAP   = 1;  // 1px gap between endpoint rows
const LABEL_WIDTH = tokens.spacing.xxxl + tokens.spacing.xl; // matches timeline padding

export class HeatmapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  // Pre-rendered pattern canvases (reused across frames)
  private timeoutPattern: CanvasPattern | null = null;
  private errorPattern:   CanvasPattern | null = null;
  private patternsBuilt = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  draw(cells: HeatmapCell[], endpointLabels: string[]): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.patternsBuilt) {
      this.buildPatterns();
      this.patternsBuilt = true;
    }

    this.drawBackground();

    if (cells.length === 0) return;

    this.drawLabels(endpointLabels);
    this.drawCells(cells);
  }

  resize(): void {
    // Patterns depend on cell size (fixed), but reset on resize in case DPR changed
    this.patternsBuilt = false;
    this.timeoutPattern = null;
    this.errorPattern = null;
  }

  // ── Background ─────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.fillStyle = tokens.color.surface.mid;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  private drawLabels(labels: string[]): void {
    const { ctx } = this;
    if (!ctx) return;
    ctx.save();
    ctx.font = `${tokens.typography.labelSize}px ${tokens.typography.mono.fontFamily}`;
    ctx.fillStyle = tokens.color.text.secondary;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < labels.length; i++) {
      const y = this.rowToY(i) + CELL_SIZE / 2;
      ctx.fillText(labels[i], LABEL_WIDTH - tokens.spacing.xs, y);
    }
    ctx.restore();
  }

  // ── Cells ──────────────────────────────────────────────────────────────────

  private drawCells(cells: HeatmapCell[]): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    // Use CSS logical dimensions (not physical pixel dimensions) because
    // colToX/rowToY return logical coordinates. canvas.width is scaled by DPR.
    const viewLeft   = 0;
    const viewRight  = parseFloat(canvas.style.width) || canvas.width;
    const viewTop    = 0;
    const viewBottom = parseFloat(canvas.style.height) || canvas.height;

    for (const cell of cells) {
      const x = this.colToX(cell.col);
      const y = this.rowToY(cell.row);

      // Viewport culling
      if (x + CELL_SIZE < viewLeft  || x > viewRight)  continue;
      if (y + CELL_SIZE < viewTop   || y > viewBottom)  continue;

      // Base fill
      ctx.fillStyle = cell.color;
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      // Pattern overlay for special statuses
      if (cell.status === 'timeout' && this.timeoutPattern) {
        ctx.fillStyle = this.timeoutPattern;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      } else if (cell.status === 'error' && this.errorPattern) {
        ctx.fillStyle = this.errorPattern;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  private colToX(col: number): number {
    return LABEL_WIDTH + col * CELL_SIZE;
  }

  private rowToY(row: number): number {
    return tokens.spacing.sm + row * (CELL_SIZE + ROW_GAP);
  }

  // ── Pattern builders ───────────────────────────────────────────────────────

  private buildPatterns(): void {
    if (!this.ctx) return;
    this.timeoutPattern = this.buildDiagonalPattern();
    this.errorPattern   = this.buildCrossPattern();
  }

  /** Diagonal lines overlay — used for timeout cells */
  private buildDiagonalPattern(): CanvasPattern | null {
    try {
      const size = CELL_SIZE;
      const offscreen = document.createElement('canvas');
      offscreen.width  = size;
      offscreen.height = size;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return null;

      // eslint-disable-next-line local/no-raw-visual-values -- retired renderer, util tokens removed
      offCtx.strokeStyle = 'rgba(0,0,0,0.4)';
      offCtx.lineWidth = 1;
      // Two diagonal lines across the cell
      offCtx.beginPath();
      offCtx.moveTo(0, 0);
      offCtx.lineTo(size, size);
      offCtx.moveTo(size / 2, 0);
      offCtx.lineTo(size, size / 2);
      offCtx.stroke();

      return this.ctx?.createPattern(offscreen, 'repeat') ?? null;
    } catch {
      return null;
    }
  }

  /** Cross (+) overlay — used for error cells */
  private buildCrossPattern(): CanvasPattern | null {
    try {
      const size = CELL_SIZE;
      const offscreen = document.createElement('canvas');
      offscreen.width  = size;
      offscreen.height = size;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return null;

      // eslint-disable-next-line local/no-raw-visual-values -- retired renderer, util tokens removed
      offCtx.strokeStyle = 'rgba(0,0,0,0.4)';
      offCtx.lineWidth = 1;
      const mid = size / 2;
      offCtx.beginPath();
      offCtx.moveTo(mid, 0);
      offCtx.lineTo(mid, size);
      offCtx.moveTo(0, mid);
      offCtx.lineTo(size, mid);
      offCtx.stroke();

      return this.ctx?.createPattern(offscreen, 'repeat') ?? null;
    } catch {
      return null;
    }
  }
}
