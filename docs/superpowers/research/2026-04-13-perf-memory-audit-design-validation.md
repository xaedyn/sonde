---
date: 2026-04-13
feature: perf-memory-audit
type: design-validation
---

# Design Validation — Performance & Memory Audit

## Acceptance Criteria (from Step 2.5)

AC1: When a user runs Chronoscope continuously for 8 hours at default settings (2 endpoints, 1000ms monitor cadence), heap memory usage stays below 150MB and does not grow monotonically after the first 10 minutes of operation.

AC2: When 10 endpoints are active at 1000ms monitor cadence, the per-round store update + derived recomputation completes in under 4ms total on a mid-range laptop.

AC3: When the browser tab is backgrounded for 30+ minutes and then foregrounded, Chronoscope resumes measurement within 2 rounds without orphaned timers, stale flush callbacks, or zombie workers accumulating.

AC4: When running at steady state, no individual requestAnimationFrame callback exceeds 16ms for data rendering, and the render scheduler's overload detection does not permanently disable effects during normal operation with ≤10 endpoints.

AC5: When a test session accumulates >50,000 total samples, derived computations in LanesView remain under 2ms per store update.

## Dependency Enumeration

No existing interfaces modified — `measurementStore` public API (`addSamples`, `initEndpoint`, `removeEndpoint`, `loadSnapshot`) retains identical signatures. The ring buffer is an internal implementation detail. `EndpointStatistics` shape is unchanged. Worker message format is unchanged.

New addition: `sessionHistoryStore` (write-only accumulator) — zero existing consumers; only the future detailed results page will read it.

## Questions Asked & Answers

### Zero Silent Failures
- What happens to existing users? Nothing — ring buffer is behind the same store API; UI is identical.
- What happens to existing data? Persistence saves endpoints/settings only (not samples). Share restore via loadSnapshot pushes into ring buffer; payloads are already truncated below ring capacity by truncatePayload().
- What happens to existing integrations? All measurementStore method signatures remain unchanged. Share payloads serialize from ring buffer's toArray() — wire-compatible plain array.
- First deployment step succeeds, second fails? Single atomic Cloudflare Pages deployment — no partial state possible.

### Failure at Scale
- 10x volume? MAX_ENDPOINTS=10 is enforced. At 10 endpoints: ~34MB ring buffer memory, well within 150MB budget.
- Concurrent operations? Engine processes worker messages sequentially on main thread. No concurrent ring buffer writes.
- External dependency unavailable? No external dependencies — fully client-side.

### Simplest Attack
- Cheapest abuse? Malicious share URL — already capped by validateSharePayload (10,000 samples/endpoint, 50 endpoints max). Below ring capacity.
- Auth/authz? No auth exists — client-side tool. No new endpoints.
- Information leakage? Compacted history is session-only, in-memory, not persisted/shared/exposed.

## Gaps Found

1. Compacted history accumulator must be isolated from share and persistence paths to avoid leaking session data into shared URLs or localStorage.

## Fixes Applied

1. Store compacted history in a separate `sessionHistoryStore` rather than embedding in `measurementStore`. This keeps it invisible to all existing consumers (persistence, share, engine). Only the future detailed results page will read it.
