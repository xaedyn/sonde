---
date: 2026-04-13
feature: perf-memory-audit
type: approach-decision-memos
---

# Approach Decision Memos — Performance & Memory Audit

## APPROACH 1: Ring Buffer + Incremental Derivation

### CORE IDEA
Replace unbounded sample arrays with fixed-capacity ring buffers and convert all O(n) derived computations to incremental (delta-based) updates that process only new samples.

### MECHANISM
Each endpoint's `samples` array becomes a `RingBuffer<MeasurementSample>` with a configurable capacity (e.g., 28,800 = 8 hours at 1 Hz). The ring buffer overwrites the oldest sample on overflow, providing O(1) insertion with zero GC allocation after init. The `addSamples` path writes into the ring buffer and emits a `tailIndex` signal alongside the store update, so derived computations can process only the delta (new samples since last read) rather than re-scanning the full buffer. `sampleTimestamps` in Layout.svelte maintains a parallel dense array updated incrementally via the tail pointer. `heatmapCellsByEndpoint` adopts the same sampleCount gate that `statisticsStore` already uses. `getLaneProps` reads loss counts from pre-maintained running counters instead of filtering all samples. `computeEndpointStatistics` maintains a persistent sorted insertion buffer (binary search insert is O(log n) per sample, avoiding the O(n log n) full sort on every cache miss).

### FIT ASSESSMENT
- **Scale fit:** matches — ring buffer is the standard pattern for bounded time-series in long-running dashboards
- **Team fit:** fits — no new paradigms; ring buffer is a data structure swap with the same iteration API
- **Operational:** Requires choosing a capacity constant; too small loses historical data users may want for share/export
- **Stack alignment:** fits existing — pure TypeScript data structure, no new dependencies; Svelte reactivity triggers unchanged (store `.set()` still fires)

### TRADEOFFS
- **Strong at:** Guarantees hard memory ceiling (AC1), eliminates all O(n) scans (AC2, AC5), zero GC pressure after warmup
- **Sacrifices:** Users lose samples older than the ring capacity (unless we add a separate compacted summary for historical stats); share/persistence payloads change shape slightly (ring buffer serializes to array, but capacity metadata needs handling); slightly more complex `loadSnapshot` path

### WHAT WE'D BUILD
1. **RingBuffer\<T\>** — Generic fixed-capacity circular buffer with typed-array-style iteration, `push()`, `slice()`, `length`, and `forEach(startIndex)` for delta reads
2. **IncrementalTimestampTracker** — Maintains the round-to-timestamp dense array incrementally, consumed by XAxisBar
3. **IncrementalLossCounter** — Per-endpoint running error/timeout counts updated on each `addSamples` call, replacing `getLaneProps` filter
4. **SortedInsertionBuffer** — Persistent sorted latency array for `computeEndpointStatistics`, with O(log n) binary-search insert
5. **HeatmapSampleCountGate** — sampleCount memoization guard for `computeHeatmapCells`, mirroring `statisticsStore` pattern
6. **RenderScheduler hysteresis** — Add recovery counter: after N consecutive under-budget frames, re-enable effects (AC4)
7. **Visibility-aware engine pause** — `document.visibilitychange` listener pauses round dispatch and stops rAF loop when backgrounded, resumes cleanly on foreground (AC3)

### THE BET
That a fixed ring capacity of ~28,800 samples per endpoint is large enough that no user session needs older data, and that incremental delta tracking through Svelte's reactive graph is straightforward enough to not introduce subtle stale-data bugs.

### REVERSAL COST
If wrong at 30 days: **easy** — ring buffer is behind the same `measurementStore` API; reverting to unbounded arrays is a data-structure swap with no consumer changes.

