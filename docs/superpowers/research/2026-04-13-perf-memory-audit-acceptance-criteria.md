---
date: 2026-04-13
feature: perf-memory-audit
type: acceptance-criteria
---

# Acceptance Criteria — Performance & Memory Audit

AC1: When a user runs Chronoscope continuously for 8 hours at default settings (2 endpoints, 1000ms monitor cadence), heap memory usage stays below 150MB and does not grow monotonically after the first 10 minutes of operation (measured via Chrome DevTools heap snapshot at t=10min, t=1hr, t=4hr, t=8hr).

AC2: When 10 endpoints are active at 1000ms monitor cadence, the per-round store update + derived recomputation completes in under 4ms total on a mid-range laptop (measured via Performance.now() instrumentation around addSamples + reactive flush), ensuring the main thread is never blocked long enough to drop a 60fps frame.

AC3: When the browser tab is backgrounded for 30+ minutes and then foregrounded, Chronoscope resumes measurement within 2 rounds without orphaned timers, stale flush callbacks, or zombie workers accumulating (verified by checking worker count and timer count before/after background cycle).

AC4: When running at steady state (post-burst, monitor cadence), no individual requestAnimationFrame callback exceeds 16ms for data rendering, and the render scheduler's overload detection does not permanently disable effects during normal operation with ≤10 endpoints (verified by profiling the render loop for 1000 consecutive frames).

AC5: When a test session accumulates >50,000 total samples, derived computations in LanesView (sampleTimestamps, heatmapCells, laneProps) remain under 2ms per store update (measured via performance marks), confirming O(n) full-scan paths have been eliminated or bounded.
