---
date: 2026-04-10
feature: optimal-measurement
type: codebase-context-brief
---

# Codebase Context Brief — Optimal Measurement Engine

## STACK

Svelte 5.55.1, Vite 8.0.4, TypeScript ~6.0.2 (strict), Vitest 4.1.3, Playwright 1.59.1. Web Workers (ES modules), Resource Timing API, PerformanceObserver API, Fetch + AbortController. Svelte writable/derived stores for state. Canvas + SVG renderers. No external state libraries.

## EXISTING PATTERNS

**Measurement flow:** MeasurementEngine dispatches `measure` messages to one Worker per enabled endpoint per round. Workers do `HEAD` fetch with `no-cors`/`no-store`, extract Resource Timing entry (or fall back to `performance.now()`), post result back. Engine buffers responses by roundId, flushes batch to measurementStore when all arrive or 200ms straggler timeout fires.

**Round dispatch (current, time-gated):** `_dispatchRound()` sends to all workers, immediately calls `_scheduleNextRound()` which sets `setTimeout(delay)`. Next round fires regardless of whether previous responses arrived. Rounds can overlap.

**Epoch staleness:** Each `start()` increments epoch. Worker responses carry epoch; stale messages (old epoch) are silently discarded.

**Statistics:** Derived store with memoization keyed on sample count. Pure functions: percentile (nearest-rank), stddev, CI95. Ready gate at 30 samples. Connection reuse delta computed from first cold sample vs warm average.

**Error handling:** Worker try/catch with AbortController signal discrimination (timeout vs network error). Engine catches dead-worker postMessage errors. No cascade failures.

**Tests:** Engine tests inject messages via `_handleWorkerMessage()` (no real Workers in jsdom). Worker tests cover pure helper exports. Statistics tests cover all computation functions.

## RELEVANT FILES

| File | Purpose | Key Exports | Lines |
|------|---------|-------------|-------|
| `src/lib/engine/worker.ts` | Web Worker: fetch + Resource Timing | `extractTimingPayload()`, `classifyLatencyTier()` | 172 |
| `src/lib/engine/measurement-engine.ts` | Round dispatch orchestrator | `MeasurementEngine` class | 262 |
| `src/lib/engine/worker-factory.ts` | Worker instantiation abstraction | `WorkerFactory` interface | 12 |
| `src/lib/stores/measurements.ts` | Measurement state store | `measurementStore` | 176 |
| `src/lib/stores/settings.ts` | Settings store | `settingsStore` | 21 |
| `src/lib/stores/statistics.ts` | Derived stats with memoization | `statisticsStore` | 43 |
| `src/lib/utils/statistics.ts` | Pure stats functions | `percentile()`, `stddev()`, `computeEndpointStatistics()` | 150 |
| `src/lib/types.ts` | All type contracts | `TimingPayload`, `Settings`, `WorkerToMainMessage`, etc. | 303 |
| `src/lib/components/SummaryCard.svelte` | Per-endpoint stats display | — | ~200 |
| `tests/unit/measurement-engine.test.ts` | Engine unit tests | — | ~200 |
| `tests/unit/worker.test.ts` | Worker helper tests | — | ~100 |
| `tests/unit/statistics.test.ts` | Statistics function tests | — | ~150 |

## CONSTRAINTS

**Immutable interfaces (external contracts):** `TimingPayload`, `MeasurementSample`, `SampleStatus`, `WorkerToMainMessage`, `MainToWorkerMessage`, `EndpointStatistics` required fields (p50, p95, p99, ready, etc.).

**Can change (internal):** Worker fetch strategy, engine dispatch logic (time-gated → response-gated), Resource Timing extraction method, default settings values, flush timeout duration, statistics algorithms (same output interface).

**Test expectations:** Epoch increments on start(), stale messages discarded, batching reduces store updates, timeout messages plot at configured value, ready gate at 30 samples, percentile ordering.

## OPEN QUESTIONS

1. **Resource Timing buffer never cleared** — `performance.clearResourceTimings()` never called in worker. After 250+ requests, buffer may overflow (browser-specific behavior). `getEntriesByType` scan becomes O(n).
2. **Round overlap** — Time-gated dispatch means rounds overlap when responses are slower than delay. Creates self-inflicted contention and scheduling artifacts.
3. **200ms straggler flush** — If an endpoint regularly takes >200ms, its responses are orphaned after flush. The orphan creates a new roundBuffer entry that may never be flushed (memory leak).
4. **No phase concept** — No distinction between burst (establishing baseline) and monitoring (tracking stability). Single fixed delay for all measurement.
5. **`setTimeout(resolve, 0)` in worker** — Macrotask yield for Resource Timing entry. Could use PerformanceObserver instead (push-based, no polling).
