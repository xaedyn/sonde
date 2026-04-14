---
date: 2026-04-13
feature: perf-memory-audit
type: design-spec
approach: "Approach 1: Ring Buffer + Incremental Derivation"
bet: "A fixed ring capacity of ~28,800 samples per endpoint is large enough for any practical session, and incremental delta tracking through Svelte's reactive graph won't introduce stale-data bugs."
---

# Design Spec — Performance & Memory Audit

## 1. Problem

Users running Chronoscope for multi-hour sessions experience progressive degradation: heap memory grows monotonically as sample arrays accumulate without bound, O(n) derived computations in Layout.svelte and LanesView.svelte slow down proportionally to total sample count, and a transient CPU spike during burst phase permanently disables sonar effects with no recovery path. Backgrounding the tab wastes resources dispatching rounds and running rAF callbacks that no one can see.

At 2 endpoints x 1 Hz x 8 hours, 57,600 samples per endpoint accumulate. The raw memory (~14MB) is manageable, but the downstream O(n) scans that fire on every store update turn a 1ms operation into 10ms+ at high counts, dropping frames. Users with 10 endpoints hit this ceiling in under 2 hours.

## 2. Success Metrics

All five ACs from the acceptance criteria document define "done":

| AC | Metric | Threshold | Measurement Method |
|----|--------|-----------|-------------------|
| AC1 | Heap memory after 8hr session (2 endpoints, 1 Hz) | < 150MB, no monotonic growth after t=10min | Chrome DevTools heap snapshots at t=10min, t=1hr, t=4hr, t=8hr |
| AC2 | Per-round store update + derived recomputation (10 endpoints) | < 4ms total | `performance.now()` instrumentation around `addSamples` + reactive flush |
| AC3 | Resume after 30min background | Within 2 rounds, zero orphaned timers/workers | Worker count + timer count before/after background cycle |
| AC4 | Individual rAF callback duration at steady state | No frame > 16ms; effects not permanently disabled | Profile 1000 consecutive frames at steady state with 10 endpoints |
| AC5 | Derived computation cost at 50K total samples | < 2ms per store update for sampleTimestamps, heatmapCells, laneProps | `performance.mark()` around each derived block |

## 3. Out of Scope

| Excluded | Reason |
|----------|--------|
| IndexedDB persistence for evicted samples | YAGNI — no user has requested historical replay; ring buffer capacity covers any practical session |
| Web Worker pooling or SharedWorker | Worker-per-endpoint is fine at MAX_ENDPOINTS=10; worker memory is isolated (own V8 isolate) |
| Virtual scrolling for lanes | MAX_ENDPOINTS=10 is too few to need it |
| Canvas 2D replacement for SVG rendering | SVG perf is fine within the 60-dot visible window |
| GPU/animation optimization (backdrop-filter reduction, SMIL-to-CSS migration) | Identified in the brief as moderate; separate concern from memory/compute audit; will be addressed in a follow-up |
| Detailed results page UI | SessionHistoryStore is write-only infrastructure; the consumer is a future feature |
| Online/approximate percentile algorithms (t-digest, Welford) | Approach 1 uses exact sorted-insertion buffer; no approximation needed |
| `freezeEvents` array capping | Freeze events fire only when a >1000ms gap is detected — structurally rare (a few per hour at worst under heavy CPU load). At ~40 bytes per event, even 1000 events = 40KB. The CCB flagged this as LOW severity. If a future scenario generates high-frequency freeze events, a ring buffer can be trivially applied — same pattern as samples. |

## 4. Security Surface

### New Attack Surface

None. All changes are internal data structure swaps behind existing APIs. No new endpoints, no new user-controlled inputs, no new auth paths.

### Existing Mitigations (Unchanged)

- **Malicious share URL:** `validateSharePayload` already caps at 10,000 samples/endpoint and 50 endpoints. Both are below ring buffer capacity.
- **`loadSnapshot` injection:** Share restore pushes into ring buffer via existing validation path. `truncatePayload()` already truncates payloads below ring capacity.

### PII Classification

- **Ring buffer contents:** Same `MeasurementSample` data as today (round number, latency number, status enum, timestamp, optional timing breakdown). No PII — only numeric network measurements against user-configured URLs.
- **SessionHistoryStore:** Aggregated statistics (count, min, max, mean, percentiles, error/timeout counts). Strictly less identifying than raw samples. Session-only, in-memory, not persisted to localStorage, not included in share payloads, not exposed to any existing consumer.

## 5. Rollout

### Deployment

Single atomic Cloudflare Pages deployment. No server-side state, no database migrations, no feature flags needed.

