// src/lib/utils/freeze-detector.ts
// Heartbeat-based freeze detector. Detects when the browser tab is backgrounded
// or the JS thread is blocked for >1000ms, emitting "freeze" events.

export interface FreezeEvent {
  readonly round: number;
  readonly at: number;
  readonly gapMs: number;
}

export type FreezeCallback = (event: FreezeEvent) => void;

const HEARTBEAT_INTERVAL_MS = 100;
const FREEZE_THRESHOLD_MS = 1000;

export class FreezeDetector {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private readonly callbacks: FreezeCallback[] = [];
  private getRound: () => number;

  constructor(getRound: () => number) {
    this.getRound = getRound;
  }

  start(): void {
    if (this.timerId !== null) return;
    this.lastTick = Date.now();
    this.timerId = setInterval(() => this._tick(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  onFreeze(cb: FreezeCallback): void {
    this.callbacks.push(cb);
  }

  private _tick(): void {
    const now = Date.now();
    const gap = now - this.lastTick;
    this.lastTick = now;

    if (gap > FREEZE_THRESHOLD_MS) {
      const event: FreezeEvent = {
        round: this.getRound(),
        at: now,
        gapMs: gap,
      };
      for (const cb of this.callbacks) {
        cb(event);
      }
    }
  }
}
