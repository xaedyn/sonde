---
date: 2026-04-10
feature: optimal-measurement
type: acceptance-criteria
---

# Acceptance Criteria — Optimal Measurement Engine

AC1: When the engine starts, it fires rounds with 0ms delay (burst phase) for the first 50 rounds, then automatically transitions to a configurable monitor delay (default 3000ms), observable by inspecting `measurementStore` lifecycle/phase state and the actual round dispatch timing.

AC2: When a round is dispatched, the next round does NOT fire until all workers have responded (or the straggler timeout expires), observable by confirming no two rounds have overlapping in-flight workers and that `_scheduleNextRound()` is called only from `_flushRound()`.

AC3: When a worker completes a measurement, the Resource Timing performance buffer is cleared via `performance.clearResourceTimings()`, observable by confirming the entry count in the worker's performance buffer stays at 0-1 entries regardless of round count.

AC4: When the worker extracts Resource Timing data, it uses `PerformanceObserver` (push-based) instead of `setTimeout(0)` + `getEntriesByType()` (poll-based), observable by the absence of `setTimeout(resolve, 0)` in the measurement path and the presence of a `PerformanceObserver` subscription.

AC5: When statistics are displayed, connection reuse state is detected per-sample via `connectStart === connectEnd` from Resource Timing, and the HTTP protocol version is extracted from `nextHopProtocol`, observable as new fields on `TimingPayload` and rendered in `SummaryCard`.