### Backward Compatibility

| Surface | Impact |
|---------|--------|
| `measurementStore` public API (`addSamples`, `initEndpoint`, `removeEndpoint`, `loadSnapshot`) | **No change** — identical signatures. Ring buffer is an internal implementation detail. |
| `EndpointStatistics` shape | **No change** — `StatisticsState` type is preserved exactly. |
| `WorkerToMainMessage` / `MainToWorkerMessage` wire format | **No change** — worker messages are unchanged. |
| Share payload (`SharePayload` type) | **No change** — serialization calls `ringBuffer.toArray()` which produces a plain `MeasurementSample[]`. |
| Persisted settings (`PersistedSettings`) | **No change** — persistence stores endpoints/settings/UI state only, not samples. |
| `MeasurementState.endpoints[id].samples` | **Internal change** — type narrows from `MeasurementSample[]` to `RingBuffer<MeasurementSample>`. `RingBuffer` must implement the `ReadonlyArray<T>` interface (via structural typing: `length`, `[index: number]`, `[Symbol.iterator]`, `filter()`, `map()`, `slice()`, `forEach()`, `find()`, `reduce()`) so existing consumers that use array methods continue to type-check. Any code using `.push()` or `.splice()` is internal to `measurementStore` and will be updated. |
| `measurementStore.addSample()` (singular) | **Redirected** — `addSample()` will be reimplemented to delegate to `addSamples()` with a single-entry array, ensuring all ring buffer, loss counter, sorted buffer, and timestamp tracker updates go through the same code path. Existing tests call `addSample()` directly and must continue to work. |

### Rollback Plan

Revert the deployment to the previous Cloudflare Pages build. Ring buffer is behind the same store API; reverting to unbounded arrays is a data-structure swap with no consumer changes. No data migration needed in either direction — samples are ephemeral session state.

## 6. Edge Cases

### Empty State

- **Ring buffer at capacity 0 samples:** `RingBuffer` constructor requires `capacity >= 1`. An endpoint initialized but never measured has `length === 0`; all derived computations return their zero/empty defaults (same as today).
- **SessionHistoryStore with no evictions:** Store remains empty. Future detailed results page must handle the case where no compaction has occurred (session shorter than ring capacity).

### Error State

- **All samples are errors/timeouts:** `SortedInsertionBuffer` for latencies will be empty (only `ok` samples insert). `computeEndpointStatistics` already handles `okSamples.length === 0` — returns zero stats. `IncrementalLossCounter` correctly counts 100% loss.
- **Ring buffer eviction of error samples:** Evicted error/timeout samples are compacted into `SessionHistoryStore.errorCount` and `timeoutCount` before eviction. Running loss counters in `IncrementalLossCounter` remain accurate because they track lifetime totals, not ring buffer contents.

### Concurrent Modification

- **No concurrent ring buffer writes:** Engine processes worker messages sequentially on the main thread via `_flushRound`. The Svelte store `update()` callback is synchronous. No race conditions possible.
- **`loadSnapshot` during active measurement:** `loadSnapshot` replaces the entire store state atomically (existing behavior). Ring buffers are reconstructed from the snapshot's sample arrays. Any in-flight round responses with the old epoch are discarded by the epoch guard.
- **`removeEndpoint` during active measurement:** Existing behavior — removes the endpoint's worker, deletes the endpoint state. Ring buffer and associated incrementals for that endpoint are garbage collected. `SessionHistoryStore` retains the compacted history for the removed endpoint (keyed by endpointId).

### Permission Boundaries

- **SessionHistoryStore isolation:** The store is a separate module export, not embedded in `measurementStore`. It has no `subscribe` registered by persistence, share, or engine code. Only the future detailed results page will import it. This prevents accidental leakage of session data into shared URLs or localStorage.

### Visibility Transitions

- **Rapid tab switching:** Each `visibilitychange` to `hidden` pauses dispatch + rAF. Each `visibilitychange` to `visible` resumes. No debounce needed — pausing is idempotent, and resuming simply schedules the next round. The epoch guard discards any stale worker responses that arrive during the pause.
- **Tab backgrounded during burst phase:** Burst counter is preserved. On resume, remaining burst rounds continue at 0ms delay, then transition to monitor cadence as normal.
- **Worker behavior when backgrounded:** Workers have their own event loop and are not throttled by the browser's background tab policy. However, since the engine stops dispatching new rounds, workers sit idle. On resume, the engine dispatches a fresh round — no stale worker state accumulates.

### Ring Buffer Overflow

