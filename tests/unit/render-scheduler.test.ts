// NOTE: TimelineRenderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead of a shared Canvas 2D.
// These tests remain to ensure the class still compiles and its coordinate math
// is correct should it be needed for a future alternate view.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderScheduler } from '../../src/lib/renderers/render-scheduler';

// Helper: mark dirty then simulate a frame (mirrors real rAF usage)
function simulateDirtyFrame(scheduler: RenderScheduler, dataMs: number): void {
  scheduler.markDirty();
  scheduler._simulateFrame(dataMs);
}

describe('RenderScheduler', () => {
  let scheduler: RenderScheduler;

  beforeEach(() => {
    scheduler = new RenderScheduler();
  });

  // _simulateFrame mirrors runFrame: effects tick first (unconditionally),
  // then data+interaction only when dirty.

  it('calls data renderer when _simulateFrame is called with dirty', () => {
    const dataRenderer = vi.fn();
    scheduler.registerDataRenderer(dataRenderer);
    simulateDirtyFrame(scheduler, 2);
    expect(dataRenderer).toHaveBeenCalledTimes(1);
  });

  it('does not call data renderer when not dirty', () => {
    const dataRenderer = vi.fn();
    scheduler.registerDataRenderer(dataRenderer);
    scheduler._simulateFrame(2); // no markDirty
    expect(dataRenderer).not.toHaveBeenCalled();
  });

  it('calls multiple data renderers when dirty', () => {
    const dr1 = vi.fn();
    const dr2 = vi.fn();
    scheduler.registerDataRenderer(dr1);
    scheduler.registerDataRenderer(dr2);
    simulateDirtyFrame(scheduler, 2);
    expect(dr1).toHaveBeenCalledTimes(1);
    expect(dr2).toHaveBeenCalledTimes(1);
  });

  it('calls effects renderer unconditionally (even when data exceeds budget)', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);
    // Effects run regardless of dataMs — no budget gate in production runFrame
    scheduler._simulateFrame(10); // 10ms > 8ms budget, but effects still tick
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('calls effects renderer even when not dirty', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);
    scheduler._simulateFrame(2); // no markDirty — effects still tick
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('disables effects after 10 consecutive overloaded dirty frames exceeding 12ms', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // Simulate 10 consecutive overloaded frames (>12ms each, dirty each time)
    for (let i = 0; i < 10; i++) {
      simulateDirtyFrame(scheduler, 15);
    }

    // Effects should now be permanently disabled for subsequent frames
    effectsRenderer.mockClear();
    simulateDirtyFrame(scheduler, 1); // even under budget, effects stay disabled
    expect(effectsRenderer).not.toHaveBeenCalled();
  });

  it('does not disable effects if overload streak is broken before reaching 10', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // 9 overloaded frames then one under budget
    for (let i = 0; i < 9; i++) {
      simulateDirtyFrame(scheduler, 15);
    }
    simulateDirtyFrame(scheduler, 2); // breaks the streak

    // Effects should still work (streak reset)
    effectsRenderer.mockClear();
    simulateDirtyFrame(scheduler, 1);
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('calls interaction renderer when dirty', () => {
    const interactionRenderer = vi.fn();
    scheduler.registerInteractionRenderer(interactionRenderer);
    simulateDirtyFrame(scheduler, 15); // high data cost — interaction still runs
    expect(interactionRenderer).toHaveBeenCalledTimes(1);
  });

  it('does not call interaction renderer when not dirty', () => {
    const interactionRenderer = vi.fn();
    scheduler.registerInteractionRenderer(interactionRenderer);
    scheduler._simulateFrame(15); // no markDirty
    expect(interactionRenderer).not.toHaveBeenCalled();
  });

  it('markDirty does not throw', () => {
    expect(() => scheduler.markDirty()).not.toThrow();
  });

  it('start and stop do not throw in test environment', () => {
    expect(() => scheduler.start()).not.toThrow();
    expect(() => scheduler.stop()).not.toThrow();
  });

  it('renderers are not called before _simulateFrame is invoked', () => {
    const dataRenderer = vi.fn();
    scheduler.registerDataRenderer(dataRenderer);
    expect(dataRenderer).not.toHaveBeenCalled();
  });
});
