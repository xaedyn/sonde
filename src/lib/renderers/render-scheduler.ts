// src/lib/renderers/render-scheduler.ts
// Frame-budget-aware render scheduler built around requestAnimationFrame.
//
// Renderer tiers:
//   Data renderers        — always run (critical path: timeline dots, heatmap cells)
//   Effects renderers     — skipped when data cost ≥ DATA_BUDGET_MS
//   Interaction renderers — always run (crosshairs, hover state)
//
// Sustained overload protection:
//   After OVERLOAD_STREAK_LIMIT consecutive frames where the combined cost
//   exceeds OVERLOAD_THRESHOLD_MS, effects are disabled entirely for the
//   lifetime of this scheduler instance.

type RendererFn = () => void;

const OVERLOAD_THRESHOLD_MS = 12;  // frames above this count toward the streak
const OVERLOAD_STREAK_LIMIT = 10;  // consecutive frames before effects are disabled
const RECOVERY_STREAK_LIMIT = 60;  // consecutive under-budget frames to re-enable effects

export class RenderScheduler {
  private readonly dataRenderers: RendererFn[] = [];
  private readonly effectsRenderers: RendererFn[] = [];
  private readonly interactionRenderers: RendererFn[] = [];

  private rafHandle: number | null = null;
  private dirty = false;
  private running = false;

  private overloadStreak = 0;
  private effectsDisabled = false;
  private recoveryStreak = 0;

  // ── Registration ─────────────────────────────────────────────────────────

  registerDataRenderer(fn: RendererFn): void {
    this.dataRenderers.push(fn);
  }

  registerEffectsRenderer(fn: RendererFn): void {
    this.effectsRenderers.push(fn);
  }

  registerInteractionRenderer(fn: RendererFn): void {
    this.interactionRenderers.push(fn);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  markDirty(): void {
    this.dirty = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  // ── Internal rAF loop ─────────────────────────────────────────────────────

  private scheduleFrame(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    this.rafHandle = requestAnimationFrame(() => {
      if (!this.running) return;
      this.runFrame();
      this.scheduleFrame();
    });
  }

  private runFrame(): void {
    // Effects always tick (animations run independently of data changes)
    if (!this.effectsDisabled) {
      for (const fn of this.effectsRenderers) fn();
    }

    // Data + interaction only redraw when marked dirty
    if (!this.dirty) return;
    this.dirty = false;

    const dataStart = performance.now();
    for (const fn of this.dataRenderers) fn();
    const dataMs = performance.now() - dataStart;

    this.updateOverloadStreak(dataMs);

    for (const fn of this.interactionRenderers) fn();
  }

  private updateOverloadStreak(dataMs: number): void {
    if (this.effectsDisabled) {
      // Recovery phase: accumulate under-budget frames
      if (dataMs > OVERLOAD_THRESHOLD_MS) {
        this.recoveryStreak = 0; // reset on any overload frame
      } else {
        this.recoveryStreak++;
        if (this.recoveryStreak >= RECOVERY_STREAK_LIMIT) {
          this.effectsDisabled = false;
          this.recoveryStreak = 0;
          this.overloadStreak = 0;
        }
      }
      return;
    }

    if (dataMs > OVERLOAD_THRESHOLD_MS) {
      this.overloadStreak++;
      if (this.overloadStreak >= OVERLOAD_STREAK_LIMIT) {
        this.effectsDisabled = true;
      }
    } else {
      this.overloadStreak = 0;
    }
  }

  // ── Test hook ─────────────────────────────────────────────────────────────
  // Simulates a single frame with the given data renderer cost in ms.
  // Allows unit tests to exercise scheduler logic without real rAF timing.

  _simulateFrame(dataMs: number): void {
    // Mirror runFrame execution order exactly:
    // 1. Effects tick unconditionally (animations run independently of data changes)
    if (!this.effectsDisabled) {
      for (const fn of this.effectsRenderers) fn();
    }

    // 2. Data + interaction only when dirty
    if (!this.dirty) return;
    this.dirty = false;

    for (const fn of this.dataRenderers) fn();
    this.updateOverloadStreak(dataMs);

    for (const fn of this.interactionRenderers) fn();
  }
}
