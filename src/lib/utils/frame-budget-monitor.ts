export type BudgetStatus = 'ok' | 'warn' | 'error';

export class FrameBudgetMonitor {
  private frameTimes: number[] = [];
  private readonly windowSize: number;
  private readonly warnThresholdMs: number;
  private readonly errorThresholdMs: number;

  constructor(windowSize = 60, warnThresholdMs = 14, errorThresholdMs = 16) {
    this.windowSize = windowSize;
    this.warnThresholdMs = warnThresholdMs;
    this.errorThresholdMs = errorThresholdMs;
  }

  record(frameTimeMs: number): void {
    this.frameTimes.push(frameTimeMs);
    if (this.frameTimes.length > this.windowSize) {
      this.frameTimes.shift();
    }
  }

  getP95(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const idx = Math.ceil(0.95 * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  }

  getStatus(): BudgetStatus {
    const p95 = this.getP95();
    if (p95 >= this.errorThresholdMs) return 'error';
    if (p95 >= this.warnThresholdMs) return 'warn';
    return 'ok';
  }

  reset(): void {
    this.frameTimes = [];
  }
}