- **Eviction ordering:** Ring buffer uses FIFO eviction (oldest sample overwritten first). This matches the chronological insertion order since samples arrive in round order.
- **Out-of-order insertion (straggler):** The existing `addSamples` splice logic handles stragglers arriving 1-2 rounds late. In the ring buffer, `insertOrdered(sample, (existing) => existing.round > sample.round)` walks backward from the tail to find the correct chronological position — matching the existing backward-walk pattern. If the straggler's round is older than the buffer's oldest live sample, it is discarded (already compacted).

## 7. Architecture

### 7.1 RingBuffer\<T\>

**File:** `src/lib/utils/ring-buffer.ts`

A generic fixed-capacity circular buffer that replaces unbounded arrays for sample storage.

```typescript
const DEFAULT_RING_CAPACITY = 28_800; // 8 hours at 1 Hz

interface RingBufferOptions {
  readonly capacity: number; // must be >= 1
}

interface EvictionCallback<T> {
  (evicted: T): void;
}

class RingBuffer<T> {
  private readonly _items: (T | undefined)[];
  private readonly _capacity: number;
  private _head: number;   // index of oldest item
  private _length: number; // current number of items
  private _onEvict: EvictionCallback<T> | null;

  constructor(options: RingBufferOptions);

  get capacity(): number;
  get length(): number;
  get isEmpty(): boolean;
  get isFull(): boolean;

  /** Register a callback invoked with each evicted item before overwrite. */
  onEvict(cb: EvictionCallback<T>): void;

  /** Append item. If at capacity, evicts oldest (fires onEvict callback). Returns evicted item or undefined. */
  push(item: T): T | undefined;

  /** Insert item at a position determined by a comparator (for straggler insertion).
   *  Walks backward from newest to find the correct position using the provided predicate.
   *  `shouldInsertBefore(existingItem)` returns true when the new item should be placed before existingItem.
   *  O(k) where k = distance from tail to insertion point (typically 1-2 for stragglers). */
  insertOrdered(item: T, shouldInsertBefore: (existing: T) => boolean): T | undefined;

  /** Read item at logical index (0 = oldest live item). */
  at(index: number): T | undefined;

  /** Number of items. */
  get length(): number;

  /** Iterate from oldest to newest. */
  [Symbol.iterator](): Iterator<T>;

  /** Iterate from a given tailIndex to the current tail (for delta reads).
   *  tailStart is an absolute tailIndex value (not a logical position).
   *  Returns items pushed between tailStart and the current tailIndex.
   *  If tailStart is before the buffer's oldest live item (evicted), returns all live items. */
  sliceFromTail(tailStart: number): T[];

  /** Export as plain array (oldest to newest). Used by share serialization. */
  toArray(): T[];

  /** Bulk load from plain array (e.g., loadSnapshot). Clears existing contents. */
  loadFrom(items: T[]): void;

  /** The logical index that will be assigned to the next push. Used by delta tracking. */
  get tailIndex(): number;

  /** Oldest item, or undefined if empty. */
  get front(): T | undefined;

  /** Newest item, or undefined if empty. */
  get back(): T | undefined;
}
```

**Behavioral contracts:**
- `capacity` is immutable after construction. Set to `DEFAULT_RING_CAPACITY` (28,800) for sample storage.
- `push()` is O(1). When `length === capacity`, the oldest item is passed to `onEvict` before being overwritten.
- `toArray()` returns a new plain array each call — used only for serialization (share/snapshot), not hot-path rendering.
- `loadFrom()` clears the buffer and bulk-inserts. Items beyond capacity are truncated from the front (oldest discarded). This handles `loadSnapshot` where the snapshot may contain fewer items than capacity.
- `[Symbol.iterator]` yields from oldest (head) to newest in logical order.
- `tailIndex` is a monotonically increasing counter (never resets) representing the total number of items ever pushed. Derived stores use this to compute deltas.

**Memory budget:** At `DEFAULT_RING_CAPACITY = 28,800` with ~250 bytes per `MeasurementSample`: ~7.2MB per endpoint. At MAX_ENDPOINTS=10: ~72MB. Well within the 150MB AC1 budget, leaving headroom for DOM, JS engine, and other allocations.

### 7.2 IncrementalTimestampTracker

**File:** `src/lib/utils/incremental-timestamp-tracker.ts`

Replaces the O(n) `sampleTimestamps` derived block in `Layout.svelte` that re-scans all samples across all endpoints on every store update.

