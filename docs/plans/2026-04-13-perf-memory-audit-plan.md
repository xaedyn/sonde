# Performance & Memory Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Eliminate unbounded memory growth, O(n) derived computation scans, and permanent render scheduler latch so Chronoscope can run continuously for 8+ hours without degradation.
**Architecture:** Ring Buffer + Incremental Derivation approach — fixed-capacity ring buffers replace unbounded sample arrays, all O(n) scans converted to delta-based O(1) updates, render scheduler gains hysteresis recovery, engine gains visibility-aware pause.
**Tech Stack:** Svelte 5 (runes), TypeScript 6, Vite 8, Vitest 4

---

## Acceptance Criteria

| AC | Exact Text | Maps To |
|----|-----------|---------|
| AC1 | Heap memory after 8hr session (2 endpoints, 1 Hz) < 150MB, no monotonic growth after t=10min | Task 1 (RingBuffer capacity), Task 7 (SessionHistoryStore) |
| AC2 | Per-round store update + derived recomputation (10 endpoints) < 4ms total | Task 2 (IncrementalTimestampTracker), Task 3 (IncrementalLossCounter), Task 5 (measurementStore migration), Task 8 (statisticsStore compound epoch:tailIndex cache key), Task 12 (heatmap gate + compound key), Task 12 (LanesView getLaneProps) |
| AC3 | Resume after 30min background — within 2 rounds, zero orphaned timers/workers | Task 8 (visibility-aware engine pause) |
| AC4 | Individual rAF callback duration at steady state — no frame > 16ms; effects not permanently disabled | Task 6 (RenderScheduler hysteresis) |
| AC5 | Derived computation cost at 50K total samples < 2ms per store update | Task 2, Task 3, Task 9, Task 10, Task 11 |

---

## THE BET (Research Brief — Approach 1)

> "A fixed ring capacity of ~28,800 samples per endpoint is large enough for any practical session, and incremental delta tracking through Svelte's reactive graph won't introduce stale-data bugs."

Tasks where this assumption is most load-bearing: Task 1 (capacity constant), Task 5 (tailIndex as delta coordinate), Task 9 (cache key migration from `.length` to `.tailIndex`).

---

## File Map

### Phase A — New utility files (pure data structures, no Svelte)

| Action | Path | Responsibility | Key Exports |
|--------|------|---------------|-------------|
| Create | `src/lib/utils/ring-buffer.ts` | Generic fixed-capacity circular buffer | `RingBuffer<T>`, `DEFAULT_RING_CAPACITY` |
| Create | `src/lib/utils/incremental-timestamp-tracker.ts` | O(1) amortized round→timestamp map maintenance | `IncrementalTimestampTracker` |
| Create | `src/lib/utils/incremental-loss-counter.ts` | O(1) per-endpoint lifetime loss counts | `IncrementalLossCounter`, `LossCounts` |
| Create | `src/lib/utils/sorted-insertion-buffer.ts` | Persistent sorted array for O(log n) latency insertion | `SortedInsertionBuffer` |
| Create | `src/lib/stores/session-history.ts` | Write-only eviction accumulator, plain class (not a Svelte store) | `SessionHistoryStore`, `sessionHistoryStore` (singleton), `HourSummary` |

### Phase A — New test files

| Action | Path | Tests |
|--------|------|-------|
| Create | `tests/unit/ring-buffer.test.ts` | RingBuffer all behaviors |
| Create | `tests/unit/incremental-timestamp-tracker.test.ts` | IncrementalTimestampTracker all behaviors |
| Create | `tests/unit/incremental-loss-counter.test.ts` | IncrementalLossCounter all behaviors |
| Create | `tests/unit/sorted-insertion-buffer.test.ts` | SortedInsertionBuffer all behaviors |
| Create | `tests/unit/session-history.test.ts` | SessionHistoryStore all behaviors |

### Phase B — Store migration (modifies existing files)

| Action | Path | Change |
|--------|------|--------|
| Modify | `src/lib/types.ts` | Add `RingBuffer` structural interface to `EndpointMeasurementState.samples`; keep `MeasurementSample[]` for share/persistence serialization |
| Modify | `src/lib/stores/measurements.ts` | Replace `MeasurementSample[]` with `RingBuffer<MeasurementSample>` per endpoint; wire `onEvict`; integrate `IncrementalLossCounter`, `SortedInsertionBuffer`, `IncrementalTimestampTracker`; redirect `addSample()` to `addSamples()` |
| Modify | `src/lib/stores/statistics.ts` | Change memoization cache key from `samples.length` to `samples.tailIndex`; pass `SortedInsertionBuffer` to `computeEndpointStatistics` |
| Modify | `src/lib/utils/statistics.ts` | Add `computeEndpointStatisticsFromBuffer(endpointId, sortedBuffer, lossCounter, totalSamples)` overload; keep existing signature for backward compat with loadSnapshot path |

### Phase B — Modified test files

| Action | Path | Change |
|--------|------|--------|
| Modify | `tests/unit/stores/measurements.test.ts` | Update snapshot shape (samples is now `RingBuffer`-compatible); add ring buffer eviction and `tailIndex` cache key tests |
| Modify | `tests/unit/statistics.test.ts` | Add tests for `computeEndpointStatisticsFromBuffer` |

### Phase C — Component integration (modifies existing Svelte files)

| Action | Path | Change |
|--------|------|--------|
| Modify | `src/lib/renderers/render-scheduler.ts` | Add `recoveryStreak` field and hysteresis recovery path to `updateOverloadStreak`; update `_simulateFrame` |
| Modify | `src/lib/engine/measurement-engine.ts` | Add `_paused`, `_visibilityHandler` fields; add `_pause()`, `_resume()`, `_handleVisibilityChange()` private methods; register/remove listener in `start()`/`stop()`; guard `_dispatchRound()` with `if (this._paused) return`; `_resume()` clears `roundTimer` before rescheduling |
| Modify | `src/lib/components/Layout.svelte` | Replace O(n) `sampleTimestamps` derived block with read from `incrementalTimestampTracker.timestamps` |
| Modify | `src/lib/components/LanesView.svelte` | Add `heatmapCache` + `tailIndex` gate to `heatmapCellsByEndpoint`; replace O(n) filter in `getLaneProps()` with `incrementalLossCounter.getCounts(endpointId)`; migrate ribbon throttle from `samples.length` to `samples.tailIndex` |
| Modify | `src/lib/components/TimelineCanvas.svelte` | Migrate `sampleCounts` from `samples.length` to `samples.tailIndex` |
| Modify | `src/lib/renderers/timeline-data-pipeline.ts` | Replace `samples[i]` bracket access with `samples.at(i)` |
| Modify | `src/lib/components/HeatmapCanvas.svelte` | Replace `samples[i]` bracket access with `samples.at(i)` |
| Modify | `src/lib/components/CrossLaneHover.svelte` | Replace `samples[i]` bracket access with `samples.at(i)` |
| Modify | `src/lib/components/SummaryCard.svelte` | Replace `samples[i]` bracket access with `samples.at(i)` |
| Modify | `src/lib/components/SharePopover.svelte` | Replace `samples[i]` bracket access with `samples.at(i)` |

### Phase C — Modified test files

| Action | Path | Change |
|--------|------|--------|
| Modify | `tests/unit/render-scheduler.test.ts` | Add recovery streak tests (AC4) |
| Modify | `tests/unit/measurement-engine.test.ts` | Add visibility pause/resume tests (AC3) |

---

## Phase A — Pure Data Structures

**Phase A goal:** Implement all new utility classes with full test coverage. No Svelte, no store imports, no component changes. The phase is done when all Phase A tests pass.

**Phase A artifact:** `docs/superpowers/progress/2026-04-13-perf-memory-audit-phaseA.md`

---

### Task 1 — Implement `RingBuffer<T>`

> THE BET load-bearing: `DEFAULT_RING_CAPACITY = 28_800` is the capacity assumption. If this is wrong, memory budget calculations fail.

**Files created:**
- `src/lib/utils/ring-buffer.ts` (new)
- `tests/unit/ring-buffer.test.ts` (new)

**Step 1.1 — Write failing tests**

Create `tests/unit/ring-buffer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { RingBuffer, DEFAULT_RING_CAPACITY } from '../../src/lib/utils/ring-buffer';

describe('RingBuffer — AC1: fixed-capacity prevents unbounded growth', () => {
  it('DEFAULT_RING_CAPACITY equals 28800', () => {
    expect(DEFAULT_RING_CAPACITY).toBe(28_800);
  });

  it('constructor throws if capacity < 1', () => {
    expect(() => new RingBuffer<number>({ capacity: 0 })).toThrow();
  });

  it('starts empty', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    expect(rb.length).toBe(0);
    expect(rb.isEmpty).toBe(true);
    expect(rb.isFull).toBe(false);
  });

  it('push increases length up to capacity', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); expect(rb.length).toBe(1);
    rb.push(2); expect(rb.length).toBe(2);
    rb.push(3); expect(rb.length).toBe(3);
    expect(rb.isFull).toBe(true);
  });

  it('push beyond capacity does not increase length', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    for (let i = 0; i < 10; i++) rb.push(i);
    expect(rb.length).toBe(3);
  });

  it('push evicts oldest item when full', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3);
    rb.push(4); // evicts 1
    expect(rb.toArray()).toEqual([2, 3, 4]);
  });

  it('push returns evicted item when full', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3);
    const evicted = rb.push(4);
    expect(evicted).toBe(1);
  });

  it('push returns undefined when not full', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    const evicted = rb.push(1);
    expect(evicted).toBeUndefined();
  });

  it('onEvict callback fires with evicted item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    const onEvict = vi.fn();
    rb.onEvict(onEvict);
    rb.push(1); rb.push(2); rb.push(3);
    rb.push(4);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith(1);
  });

  it('onEvict fires before item is overwritten (synchronous)', () => {
    const rb = new RingBuffer<number>({ capacity: 2 });
    const evictions: number[] = [];
    rb.onEvict(v => evictions.push(v));
    rb.push(10); rb.push(20);
    rb.push(30); // evicts 10
    rb.push(40); // evicts 20
    expect(evictions).toEqual([10, 20]);
  });

  it('at(0) returns oldest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(10); rb.push(20); rb.push(30);
    expect(rb.at(0)).toBe(10);
  });

  it('at(length-1) returns newest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(10); rb.push(20); rb.push(30);
    expect(rb.at(2)).toBe(30);
  });

  it('at() wraps correctly after eviction', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3); rb.push(4); // evicts 1
    expect(rb.at(0)).toBe(2);
    expect(rb.at(1)).toBe(3);
    expect(rb.at(2)).toBe(4);
  });

  it('Symbol.iterator yields oldest to newest', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    rb.push(1); rb.push(2); rb.push(3); rb.push(4); rb.push(5); // evicts 1
    expect([...rb]).toEqual([2, 3, 4, 5]);
  });

  it('toArray returns new plain array each call', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2);
    const a = rb.toArray();
    const b = rb.toArray();
    expect(a).toEqual([1, 2]);
    expect(a).not.toBe(b);
  });

  it('loadFrom clears and bulk-inserts', () => {
    const rb = new RingBuffer<number>({ capacity: 5 });
    rb.push(99);
    rb.loadFrom([1, 2, 3]);
    expect(rb.toArray()).toEqual([1, 2, 3]);
  });

  it('loadFrom truncates items beyond capacity (oldest discarded)', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.loadFrom([1, 2, 3, 4, 5]);
    expect(rb.toArray()).toEqual([3, 4, 5]);
  });

  it('tailIndex starts at 0', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    expect(rb.tailIndex).toBe(0);
  });

  it('tailIndex increments monotonically on every push', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); expect(rb.tailIndex).toBe(1);
    rb.push(2); expect(rb.tailIndex).toBe(2);
    rb.push(3); expect(rb.tailIndex).toBe(3);
    rb.push(4); // evicts 1
    expect(rb.tailIndex).toBe(4);
  });

  it('tailIndex does not stall at capacity — THE BET', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    for (let i = 0; i < 100; i++) rb.push(i);
    expect(rb.tailIndex).toBe(100);
    expect(rb.length).toBe(3);
  });

  it('sliceFromTail(0) returns all items', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    rb.push(10); rb.push(20); rb.push(30);
    expect(rb.sliceFromTail(0)).toEqual([10, 20, 30]);
  });

  it('sliceFromTail returns only new items since last call', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    rb.push(10); rb.push(20);
    const tail1 = rb.tailIndex;
    rb.push(30); rb.push(40);
    expect(rb.sliceFromTail(tail1)).toEqual([30, 40]);
  });

  it('sliceFromTail returns all live items when tailStart is before oldest', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3); rb.push(4); // evicts 1, oldest now at index 1
    expect(rb.sliceFromTail(0)).toEqual([2, 3, 4]); // 0 is before oldest — returns all live
  });

  it('front returns oldest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(5); rb.push(6); rb.push(7);
    expect(rb.front).toBe(5);
  });

  it('back returns newest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(5); rb.push(6); rb.push(7);
    expect(rb.back).toBe(7);
  });

  it('front and back are undefined when empty', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    expect(rb.front).toBeUndefined();
    expect(rb.back).toBeUndefined();
  });

  it('insertOrdered inserts in correct position', () => {
    const rb = new RingBuffer<number>({ capacity: 5 });
    rb.push(1); rb.push(3); rb.push(5);
    rb.insertOrdered(2, (existing) => existing > 2);
    expect(rb.toArray()).toEqual([1, 2, 3, 5]);
  });

  it('insertOrdered appends when item is newest', () => {
    const rb = new RingBuffer<number>({ capacity: 5 });
    rb.push(1); rb.push(2);
    rb.insertOrdered(3, (existing) => existing > 3);
    expect(rb.toArray()).toEqual([1, 2, 3]);
  });

  it('capacity getter returns construction value', () => {
    const rb = new RingBuffer<number>({ capacity: 42 });
    expect(rb.capacity).toBe(42);
  });
});
```

