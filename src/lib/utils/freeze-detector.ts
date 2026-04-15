// src/lib/utils/freeze-detector.ts
// Heartbeat-based freeze detector. Detects when the JS thread is blocked for
// >2000ms while the tab is visible, emitting "freeze" events. Pauses detection
// during tab backgrounding and applies a grace period on restore to eliminate
// false positives caused by browser timer throttling.

export interface FreezeEvent {
  readonly round: number;
  readonly at: number;
  readonly gapMs: number;
}

export type FreezeCallback = (event: FreezeEvent) => void;

const HEARTBEAT_INTERVAL_MS = 100;
const FREEZE_THRESHOLD_MS = 2000;
const GRACE_PERIOD_MS = 3000;

export class FreezeDetector {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private graceUntil = 0;
  private readonly callbacks: FreezeCallback[] = [];
  private readonly getRound: () => number;
  private readonly _visibilityHandler: () => void;

  constructor(getRound: () => number) {
    this.getRound = getRound;
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this._handleVisibilityHidden();
      } else {
        this._handleVisibilityVisible();
      }
    };
  }

  start(): void {
    if (this.timerId !== null) return;
    document.addEventListener('visibilitychange', this._visibilityHandler);
    if (document.visibilityState === 'hidden') {
      return; // stay paused until visible
    }
    this.lastTick = Date.now();
    this.timerId = setInterval(() => this._tick(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    document.removeEventListener('visibilitychange', this._visibilityHandler);
  }

  onFreeze(cb: FreezeCallback): void {
    this.callbacks.push(cb);
  }

  _handleVisibilityHidden(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  _handleVisibilityVisible(): void {
    this.lastTick = Date.now();
    this.graceUntil = Date.now() + GRACE_PERIOD_MS;
    if (this.timerId === null) {
      this.timerId = setInterval(() => this._tick(), HEARTBEAT_INTERVAL_MS);
    }
  }

  private _tick(): void {
    const now = Date.now();
    const gap = now - this.lastTick;
    this.lastTick = now;

    if (gap > FREEZE_THRESHOLD_MS && now > this.graceUntil) {
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