```typescript
class IncrementalTimestampTracker {
  private _timestamps: number[];      // dense array: index = round, value = earliest timestamp
  private _lastProcessedTail: Map<string, number>; // per-endpoint tail index at last processing

  /** Process only new samples since last call. Called from measurementStore update path. */
  processNewSamples(endpointId: string, ringBuffer: RingBuffer<MeasurementSample>, currentTailIndex: number): void;

  /** Get the full timestamps array (read-only view). */
  get timestamps(): readonly number[];

  /** Reset state (called on loadSnapshot or reset). */
  reset(): void;
}
```

**Behavioral contracts:**
- `processNewSamples` reads only the delta via `ringBuffer.sliceFromTail(_lastProcessedTail[endpointId])`. The `sliceFromTail` method accepts an absolute `tailIndex` value (the same coordinate system as `_lastProcessedTail`) and returns only the items pushed since that point, correctly handling the circular buffer's internal wrapping. For each new sample, it updates `_timestamps[sample.round]` with `Math.min(existing, sample.timestamp)`.
- Amortized cost per call: O(k) where k = number of new samples since last call (typically 1 per endpoint per round).
- The `timestamps` getter returns the internal array directly (no copy). Consumers must treat it as read-only. Layout.svelte's `sampleTimestamps` derived expression is replaced by a subscription to this tracker's output.
- On `reset()`, clears the timestamps array and tail map. On `loadSnapshot`, calls `reset()` then processes all loaded samples as "new."

### 7.3 IncrementalLossCounter

**File:** `src/lib/utils/incremental-loss-counter.ts`

Replaces the O(n) `samples.filter(s => s.status !== 'ok')` in `getLaneProps()` with pre-maintained running counters.

```typescript
interface LossCounts {
  readonly totalSamples: number;
  readonly errorCount: number;
  readonly timeoutCount: number;
  readonly lossPercent: number; // (errorCount + timeoutCount) / totalSamples * 100
}

class IncrementalLossCounter {
  private _counts: Map<string, { total: number; errors: number; timeouts: number }>;

  /** Called on every addSamples. Processes only the new entries. */
  addSamples(entries: ReadonlyArray<{ endpointId: string; status: SampleStatus }>): void;

  /** Get current loss counts for an endpoint. */
  getCounts(endpointId: string): LossCounts;

  /** Remove an endpoint's counters. */
  removeEndpoint(endpointId: string): void;

  /** Reset all counters. */
  reset(): void;

  /** Bulk load from snapshot samples. */
  loadFrom(endpoints: Record<string, { samples: MeasurementSample[] }>): void;
}
```

**Behavioral contracts:**
- Counts are **lifetime totals**, not ring-buffer-window totals. When samples are evicted from the ring buffer, the loss counter is NOT decremented — it reflects the entire session's loss rate. This matches user expectation: "3% packet loss" means across the whole run, not just the visible window.
- `addSamples` is O(k) where k = number of new entries in the batch (typically equal to number of active endpoints per round).
- `getCounts` is O(1) — returns precomputed values.
- `getLaneProps()` in LanesView.svelte reads from `IncrementalLossCounter.getCounts(endpointId)` instead of filtering the samples array.

### 7.4 SortedInsertionBuffer

**File:** `src/lib/utils/sorted-insertion-buffer.ts`

Replaces the `latencies.slice().sort()` allocation in `computeEndpointStatistics` with a persistent sorted array that accepts O(log n) insertions.

```typescript
class SortedInsertionBuffer {
  private _sorted: number[];
  private _count: number;

  /** Insert a value, maintaining sorted order. O(log n) binary search + O(n) shift worst case, but O(1) amortized when values arrive in roughly ascending order (typical for latencies). */
  insert(value: number): void;

  /** Read sorted array (no copy — internal reference). */
  get sorted(): readonly number[];

  /** Number of values. */
  get length(): number;

  /** Reset buffer. */
  reset(): void;

  /** Bulk load from unsorted array. Sorts once — O(n log n). Used for loadSnapshot. */
  loadFrom(values: number[]): void;
}
```

**Behavioral contracts:**
- One `SortedInsertionBuffer` per endpoint, stored alongside the ring buffer in the endpoint measurement state.
- Only `ok` samples insert their latency. Error/timeout samples do not contribute to the sorted buffer.
- The sorted buffer grows without bound (it is NOT ring-buffered) because `EndpointStatistics` reports session-lifetime percentiles. At 28,800 ok-samples, the sorted buffer is ~230KB of numbers per endpoint — negligible.
- On `removeEndpoint`, the buffer is dropped and GC'd.
- `percentileSorted()` from `src/lib/utils/statistics.ts` reads directly from `sorted` — zero allocation per stats computation.