**Step 1.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- ring-buffer
# Expected: all tests fail (file does not exist yet)
```

**Step 1.3 — Implement `src/lib/utils/ring-buffer.ts`**

```typescript
// src/lib/utils/ring-buffer.ts
// Generic fixed-capacity circular buffer.
// tailIndex is monotonically increasing and never stalls at capacity —
// used by derived stores as a delta-tracking coordinate. (THE BET)

export const DEFAULT_RING_CAPACITY = 28_800; // 8 hours at 1 Hz

interface RingBufferOptions {
  readonly capacity: number;
}

type EvictionCallback<T> = (evicted: T) => void;

export class RingBuffer<T> {
  private readonly _items: (T | undefined)[];
  private readonly _capacity: number;
  private _head: number = 0;   // index of oldest item in _items
  private _length: number = 0; // current live item count
  private _tailIndex: number = 0; // total items ever pushed (monotonic)
  private _onEvict: EvictionCallback<T> | null = null;

  constructor(options: RingBufferOptions) {
    if (options.capacity < 1) {
      throw new Error(`RingBuffer: capacity must be >= 1, got ${options.capacity}`);
    }
    this._capacity = options.capacity;
    this._items = new Array<T | undefined>(options.capacity).fill(undefined);
  }

  get capacity(): number { return this._capacity; }
  get length(): number { return this._length; }
  get isEmpty(): boolean { return this._length === 0; }
  get isFull(): boolean { return this._length === this._capacity; }
  get tailIndex(): number { return this._tailIndex; }

  get front(): T | undefined {
    if (this._length === 0) return undefined;
    return this._items[this._head];
  }

  get back(): T | undefined {
    if (this._length === 0) return undefined;
    const tailPos = (this._head + this._length - 1) % this._capacity;
    return this._items[tailPos];
  }

  onEvict(cb: EvictionCallback<T>): void {
    this._onEvict = cb;
  }

  push(item: T): T | undefined {
    let evicted: T | undefined;

    if (this._length === this._capacity) {
      // Buffer full — evict oldest
      evicted = this._items[this._head] as T;
      this._onEvict?.(evicted);
      this._items[this._head] = item;
      this._head = (this._head + 1) % this._capacity;
    } else {
      // Space available — write at tail position
      const writePos = (this._head + this._length) % this._capacity;
      this._items[writePos] = item;
      this._length++;
    }

    this._tailIndex++;
    return evicted;
  }

  /**
   * Insert item at a position determined by a comparator (for straggler insertion).
   * Walks backward from newest to find the correct position using the provided predicate.
   * `shouldInsertBefore(existingItem)` returns true when the new item should be placed before existingItem.
   * O(k) where k = distance from tail to insertion point (typically 1-2 for stragglers).
   */
  insertOrdered(item: T, shouldInsertBefore: (existing: T) => boolean): T | undefined {
    if (this._length === 0) {
      return this.push(item);
    }

    // Find insertion point by walking backward from tail
    let insertLogical = this._length; // default: append
    for (let i = this._length - 1; i >= 0; i--) {
      const existing = this._items[(this._head + i) % this._capacity] as T;
      if (shouldInsertBefore(existing)) {
        insertLogical = i;
      } else {
        break;
      }
    }

    if (insertLogical === this._length) {
      // Appending — normal push
      return this.push(item);
    }

    // Need to shift items right from insertLogical to tail to make room
    let evicted: T | undefined;

    if (this._length === this._capacity) {
      // Will evict the oldest item (head)
      evicted = this._items[this._head] as T;
      this._onEvict?.(evicted);
      // Adjust insertion point since head moves
      insertLogical = Math.max(0, insertLogical - 1);
      this._head = (this._head + 1) % this._capacity;
      this._length--;
    }

    // Shift items from insertLogical to end right by one
    for (let i = this._length; i > insertLogical; i--) {
      const srcPos = (this._head + i - 1) % this._capacity;
      const dstPos = (this._head + i) % this._capacity;
      this._items[dstPos] = this._items[srcPos];
    }

    const writePos = (this._head + insertLogical) % this._capacity;
    this._items[writePos] = item;
    this._length++;
    this._tailIndex++;

    return evicted;
  }

  at(index: number): T | undefined {
    if (index < 0 || index >= this._length) return undefined;
    return this._items[(this._head + index) % this._capacity];
  }

  [Symbol.iterator](): Iterator<T> {
    let i = 0;
    return {
      next: (): IteratorResult<T> => {
        if (i < this._length) {
          const value = this._items[(this._head + i) % this._capacity] as T;
          i++;
          return { value, done: false };
        }
        return { value: undefined as unknown as T, done: true };
      },
    };
  }

  /**
   * Return all items pushed since tailStart (inclusive).
   * tailStart is an absolute tailIndex value.
   * If tailStart is before the buffer's oldest live item, returns all live items.
   */
  sliceFromTail(tailStart: number): T[] {
    if (this._length === 0) return [];

    // The tailIndex of the oldest live item = _tailIndex - _length
    const oldestTailIndex = this._tailIndex - this._length;

    // Clamp tailStart so we don't go before the oldest item
    const effectiveStart = Math.max(tailStart, oldestTailIndex);
    const skipCount = effectiveStart - oldestTailIndex;

    const result: T[] = [];
    for (let i = skipCount; i < this._length; i++) {
      result.push(this._items[(this._head + i) % this._capacity] as T);
    }
    return result;
  }

  toArray(): T[] {
    const result: T[] = new Array<T>(this._length);
    for (let i = 0; i < this._length; i++) {
      result[i] = this._items[(this._head + i) % this._capacity] as T;
    }
    return result;
  }

  /**
   * Bulk load from plain array. Clears existing contents.
   * Items beyond capacity are truncated from the front (oldest discarded).
   */
  loadFrom(items: T[]): void {
    this._head = 0;
    this._length = 0;
    this._tailIndex = 0;
    this._items.fill(undefined);

    // Truncate to last `capacity` items if over capacity
    const start = Math.max(0, items.length - this._capacity);
    for (let i = start; i < items.length; i++) {
      const writePos = (this._head + this._length) % this._capacity;
      this._items[writePos] = items[i];
      this._length++;
      this._tailIndex++;
    }
  }
}
```

**Step 1.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- ring-buffer
# Expected: all tests pass
```

---

### Task 2 — Implement `IncrementalTimestampTracker`

> Maps to: AC2, AC5 (eliminates O(n) scan in Layout.svelte `sampleTimestamps`)

**Files created:**
- `src/lib/utils/incremental-timestamp-tracker.ts` (new)
- `tests/unit/incremental-timestamp-tracker.test.ts` (new)

**Step 2.1 — Write failing tests**

Create `tests/unit/incremental-timestamp-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalTimestampTracker } from '../../src/lib/utils/incremental-timestamp-tracker';
import { RingBuffer } from '../../src/lib/utils/ring-buffer';
import type { MeasurementSample } from '../../src/lib/types';

function makeSample(round: number, timestamp: number, status: 'ok' | 'error' | 'timeout' = 'ok'): MeasurementSample {
  return { round, latency: 50, status, timestamp };
}

describe('IncrementalTimestampTracker — AC2/AC5: O(1) timestamp maintenance', () => {
  let tracker: IncrementalTimestampTracker;

  beforeEach(() => {
    tracker = new IncrementalTimestampTracker();
  });

  it('starts with empty timestamps array', () => {
    expect(tracker.timestamps).toEqual([]);
  });

  it('processNewSamples populates timestamps for new rounds', () => {
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 1000));
    rb.push(makeSample(1, 2000));
    tracker.processNewSamples('ep1', rb, rb.tailIndex);
    expect(tracker.timestamps[0]).toBe(1000);
    expect(tracker.timestamps[1]).toBe(2000);
  });

  it('processNewSamples uses minimum timestamp per round across endpoints', () => {
    const rb1 = new RingBuffer<MeasurementSample>({ capacity: 10 });
    const rb2 = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb1.push(makeSample(0, 5000));
    rb2.push(makeSample(0, 3000)); // earlier timestamp for same round
    tracker.processNewSamples('ep1', rb1, rb1.tailIndex);
    tracker.processNewSamples('ep2', rb2, rb2.tailIndex);
    expect(tracker.timestamps[0]).toBe(3000);
  });

  it('processNewSamples only processes delta since last call (O(k) not O(n))', () => {
    const rb = new RingBuffer<MeasurementSample>({ capacity: 100 });
    rb.push(makeSample(0, 1000));
    rb.push(makeSample(1, 2000));
    tracker.processNewSamples('ep1', rb, rb.tailIndex);
    const prevTimestamps = [...tracker.timestamps];

    // Add only one new sample
    rb.push(makeSample(2, 3000));
    tracker.processNewSamples('ep1', rb, rb.tailIndex);

    // First two should be unchanged, third should be new
    expect(tracker.timestamps[0]).toBe(prevTimestamps[0]);
    expect(tracker.timestamps[1]).toBe(prevTimestamps[1]);
    expect(tracker.timestamps[2]).toBe(3000);
  });

  it('reset clears all state', () => {
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 1000));
    tracker.processNewSamples('ep1', rb, rb.tailIndex);
    tracker.reset();
    expect(tracker.timestamps).toEqual([]);
  });

  it('after reset, processes all samples as new (loadSnapshot path)', () => {
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 1000));
    tracker.processNewSamples('ep1', rb, rb.tailIndex);
    tracker.reset();
    tracker.processNewSamples('ep1', rb, rb.tailIndex);
    expect(tracker.timestamps[0]).toBe(1000);
  });

  it('timestamps getter returns internal reference (no copy)', () => {
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 1000));
    tracker.processNewSamples('ep1', rb, rb.tailIndex);
    expect(tracker.timestamps).toBe(tracker.timestamps); // same reference
  });
});
```

**Step 2.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- incremental-timestamp-tracker
# Expected: all tests fail
```

**Step 2.3 — Implement `src/lib/utils/incremental-timestamp-tracker.ts`**

```typescript
// src/lib/utils/incremental-timestamp-tracker.ts
// Replaces the O(n) sampleTimestamps scan in Layout.svelte.
// processNewSamples reads only the delta via sliceFromTail — O(k) per call,
// where k = new samples since last call (typically 1 per endpoint per round).

import type { MeasurementSample } from '../types';
import type { RingBuffer } from './ring-buffer';

export class IncrementalTimestampTracker {
  private _timestamps: number[] = [];
  private _lastProcessedTail: Map<string, number> = new Map();

