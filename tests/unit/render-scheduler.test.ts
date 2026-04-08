import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderScheduler } from '../../src/lib/renderers/render-scheduler';

describe('RenderScheduler', () => {
  let scheduler: RenderScheduler;

  beforeEach(() => {
    scheduler = new RenderScheduler();
  });

  it('calls data renderer when _simulateFrame is called', () => {
    const dataRenderer = vi.fn();
    scheduler.registerDataRenderer(dataRenderer);
    scheduler._simulateFrame(2);
    expect(dataRenderer).toHaveBeenCalledTimes(1);
  });

  it('calls multiple data renderers', () => {
    const dr1 = vi.fn();
    const dr2 = vi.fn();
    scheduler.registerDataRenderer(dr1);
    scheduler.registerDataRenderer(dr2);
    scheduler._simulateFrame(2);
    expect(dr1).toHaveBeenCalledTimes(1);
    expect(dr2).toHaveBeenCalledTimes(1);
  });

  it('calls effects renderer when data is under 8ms budget', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);
    scheduler._simulateFrame(4); // 4ms < 8ms budget
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('skips effects renderer when data exceeds 8ms budget', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);
    scheduler._simulateFrame(10); // 10ms > 8ms budget
    expect(effectsRenderer).not.toHaveBeenCalled();
  });

  it('skips effects at exactly the budget boundary (8ms)', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);
    scheduler._simulateFrame(8); // 8ms == budget, should skip (exceeds means >= boundary)
    // At exactly budget, effects are skipped to protect headroom
    expect(effectsRenderer).not.toHaveBeenCalled();
  });

  it('still calls data renderer when effects are skipped over budget', () => {
    const dataRenderer = vi.fn();
    const effectsRenderer = vi.fn();
    scheduler.registerDataRenderer(dataRenderer);
    scheduler.registerEffectsRenderer(effectsRenderer);
    scheduler._simulateFrame(10);
    expect(dataRenderer).toHaveBeenCalledTimes(1);
    expect(effectsRenderer).not.toHaveBeenCalled();
  });

  it('disables effects after 10 consecutive frames exceeding 12ms', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // Simulate 10 consecutive overloaded frames (>12ms)
    for (let i = 0; i < 10; i++) {
      scheduler._simulateFrame(15);
    }

    // Effects should now be permanently disabled for subsequent frames
    scheduler._simulateFrame(1); // even under budget, effects stay disabled
    expect(effectsRenderer).not.toHaveBeenCalled();
  });

  it('does not disable effects if overload streak is broken before reaching 10', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // 9 overloaded frames then one under budget
    for (let i = 0; i < 9; i++) {
      scheduler._simulateFrame(15);
    }
    scheduler._simulateFrame(2); // breaks the streak

    // Effects should still work under budget (streak reset)
    effectsRenderer.mockClear();
    scheduler._simulateFrame(1);
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('calls interaction renderer independently of effects budget', () => {
    const interactionRenderer = vi.fn();
    scheduler.registerInteractionRenderer(interactionRenderer);
    scheduler._simulateFrame(15); // high data cost
    expect(interactionRenderer).toHaveBeenCalledTimes(1);
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