**Eviction interaction:** When the ring buffer evicts a sample, the sorted buffer is NOT modified. The sorted buffer tracks all ok-latencies ever seen, matching the lifetime semantics of `EndpointStatistics`. If we later want window-only stats, a separate windowed sorted buffer could be added; this is out of scope.

### 7.5 HeatmapSampleCountGate

**File:** Inline in `src/lib/components/LanesView.svelte` (not a separate class)

Adds a `sampleCount` memoization guard to the `heatmapCellsByEndpoint` derived block, mirroring the pattern already used by `statisticsStore`.

```typescript
// Inside LanesView.svelte
let heatmapCache: Map<string, { sampleCount: number; cells: readonly HeatmapCellData[] }> = new Map();

const heatmapCellsByEndpoint = $derived.by(() => {
  const map = new Map<string, readonly HeatmapCellData[]>();
  const startedAt = $measurementStore.startedAt;
  for (const ep of endpoints) {
    const epState = $measurementStore.endpoints[ep.id];
    const stats = $statisticsStore[ep.id];
    if (!epState || !stats) {
      map.set(ep.id, []);
      continue;
    }
    const tail = epState.samples.tailIndex; // monotonically increasing — never stalls at capacity
    const cached = heatmapCache.get(ep.id);
    if (cached && cached.sampleCount === tail) {
      map.set(ep.id, cached.cells);
      continue;
    }
    const cells = computeHeatmapCells(epState.samples, stats, startedAt);
    heatmapCache.set(ep.id, { sampleCount: tail, cells });
    map.set(ep.id, cells);
  }
  return map;
});
```

**Additional migration: TimelineCanvas.svelte sonar ping detection.** `TimelineCanvas.svelte` (lines 146-149) uses `epState.samples.length` to detect new samples and trigger sonar pings (`if (newCount > prevCount)`). Once the ring buffer reaches capacity, `length` is constant, so sonar pings would permanently stop. The `sampleCounts` tracking must be changed from `samples.length` to `samples.tailIndex` — same pattern as the heatmap and statistics cache keys.

**Behavioral contract:** `computeHeatmapCells` is only called when `tailIndex` changes for a given endpoint. Unlike `samples.length` (which becomes constant once the ring buffer reaches capacity), `tailIndex` is monotonically increasing and increments on every push — so the cache correctly invalidates on every new sample. At 1 Hz per endpoint, this means one call per second per endpoint — down from one call per store update (which fires for every endpoint every round).

### 7.6 RenderScheduler Hysteresis

**File:** `src/lib/renderers/render-scheduler.ts`

Adds a recovery path so that effects are re-enabled after sustained good performance, preventing a transient burst-phase CPU spike from permanently disabling sonar effects.

```typescript
const OVERLOAD_THRESHOLD_MS = 12;
const OVERLOAD_STREAK_LIMIT = 10;  // consecutive bad frames to disable
const RECOVERY_STREAK_LIMIT = 60;  // consecutive good frames to re-enable (~1 second at 60fps)

class RenderScheduler {
  // ... existing fields ...
  private recoveryStreak = 0;

  private updateOverloadStreak(dataMs: number): void {
    if (dataMs > OVERLOAD_THRESHOLD_MS) {
      this.overloadStreak++;
      this.recoveryStreak = 0;
      if (this.overloadStreak >= OVERLOAD_STREAK_LIMIT) {
        this.effectsDisabled = true;
        this.overloadStreak = 0; // reset so recovery can trigger
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
}
```

**Behavioral contracts:**
- Effects disable after `OVERLOAD_STREAK_LIMIT` (10) consecutive frames exceeding 12ms data cost — same as today.
- Effects re-enable after `RECOVERY_STREAK_LIMIT` (60) consecutive frames under 12ms data cost (~1 second of smooth rendering). This prevents flickering: effects don't toggle on/off rapidly.
- Recovery tracking only runs while `effectsDisabled === true`. When effects are enabled, `recoveryStreak` stays at 0.
- The `_simulateFrame` test hook must also exercise recovery behavior.

### 7.7 Visibility-Aware Engine Pause

**File:** `src/lib/engine/measurement-engine.ts`

Pauses round dispatch and signals the render scheduler to stop its rAF loop when the tab is backgrounded.