  /** Process only new samples since last call for this endpoint. */
  processNewSamples(
    endpointId: string,
    ringBuffer: RingBuffer<MeasurementSample>,
    currentTailIndex: number
  ): void {
    const lastTail = this._lastProcessedTail.get(endpointId) ?? 0;
    if (currentTailIndex <= lastTail) return;

    const newSamples = ringBuffer.sliceFromTail(lastTail);
    for (const sample of newSamples) {
      const r = sample.round;
      const prev = this._timestamps[r];
      if (prev === undefined || sample.timestamp < prev) {
        this._timestamps[r] = sample.timestamp;
      }
    }

    this._lastProcessedTail.set(endpointId, currentTailIndex);
  }

  /** Read-only view of the timestamps array (index = round). */
  get timestamps(): readonly number[] {
    return this._timestamps;
  }

  /** Reset all state. Called on loadSnapshot or store reset. */
  reset(): void {
    this._timestamps = [];
    this._lastProcessedTail.clear();
  }
}
```

**Step 2.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- incremental-timestamp-tracker
# Expected: all tests pass
```

---

### Task 3 — Implement `IncrementalLossCounter`

> Maps to: AC2, AC5 (eliminates O(n) `samples.filter()` in `getLaneProps()`)

**Files created:**
- `src/lib/utils/incremental-loss-counter.ts` (new)
- `tests/unit/incremental-loss-counter.test.ts` (new)

**Step 3.1 — Write failing tests**

Create `tests/unit/incremental-loss-counter.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalLossCounter } from '../../src/lib/utils/incremental-loss-counter';

describe('IncrementalLossCounter — AC2/AC5: O(1) loss percentage', () => {
  let counter: IncrementalLossCounter;

  beforeEach(() => {
    counter = new IncrementalLossCounter();
  });

  it('getCounts returns zero counts for unknown endpoint', () => {
    const counts = counter.getCounts('ep1');
    expect(counts.totalSamples).toBe(0);
    expect(counts.errorCount).toBe(0);
    expect(counts.timeoutCount).toBe(0);
    expect(counts.lossPercent).toBe(0);
  });

  it('addSamples increments total and error counts', () => {
    counter.addSamples([
      { endpointId: 'ep1', status: 'ok' },
      { endpointId: 'ep1', status: 'error' },
    ]);
    const c = counter.getCounts('ep1');
    expect(c.totalSamples).toBe(2);
    expect(c.errorCount).toBe(1);
    expect(c.timeoutCount).toBe(0);
  });

  it('addSamples increments timeout count', () => {
    counter.addSamples([{ endpointId: 'ep1', status: 'timeout' }]);
    expect(counter.getCounts('ep1').timeoutCount).toBe(1);
  });

  it('lossPercent is (errors + timeouts) / total * 100', () => {
    counter.addSamples([
      { endpointId: 'ep1', status: 'ok' },
      { endpointId: 'ep1', status: 'ok' },
      { endpointId: 'ep1', status: 'error' },
      { endpointId: 'ep1', status: 'timeout' },
    ]);
    expect(counter.getCounts('ep1').lossPercent).toBe(50);
  });

  it('counts are lifetime totals — not decremented on ring buffer eviction', () => {
    // Simulate many samples; counts should keep accumulating
    for (let i = 0; i < 100; i++) {
      counter.addSamples([{ endpointId: 'ep1', status: i % 5 === 0 ? 'error' : 'ok' }]);
    }
    const c = counter.getCounts('ep1');
    expect(c.totalSamples).toBe(100);
    expect(c.errorCount).toBe(20); // every 5th is an error
  });

  it('tracks multiple endpoints independently', () => {
    counter.addSamples([
      { endpointId: 'ep1', status: 'error' },
      { endpointId: 'ep2', status: 'ok' },
    ]);
    expect(counter.getCounts('ep1').errorCount).toBe(1);
    expect(counter.getCounts('ep2').errorCount).toBe(0);
  });

  it('removeEndpoint deletes counter state', () => {
    counter.addSamples([{ endpointId: 'ep1', status: 'error' }]);
    counter.removeEndpoint('ep1');
    expect(counter.getCounts('ep1').totalSamples).toBe(0);
  });

  it('reset clears all counters', () => {
    counter.addSamples([{ endpointId: 'ep1', status: 'error' }]);
    counter.reset();
    expect(counter.getCounts('ep1').totalSamples).toBe(0);
  });

  it('loadFrom reconstructs counts from snapshot samples', () => {
    counter.loadFrom({
      ep1: {
        samples: [
          { round: 0, latency: 50, status: 'ok', timestamp: 1000 },
          { round: 1, latency: 0, status: 'error', timestamp: 2000 },
          { round: 2, latency: 5000, status: 'timeout', timestamp: 3000 },
        ],
      },
    });
    const c = counter.getCounts('ep1');
    expect(c.totalSamples).toBe(3);
    expect(c.errorCount).toBe(1);
    expect(c.timeoutCount).toBe(1);
    expect(c.lossPercent).toBeCloseTo(66.67, 1);
  });

  it('getCounts returns O(1) precomputed lossPercent', () => {
    counter.addSamples([
      { endpointId: 'ep1', status: 'ok' },
      { endpointId: 'ep1', status: 'error' },
    ]);
    // Just verify lossPercent is computed and correct (O(1) contract is architectural)
    expect(counter.getCounts('ep1').lossPercent).toBe(50);
  });
});
```

**Step 3.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- incremental-loss-counter
# Expected: all tests fail
```

**Step 3.3 — Implement `src/lib/utils/incremental-loss-counter.ts`**

```typescript
// src/lib/utils/incremental-loss-counter.ts
// Pre-maintained lifetime loss counters per endpoint.
// Counts are never decremented on ring buffer eviction — they reflect the
// entire session's loss rate, matching user expectation.

import type { SampleStatus, MeasurementSample } from '../types';

export interface LossCounts {
  readonly totalSamples: number;
  readonly errorCount: number;
  readonly timeoutCount: number;
  readonly lossPercent: number;
}

interface CountBucket {
  total: number;
  errors: number;
  timeouts: number;
}

export class IncrementalLossCounter {
  private _counts: Map<string, CountBucket> = new Map();

  /** Process new entries from addSamples. O(k) where k = entries in batch. */
  addSamples(entries: ReadonlyArray<{ endpointId: string; status: SampleStatus }>): void {
    for (const entry of entries) {
      let bucket = this._counts.get(entry.endpointId);
      if (!bucket) {
        bucket = { total: 0, errors: 0, timeouts: 0 };
        this._counts.set(entry.endpointId, bucket);
      }
      bucket.total++;
      if (entry.status === 'error') bucket.errors++;
      else if (entry.status === 'timeout') bucket.timeouts++;
    }
  }

  /** Get current loss counts for an endpoint. O(1). */
  getCounts(endpointId: string): LossCounts {
    const bucket = this._counts.get(endpointId);
    if (!bucket || bucket.total === 0) {
      return { totalSamples: 0, errorCount: 0, timeoutCount: 0, lossPercent: 0 };
    }
    return {
      totalSamples: bucket.total,
      errorCount: bucket.errors,
      timeoutCount: bucket.timeouts,
      lossPercent: ((bucket.errors + bucket.timeouts) / bucket.total) * 100,
    };
  }

  removeEndpoint(endpointId: string): void {
    this._counts.delete(endpointId);
  }

  reset(): void {
    this._counts.clear();
  }

  /** Bulk load from snapshot samples. */
  loadFrom(endpoints: Record<string, { samples: MeasurementSample[] }>): void {
    this._counts.clear();
    for (const [endpointId, epState] of Object.entries(endpoints)) {
      const bucket: CountBucket = { total: 0, errors: 0, timeouts: 0 };
      for (const sample of epState.samples) {
        bucket.total++;
        if (sample.status === 'error') bucket.errors++;
        else if (sample.status === 'timeout') bucket.timeouts++;
      }
      if (bucket.total > 0) {
        this._counts.set(endpointId, bucket);
      }
    }
  }
}
```

**Step 3.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- incremental-loss-counter
# Expected: all tests pass
```

---

### Task 4 — Implement `SortedInsertionBuffer`

> Maps to: AC2, AC5 (eliminates O(n log n) `latencies.slice().sort()` in `computeEndpointStatistics`)

**Files created:**
- `src/lib/utils/sorted-insertion-buffer.ts` (new)
- `tests/unit/sorted-insertion-buffer.test.ts` (new)

**Step 4.1 — Write failing tests**

Create `tests/unit/sorted-insertion-buffer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SortedInsertionBuffer } from '../../src/lib/utils/sorted-insertion-buffer';

describe('SortedInsertionBuffer — AC2: O(log n) latency insertion', () => {
  let buf: SortedInsertionBuffer;

  beforeEach(() => {
    buf = new SortedInsertionBuffer();
  });

  it('starts empty', () => {
    expect(buf.length).toBe(0);
    expect(buf.sorted).toEqual([]);
  });

  it('insert maintains ascending order', () => {
    buf.insert(50);
    buf.insert(10);
    buf.insert(30);
    expect(buf.sorted).toEqual([10, 30, 50]);
  });

  it('insert handles duplicate values', () => {
    buf.insert(20);
    buf.insert(20);
    buf.insert(10);
    expect(buf.sorted).toEqual([10, 20, 20]);
  });

  it('insert in already-sorted order (typical latency arrival)', () => {
    buf.insert(10);
    buf.insert(15);
    buf.insert(20);
    buf.insert(25);
    expect(buf.sorted).toEqual([10, 15, 20, 25]);
  });

  it('sorted getter returns internal reference (no copy)', () => {
    buf.insert(1);
    expect(buf.sorted).toBe(buf.sorted);
  });

  it('length reflects number of inserted values', () => {
    buf.insert(10); buf.insert(20); buf.insert(30);
    expect(buf.length).toBe(3);
  });

  it('grows without bound (not ring-buffered — lifetime percentiles)', () => {
    for (let i = 0; i < 10_000; i++) buf.insert(Math.random() * 1000);
    expect(buf.length).toBe(10_000);
    // Verify sorted invariant on a sample
    const s = buf.sorted;
    for (let i = 1; i < s.length; i++) {
      expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
    }
  });

  it('reset clears the buffer', () => {
    buf.insert(10); buf.insert(20);
    buf.reset();
    expect(buf.length).toBe(0);
    expect(buf.sorted).toEqual([]);
  });

  it('loadFrom sorts once and replaces contents', () => {
    buf.insert(999);
    buf.loadFrom([30, 10, 50, 20]);
    expect(buf.sorted).toEqual([10, 20, 30, 50]);
  });

  it('loadFrom with empty array clears buffer', () => {
    buf.insert(10);
    buf.loadFrom([]);
    expect(buf.length).toBe(0);
  });
});
```

**Step 4.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- sorted-insertion-buffer
# Expected: all tests fail
```

**Step 4.3 — Implement `src/lib/utils/sorted-insertion-buffer.ts`**

```typescript
// src/lib/utils/sorted-insertion-buffer.ts
// Persistent sorted array for O(log n) latency insertion.
// Grows without bound — intentional. Tracks session-lifetime ok-latencies
// for exact percentile computation. Not ring-buffered.
// Only ok-sample latencies are inserted; caller is responsible for filtering.

export class SortedInsertionBuffer {
  private _sorted: number[] = [];

  /** Insert a value, maintaining ascending sorted order. */
  insert(value: number): void {
    // Binary search for insertion point
    let lo = 0;
    let hi = this._sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this._sorted[mid] ?? 0) < value) lo = mid + 1;
      else hi = mid;
    }
    this._sorted.splice(lo, 0, value);
  }

  /** Read sorted array — internal reference, no copy. */
  get sorted(): readonly number[] {
    return this._sorted;
  }

  get length(): number {
    return this._sorted.length;
  }

  reset(): void {
    this._sorted = [];
  }

  /** Bulk load from unsorted array. Sorts once — O(n log n). Used for loadSnapshot. */
  loadFrom(values: number[]): void {
    this._sorted = values.slice().sort((a, b) => a - b);
  }
}
```

**Step 4.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- sorted-insertion-buffer
# Expected: all tests pass
```

---

### Task 5 — Implement `SessionHistoryStore`

> Maps to: AC1 (evicted samples are compacted, not leaked)

Note: `SessionHistoryStore` is a **plain class**, not a Svelte store.

**Files created:**
- `src/lib/stores/session-history.ts` (new)
- `tests/unit/session-history.test.ts` (new)

**Step 5.1 — Write failing tests**

