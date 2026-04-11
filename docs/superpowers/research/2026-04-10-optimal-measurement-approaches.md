---
date: 2026-04-10
feature: optimal-measurement
type: approaches
---

# Approach Decision Memos — Optimal Measurement Engine

## APPROACH: Response-Gated Two-Phase Engine

### CORE IDEA

Replace time-gated round dispatch with response-gated dispatch, add automatic burst→monitor phase transition, fix Resource Timing extraction, and surface connection metadata.

### MECHANISM

The engine tracks a `phase` state: `burst` (first N rounds, 0ms delay, response-gated) and `monitor` (subsequent rounds, configurable delay, response-gated). In both phases, the next round fires only after the current round's responses are fully collected (or straggler timeout expires). This eliminates round overlap and self-inflicted network contention.

The worker switches from `setTimeout(0)` + `getEntriesByType()` polling to a `PerformanceObserver` subscription for push-based Resource Timing entry delivery. After extracting each entry, `performance.clearResourceTimings()` prevents unbounded buffer growth. Two new fields are added to `TimingPayload`: `connectionReused` (boolean, from `connectStart === connectEnd`) and `protocol` (string, from `nextHopProtocol`).

Default endpoints are reduced from 10 to 3 (Google, Cloudflare 1.1.1.1, GitHub) for signal over noise.

### FIT ASSESSMENT

- **Scale fit**: Matches — reduces network load vs current approach (fewer overlapping requests)
- **Team fit**: Fits — changes are contained to engine layer + worker, same patterns
- **Operational**: No new infrastructure. Pure client-side changes.
- **Stack alignment**: Fits existing — Svelte stores, Web Workers, TypeScript, same test patterns

### TRADEOFFS

- **Strong at**: Measurement accuracy, reduced variance, clear phase separation, no self-inflicted contention
- **Sacrifices**: Burst phase fires faster than current 500ms interval (may concern users testing against rate-limited endpoints). Monitor phase fires slower (3s default vs 500ms), meaning fewer data points per minute during monitoring.

### WHAT WE'D BUILD

1. Response-gated dispatch in MeasurementEngine (move `_scheduleNextRound()` into `_flushRound()`)
2. Phase state machine (burst → monitor auto-transition after N rounds)
3. PerformanceObserver-based timing extraction in worker
4. Resource Timing buffer cleanup in worker
5. Extended TimingPayload with connectionReused + protocol fields
6. Settings model update (burstRounds, monitorDelay as new fields)
7. UI updates: phase indicator, connection reuse display, protocol badge
8. Reduced default endpoints (3 instead of 10)

### THE BET

Response-gated dispatch with burst phase will produce measurably lower jitter and more stable baseline readings than the current time-gated approach, making Sonde's output comparable to or better than S80's stability.

### REVERSAL COST

Easy — all changes are in the engine/worker layer with clear interfaces. Reverting to time-gated dispatch is a single-method change.

### WHAT WE'RE NOT BUILDING

- Bufferbloat / loaded latency testing (requires connection saturation — out of scope)
- Server-side measurement infrastructure
- ICMP ping or traceroute (impossible from browser)
- Parallel request stress testing

### INDUSTRY PRECEDENT

Apple's Network Quality tool uses a burst+monitor approach for RPM measurement [SINGLE — Apple developer documentation]. Ookla's Speedtest methodology uses response-gated probe scheduling [SINGLE — Ookla whitepaper]. RIPE Atlas probes use configurable intervals with response-gated dispatch [VERIFIED — RIPE NCC documentation].

---

## Comparison Matrix

| Criterion | Response-Gated Two-Phase Engine |
|-----------|--------------------------------|
| AC1: Burst→monitor phase transition | STRONG — Core design feature, explicit phase state machine |
| AC2: Response-gated dispatch (no overlap) | STRONG — `_scheduleNextRound()` moves into `_flushRound()` |
| AC3: Resource Timing buffer cleanup | STRONG — `clearResourceTimings()` after each extraction |
| AC4: PerformanceObserver instead of polling | STRONG — Push-based, eliminates `setTimeout(0)` yield |
| AC5: Connection reuse + protocol detection | STRONG — New TimingPayload fields from Resource Timing |
| Scale fit | STRONG — Reduces load vs current approach |
| Team fit | STRONG — Same patterns, same test approach |
| Operational burden | STRONG — Zero new dependencies |
| Stack alignment | STRONG — Pure TypeScript, Svelte stores, Web Workers |

Only one approach presented — the alternatives (keeping time-gated dispatch, or switching to a completely different measurement library) are strictly inferior given the analysis.