### WHAT WE'RE NOT BUILDING
- Web Worker pooling or shared workers (worker-per-endpoint is fine at MAX_ENDPOINTS=10)
- IndexedDB persistence for evicted samples (YAGNI — no user has requested historical replay)
- Virtual scrolling for lanes (MAX_ENDPOINTS=10 is too few to need it)
- Canvas 2D replacement for SVG rendering (SVG perf is fine within the 60-dot window)

### INDUSTRY PRECEDENT
Grafana's `CircularDataFrame` uses a typed-array ring buffer with a write pointer mod capacity for unbounded time-series panels. [VERIFIED — grafana/grafana `src/packages/grafana-data/src/dataframe/CircularDataFrame.ts`]

---

## APPROACH 2: Windowed Snapshot + Lazy Aggregation

### CORE IDEA
Keep the unbounded sample arrays but make all rendering paths operate on a small fixed-size window (the visible 60 rounds), with statistical aggregates computed lazily and cached aggressively.

### MECHANISM
Instead of replacing the storage layer, this approach inserts a **windowed projection layer** between `measurementStore` and all consumers. A new `windowedSamplesStore` derived store slices each endpoint's samples to only the visible window (last 60 rounds), and all downstream derivations — `sampleTimestamps`, `heatmapCells`, `getLaneProps`, `prepareFrame` — subscribe to the windowed projection instead of the raw store. This makes all per-frame work O(window) = O(60) regardless of total sample count. For statistics that need the full dataset (p50, p95, etc.), `computeEndpointStatistics` adds an **online algorithm**: running min/max, Welford's online variance, and a t-digest for approximate percentiles — eliminating the sort entirely. The render scheduler gets hysteresis recovery. Tab visibility pauses the engine.

### FIT ASSESSMENT
- **Scale fit:** matches — windowing is the simplest possible fix for render-path cost; online stats are well-studied
- **Team fit:** requires new expertise — t-digest is non-trivial to implement correctly; approximate percentiles may surprise users expecting exact values
- **Operational:** Requires validating that approximate percentiles are within acceptable tolerance (the share contract exposes exact p50/p95/p99 values)
- **Stack alignment:** fits existing — no new dependencies if t-digest is hand-rolled; could use `tdigest` npm package but that adds a dependency

### TRADEOFFS
- **Strong at:** Zero breaking changes to storage layer; all samples retained for full-session export/share; rendering cost is O(1) regardless of session length; statistics computation becomes O(1) per sample arrival
- **Sacrifices:** Memory still grows monotonically (samples are never evicted) — AC1's 150MB ceiling depends on per-sample memory being small enough that 8hr * 10 endpoints fits; t-digest percentiles are approximate (typically within 0.5% but not exact); more indirection layers between store and components

### WHAT WE'D BUILD
1. **WindowedProjectionStore** — Derived store that slices each endpoint's samples to visible window bounds, subscribed to by all rendering components
2. **OnlineStatisticsAccumulator** — Welford's algorithm for mean/variance/stddev, running min/max, and count-based loss tracking — O(1) per sample
3. **TDigestPercentile** — Streaming approximate percentile computation (p25, p50, p75, p90, p95, p99) using a merging t-digest with compression factor ~100
4. **HeatmapSampleCountGate** — Same as Approach 1
5. **RenderScheduler hysteresis** — Same as Approach 1
6. **Visibility-aware engine pause** — Same as Approach 1

### THE BET
That raw sample memory (MeasurementSample objects) stays under 150MB for an 8-hour session with 10 endpoints (~288,000 samples), and that approximate percentiles from a t-digest are acceptable for the share/persistence contract.

### REVERSAL COST
If wrong at 30 days: **hard** — the online statistics pipeline (Welford + t-digest) threads through every stats consumer; reverting to exact sort-based stats requires unwinding the accumulator state and re-validating all statistical outputs.

### WHAT WE'RE NOT BUILDING
- Ring buffer or sample eviction (this approach deliberately retains all data)
- Worker-side aggregation (stats stay on main thread)
- Canvas 2D replacement for SVG
- Compression of in-memory samples