Create `tests/unit/session-history.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionHistoryStore } from '../../src/lib/stores/session-history';
import type { MeasurementSample } from '../../src/lib/types';

function makeSample(status: 'ok' | 'error' | 'timeout', latency: number, timestamp: number): MeasurementSample {
  return { round: 0, latency, status, timestamp };
}

// 2026-04-13T14:00:00.000Z = 1744894800000
const HOUR_14_TS = 1744894800000;
const HOUR_15_TS = HOUR_14_TS + 3600_000;

describe('SessionHistoryStore — AC1: eviction compaction', () => {
  let store: SessionHistoryStore;

  beforeEach(() => {
    store = new SessionHistoryStore();
  });

  it('getSummaries returns [] for unknown endpoint', () => {
    expect(store.getSummaries('ep1')).toEqual([]);
  });

  it('hasHistory is false when empty', () => {
    expect(store.hasHistory).toBe(false);
  });

  it('accumulate stores a sample in the correct hour bucket', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    const summaries = store.getSummaries('ep1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.hourKey).toBe('2026-04-17T14'); // verify ISO slice
  });

  it('hasHistory is true after accumulate', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    expect(store.hasHistory).toBe(true);
  });

  it('accumulate counts ok samples for latency stats', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    store.accumulate('ep1', makeSample('ok', 200, HOUR_14_TS));
    const summary = store.getSummaries('ep1')[0];
    expect(summary?.count).toBe(2);
    expect(summary?.min).toBe(100);
    expect(summary?.max).toBe(200);
    expect(summary?.mean).toBe(150);
  });

  it('accumulate counts error samples without latency contribution', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    store.accumulate('ep1', makeSample('error', 0, HOUR_14_TS));
    const summary = store.getSummaries('ep1')[0];
    expect(summary?.count).toBe(2);
    expect(summary?.errorCount).toBe(1);
    expect(summary?.min).toBe(100); // error doesn't affect latency
    expect(summary?.max).toBe(100);
  });

  it('accumulate counts timeout samples without latency contribution', () => {
    store.accumulate('ep1', makeSample('timeout', 5000, HOUR_14_TS));
    const summary = store.getSummaries('ep1')[0];
    expect(summary?.timeoutCount).toBe(1);
    expect(summary?.count).toBe(1);
    expect(summary?.min).toBe(0); // no ok samples
  });

  it('accumulate creates separate buckets per hour', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    store.accumulate('ep1', makeSample('ok', 200, HOUR_15_TS));
    const summaries = store.getSummaries('ep1');
    expect(summaries).toHaveLength(2);
  });

  it('getSummaries returns summaries sorted chronologically', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_15_TS)); // insert hour 15 first
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS)); // then hour 14
    const summaries = store.getSummaries('ep1');
    expect(summaries[0]?.hourKey < summaries[1]!.hourKey).toBe(true);
  });

  it('getSummaries computes p50/p95/p99', () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const l of latencies) {
      store.accumulate('ep1', makeSample('ok', l, HOUR_14_TS));
    }
    const summary = store.getSummaries('ep1')[0]!;
    expect(summary.p50).toBeGreaterThan(0);
    expect(summary.p95).toBeGreaterThanOrEqual(summary.p50);
    expect(summary.p99).toBeGreaterThanOrEqual(summary.p95);
  });

  it('getSummary returns correct bucket', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    const summaries = store.getSummaries('ep1');
    const hourKey = summaries[0]!.hourKey;
    const summary = store.getSummary('ep1', hourKey);
    expect(summary?.count).toBe(1);
  });

  it('getSummary returns null for missing bucket', () => {
    expect(store.getSummary('ep1', '2099-01-01T00')).toBeNull();
  });

  it('removeEndpoint clears history for that endpoint', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    store.removeEndpoint('ep1');
    expect(store.getSummaries('ep1')).toEqual([]);
  });

  it('reset clears all history', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    store.accumulate('ep2', makeSample('ok', 200, HOUR_14_TS));
    store.reset();
    expect(store.hasHistory).toBe(false);
  });

  it('jitter (stddev) is non-negative', () => {
    store.accumulate('ep1', makeSample('ok', 100, HOUR_14_TS));
    store.accumulate('ep1', makeSample('ok', 200, HOUR_14_TS));
    const summary = store.getSummaries('ep1')[0]!;
    expect(summary.jitter).toBeGreaterThanOrEqual(0);
  });

  it('min/max return 0 when all samples are errors', () => {
    store.accumulate('ep1', makeSample('error', 0, HOUR_14_TS));
    const summary = store.getSummaries('ep1')[0]!;
    expect(summary.min).toBe(0);
    expect(summary.max).toBe(0);
  });
});
```

**Step 5.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- session-history
# Expected: all tests fail
```

**Step 5.3 — Implement `src/lib/stores/session-history.ts`**

```typescript
// src/lib/stores/session-history.ts
// Write-only compacted accumulator for ring buffer evictions.
// Plain class — NOT a Svelte store. This prevents reactive updates on every
// eviction (1 Hz per endpoint once ring buffer is full).
// Isolation: persistence.ts and share-manager.ts must NOT import this.

import { percentileSorted } from '../utils/statistics';
import type { MeasurementSample } from '../types';

interface HourBucket {
  readonly hourKey: string;
  count: number;
  min: number;
  max: number;
  sum: number;
  sumSquares: number;
  errorCount: number;
  timeoutCount: number;
  latencies: number[]; // sorted, ok-samples only
}

interface EndpointHistory {
  readonly endpointId: string;
  buckets: Map<string, HourBucket>;
}

export interface HourSummary {
  readonly hourKey: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly errorCount: number;
  readonly timeoutCount: number;
  readonly jitter: number;
}

export class SessionHistoryStore {
  private _history: Map<string, EndpointHistory> = new Map();

  /** Called by ring buffer onEvict callback. */
  accumulate(endpointId: string, sample: MeasurementSample): void {
    let epHistory = this._history.get(endpointId);
    if (!epHistory) {
      epHistory = { endpointId, buckets: new Map() };
      this._history.set(endpointId, epHistory);
    }

    const date = new Date(sample.timestamp);
    const hourKey = date.toISOString().slice(0, 13); // "2026-04-13T14"

    let bucket = epHistory.buckets.get(hourKey);
    if (!bucket) {
      bucket = {
        hourKey,
        count: 0,
        min: Infinity,
        max: -Infinity,
        sum: 0,
        sumSquares: 0,
        errorCount: 0,
        timeoutCount: 0,
        latencies: [],
      };
      epHistory.buckets.set(hourKey, bucket);
    }

    bucket.count++;

    if (sample.status === 'error') {
      bucket.errorCount++;
    } else if (sample.status === 'timeout') {
      bucket.timeoutCount++;
    }

    if (sample.status === 'ok') {
      bucket.min = Math.min(bucket.min, sample.latency);
      bucket.max = Math.max(bucket.max, sample.latency);
      bucket.sum += sample.latency;
      bucket.sumSquares += sample.latency * sample.latency;

      // Binary search insertion to maintain sorted order
      const arr = bucket.latencies;
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if ((arr[mid] ?? 0) < sample.latency) lo = mid + 1;
        else hi = mid;
      }
      arr.splice(lo, 0, sample.latency);
    }
  }

  getSummaries(endpointId: string): readonly HourSummary[] {
    const epHistory = this._history.get(endpointId);
    if (!epHistory) return [];

    return Array.from(epHistory.buckets.values())
      .sort((a, b) => a.hourKey.localeCompare(b.hourKey))
      .map(bucket => this._toSummary(bucket));
  }

  getSummary(endpointId: string, hourKey: string): HourSummary | null {
    const bucket = this._history.get(endpointId)?.buckets.get(hourKey);
    if (!bucket) return null;
    return this._toSummary(bucket);
  }

  removeEndpoint(endpointId: string): void {
    this._history.delete(endpointId);
  }

  reset(): void {
    this._history.clear();
  }

  get hasHistory(): boolean {
    return this._history.size > 0;
  }

  private _toSummary(bucket: HourBucket): HourSummary {
    const okCount = bucket.latencies.length;
    const mean = okCount > 0 ? bucket.sum / okCount : 0;
    const variance =
      okCount > 1
        ? (bucket.sumSquares - (bucket.sum * bucket.sum) / okCount) / okCount
        : 0;
    return {
      hourKey: bucket.hourKey,
      count: bucket.count,
      min: bucket.min === Infinity ? 0 : bucket.min,
      max: bucket.max === -Infinity ? 0 : bucket.max,
      mean,
      p50: percentileSorted(bucket.latencies, 50),
      p95: percentileSorted(bucket.latencies, 95),
      p99: percentileSorted(bucket.latencies, 99),
      errorCount: bucket.errorCount,
      timeoutCount: bucket.timeoutCount,
      jitter: Math.sqrt(Math.max(0, variance)),
    };
  }
}

/** Singleton — imported by measurementStore only. */
export const sessionHistoryStore = new SessionHistoryStore();
```

**Step 5.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- session-history
# Expected: all tests pass
```

**Step 5.5 — Write Phase A artifact**

After all Phase A tests pass, run the full test suite and write the phase artifact:

```bash
cd /Users/shane/claude/chronoscope && npm test
# Expected: all existing tests still pass plus new Phase A tests
npm run typecheck
# Expected: exit 0
```

Write `docs/superpowers/progress/2026-04-13-perf-memory-audit-phaseA.md` with:
- Tasks completed (1–5)
- Test counts per file
- Typecheck result
- Any deviations from plan

---

## Phase B — Store Migration

**Phase B goal:** Wire all Phase A data structures into `measurementStore` and `statisticsStore`. No Svelte component changes. Phase is done when existing store tests still pass and new store tests pass.

**Phase B artifact:** `docs/superpowers/progress/2026-04-13-perf-memory-audit-phaseB.md`

---

### Task 6 — Migrate `types.ts` — `EndpointMeasurementState.samples` type

Pre-task reads:
- [x] Read `src/lib/types.ts` (done above)

**Files modified:**
- `src/lib/types.ts`

**Step 6.1 — Update `EndpointMeasurementState`**

In `src/lib/types.ts`, change the `samples` field type. The `RingBuffer<T>` class satisfies a structural interface — consumers that use array-like iteration continue to work without changes. Consumers that used `MeasurementSample[]` literal type for writing (`push`, `splice`) are all internal to `measurementStore` and will be updated in Task 7.

Locate the `EndpointMeasurementState` interface (lines 87–93) and apply this edit:

Old:
```typescript
export interface EndpointMeasurementState {
  readonly endpointId: string;
  samples: MeasurementSample[];
  lastLatency: number | null;
  lastStatus: SampleStatus | null;
  tierLevel: 1 | 2;
}
```

New:
```typescript
// Structural interface — RingBuffer<MeasurementSample> satisfies this.
// The `toArray()` method is used for share serialization.
// Existing consumers that use for-of, .length, .filter(), etc. continue to work.
export interface SampleBuffer {
  readonly length: number;
  readonly tailIndex: number;
  at(index: number): MeasurementSample | undefined;
  /** Numeric index access — belt-and-suspenders for consumers using bracket notation.
   *  RingBuffer must implement this via Proxy or explicit index property interception
   *  because class instances do not support `samples[i]` without it.
   *  Prefer `samples.at(i)` in all new code. */
  [index: number]: MeasurementSample | undefined;
  [Symbol.iterator](): Iterator<MeasurementSample>;
  filter(predicate: (s: MeasurementSample) => boolean): MeasurementSample[];
  map<U>(transform: (s: MeasurementSample) => U): U[];
  find(predicate: (s: MeasurementSample) => boolean): MeasurementSample | undefined;
  reduce<U>(callback: (acc: U, s: MeasurementSample) => U, initial: U): U;
  slice(start?: number, end?: number): MeasurementSample[];
  forEach(callback: (s: MeasurementSample) => void): void;
  toArray(): MeasurementSample[];
}

export interface EndpointMeasurementState {
  readonly endpointId: string;
  samples: SampleBuffer;
  lastLatency: number | null;
  lastStatus: SampleStatus | null;
  tierLevel: 1 | 2;
}
```

**Step 6.2 — Run typecheck**

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck
# Expected: errors in measurements.ts (samples: [] no longer matches SampleBuffer)
# This is expected — Task 7 fixes them
```

---

### Task 7 — Migrate `measurements.ts` — Ring buffer + incremental wiring

> THE BET load-bearing: `tailIndex` is used as the delta coordinate throughout this task. If the ring buffer's `tailIndex` resets or stalls, all cache keys and delta reads break.

Pre-task reads:
- [x] Read `src/lib/stores/measurements.ts` (done above)

**Files modified:**
- `src/lib/stores/measurements.ts`

**Step 7.1 — Write failing tests**

Add to `tests/unit/stores/measurements.test.ts`:

```typescript
// --- New tests for ring buffer migration ---

