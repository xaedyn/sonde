---
date: 2026-04-13
feature: perf-memory-audit
type: research-brief
---

# Research Brief — Performance & Memory Audit

## Problem Summary

Chronoscope must sustain 8+ hour continuous browser sessions without memory growth, render degradation, or GC pauses. The CCB and codebase deep-dive identified 4 actionable hotspots (1 critical, 3 moderate) and 2 non-issues.

## Hotspot Analysis

### 1. Unbounded Sample Arrays — CRITICAL

Samples grow monotonically forever. At 2 endpoints × 1 Hz × 8 hours = 57,600 samples/endpoint. Raw memory (~14MB) is manageable, but the downstream O(n) scans on every store update are the real cost — they turn a 1ms operation into 10ms+ at high sample counts, dropping frames.

**Industry pattern:** Grafana uses `CircularDataFrame` backed by typed arrays with a write pointer mod capacity — zero GC after init. [VERIFIED — grafana/grafana source] The `mnemonist` npm library provides a production-tested `CircularBuffer`. [VERIFIED — yomguithereal/mnemonist GitHub]

### 2. O(n) Derived Computations — MODERATE

Three derived blocks re-scan all samples on every `measurementStore` update:
- `Layout.svelte → sampleTimestamps`: builds Map + dense array from all samples across all endpoints
- `LanesView.svelte → heatmapCellsByEndpoint`: calls `computeHeatmapCells()` per endpoint with no sampleCount guard
- `LanesView.svelte → getLaneProps()`: `samples.filter(s => s.status !== 'ok')` per lane per render — O(n) per lane

The `statisticsStore` already has the correct pattern: memoize on `sampleCount`, skip when unchanged. These three do not.

**Industry pattern:** Svelte `derived()` recomputes on every store write. The idiomatic fix is a separate tail/count signal; derived stores subscribe to the count and short-circuit when unchanged. Rich Harris recommended mutable-object stores with explicit `.set()` for high-frequency data. [VERIFIED — Svelte Summit 2022]

### 3. Statistics Sort Allocation — MODERATE

`computeEndpointStatistics` allocates `latencies.slice().sort()` — O(n log n) — on every new sample. The memoization guard fires once per second per endpoint. At 50,000 samples this is ~2ms per call. Not urgent but grows linearly.

**Fix:** Maintain a persistent insertion-sorted buffer (since samples arrive in order, insertion is O(1) amortized with binary search for the insert point).

### 4. Render Scheduler Permanent Latch — MODERATE

`effectsDisabled` is permanently set after 10 consecutive >12ms frames. No recovery path exists. A transient CPU spike during initial burst (which is 0ms delay = highest throughput) permanently kills sonar effects for the session.

**Industry pattern:** Adaptive frame budgets with hysteresis — track consecutive under-budget frames and re-enable after N good frames. [SINGLE — Chrome developers blog "Long Animation Frames API"]

### 5. GPU/Animation Overhead — MODERATE

- 10 lanes × `backdrop-filter: blur(20px)` = 10 GPU compositor layers running continuously
- 10 lanes × 2 SVG `<animate>` elements = 20 SMIL animations on the main thread (not composited)
- SMIL animations are NOT gated by `prefers-reduced-motion` (unlike the CSS orb animations)

**Industry pattern:** SMIL runs on main thread; CSS `transform`/`opacity` animations are compositor-promoted and cheaper. [VERIFIED — Chrome crbug.com/330178; CSS Animations L1 spec] `backdrop-filter` can be replaced with pre-blurred background or limited to a single container layer. [SINGLE — Chrome DevTools Layers panel measurements]

### Non-Issues (confirmed safe)

- **FreezeDetector**: Uses callback injection, not store polling. Clean.
- **freezeEvents spread**: Fires only on gaps >1000ms — structurally rare. No fix needed.

## Web Worker Memory Note

Workers have their own V8 isolate and GC — they do NOT share heap with the main thread. [VERIFIED — W3C Performance Timeline L2 spec] The existing `performance.clearResourceTimings()` calls in worker.ts prevent buffer growth. Worker-side memory is not a concern.

## Key Design Constraints

- `measurementStore` public API (addSamples, initEndpoint, removeEndpoint, loadSnapshot) must remain compatible — engine, persistence, and share restore all call it
- `EndpointStatistics` shape is part of the share/persistence contract
- `WorkerToMainMessage` / `MainToWorkerMessage` wire format must remain stable
- `MAX_ENDPOINTS = 10` cap is both UI and memory safety bound