### INDUSTRY PRECEDENT
Netflix's Atlas time-series system uses streaming t-digest for approximate percentiles on unbounded observation streams. [VERIFIED — Netflix/atlas GitHub, `atlas-core/src/main/scala/com/netflix/atlas/core/util/TDigest.scala`]

---

## APPROACH 3: Tiered Storage + Compaction

### CORE IDEA
Maintain a small "hot" buffer of recent samples for rendering and a compacted "cold" summary for historical statistics, with automatic promotion from hot to cold as samples age out of the visible window.

### MECHANISM
Each endpoint maintains two storage tiers: a **hot buffer** (last 120 rounds, ~2 minutes) stored as full `MeasurementSample` objects for rendering, and a **cold accumulator** that stores only aggregate statistics (count, sum, sum-of-squares, min, max, sorted percentile digests, error count, timeout count) for all samples that have aged out of the hot buffer. When samples leave the hot buffer, a **compaction step** runs: it updates the cold accumulator's running stats and discards the raw sample objects so they can be GC'd. All rendering paths read from the hot buffer only (O(120) max). Statistics merge hot-buffer exact computation with cold-accumulator aggregates. This gives exact stats for recent data and mathematically correct merged stats for the full session, without the approximation tradeoff of t-digest.

### FIT ASSESSMENT
- **Scale fit:** overengineered — the two-tier model adds conceptual complexity beyond what 10 endpoints at 1 Hz requires; a simple ring buffer achieves the same memory bound with less machinery
- **Team fit:** requires new expertise — correct statistical merging (combining a sorted hot array with cold aggregates for percentiles) is subtle; Welford's merge for variance is straightforward but percentile merge from partial data is not exact without keeping all values
- **Operational:** Compaction runs on every round (trivial cost since it processes only 0-1 samples per endpoint leaving the hot window), but the merge logic for `computeEndpointStatistics` must be carefully tested
- **Stack alignment:** fits existing — no new dependencies; pure TypeScript

### TRADEOFFS
- **Strong at:** Hard memory ceiling like ring buffer (AC1), retains full-session statistical accuracy (better than t-digest), rendering paths are bounded (AC2, AC5), clean separation of concerns between "what we render" and "what we know"
- **Sacrifices:** Cannot export raw historical samples (only aggregates survive compaction); share payload can only include hot-buffer samples + cold stats; percentile accuracy for full-session stats degrades compared to exact computation (cold tier can only store histogram buckets, not exact sorted values); most complex implementation of the three approaches

### WHAT WE'D BUILD
1. **HotBuffer** — Fixed-capacity recent-sample store (120 rounds) per endpoint, iterable for rendering
2. **ColdAccumulator** — Per-endpoint aggregate: count, sum, sumSquares, min, max, errorCount, timeoutCount, histogram buckets for percentile approximation
3. **CompactionScheduler** — Runs after each `addSamples` to move aged-out hot samples into cold accumulator
4. **MergedStatisticsComputer** — Merges hot-buffer exact stats with cold-accumulator aggregates for full-session statistics
5. **HeatmapSampleCountGate** — Same as Approach 1
6. **RenderScheduler hysteresis** — Same as Approach 1
7. **Visibility-aware engine pause** — Same as Approach 1

### THE BET
That the merged statistics from hot-exact + cold-approximate are accurate enough to satisfy the `EndpointStatistics` contract, and that users don't need raw access to samples older than 2 minutes.

### REVERSAL COST
If wrong at 30 days: **very hard** — the two-tier storage model changes the fundamental data flow; every consumer of `measurementStore` must understand the hot/cold split; reverting requires re-architecting back to a single array, and any persisted share payloads created during the tiered period may have incompatible shapes.

### WHAT WE'RE NOT BUILDING
- IndexedDB for cold-tier persistence
- Worker-side compaction
- Canvas 2D rendering
- Streaming export of historical data