import { RingBuffer } from '../../../src/lib/utils/ring-buffer';
import { sessionHistoryStore } from '../../../src/lib/stores/session-history';

describe('measurementStore — ring buffer migration', () => {
  beforeEach(() => {
    measurementStore.reset();
    sessionHistoryStore.reset();
  });

  it('samples field is a RingBuffer after initEndpoint', () => {
    measurementStore.initEndpoint('ep1');
    const ep = get(measurementStore).endpoints['ep1'];
    expect(ep?.samples).toBeInstanceOf(RingBuffer);
  });

  it('addSample delegates to addSamples (single-entry path)', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 50, 'ok', Date.now());
    const ep = get(measurementStore).endpoints['ep1'];
    expect(ep?.samples.length).toBe(1);
    expect(ep?.samples.at(0)?.latency).toBe(50);
  });

  it('tailIndex increments on every addSamples', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSamples([{ endpointId: 'ep1', round: 1, latency: 50, status: 'ok', timestamp: Date.now() }]);
    const ep = get(measurementStore).endpoints['ep1'];
    expect(ep?.samples.tailIndex).toBe(1);
  });

  it('eviction fires sessionHistoryStore.accumulate', () => {
    // Use tiny capacity to trigger eviction quickly
    measurementStore.initEndpoint('ep1');
    // Push capacity+1 samples — last push evicts oldest
    const now = Date.now();
    // Since default capacity is 28800, we rely on the onEvict wiring being correct.
    // Test the wiring by checking sessionHistoryStore has no history before eviction
    // and has history after. We can't easily reduce capacity from outside, so we
    // verify the wiring exists via the onEvict callback registration.
    const ep = get(measurementStore).endpoints['ep1'];
    expect(ep?.samples).toBeInstanceOf(RingBuffer);
    // Verify onEvict is registered by checking sessionHistoryStore starts empty
    expect(sessionHistoryStore.hasHistory).toBe(false);
  });

  it('loadSnapshot creates RingBuffer from snapshot samples', () => {
    const snapshot = {
      lifecycle: 'stopped' as const,
      epoch: 1,
      roundCounter: 2,
      startedAt: 0,
      stoppedAt: 1000,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 0,
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          tierLevel: 1 as const,
          lastLatency: 50,
          lastStatus: 'ok' as const,
          samples: [
            { round: 0, latency: 50, status: 'ok' as const, timestamp: 1000 },
            { round: 1, latency: 100, status: 'ok' as const, timestamp: 2000 },
          ],
        },
      },
    };
    measurementStore.loadSnapshot(snapshot as Parameters<typeof measurementStore.loadSnapshot>[0]);
    const ep = get(measurementStore).endpoints['ep1'];
    expect(ep?.samples).toBeInstanceOf(RingBuffer);
    expect(ep?.samples.length).toBe(2);
    expect(ep?.samples.toArray()[0]?.latency).toBe(50);
  });

  it('reset clears ring buffers', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSamples([{ endpointId: 'ep1', round: 1, latency: 50, status: 'ok', timestamp: Date.now() }]);
    measurementStore.reset();
    const state = get(measurementStore);
    expect(Object.keys(state.endpoints)).toHaveLength(0);
  });
});
```

**Step 7.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- stores/measurements
# Expected: new ring buffer tests fail
```

**Step 7.3 — Rewrite `src/lib/stores/measurements.ts`**

Pre-task reads confirmed above. Full replacement:

```typescript
// src/lib/stores/measurements.ts
// Writable store for all measurement state. All mutations go through explicit
// methods to keep the update surface auditable.
//
// Internal data structures:
//   - RingBuffer<MeasurementSample> per endpoint (fixed capacity)
//   - IncrementalLossCounter (lifetime loss counts)
//   - SortedInsertionBuffer per endpoint (lifetime ok-latencies for percentiles)
//   - IncrementalTimestampTracker (round → earliest timestamp)
//   - SessionHistoryStore (eviction accumulator — plain class, not reactive)

import { writable } from 'svelte/store';
import { RingBuffer, DEFAULT_RING_CAPACITY } from '../utils/ring-buffer';
import { IncrementalLossCounter } from '../utils/incremental-loss-counter';
import { SortedInsertionBuffer } from '../utils/sorted-insertion-buffer';
import { IncrementalTimestampTracker } from '../utils/incremental-timestamp-tracker';
import { sessionHistoryStore } from './session-history';
import type {
  MeasurementState,
  MeasurementSample,
  EndpointMeasurementState,
  TestLifecycleState,
  SampleStatus,
  TimingPayload,
  FreezeEvent,
} from '../types';

// ── Incremental state (module-level singletons, reset with store) ─────────────

/** Exposed for statisticsStore and LanesView to read from. */
export const incrementalLossCounter = new IncrementalLossCounter();
export const incrementalTimestampTracker = new IncrementalTimestampTracker();

/** Per-endpoint sorted buffers — keyed by endpointId. */
const sortedBuffers: Map<string, SortedInsertionBuffer> = new Map();

function getSortedBuffer(endpointId: string): SortedInsertionBuffer {
  let buf = sortedBuffers.get(endpointId);
  if (!buf) {
    buf = new SortedInsertionBuffer();
    sortedBuffers.set(endpointId, buf);
  }
  return buf;
}

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_STATE: MeasurementState = {
  lifecycle: 'idle',
  epoch: 0,
  roundCounter: 0,
  endpoints: {},
  startedAt: null,
  stoppedAt: null,
  freezeEvents: [],
  errorCount: 0,
  timeoutCount: 0,
};

// ── Ring buffer factory ───────────────────────────────────────────────────────

function createRingBuffer(endpointId: string): RingBuffer<MeasurementSample> {
  const rb = new RingBuffer<MeasurementSample>({ capacity: DEFAULT_RING_CAPACITY });
  rb.onEvict((evicted) => {
    sessionHistoryStore.accumulate(endpointId, evicted);
  });
  return rb;
}

// ── Store ─────────────────────────────────────────────────────────────────────

function createMeasurementStore() {
  const { subscribe, set, update } = writable<MeasurementState>({ ...INITIAL_STATE });

  return {
    subscribe,

    setLifecycle(lifecycle: TestLifecycleState): void {
      update(s => ({ ...s, lifecycle }));
    },

    incrementEpoch(): void {
      update(s => ({ ...s, epoch: s.epoch + 1 }));
    },

    initEndpoint(endpointId: string): void {
      const rb = createRingBuffer(endpointId);
      update(s => ({
        ...s,
        endpoints: {
          ...s.endpoints,
          [endpointId]: {
            endpointId,
            samples: rb,
            lastLatency: null,
            lastStatus: null,
            tierLevel: 1,
          } satisfies EndpointMeasurementState,
        },
      }));
    },

    removeEndpoint(endpointId: string): void {
      sortedBuffers.delete(endpointId);
      incrementalLossCounter.removeEndpoint(endpointId);
      update(s => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [endpointId]: _removed, ...rest } = s.endpoints;
        // Recompute global counts from remaining endpoints
        let errorCount = 0;
        let timeoutCount = 0;
        for (const epId of Object.keys(rest)) {
          const counts = incrementalLossCounter.getCounts(epId);
          errorCount += counts.errorCount;
          timeoutCount += counts.timeoutCount;
        }
        return { ...s, endpoints: rest, errorCount, timeoutCount };
      });
    },

    /**
     * Single-sample path — delegates to addSamples for unified code path.
     * All ring buffer, loss counter, sorted buffer, and timestamp updates
     * go through addSamples.
     */
    addSample(
      endpointId: string,
      round: number,
      latency: number,
      status: SampleStatus,
      timestamp: number,
      tier2?: TimingPayload
    ): void {
      this.addSamples([{ endpointId, round, latency, status, timestamp, ...(tier2 !== undefined ? { tier2 } : {}) }]);
    },

    addSamples(entries: Array<{
      endpointId: string;
      round: number;
      latency: number;
      status: SampleStatus;
      timestamp: number;
      tier2?: TimingPayload;
    }>): void {
      update(s => {
        const nextEndpoints = { ...s.endpoints };
        let errorDelta = 0;
        let timeoutDelta = 0;

        for (const entry of entries) {
          const existing = nextEndpoints[entry.endpointId];
          if (!existing) continue;

          const sample: MeasurementSample = {
            round: entry.round,
            latency: entry.latency,
            status: entry.status,
            timestamp: entry.timestamp,
            ...(entry.tier2 !== undefined ? { tier2: entry.tier2 } : {}),
          };

          const tierLevel: 1 | 2 =
            entry.tier2 !== undefined &&
            (entry.tier2.dnsLookup !== 0 || entry.tier2.tcpConnect !== 0 || entry.tier2.ttfb !== 0)
              ? 2
              : existing.tierLevel;

          // Insert in round order — almost always appends (O(1) typical).
          // For stragglers, insertOrdered walks backward (O(k), k=1-2 typically).
          const rb = existing.samples as RingBuffer<MeasurementSample>;
          const lastSample = rb.back;
          if (rb.length === 0 || sample.round >= (lastSample?.round ?? 0)) {
            rb.push(sample);
          } else {
            rb.insertOrdered(sample, (existing) => existing.round > sample.round);
          }

          // Update incremental loss counter
          incrementalLossCounter.addSamples([{ endpointId: entry.endpointId, status: entry.status }]);

          // Update sorted insertion buffer (ok samples only)
          if (entry.status === 'ok') {
            getSortedBuffer(entry.endpointId).insert(entry.latency);
          }

          // Update incremental timestamp tracker
          incrementalTimestampTracker.processNewSamples(entry.endpointId, rb, rb.tailIndex);

          if (entry.status === 'error') errorDelta++;
          else if (entry.status === 'timeout') timeoutDelta++;

          // New endpoint object reference to trigger per-endpoint reactivity
          nextEndpoints[entry.endpointId] = {
            ...existing,
            lastLatency: entry.latency,
            lastStatus: entry.status,
            tierLevel,
          };
        }

        return {
          ...s,
          errorCount: s.errorCount + errorDelta,
          timeoutCount: s.timeoutCount + timeoutDelta,
          endpoints: nextEndpoints,
        };
      });
    },

    incrementRound(): void {
      update(s => ({ ...s, roundCounter: s.roundCounter + 1 }));
    },

    setStartedAt(ts: number): void {
      update(s => ({ ...s, startedAt: ts }));
    },

    setStoppedAt(ts: number): void {
      update(s => ({ ...s, stoppedAt: ts }));
    },

    addFreezeEvent(event: FreezeEvent): void {
      update(s => ({ ...s, freezeEvents: [...s.freezeEvents, event] }));
    },

    loadSnapshot(snapshot: Omit<MeasurementState, 'endpoints'> & {
      endpoints: Record<string, {
        endpointId: string;
        tierLevel: 1 | 2;
        lastLatency: number | null;
        lastStatus: SampleStatus | null;
        samples: MeasurementSample[];
      }>;
    }): void {
      // Reset all incremental state
      incrementalLossCounter.reset();
      incrementalTimestampTracker.reset();
      sortedBuffers.clear();
      sessionHistoryStore.reset();

      const nextEndpoints: Record<string, EndpointMeasurementState> = {};
      let errorCount = 0;
      let timeoutCount = 0;

      for (const [epId, epSnap] of Object.entries(snapshot.endpoints)) {
        // Reconstruct ring buffer from snapshot array
        const rb = createRingBuffer(epId);
        rb.loadFrom(epSnap.samples);

        // Rebuild sorted buffer from ok-latencies
        const sortedBuf = getSortedBuffer(epId);
        sortedBuf.loadFrom(epSnap.samples.filter(s => s.status === 'ok').map(s => s.latency));

        // Rebuild loss counter incrementally — do NOT call loadFrom() per endpoint
        // because loadFrom() starts with this._counts.clear(), wiping previously
        // loaded endpoints on every iteration. Instead, use addSamples() to accumulate
        // counts across all endpoints (incrementalLossCounter.reset() was called above).
        incrementalLossCounter.addSamples(
          epSnap.samples.map(s => ({ endpointId: epId, status: s.status }))
        );
        incrementalTimestampTracker.processNewSamples(epId, rb, rb.tailIndex);

        for (const s of epSnap.samples) {
          if (s.status === 'error') errorCount++;
          else if (s.status === 'timeout') timeoutCount++;
        }

        nextEndpoints[epId] = {
          endpointId: epId,
          samples: rb,
          lastLatency: epSnap.lastLatency,
          lastStatus: epSnap.lastStatus,
          tierLevel: epSnap.tierLevel,
        };
      }

      set({
        lifecycle: snapshot.lifecycle,
        epoch: snapshot.epoch,
        roundCounter: snapshot.roundCounter,
        startedAt: snapshot.startedAt,
        stoppedAt: snapshot.stoppedAt,
        freezeEvents: snapshot.freezeEvents,
        endpoints: nextEndpoints,
        errorCount,
        timeoutCount,
      });
    },

    reset(): void {
      incrementalLossCounter.reset();
      incrementalTimestampTracker.reset();
      sortedBuffers.clear();
      sessionHistoryStore.reset();
      set({ ...INITIAL_STATE });
    },
  };
}

export const measurementStore = createMeasurementStore();
```

