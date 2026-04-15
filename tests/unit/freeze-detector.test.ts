import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FreezeDetector } from '../../src/lib/utils/freeze-detector';

describe('FreezeDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: jump system time without firing any timer callbacks, then fire one tick.
  function jumpTime(ms: number): void {
    const now = Date.now();
    vi.setSystemTime(now + ms);
    vi.advanceTimersByTime(100); // fire exactly one heartbeat tick
  }

  it('does not fire for gap of 1001ms (browser background throttle level)', () => {
    const onFreeze = vi.fn();
    const detector = new FreezeDetector(() => 1);
    detector.onFreeze(onFreeze);
    detector.start();

    vi.advanceTimersByTime(100); // establish lastTick
    jumpTime(1001);

    expect(onFreeze).not.toHaveBeenCalled();
    detector.stop();
  });

  it('fires for gap exceeding 2000ms (genuine freeze)', () => {
    const onFreeze = vi.fn();
    const detector = new FreezeDetector(() => 1);
    detector.onFreeze(onFreeze);
    detector.start();

    vi.advanceTimersByTime(100); // establish lastTick
    jumpTime(2001);

    expect(onFreeze).toHaveBeenCalledOnce();
    expect(onFreeze.mock.calls[0][0].gapMs).toBeGreaterThan(2000);
    detector.stop();
  });

  it('does not fire when tab is backgrounded and restored within 3s grace period', () => {
    const onFreeze = vi.fn();
    const detector = new FreezeDetector(() => 1);
    detector.onFreeze(onFreeze);
    detector.start();

    (detector as unknown as { _handleVisibilityHidden: () => void })._handleVisibilityHidden();
    // Advance fake clock 2000ms while interval is paused
    vi.setSystemTime(Date.now() + 2000);
    (detector as unknown as { _handleVisibilityVisible: () => void })._handleVisibilityVisible();
    // Within grace period: advance 1000ms and fire ticks — gap should be ignored
    vi.advanceTimersByTime(1000);

    expect(onFreeze).not.toHaveBeenCalled();
    detector.stop();
  });

  it('detects real freeze occurring while tab is visible', () => {
    const onFreeze = vi.fn();
    const detector = new FreezeDetector(() => 1);
    detector.onFreeze(onFreeze);
    detector.start();

    vi.advanceTimersByTime(100); // establish lastTick
    jumpTime(2500);

    expect(onFreeze).toHaveBeenCalled();
    detector.stop();
  });

  it('stop() removes the visibilitychange listener', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const detector = new FreezeDetector(() => 1);
    detector.start();
    detector.stop();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
    removeEventListenerSpy.mockRestore();
  });

  it('does not double-register visibilitychange on multiple start() calls', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const detector = new FreezeDetector(() => 1);
    detector.start();
    detector.start();

    const visibilityCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'visibilitychange'
    );
    expect(visibilityCalls).toHaveLength(1);

    detector.stop();
    addEventListenerSpy.mockRestore();
  });
});