```typescript
class MeasurementEngine {
  // ... existing fields ...
  private _visibilityHandler: (() => void) | null = null;
  private _paused = false;

  start(): void {
    // ... existing start logic ...
    this._visibilityHandler = () => this._handleVisibilityChange();
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  stop(): void {
    // ... existing stop logic ...
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this._paused = false;
  }

  private _handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this._pause();
    } else {
      this._resume();
    }
  }

  private _pause(): void {
    if (this._paused) return; // idempotent
    this._paused = true;

    // Cancel pending round timer — no new rounds dispatched while hidden
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    // Flush timers stay active — straggler responses for the current round
    // should still flush so we don't lose data. But no NEW rounds are dispatched.
  }

  private _resume(): void {
    if (!this._paused) return; // idempotent
    this._paused = false;

    // Clear any roundTimer that _flushRound may have set during the pause
    // window. Without this, the orphaned timer would fire after resume and
    // dispatch a round concurrently with the one scheduled below —
    // violating the response-gated sequential invariant.
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    const lifecycle = get(measurementStore).lifecycle;
    if (lifecycle === 'running') {
      this._scheduleNextRound();
    }
  }

  private _dispatchRound(): void {
    if (this._paused) return; // don't dispatch while hidden
    // ... existing dispatch logic ...
  }
}
```

**Behavioral contracts:**
- `_pause()` is idempotent — multiple `visibilitychange` events to `hidden` are safe.
- `_resume()` is idempotent — multiple events to `visible` are safe.
- Pausing cancels the pending `roundTimer` but does NOT cancel flush timers. In-flight rounds complete normally; their results are written to the ring buffer. The engine simply stops dispatching new rounds.
- On resume, `_scheduleNextRound()` is called, which reads `roundCounter` and applies the correct cadence (burst vs monitor). If the session was in burst phase when backgrounded, it resumes in burst phase.
- The `_dispatchRound` guard (`if (this._paused) return`) prevents any race between a scheduled timeout firing and the pause state changing.
- Render scheduler integration: The engine does NOT directly control the render scheduler's rAF loop. Instead, when no new data arrives (because rounds are paused), the render scheduler's `dirty` flag is never set, so data renderers don't tick. Effects renderers still tick (animations continue) but at lower priority since the browser throttles backgrounded rAF to ~1fps. A future optimization could explicitly stop/start the render scheduler, but the current approach is sufficient for AC3.

### 7.8 SessionHistoryStore

**File:** `src/lib/stores/session-history.ts`

A write-only compacted accumulator fed by ring buffer eviction callbacks. Stores per-endpoint-per-hour statistical summaries for all samples that have been evicted from the ring buffer.

```typescript
interface HourBucket {
  /** ISO hour label, e.g., "2026-04-13T14" */
  readonly hourKey: string;
  count: number;
  min: number;
  max: number;
  sum: number;         // for computing mean
  sumSquares: number;  // for computing stddev
  errorCount: number;
  timeoutCount: number;
  /** Sorted latency values for exact percentile computation. Only ok-sample latencies. */
  latencies: number[];
}

interface EndpointHistory {
  readonly endpointId: string;
  buckets: Map<string, HourBucket>;
}

interface HourSummary {
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
  readonly jitter: number; // population stddev
}

class SessionHistoryStore {
  private _history: Map<string, EndpointHistory>;

  /** Called by ring buffer onEvict callback. Accumulates the evicted sample into the correct hour bucket. */
  accumulate(endpointId: string, sample: MeasurementSample): void;

  /** Get all hour summaries for an endpoint, sorted chronologically. */
  getSummaries(endpointId: string): readonly HourSummary[];

  /** Get a single hour summary. */
  getSummary(endpointId: string, hourKey: string): HourSummary | null;

  /** Remove an endpoint's history. */
  removeEndpoint(endpointId: string): void;

  /** Reset all history (called on measurementStore.reset()). */
  reset(): void;

  /** Check if any history exists. */
  get hasHistory(): boolean;
}
```

**`accumulate` implementation detail:**

```typescript
accumulate(endpointId: string, sample: MeasurementSample): void {
  let epHistory = this._history.get(endpointId);
  if (!epHistory) {
    epHistory = { endpointId, buckets: new Map() };
    this._history.set(endpointId, epHistory);
  }

  // Derive hour key from sample timestamp
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
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < sample.latency) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, sample.latency);
  }
}
```

**`getSummaries` computes derived values on read:**

```typescript
getSummaries(endpointId: string): readonly HourSummary[] {
  const epHistory = this._history.get(endpointId);
  if (!epHistory) return [];

  return Array.from(epHistory.buckets.values())
    .sort((a, b) => a.hourKey.localeCompare(b.hourKey))
    .map(bucket => {
      const okCount = bucket.latencies.length;
      const mean = okCount > 0 ? bucket.sum / okCount : 0;
      const variance = okCount > 1
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
    });
}
```