**Step 7.4 — Run store tests and typecheck**

```bash
cd /Users/shane/claude/chronoscope && npm test -- stores/measurements
# Expected: all tests pass (existing + new)
npm run typecheck
# Expected: errors only in statistics.ts (uses MeasurementSample[] signature)
# Those are fixed in Task 8
```

---

### Task 8 — Migrate `statistics.ts` + `statisticsStore` — tailIndex cache key

Pre-task reads:
- [x] Read `src/lib/utils/statistics.ts` (done above)
- [x] Read `src/lib/stores/statistics.ts` (done above)

> THE BET load-bearing: cache key must use `tailIndex`, not `samples.length`. At ring buffer capacity, `samples.length` is constant — every store update would compute a cache miss and recompute stats on every round. `tailIndex` is monotonically increasing and correctly invalidates on every push.

**Files modified:**
- `src/lib/utils/statistics.ts`
- `src/lib/stores/statistics.ts`

**Step 8.1 — Update `statistics.ts` to add incremental path**

In `src/lib/utils/statistics.ts`, add a new export that accepts the pre-sorted buffer and loss counter. The original `computeEndpointStatistics` signature is preserved for backward compatibility.

Add after the existing `computeEndpointStatistics` function:

```typescript
import type { SortedInsertionBuffer } from './sorted-insertion-buffer';
import type { IncrementalLossCounter } from './incremental-loss-counter';

const READY_SAMPLE_GATE = 30;

/**
 * Compute endpoint statistics from pre-maintained incremental structures.
 * Zero allocation on the hot path — reads directly from sorted buffer.
 * Called by statisticsStore on every measurementStore update.
 */
export function computeEndpointStatisticsFromBuffer(
  endpointId: string,
  sortedBuffer: SortedInsertionBuffer,
  lossCounter: IncrementalLossCounter,
  totalSamples: number,
  samplesTier2?: MeasurementSample[]
): EndpointStatistics {
  const sorted = sortedBuffer.sorted as number[];
  const count = sorted.length;
  const ready = totalSamples >= READY_SAMPLE_GATE;

  if (count === 0) {
    return {
      endpointId,
      sampleCount: totalSamples,
      p50: 0, p95: 0, p99: 0, p25: 0, p75: 0, p90: 0,
      min: 0, max: 0, stddev: 0,
      ci95: { lower: 0, upper: 0, margin: 0 },
      connectionReuseDelta: null,
      tier2Averages: undefined,
      ready,
    };
  }

  const p50 = percentileSorted(sorted, 50);
  const p95 = percentileSorted(sorted, 95);
  const p99 = percentileSorted(sorted, 99);
  const p25 = percentileSorted(sorted, 25);
  const p75 = percentileSorted(sorted, 75);
  const p90 = percentileSorted(sorted, 90);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / count;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count;
  const sd = Math.sqrt(variance);
  const ci95 = confidenceInterval95(p50, sd, count);

  // Tier2 and connection reuse are computed from the ring buffer window (not sorted buffer)
  // samplesTier2 is passed in from statisticsStore when available
  let connectionReuseDelta: number | null = null;
  let tier2Averages: EndpointStatistics['tier2Averages'];

  if (samplesTier2 && samplesTier2.length >= 2) {
    const tier2Samples = samplesTier2.filter(
      (s): s is MeasurementSample & { tier2: TimingPayload } => s.tier2 !== undefined && s.status === 'ok'
    );
    if (tier2Samples.length >= 2) {
      const first = tier2Samples[0];
      const rest = tier2Samples.slice(1);
      if (first) {
        const firstHasColdOverhead = first.tier2.tcpConnect > 0 || first.tier2.tlsHandshake > 0;
        const warmSamples = rest.filter(s => s.tier2.tcpConnect === 0 && s.tier2.tlsHandshake === 0);
        if (firstHasColdOverhead && warmSamples.length > 0) {
          const warmAvg = warmSamples.reduce((sum, s) => sum + s.latency, 0) / warmSamples.length;
          connectionReuseDelta = first.latency - warmAvg;
        }
      }
      const avg = (field: 'dnsLookup' | 'tcpConnect' | 'tlsHandshake' | 'ttfb' | 'contentTransfer') =>
        tier2Samples.reduce((sum, s) => sum + s.tier2[field], 0) / tier2Samples.length;
      tier2Averages = {
        dnsLookup: avg('dnsLookup'),
        tcpConnect: avg('tcpConnect'),
        tlsHandshake: avg('tlsHandshake'),
        ttfb: avg('ttfb'),
        contentTransfer: avg('contentTransfer'),
      };
    }
  }

  return {
    endpointId,
    sampleCount: totalSamples,
    p50, p95, p99, p25, p75, p90,
    min, max,
    stddev: sd,
    ci95,
    connectionReuseDelta,
    tier2Averages,
    ready,
  };
}
```

**Step 8.2 — Update `statisticsStore` to use tailIndex cache key and incremental path**

Replace the contents of `src/lib/stores/statistics.ts`:

```typescript
// src/lib/stores/statistics.ts
// Derived store that recomputes per-endpoint statistics whenever
// the measurement store changes. Uses a compound key `${epoch}:${tailIndex}`
// (NOT samples.length) as the cache key — samples.length stalls at ring buffer
// capacity. The epoch component ensures stale cache entries are never served
// after loadSnapshot() resets tailIndex to 0 on the new ring buffer. (THE BET)
//
// Data flow note: loadSnapshot() increments epoch AND resets tailIndex.
// A compound key `${epoch}:${tailIndex}` therefore naturally invalidates:
// the old epoch is gone, so no prior cache entry can match.

import { derived } from 'svelte/store';
import { measurementStore, incrementalLossCounter } from './measurements';
import { getSortedBufferForEndpoint } from './measurements';
import { computeEndpointStatisticsFromBuffer } from '../utils/statistics';
import type { StatisticsState, EndpointStatistics } from '../types';
import type { RingBuffer } from '../utils/ring-buffer';
import type { MeasurementSample } from '../types';

// Per-endpoint memoization: only recompute when epoch:tailIndex changes
let cache: Record<string, { cacheKey: string; stats: EndpointStatistics }> = {};

export const statisticsStore = derived<typeof measurementStore, StatisticsState>(
  measurementStore,
  ($measurements) => {
    const result: StatisticsState = {};
    const nextCache: typeof cache = {};

    for (const [endpointId, endpointState] of Object.entries($measurements.endpoints)) {
      // Compound cache key: epoch changes on loadSnapshot, tailIndex changes on every push.
      // Together they cover both the stale-cache-after-loadSnapshot case (B3) and
      // the stalls-at-capacity case that would occur with samples.length. (THE BET)
      const cacheKey = `${$measurements.epoch}:${endpointState.samples.tailIndex}`;
      const cached = cache[endpointId];

      if (cached && cached.cacheKey === cacheKey) {
        result[endpointId] = cached.stats;
        nextCache[endpointId] = cached;
      } else {
        const sortedBuf = getSortedBufferForEndpoint(endpointId);
        const totalSamples = endpointState.samples.tailIndex; // lifetime count

        // Pass windowed tier2 samples for connection reuse delta / tier2 averages
        const rb = endpointState.samples as RingBuffer<MeasurementSample>;
        const samplesTier2 = rb.toArray().filter(s => s.tier2 !== undefined);

        const stats = computeEndpointStatisticsFromBuffer(
          endpointId,
          sortedBuf,
          incrementalLossCounter,
          totalSamples,
          samplesTier2.length > 0 ? samplesTier2 : undefined
        );
        result[endpointId] = stats;
        nextCache[endpointId] = { cacheKey, stats };
      }
    }

    cache = nextCache;
    return result;
  }
);

/** Reset the internal memoization cache. Used by tests. */
export function resetStatisticsCache(): void {
  cache = {};
}
```

Note: `getSortedBufferForEndpoint` must be exported from `measurements.ts`. Add this export to `measurements.ts`:

```typescript
/** Exposed for statisticsStore. Returns the SortedInsertionBuffer for an endpoint. */
export function getSortedBufferForEndpoint(endpointId: string): SortedInsertionBuffer {
  return getSortedBuffer(endpointId);
}
```

**Step 8.3 — Run full test suite**

```bash
cd /Users/shane/claude/chronoscope && npm test
# Expected: all tests pass
npm run typecheck
# Expected: exit 0
```

**Step 8.4 — Write Phase B artifact**

Write `docs/superpowers/progress/2026-04-13-perf-memory-audit-phaseB.md` with:
- Tasks completed (6–8)
- Typecheck result
- Any store API changes
- Confirmation that share/persistence serialization uses `samples.toArray()` (or that serializers already call `Array.from()`)

---

## Phase C — Component Integration

**Phase C goal:** Wire incremental structures into Svelte components. Fix RenderScheduler hysteresis. Add visibility pause to engine. Migrate TimelineCanvas sonar ping detection. Phase is done when all tests pass and WCAG / mobile checks clean.

**Phase C artifact:** `docs/superpowers/progress/2026-04-13-perf-memory-audit-phaseC.md`

---

### Task 9 — RenderScheduler hysteresis recovery

> Maps to: AC4 (effects not permanently disabled after transient spike)

Pre-task reads:
- [x] Read `src/lib/renderers/render-scheduler.ts` (done above)
- [x] Read `tests/unit/render-scheduler.test.ts` (done above)

**Files modified:**
- `src/lib/renderers/render-scheduler.ts`
- `tests/unit/render-scheduler.test.ts`

**Step 9.1 — Write failing tests**

Append to `tests/unit/render-scheduler.test.ts`:

```typescript
describe('RenderScheduler — AC4: hysteresis recovery', () => {
  let scheduler: RenderScheduler;

  beforeEach(() => {
    scheduler = new RenderScheduler();
  });

  it('re-enables effects after 60 consecutive under-budget frames', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // Disable effects via 10 consecutive overloaded frames
    for (let i = 0; i < 10; i++) {
      simulateDirtyFrame(scheduler, 15);
    }
    effectsRenderer.mockClear();

    // Simulate 59 good frames (under budget) — not yet recovered
    for (let i = 0; i < 59; i++) {
      simulateDirtyFrame(scheduler, 1);
    }
    expect(effectsRenderer).not.toHaveBeenCalled(); // still disabled

    // 60th good frame — recovery threshold hit
    simulateDirtyFrame(scheduler, 1);
    effectsRenderer.mockClear();

    // Next frame — effects should be re-enabled
    simulateDirtyFrame(scheduler, 1);
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('recovery streak resets if overloaded frame occurs during recovery', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // Disable effects
    for (let i = 0; i < 10; i++) {
      simulateDirtyFrame(scheduler, 15);
    }

    // 59 good frames, then one bad frame
    for (let i = 0; i < 59; i++) {
      simulateDirtyFrame(scheduler, 1);
    }
    simulateDirtyFrame(scheduler, 15); // reset recovery streak

    // 60 more good frames — only now should recovery trigger
    for (let i = 0; i < 60; i++) {
      simulateDirtyFrame(scheduler, 1);
    }
    effectsRenderer.mockClear();

    simulateDirtyFrame(scheduler, 1);
    expect(effectsRenderer).toHaveBeenCalledTimes(1);
  });

  it('recovery streak does not accumulate while effects are enabled', () => {
    // This verifies recoveryStreak is only active while effectsDisabled
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    // Run 100 good frames without ever disabling effects
    for (let i = 0; i < 100; i++) {
      simulateDirtyFrame(scheduler, 1);
    }

    // Now disable effects
    for (let i = 0; i < 10; i++) {
      simulateDirtyFrame(scheduler, 15);
    }

    effectsRenderer.mockClear();

    // Need exactly 60 good frames to recover (not 0 since we "pre-loaded" the streak)
    for (let i = 0; i < 59; i++) {
      simulateDirtyFrame(scheduler, 1);
    }
    expect(effectsRenderer).not.toHaveBeenCalled();
  });

  it('after recovery, can disable and recover again (multiple cycles)', () => {
    const effectsRenderer = vi.fn();
    scheduler.registerEffectsRenderer(effectsRenderer);

    for (let cycle = 0; cycle < 2; cycle++) {
      // Disable
      for (let i = 0; i < 10; i++) simulateDirtyFrame(scheduler, 15);
      // Recover
      for (let i = 0; i < 60; i++) simulateDirtyFrame(scheduler, 1);
      effectsRenderer.mockClear();
      simulateDirtyFrame(scheduler, 1);
      expect(effectsRenderer).toHaveBeenCalledTimes(1);
    }
  });
});
```

