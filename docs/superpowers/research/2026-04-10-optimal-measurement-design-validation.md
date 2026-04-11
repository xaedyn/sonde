---
date: 2026-04-10
feature: optimal-measurement
type: design-validation
---

# Design Validation — Optimal Measurement Engine

## Acceptance Criteria (from Step 2.5)

AC1: When the engine starts, it fires rounds with 0ms delay (burst phase) for the first 50 rounds, then automatically transitions to a configurable monitor delay (default 3000ms), observable by inspecting `measurementStore` lifecycle/phase state and the actual round dispatch timing.

AC2: When a round is dispatched, the next round does NOT fire until all workers have responded (or the straggler timeout expires), observable by confirming no two rounds have overlapping in-flight workers and that `_scheduleNextRound()` is called only from `_flushRound()`.

AC3: When a worker completes a measurement, the Resource Timing performance buffer is cleared via `performance.clearResourceTimings()`, observable by confirming the entry count in the worker's performance buffer stays at 0-1 entries regardless of round count.

AC4: When the worker extracts Resource Timing data, it uses `PerformanceObserver` (push-based) instead of `setTimeout(0)` + `getEntriesByType()` (poll-based), observable by the absence of `setTimeout(resolve, 0)` in the measurement path and the presence of a `PerformanceObserver` subscription.

AC5: When TAO data is available, connection reuse state is detected per-sample via `connectStart === connectEnd` and HTTP protocol version is extracted from `nextHopProtocol`, observable as new optional fields on `TimingPayload`; when TAO-blocked, these fields are null and UI degrades gracefully.

## Dependency Enumeration

**Modified interfaces:**

1. `Settings` (types.ts) — Adding `burstRounds` and `monitorDelay` fields
   - `measurement-engine.ts` — reads `delay` in `_scheduleNextRound()` → needs phase-aware delay selection
   - `SettingsDrawer.svelte` — binds all settings fields → needs new inputs for burst/monitor
   - `FooterBar.svelte` — displays delay as "Xs interval" → needs phase-aware label
   - `SharePopover.svelte` / `hash-router.ts` — serializes full Settings → needs updated schema
   - `persistence.ts` — v2 normalizer → needs v3 migration

2. `TimingPayload` (types.ts) — Adding `connectionReused` and `protocol` optional fields
   - `worker.ts` — produces TimingPayload → needs to extract new fields
   - `statistics.ts` — averages tier2 fields → needs to handle new optional fields
   - `SummaryCard.svelte` — displays tier2 waterfall → can show new fields when present
   - `SharePayload` — embeds tier2 in serialized samples → wire format change (backward-compatible if optional)

3. `MeasurementEngine` dispatch logic — internal change, no public API change
   - `App.svelte` — calls start()/stop() → no change needed

## Questions Asked & Answers

### Zero Silent Failures
- **What happens to existing users when this ships?**: Existing cookie/localStorage settings are v2. The persistence layer migrates v2→v3, defaulting new fields (`burstRounds: 50`, `monitorDelay: 3000`). Existing `delay` field is preserved for backward compat but only used as `monitorDelay` if `monitorDelay` is absent. No user action required.
- **What happens to existing share URLs?**: Share URLs embed Settings. Old URLs without `burstRounds`/`monitorDelay` are handled by the normalizer filling defaults. New optional fields on TimingPayload (`connectionReused`, `protocol`) are optional — old share URLs without them render correctly.
- **What happens if burst phase produces fewer samples than expected?**: If endpoints error/timeout during burst, the engine still transitions after `burstRounds` rounds, not `burstRounds` successful responses. Phase transition is round-count-based, not sample-count-based.

### Failure at Scale
- **Does response-gated dispatch work at 10x endpoints?**: Yes — with N endpoints per round, the round completes when all N respond or straggler timeout fires. At 10x endpoints (100), the straggler timeout (200ms) is the bottleneck, not the dispatch logic. However, 100 concurrent HEAD requests may hit browser connection limits (Chrome: ~256 total sockets). The existing MAX_ENDPOINTS=10 cap prevents this.
- **What happens with concurrent start/stop?**: Epoch-based invalidation handles this. Each start() increments epoch; stale responses are discarded.
- **What about the straggler orphan bug?**: Fixed by response-gated dispatch. Since `_scheduleNextRound()` moves into `_flushRound()`, the next round doesn't fire until the current round is fully processed. The 200ms timer is still needed as a safety net, but orphaned responses are less likely because rounds don't overlap.

### Simplest Attack
- **N/A** — Pure client-side measurement tool. No server, no auth, no user data beyond settings in localStorage. No new attack surface.

## Gaps Found

1. **Straggler orphan memory leak** — The current `_handleWorkerMessage` re-creates a roundBuffer entry for orphaned responses that arrive after flush. With response-gated dispatch, this is mitigated (rounds don't overlap), but the 200ms straggler timeout can still cause it if a response arrives after flush. Fix: in `_handleWorkerMessage`, check if the roundId has already been flushed (track flushed round IDs) and discard late arrivals.

2. **PerformanceObserver timeout** — If the PerformanceObserver callback never fires (e.g., fetch was aborted before a Resource Timing entry was committed), the worker would hang waiting for the observer. Fix: race the observer promise against the AbortController signal or a timeout.

## Fixes Applied

1. **Orphan fix**: Add a `flushedRounds: Set<number>` to MeasurementEngine. After `_flushRound(roundId)`, add roundId to the set. In `_handleWorkerMessage`, discard messages whose roundId is in `flushedRounds`. Clear the set on `stop()`.

2. **Observer timeout fix**: Race the PerformanceObserver promise against the AbortController's signal. If the signal fires first (timeout or stop), disconnect the observer and fall back to `performance.now() - startMark`.