**Behavioral contracts:**
- **Write-only from the ring buffer's perspective.** The `accumulate` method is the only write path, called exclusively from the ring buffer's `onEvict` callback.
- **Session-only.** No persistence to localStorage. No inclusion in share payloads. The store is created fresh on page load and lost on tab close.
- **Not a Svelte store.** This is a plain class, not a writable/derived store. The future detailed results page will instantiate a Svelte derived store that reads from it when needed. Keeping it as a plain class avoids triggering reactive updates on every eviction (which happens at 1 Hz per endpoint once the ring buffer is full).
- **Isolation from share/persistence.** The class is exported from `src/lib/stores/session-history.ts` as a singleton. Neither `persistence.ts` nor `share-manager.ts` import it. This is enforced by code review, not runtime — there is no technical access control beyond module boundaries.
- **Memory budget.** Per hour bucket: ~3,600 latency values at 8 bytes each = ~29KB. At 8 hours x 10 endpoints = 80 buckets = ~2.3MB. Negligible compared to ring buffer memory.
- **Percentiles are exact.** The sorted `latencies` array in each bucket enables exact percentile computation via `percentileSorted`. No approximation (t-digest, etc.) is used.

### Wiring: onEvict Registration

When `measurementStore.initEndpoint(endpointId)` creates a new ring buffer for an endpoint, it registers the eviction callback:

```typescript
const ringBuffer = new RingBuffer<MeasurementSample>({ capacity: DEFAULT_RING_CAPACITY });
ringBuffer.onEvict((evicted) => {
  sessionHistoryStore.accumulate(endpointId, evicted);
});
```

This wiring lives inside `createMeasurementStore()` — the callback is an implementation detail invisible to external consumers.

## 8. Data Flow

### 8.1 Normal Round (Steady State)

```
Worker (per endpoint)
  │ postMessage({ type: 'result', timing, epoch, roundId })
  ▼
MeasurementEngine._handleWorkerMessage()
  │ epoch guard: discard if msg.epoch !== currentEpoch
  │ roundBuffer.set(roundId, [...messages])
  │ if all expectedResponses received → _flushRound()
  ▼
MeasurementEngine._flushRound()
  │ build entries[] from actionable messages
  │ call measurementStore.addSamples(entries)
  ▼
measurementStore.addSamples(entries)
  │ for each entry:
  │   ringBuffer.push(sample)
  │     → if at capacity: onEvict fires → sessionHistoryStore.accumulate()
  │   incrementalLossCounter.addSample(endpointId, status)
  │   sortedInsertionBuffer.insert(latency) [if status === 'ok']
  │   incrementalTimestampTracker.processNewSample(endpointId, sample)
  │ spread top-level endpoints map to trigger Svelte reactivity
  ▼
Svelte reactive graph fires:
  │
  ├─ statisticsStore (derived)
  │   tailIndex gate: skip if ringBuffer.tailIndex unchanged (NOT .length — .length stalls at capacity)
  │   reads sortedInsertionBuffer.sorted for percentiles (zero-alloc)
  │   reads incrementalLossCounter for error/timeout counts
  │
  ├─ Layout.svelte: sampleTimestamps
  │   reads incrementalTimestampTracker.timestamps (O(1) — no scan)
  │
  ├─ LanesView.svelte: heatmapCellsByEndpoint
  │   tailIndex gate: skip if ringBuffer.tailIndex unchanged per endpoint
  │
  ├─ LanesView.svelte: getLaneProps()
  │   reads incrementalLossCounter.getCounts(endpointId) (O(1))
  │
  └─ LanesView.svelte: frameData (prepareFrame)
      reads from ringBuffer via iteration (only windowed 60 rounds)
      ribbons: throttled, recomputes every N samples
```

### 8.2 loadSnapshot Path

```
Share URL decode / persistence restore
  │
  ▼
measurementStore.loadSnapshot(snapshot)
  │ for each endpoint in snapshot:
  │   create new RingBuffer, loadFrom(snapshot.endpoints[id].samples)
  │   register onEvict → sessionHistoryStore.accumulate
  │   sortedInsertionBuffer.loadFrom(okLatencies)
  │   incrementalLossCounter.loadFrom(snapshot.endpoints)
  │   incrementalTimestampTracker.reset() + processAll
  │ sessionHistoryStore.reset() (fresh session, no eviction history)
  │ set() triggers full reactive update
  ▼
All derived stores recompute (cold start — acceptable one-time cost)
```

### 8.3 Tab Background/Foreground

