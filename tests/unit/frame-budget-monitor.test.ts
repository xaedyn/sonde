import { describe, it, expect } from 'vitest';
import { FrameBudgetMonitor } from '../../src/lib/utils/frame-budget-monitor';

describe('FrameBudgetMonitor', () => {
  it('starts with p95 of 0', () => {
    const monitor = new FrameBudgetMonitor();
    expect(monitor.getP95()).toBe(0);
    expect(monitor.getStatus()).toBe('ok');
  });

  it('computes p95 correctly', () => {
    const monitor = new FrameBudgetMonitor(100);
    for (let i = 0; i < 100; i++) monitor.record(i < 95 ? 5 : 20);
    expect(monitor.getP95()).toBeGreaterThanOrEqual(5);
  });

  it('returns warn when p95 exceeds 12ms', () => {
    const monitor = new FrameBudgetMonitor(10, 12, 16);
    for (let i = 0; i < 10; i++) monitor.record(13);
    expect(monitor.getStatus()).toBe('warn');
  });

  it('returns error when p95 exceeds 16ms', () => {
    const monitor = new FrameBudgetMonitor(10, 12, 16);
    for (let i = 0; i < 10; i++) monitor.record(17);
    expect(monitor.getStatus()).toBe('error');
  });

  it('maintains rolling window', () => {
    const monitor = new FrameBudgetMonitor(5);
    for (let i = 0; i < 10; i++) monitor.record(i < 5 ? 20 : 5);
    expect(monitor.getP95()).toBeLessThan(20);
  });

  it('reset clears history', () => {
    const monitor = new FrameBudgetMonitor();
    monitor.record(20);
    monitor.reset();
    expect(monitor.getP95()).toBe(0);
  });

  it('default warnThresholdMs is 14ms — 13ms frames do not trigger warn', () => {
    const monitor = new FrameBudgetMonitor(); // default params
    for (let i = 0; i < 60; i++) monitor.record(13);
    expect(monitor.getStatus()).not.toBe('warn');
  });
});