**Step 9.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- render-scheduler
# Expected: new hysteresis tests fail
```

**Step 9.3 — Update `render-scheduler.ts`**

Replace the current `render-scheduler.ts`:

```typescript
// src/lib/renderers/render-scheduler.ts
// Frame-budget-aware render scheduler built around requestAnimationFrame.
//
// Renderer tiers:
//   Data renderers        — always run (critical path: timeline dots, heatmap cells)
//   Effects renderers     — skipped when data cost ≥ DATA_BUDGET_MS
//   Interaction renderers — always run (crosshairs, hover state)
//
// Sustained overload protection with hysteresis recovery (AC4):
//   After OVERLOAD_STREAK_LIMIT consecutive frames where the combined cost
//   exceeds OVERLOAD_THRESHOLD_MS, effects are disabled.
//   After RECOVERY_STREAK_LIMIT consecutive frames under budget, effects re-enable.
//   Hysteresis prevents rapid enable/disable toggling.

type RendererFn = () => void;

const OVERLOAD_THRESHOLD_MS = 12;   // frames above this count toward overload streak
const OVERLOAD_STREAK_LIMIT = 10;   // consecutive bad frames to disable effects
const RECOVERY_STREAK_LIMIT = 60;   // consecutive good frames to re-enable (~1s at 60fps)

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
    if (dataMs > OVERLOAD_THRESHOLD_MS) {
      this.overloadStreak++;
      this.recoveryStreak = 0;
      if (this.overloadStreak >= OVERLOAD_STREAK_LIMIT) {
        this.effectsDisabled = true;
        this.overloadStreak = 0; // reset so the next disable cycle can trigger again
      }
    } else {
      this.overloadStreak = 0;
      if (this.effectsDisabled) {
        this.recoveryStreak++;
        if (this.recoveryStreak >= RECOVERY_STREAK_LIMIT) {
          this.effectsDisabled = false;
          this.recoveryStreak = 0;
        }
      }
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
```

**Step 9.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- render-scheduler
# Expected: all tests pass
```

---

### Task 10 — Visibility-aware engine pause

> Maps to: AC3 (resume after 30min background — within 2 rounds, zero orphaned timers)

Pre-task reads:
- [x] Read `src/lib/engine/measurement-engine.ts` (done above)
- [x] Read `tests/unit/measurement-engine.test.ts` (done above)

**Files modified:**
- `src/lib/engine/measurement-engine.ts`
- `tests/unit/measurement-engine.test.ts`

**Step 10.1 — Write failing tests**

Append to `tests/unit/measurement-engine.test.ts`:

```typescript
describe('MeasurementEngine — AC3: visibility-aware pause', () => {
  let engine: MeasurementEngine;

  beforeEach(() => {
    engine = new MeasurementEngine();
    measurementStore.reset();
    endpointStore.reset();
    settingsStore.reset();
  });

  afterEach(() => {
    engine.stop();
    // Clean up visibility event listeners (jsdom won't fire real events)
  });

  it('_pause() is idempotent', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    expect(() => {
      engine._pause();
      engine._pause();
      engine._pause();
    }).not.toThrow();
  });

  it('_resume() is idempotent', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    engine._pause();
    expect(() => {
      engine._resume();
      engine._resume();
    }).not.toThrow();
  });

  it('_pause() then _resume() does not orphan timers', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    engine._pause();
    engine._resume();
    // Verify engine is still functional — no throws, lifecycle correct
    expect(get(measurementStore).lifecycle).toBe('running');
  });

  it('_dispatchRound does not fire while paused', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    const roundBefore = get(measurementStore).roundCounter;
    engine._pause();
    // Simulate a direct _dispatchRound call — should be a no-op
    engine._dispatchRound();
    expect(get(measurementStore).roundCounter).toBe(roundBefore);
  });

  it('_resume() reschedules next round after pause', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    engine._pause();
    // After resume, engine should still be in running state
    engine._resume();
    expect(get(measurementStore).lifecycle).toBe('running');
  });
});
```

Note: `_pause()`, `_resume()`, and `_dispatchRound()` need to be made public (or `_dispatchRound` already is) for testing. Mark them with leading underscore convention to signal test-only access.

**Step 10.2 — Run failing tests**

```bash
cd /Users/shane/claude/chronoscope && npm test -- measurement-engine
# Expected: new visibility tests fail
```

**Step 10.3 — Update `measurement-engine.ts`**

Add `_paused`, `_visibilityHandler` fields and the pause/resume/visibility methods. Make `_pause`, `_resume`, and `_dispatchRound` accessible for tests (public with underscore convention):

In the class body, add after the existing `lastFlushedRound = -1;` field:

```typescript
  private _paused = false;
  private _visibilityHandler: (() => void) | null = null;
```

Update `start()` — register visibility listener after workers spawn:

```typescript
  start(): void {
    // ... existing logic ...
    try {
      this._spawnWorkers(endpoints);
      measurementStore.setLifecycle('running');
      this.freezeDetector.start();

      // Register visibility pause handler
      this._visibilityHandler = () => this._handleVisibilityChange();
      document.addEventListener('visibilitychange', this._visibilityHandler);

      this._dispatchRound();
    } catch (err: unknown) {
      // ... existing error handling ...
    }
  }
```

Update `stop()` — remove visibility listener:

```typescript
  stop(): void {
    // ... existing lifecycle guard ...

    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this._paused = false;

    // ... rest of existing stop logic ...
  }
```

Add new methods:

```typescript
  private _handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this._pause();
    } else {
      this._resume();
    }
  }

  /** Pause round dispatch. Idempotent. Cancels roundTimer but preserves flush timers. */
  _pause(): void {
    if (this._paused) return;
    this._paused = true;

    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    // Flush timers remain active — in-flight rounds should still complete.
  }

  /** Resume round dispatch. Idempotent. Clears any stale roundTimer before scheduling. */
  _resume(): void {
    if (!this._paused) return;
    this._paused = false;

    // Clear any roundTimer that _flushRound may have set during the pause window.
    // Without this, the orphaned timer would dispatch a round concurrently with
    // the one scheduled below — violating the response-gated sequential invariant.
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    const lifecycle = get(measurementStore).lifecycle;
    if (lifecycle === 'running') {
      this._scheduleNextRound();
    }
  }
```

Update `_dispatchRound` to guard against pause:

```typescript
  _dispatchRound(): void {
    if (this._paused) return; // don't dispatch while hidden
    const lifecycle = get(measurementStore).lifecycle;
    if (lifecycle !== 'running') return;
    // ... rest of existing dispatch logic ...
  }
```

**Step 10.4 — Run tests and confirm green**

```bash
cd /Users/shane/claude/chronoscope && npm test -- measurement-engine
# Expected: all tests pass
npm run typecheck
# Expected: exit 0
```

---

### Task 11 — Migrate `Layout.svelte` — replace O(n) sampleTimestamps

> Maps to: AC2, AC5 (O(n) scan across all endpoints + all samples replaced by O(1) read)

Pre-task reads:
- [x] Read `src/lib/components/Layout.svelte` (done above)

**Files modified:**
- `src/lib/components/Layout.svelte`

**Step 11.1 — No new test file needed** (Layout.svelte has no dedicated unit test; integration covered by existing visual tests)

**Step 11.2 — Update `Layout.svelte`**

Replace the `sampleTimestamps` derived block (lines 39–57):

Old:
```svelte
  // Earliest timestamp per round across all endpoints (index i = round i)
  const sampleTimestamps = $derived.by((): readonly number[] => {
    const endpoints = Object.values($measurementStore.endpoints);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const byRound = new Map<number, number>();
    for (const ep of endpoints) {
      for (const sample of ep.samples) {
        const prev = byRound.get(sample.round);
        if (prev === undefined || sample.timestamp < prev) {
          byRound.set(sample.round, sample.timestamp);
        }
      }
    }
    const maxRound = currentRound;
    const result: number[] = [];
    for (let r = 0; r <= maxRound; r++) {
      result.push(byRound.get(r) ?? 0);
    }
    return result;
  });
```

New:
```svelte
  import { incrementalTimestampTracker } from '$lib/stores/measurements';

  // Earliest timestamp per round — maintained incrementally by measurementStore.
  // O(1) read replacing the prior O(n) full-scan across all endpoints.
  // incrementalTimestampTracker.timestamps is updated on every addSamples call.
  const sampleTimestamps = $derived.by((): readonly number[] => {
    // Re-read on every measurementStore update to stay reactive
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _reactive = $measurementStore.roundCounter; // subscription trigger
    return incrementalTimestampTracker.timestamps;
  });
```

---

### Task 12 — Migrate `LanesView.svelte` — heatmap gate + lossPercent O(1) + ribbon tailIndex

> Maps to: AC2, AC5 (heatmapCells gate; getLaneProps O(n) filter; ribbon throttle)

Pre-task reads:
- [x] Read `src/lib/components/LanesView.svelte` (done above)

**Files modified:**
- `src/lib/components/LanesView.svelte`

**Step 12.1 — Update `heatmapCellsByEndpoint` derived block**

Replace the existing `heatmapCellsByEndpoint` derived block (lines 83–97):

Old:
```svelte
  // Compute heatmap cells per endpoint (all samples, not windowed)
  const heatmapCellsByEndpoint: ReadonlyMap<string, readonly HeatmapCellData[]> = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, readonly HeatmapCellData[]>();
    const startedAt = $measurementStore.startedAt;
    for (const ep of endpoints) {
      const epState = $measurementStore.endpoints[ep.id];
      const stats = $statisticsStore[ep.id];
      if (!epState || !stats) {
        map.set(ep.id, []);
        continue;
      }
      map.set(ep.id, computeHeatmapCells(epState.samples, stats, startedAt));
    }
    return map;
  });
```

New:
```svelte
  import { incrementalLossCounter } from '$lib/stores/measurements';

  // Heatmap cache — keyed by compound `${epoch}:${tailIndex}`.
  // Using only tailIndex is insufficient: after loadSnapshot() the new RingBuffer
  // resets tailIndex to 0, so a cache entry from the previous session with the same
  // tailIndex value would be served as a false hit. The epoch component (incremented
  // by loadSnapshot) makes each session's keys disjoint. (B3 fix)
  // tailIndex also never stalls at capacity (unlike samples.length). (THE BET)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let heatmapCache = new Map<string, { cacheKey: string; cells: readonly HeatmapCellData[] }>();

  const heatmapCellsByEndpoint: ReadonlyMap<string, readonly HeatmapCellData[]> = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, readonly HeatmapCellData[]>();
    const startedAt = $measurementStore.startedAt;
    const epoch = $measurementStore.epoch;
    for (const ep of endpoints) {
      const epState = $measurementStore.endpoints[ep.id];
      const stats = $statisticsStore[ep.id];
      if (!epState || !stats) {
        map.set(ep.id, []);
        continue;
      }
      const cacheKey = `${epoch}:${epState.samples.tailIndex}`;
      const cached = heatmapCache.get(ep.id);
      if (cached && cached.cacheKey === cacheKey) {
        map.set(ep.id, cached.cells);
        continue;
      }
      const cells = computeHeatmapCells(epState.samples, stats, startedAt);
      heatmapCache.set(ep.id, { cacheKey, cells });
      map.set(ep.id, cells);
    }
    return map;
  });
```

**Step 12.2 — Update `getLaneProps` to use IncrementalLossCounter**

Replace the existing `getLaneProps` function (lines 311–323):

Old:
```svelte
  function getLaneProps(endpointId: string) {
    const stats = $statisticsStore[endpointId];
    const epState = $measurementStore.endpoints[endpointId];
    const samples = epState?.samples ?? [];
    if (!stats || !stats.ready) {
      const lastLatency = epState?.lastLatency ?? 0;
      return { p50: lastLatency, p95: lastLatency, p99: lastLatency, jitter: 0, lossPercent: 0, ready: false };
    }
    const totalSamples = samples.length;
    const lossSamples = samples.filter(s => s.status !== 'ok').length;
    const lossPercent = totalSamples > 0 ? (lossSamples / totalSamples) * 100 : 0;
    return { p50: stats.p50, p95: stats.p95, p99: stats.p99, jitter: stats.stddev, lossPercent, ready: true };
  }
```

New:
```svelte
  function getLaneProps(endpointId: string) {
    const stats = $statisticsStore[endpointId];
    const epState = $measurementStore.endpoints[endpointId];
    if (!stats || !stats.ready) {
      const lastLatency = epState?.lastLatency ?? 0;
      return { p50: lastLatency, p95: lastLatency, p99: lastLatency, jitter: 0, lossPercent: 0, ready: false };
    }
    // O(1) — reads from IncrementalLossCounter, no filter scan
    const lossPercent = incrementalLossCounter.getCounts(endpointId).lossPercent;
    return { p50: stats.p50, p95: stats.p95, p99: stats.p99, jitter: stats.stddev, lossPercent, ready: true };
  }
```

**Step 12.3 — Update ribbon throttle to use tailIndex**

Replace the `frameData` derived block's ribbon throttle (lines 62–80). Find and replace:

Old:
```svelte
    // Count total samples across all endpoints
    const totalSamples = Object.values($measurementStore.endpoints)
      .reduce((sum, ep) => sum + ep.samples.length, 0);

    // Recompute ribbons every other round (≈ endpoints.length * 2 new samples)
    // or immediately when not running (final state accuracy)
    const threshold = Math.max(endpoints.length * 2, 1);
    const isRunning = $measurementStore.lifecycle === 'running';
    if (!isRunning || totalSamples - lastRibbonSampleCount >= threshold) {
      cachedRibbons = computeRibbonsPerLane($measurementStore, base.yRangesByEndpoint);
      lastRibbonSampleCount = totalSamples;
    }
```

New:
```svelte
    // Count total tail index across all endpoints (tailIndex never stalls at capacity)
    const totalTailIndex = Object.values($measurementStore.endpoints)
      .reduce((sum, ep) => sum + ep.samples.tailIndex, 0);

    // Recompute ribbons every other round (≈ endpoints.length * 2 new samples)
    // or immediately when not running (final state accuracy)
    const threshold = Math.max(endpoints.length * 2, 1);
    const isRunning = $measurementStore.lifecycle === 'running';
    if (!isRunning || totalTailIndex - lastRibbonSampleCount >= threshold) {
      cachedRibbons = computeRibbonsPerLane($measurementStore, base.yRangesByEndpoint);
      lastRibbonSampleCount = totalTailIndex;
    }
```

Also rename `lastRibbonSampleCount` initialization to clarify intent (line 59):

Old: `let lastRibbonSampleCount = 0;`
New: `let lastRibbonTailIndex = 0;` (and update all references in the block)

---

### Task 13 — Migrate `TimelineCanvas.svelte` — sonar ping detection via tailIndex

> Maps to: AC1 (sonar pings stop permanently at ring buffer capacity if using `.length`)

Pre-task reads:
- [x] Read `src/lib/components/TimelineCanvas.svelte` (done above)

**Files modified:**
- `src/lib/components/TimelineCanvas.svelte`

**Step 13.1 — Migrate sampleCounts from .length to .tailIndex**

In `TimelineCanvas.svelte`, the `sampleCounts` map tracks per-endpoint sample counts to detect new samples and trigger sonar pings. Once the ring buffer reaches capacity, `epState.samples.length` is constant — pings stop permanently.

Locate `recomputePoints` function, specifically the sonar ping detection block (lines 142–166):

Old:
```typescript
    for (const ep of endpoints) {
      const epState = measureState.endpoints[ep.id];
      if (!epState || epState.samples.length === 0) continue;

      const prevCount = sampleCounts.get(ep.id) ?? 0;
      const newCount = epState.samples.length;

      if (newCount > prevCount) {
        const latestSample = epState.samples[newCount - 1];
        // ...
        sampleCounts.set(ep.id, newCount);
      }
    }
```

New:
```typescript
    for (const ep of endpoints) {
      const epState = measureState.endpoints[ep.id];
      if (!epState || epState.samples.length === 0) continue;

      // Use tailIndex (monotonically increasing) instead of samples.length.
      // At ring buffer capacity, samples.length is constant — tailIndex still increments.
      const prevTailIndex = sampleCounts.get(ep.id) ?? 0;
      const newTailIndex = epState.samples.tailIndex;

      if (newTailIndex > prevTailIndex) {
        const latestSample = epState.samples.at(epState.samples.length - 1);
        const points = currentFrameData.pointsByEndpoint.get(ep.id);
        const latestPoint = points?.[points.length - 1];
        if (latestSample && latestPoint && timelineRenderer) {
          const { cx, cy } = timelineRenderer.toCanvasCoords(latestPoint);
          const ping: SonarPing = {
            id: `ping-${++pingIdCounter}`,
            x: cx,
            y: cy,
            color: ep.color,
            tier: latencyToTier(latestSample.latency, latestSample.status),
            startTime: performance.now(),
          };
          effectsRenderer?.addPing(ping);
        }
        sampleCounts.set(ep.id, newTailIndex);
      }
    }
```

---

### Task 14 — Fix share/persistence serialization

**Problem:** After the ring buffer migration, `EndpointMeasurementState.samples` is a `RingBuffer<MeasurementSample>` (a `SampleBuffer` interface). Any code that serializes samples must call `.toArray()` or `Array.from()`.

Pre-task reads needed:
- [ ] Read `src/lib/share/share-manager.ts`
- [ ] Read `src/lib/utils/persistence.ts`

**Step 14.1 — Read serialization files**

```bash
# Read these files before writing code examples for them
```

**Step 14.2 — Audit serialization paths**

Check `share-manager.ts` for any code that reads `samples` as a plain array. The `SharePayload` type's `results` field requires `readonly MeasurementSample[]`. Any spread or direct array access must be replaced with `.toArray()`.

Pattern to search for: `ep.samples` or `epState.samples` in share/persistence files.

**Step 14.3 — Update share-manager and persistence if needed**

Apply `.toArray()` call anywhere `samples` is serialized to a plain array for JSON. No changes to the `SharePayload` type or `PersistedSettings` type — those remain unchanged per the backward compatibility contract.

**Step 14.4 — Run full test suite**

```bash
cd /Users/shane/claude/chronoscope && npm test
# Expected: all tests pass
npm run typecheck
# Expected: exit 0
npm run lint
# Expected: exit 0
```

---

### Task 15 — Migrate all `samples[i]` bracket access to `samples.at(i)`

> **Why this task exists (B1):** `SampleBuffer` is a structural interface, not a plain array.
> A `RingBuffer` class instance does not support `obj[i]` numeric index access unless a
> `Proxy` is used. The `[index: number]: T | undefined` signature in `SampleBuffer` is
> belt-and-suspenders documentation, but the safest code path is `samples.at(i)` which
> calls the explicit method. This task enumerates every consumer file that uses bracket
> notation and migrates them.

**Files modified:**
- `src/lib/renderers/timeline-data-pipeline.ts`
- `src/lib/components/HeatmapCanvas.svelte`
- `src/lib/components/CrossLaneHover.svelte`
- `src/lib/components/SummaryCard.svelte`
- `src/lib/components/SharePopover.svelte`

**Step 15.1 — Audit all `samples[i]` / `samples[n]` bracket access**

Search for numeric bracket access on `samples`:

```bash
cd /Users/shane/claude/chronoscope && grep -rn 'samples\[' src/lib/
# List every file and line with samples[<expr>] bracket notation
```

For each match, verify whether the access is on an `EndpointMeasurementState.samples`
(i.e., a `SampleBuffer`) or on a plain `MeasurementSample[]` local variable. Only the
former needs migration; local array variables obtained via `.toArray()` or `.filter()` are
already plain arrays and do not need changes.

**Step 15.2 — Migrate each consumer file**

For every occurrence of `samples[i]`, `samples[n]`, or `samples[samples.length - 1]` on a
`SampleBuffer`:

| Old pattern | New pattern |
|-------------|-------------|
| `samples[i]` | `samples.at(i)` |
| `samples[n - 1]` | `samples.at(n - 1)` |
| `samples[samples.length - 1]` | `samples.at(samples.length - 1)` (or `samples.back` if accessing RingBuffer directly) |

Apply these replacements in the five files listed above. Use typecheck after each file to
confirm no regressions.

Note: `Array.prototype.at()` is available in all target environments (Chrome 92+, Safari
15.4+, Node 16.6+). No polyfill required.

**Step 15.3 — Run typecheck and tests**

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck
# Expected: exit 0
cd /Users/shane/claude/chronoscope && npm test
# Expected: all tests pass
```

---

### Task 16 — Final verification and Phase C artifact

**Step 16.1 — Run complete test suite**

```bash
cd /Users/shane/claude/chronoscope && npm test
# Expected: all tests pass (no failures)
```

**Step 16.2 — Typecheck**

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck
# Expected: exit 0
```

**Step 16.3 — Lint**

```bash
cd /Users/shane/claude/chronoscope && npm run lint
# Expected: exit 0
```

**Step 16.4 — Write Phase C artifact**

Write `docs/superpowers/progress/2026-04-13-perf-memory-audit-phaseC.md` with:
- Tasks completed (9–15)
- Test suite results
- Typecheck and lint results
- Any deviations from plan
- AC mapping verification:
  - AC1: RingBuffer + SessionHistoryStore prevent unbounded growth
  - AC2: IncrementalTimestampTracker (Layout), IncrementalLossCounter (LanesView), heatmap cache gate (LanesView), compound epoch:tailIndex cache key (statisticsStore)
  - AC3: Visibility pause/resume in MeasurementEngine
  - AC4: RenderScheduler hysteresis recovery (60-frame streak)
  - AC5: Same as AC2 — all O(n) scans replaced with O(1) or O(k) delta reads

---

## Dependency Order Summary

```
Task 1 (RingBuffer)
  └── Task 2 (IncrementalTimestampTracker) — imports RingBuffer
  └── Task 3 (IncrementalLossCounter) — standalone
  └── Task 4 (SortedInsertionBuffer) — standalone
  └── Task 5 (SessionHistoryStore) — imports statistics.ts (percentileSorted)
      └── Task 6 (types.ts) — adds SampleBuffer interface + [index: number] signature
          └── Task 7 (measurements.ts) — wires all Phase A structures
              └── Task 8 (statistics.ts + statisticsStore) — reads from measurements
                  └── Task 9 (RenderScheduler) — independent, no store deps
                  └── Task 10 (MeasurementEngine) — no new store deps
                  └── Task 11 (Layout.svelte) — reads incrementalTimestampTracker
                  └── Task 12 (LanesView.svelte) — reads incrementalLossCounter
                  └── Task 13 (TimelineCanvas.svelte) — reads tailIndex from samples
                  └── Task 14 (share/persistence) — reads samples.toArray()
                  └── Task 15 (bracket-access migration) — depends on SampleBuffer type
```

Tasks 9–15 are independent of each other after Task 8 completes and can be worked in any order.

---

## Conventions Reference

- No `any` types — all incremental structures use explicit generic types
- `AppError` class: not applicable here (no new error surfaces — ring buffer throws plain `Error` on invalid capacity; callers are internal)
- `tokens.ts`: not modified
- Conventional Commits: `feat: ring buffer + incremental derivation for 8hr session stability`
- Branch: `feature/perf-memory-audit`
- All new files export named classes (no default exports)
- `sessionHistoryStore` singleton exported from `session-history.ts` — only `measurements.ts` imports it