```
document.visibilitychange → 'hidden'
  │
  ▼
MeasurementEngine._pause()
  │ clearTimeout(roundTimer) — no new rounds dispatched
  │ flush timers for in-flight rounds remain active
  │ _paused = true
  ▼
(tab hidden — browser throttles rAF to ~1fps)
(in-flight round may still flush via flushTimer, writing to ring buffer)
(no new rounds dispatched)
  │
  ▼
document.visibilitychange → 'visible'
  │
  ▼
MeasurementEngine._resume()
  │ _paused = false
  │ _scheduleNextRound() — resumes cadence
  ▼
Normal round dispatch resumes
RenderScheduler gets dirty flag on next addSamples, resumes rendering
```

## 9. Eviction / Compaction

### 9.1 When Eviction Occurs

Eviction occurs when a ring buffer's `length === capacity` and a new `push()` is called. This happens after the ring buffer has accumulated `DEFAULT_RING_CAPACITY` (28,800) samples for a single endpoint — approximately 8 hours at 1 Hz.

After that point, every new sample evicts the oldest sample. The eviction rate equals the insertion rate: 1 eviction per endpoint per round.

### 9.2 Eviction → Compaction Flow

```
ringBuffer.push(newSample)
  │ buffer is full (length === capacity)
  │
  ├─ 1. Read the item at head position (about to be overwritten)
  │
  ├─ 2. Call onEvict(evictedSample)
  │     │
  │     ▼
  │   sessionHistoryStore.accumulate(endpointId, evictedSample)
  │     │ derive hourKey from evictedSample.timestamp
  │     │ upsert HourBucket for that hour:
  │     │   bucket.count++
  │     │   if ok: update min, max, sum, sumSquares, binary-insert into latencies[]
  │     │   if error: bucket.errorCount++
  │     │   if timeout: bucket.timeoutCount++
  │     ▼
  │   (evictedSample is now captured in the hour bucket)
  │
  ├─ 3. Overwrite head position with newSample
  │
  └─ 4. Advance head pointer: head = (head + 1) % capacity
```

### 9.3 Compaction Guarantees

1. **No sample is lost without being compacted.** The `onEvict` callback fires synchronously before the item is overwritten. There is no window where a sample exists in neither the ring buffer nor the session history.

2. **Compaction is idempotent per sample.** Each sample is evicted exactly once (when it is the oldest item and a new push occurs). The `accumulate` method handles duplicate calls defensively (though they should not occur).

3. **Hour boundaries are derived from sample timestamps, not wall clock.** A sample recorded at 14:59:59 goes into the "T14" bucket even if it is evicted at 23:00:00. This ensures the hourly breakdown reflects when measurements actually occurred.

4. **Error/timeout samples are compacted with zero latency contribution.** They increment `count`, `errorCount`/`timeoutCount` but do not affect `min`, `max`, `sum`, `sumSquares`, or the `latencies` sorted array. This matches the existing behavior where `computeEndpointStatistics` filters to `ok` samples for latency stats.

5. **No back-pressure.** `accumulate` is O(log k) where k = number of ok-latencies in the target hour bucket (binary search insertion). At 3,600 samples/hour, this is ~12 comparisons — sub-microsecond. It cannot delay the ring buffer write path.

### 9.4 Reading Compacted History

The future detailed results page calls `sessionHistoryStore.getSummaries(endpointId)` to retrieve per-hour summaries. This is a read-time computation (O(h * k log k) where h = number of hour buckets) that does not run on the hot path. It is not triggered by store updates, rAF, or measurement rounds.

### 9.5 Lifetime Data Consistency

After eviction begins, the system maintains three complementary views of session data:

| View | Scope | Source | Semantics |
|------|-------|--------|-----------|
| Ring buffer | Last ~8 hours of raw samples | `RingBuffer<MeasurementSample>` | Rendering (timeline, heatmap, scatter) |
| Sorted insertion buffer | All ok-latencies ever recorded | `SortedInsertionBuffer` | Session-lifetime `EndpointStatistics` (p50, p95, etc.) |
| Incremental loss counter | All samples ever recorded | `IncrementalLossCounter` | Session-lifetime loss percentage |
| Incremental timestamp tracker | All rounds ever recorded | `IncrementalTimestampTracker` | X-axis time labels |
| Session history store | Evicted samples, grouped by hour | `SessionHistoryStore` | Future detailed results page |

The `EndpointStatistics` contract is satisfied by the sorted insertion buffer + loss counter (lifetime data). The ring buffer serves only the rendering path (windowed data). These two views are consistent because the sorted insertion buffer accumulates from the same `addSamples` path — it never reads from the ring buffer after insertion.