### INDUSTRY PRECEDENT
Prometheus uses a two-level storage model (in-memory "head" block for recent samples, on-disk compacted blocks for historical data) with statistical merging at query time. [VERIFIED — prometheus/prometheus `tsdb/head.go` and `tsdb/compact.go`]

---

## Comparison Matrix

| Criterion | Approach 1: Ring Buffer + Incremental | Approach 2: Windowed Snapshot + Lazy Aggregation | Approach 3: Tiered Storage + Compaction |
|---|---|---|---|
| **AC1** (150MB, no monotonic growth) | **STRONG** — hard memory ceiling; ring buffer caps sample count per endpoint; GC reclaims nothing because nothing is allocated post-init | **PARTIAL** — rendering cost is bounded but raw samples still grow monotonically; 288K samples at ~250 bytes each = ~72MB which fits under 150MB but leaves less headroom and relies on per-sample size estimate | **STRONG** — hard ceiling via hot buffer cap + cold accumulator fixed size; raw samples are GC'd after compaction |
| **AC2** (per-round update < 4ms, 10 endpoints) | **STRONG** — incremental delta processing is O(1) per new sample per derived computation; no full scans | **STRONG** — all rendering reads from O(60) windowed projection; statistics are O(1) via online accumulator | **STRONG** — rendering reads O(120) hot buffer; compaction is O(1) per aged-out sample |
| **AC3** (tab background/foreground resume) | **STRONG** — visibility-aware pause stops dispatch + rAF; ring buffer state is stable across pause; epoch guard discards stale messages | **STRONG** — same visibility-aware pause; no structural difference from Approach 1 for this AC | **STRONG** — same visibility-aware pause; compaction resumes normally on foreground |
| **AC4** (no rAF > 16ms; effects recovery) | **STRONG** — hysteresis recovery re-enables effects after N consecutive good frames; incremental derivation reduces per-frame cost | **STRONG** — same hysteresis; windowed projection ensures render cost is independent of sample count | **STRONG** — same hysteresis; hot buffer bounds render cost |
| **AC5** (derived computations < 2ms at 50K samples) | **STRONG** — incremental derivation processes only new samples; no O(n) path exists at any sample count | **STRONG** — rendering is O(window); statistics are O(1) amortized via online algorithms | **STRONG** — rendering is O(hot buffer); but merged statistics computation has constant overhead from histogram merge |
| **Scale fit** | **matches** — ring buffer is the industry standard for bounded time-series | **matches** — windowing + online stats is well-understood; memory growth is the only concern | **overengineered** — two-tier model adds complexity disproportionate to the problem size (10 endpoints, 1 Hz) |
| **Stack alignment** | **fits existing** — zero new dependencies; pure TypeScript data structures | **partial** — t-digest is either hand-rolled (error-prone) or a new dependency | **fits existing** — zero new dependencies but highest implementation complexity |
| **Reversal cost** | **easy** — ring buffer is behind the same store API; revert is a data-structure swap | **hard** — online statistics pipeline threads through all stats consumers | **very hard** — two-tier model changes fundamental data flow and share payload shape |
| **Implementation complexity** | **low-medium** — ring buffer + incremental counters are straightforward; sorted insertion buffer is the most complex piece | **medium** — windowed projection is simple but t-digest / online percentiles require careful validation | **high** — two-tier storage, compaction scheduler, and merged statistics are the most moving parts |

---

## Recommendation

**Approach 1 (Ring Buffer + Incremental Derivation)** is the strongest choice. It addresses all five ACs with hard guarantees rather than estimates, has the lowest reversal cost, requires no new dependencies, and follows the exact pattern used by Grafana for the same problem class. The ring buffer capacity can be tuned without architectural changes. The only tradeoff — losing samples older than ~8 hours — is acceptable because Chronoscope is a real-time diagnostic tool, not a historical analytics platform, and the share/export feature captures a point-in-time snapshot regardless of retention policy.
