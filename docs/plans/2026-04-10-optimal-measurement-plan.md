---
date: 2026-04-10
feature: optimal-measurement
type: implementation-plan
spec: docs/superpowers/specs/2026-04-10-optimal-measurement-design.md
---

# Implementation Plan — Optimal Measurement Engine

## Phase 1: Core Engine Changes (Tasks 1-5)

### Task 1: Extend types — Settings, TimingPayload, PersistedSettings

**Modify:** `src/lib/types.ts`

1. Add `burstRounds` and `monitorDelay` to `Settings` interface and `DEFAULT_SETTINGS`:
   ```
   Settings {
     timeout: number;
     delay: number;         // kept for backward compat
     burstRounds: number;   // default: 50
     monitorDelay: number;  // default: 3000
     cap: number;
     corsMode: 'no-cors' | 'cors';
   }
   DEFAULT_SETTINGS = { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 3000, cap: 0, corsMode: 'no-cors' }
   ```
   Note: `delay` default changes from 1000 → 0 (burst phase uses 0ms delay).

2. Add optional fields to `TimingPayload`:
   ```
   connectionReused?: boolean;
   protocol?: string;
   ```

3. Update `PersistedSettings` version to 3:
   ```
   version: 2 | 3;  // accept both for migration
   ```

4. Update `SharePayload.settings` to include new fields as optional (backward-compatible).

**Tests affected:** None directly — type-only changes.

---

### Task 2: Settings persistence migration v2 → v3

**Modify:** `src/lib/utils/persistence.ts`

1. Bump `CURRENT_VERSION` to 3.
2. Add v2 → v3 migration in `migrateSettings()`: spread existing settings, add `burstRounds: 50`, `monitorDelay: oldDelay || 3000`.
3. Add `normalizeV3()` that handles all six settings fields with type guards.
4. Keep `normalizeV2()` for incoming v2 data, but have it call through to v3 migration.

**Tests:** Add unit test for v2→v3 migration in `tests/unit/persistence.test.ts` (create if not exists).

---

### Task 3: Worker — PerformanceObserver + buffer cleanup + extended TimingPayload

**Modify:** `src/lib/engine/worker.ts`

1. Replace the `setTimeout(resolve, 0)` + `getEntriesByType` + `filter` pattern with a `raceObserverAgainstSignal()` helper:
   - Creates a `PerformanceObserver` with `{ type: 'resource', buffered: true }`
   - Resolves when a matching entry (by URL) arrives
   - Races against the AbortController signal
   - On signal abort: disconnect observer, fall back to wall-clock timing
   - Feature-detect: if `PerformanceObserver` is unavailable in worker, fall back to `getEntriesByType`

2. After extracting the entry, call `performance.clearResourceTimings()`.

3. In `extractTimingPayload()`, add:
   ```
   connectionReused: hasTao ? (connectStart === connectEnd) : undefined,
   protocol: entry.nextHopProtocol || undefined,
   ```

**Tests:** Update `tests/unit/worker.test.ts` — add tests for new TimingPayload fields.

---

### Task 4: Engine — response-gated dispatch + two-phase cadence + orphan protection

**Modify:** `src/lib/engine/measurement-engine.ts`

1. **Response-gated dispatch:**
   - Remove `this._scheduleNextRound()` from `_dispatchRound()`.
   - Add `this._scheduleNextRound()` to the end of `_flushRound()`, after `addSamples()`, guarded by lifecycle check.

2. **Two-phase cadence:**
   - Add private field `phase: 'burst' | 'monitor'` (default: `'burst'`).
   - In `_scheduleNextRound()`: read `burstRounds` from settings. If `roundCounter < burstRounds`, use delay=0. Otherwise, use `monitorDelay`.
   - Reset `phase` to `'burst'` on `start()`.

3. **Orphan protection:**
   - Add `flushedRounds: Set<number>`.
   - In `_flushRound()`: add roundId to `flushedRounds`.
   - In `_handleWorkerMessage()`: if `flushedRounds.has(roundId)`, discard the message.
   - Clear `flushedRounds` in `stop()`.

4. **Remove redundant scheduling:**
   - Remove the `measurementStore.incrementRound()` + `_scheduleNextRound()` pair from `_dispatchRound()`.
   - Move `measurementStore.incrementRound()` into `_flushRound()` (after samples are committed but before scheduling next round).

   Wait — `roundCounter` is used as `roundId` in the dispatch message. It must be incremented in `_dispatchRound` (before next dispatch uses it). Keep `incrementRound()` in `_dispatchRound()` but move `_scheduleNextRound()` into `_flushRound()`.

**Tests:** Update `tests/unit/measurement-engine.test.ts`:
- Test that next round is not scheduled until flush completes
- Test burst→monitor phase transition
- Test orphan message discard

---

### Task 5: Settings store default update

**Modify:** `src/lib/stores/settings.ts`

1. Update the writable default to use the new `DEFAULT_SETTINGS` (which now includes `burstRounds` and `monitorDelay`).

No other changes — the store shape follows the `Settings` interface.

---

## Phase 2: UI Updates (Tasks 6-8)

### Task 6: SettingsDrawer — burst rounds + monitor interval fields

**Modify:** `src/lib/components/SettingsDrawer.svelte`

1. Add local state for `burstRounds` and `monitorDelay`.
2. Sync from store in the existing `$effect`.
3. Rename "Interval" label to "Monitor interval" and bind to `monitorDelay`.
4. Add new "Burst rounds" field (number input, 0-200, step 10).
5. Add apply handlers that update `settingsStore`.
6. Keep existing `delay` binding for backward compat but hide the field (or remove if `delay` is fully replaced by the phase model).

---

### Task 7: FooterBar — phase-aware label

**Modify:** `src/lib/components/FooterBar.svelte`

1. Derive `burstRounds` from `$settingsStore.burstRounds`.
2. Derive `monitorDelay` from `$settingsStore.monitorDelay`.
3. Update `configLabel`:
   - During burst (roundCounter < burstRounds): `"Burst · {roundCounter}/{burstRounds}"`
   - During monitor: `"{monitorDelay/1000}s interval · {timeout/1000}s timeout"`

---

### Task 8: SummaryCard — protocol badge + connection reuse

**Modify:** `src/lib/components/SummaryCard.svelte`

1. Read `tier2Averages` — if `protocol` is present, display a small badge (e.g., "h2", "h3").
2. Compute connection reuse rate from samples that have `tier2.connectionReused` defined. Display as "X% reused" if available.
3. Both degrade gracefully (hidden) when TAO-blocked.

---

## Phase 3: Verification (Task 9)

### Task 9: Typecheck + lint + test + visual verification

1. Run `npm run typecheck` — zero errors.
2. Run `npm run lint` — zero errors.
3. Run `npm test` — all tests pass, including new ones.
4. Start dev server, open in browser, run a measurement session:
   - Verify burst phase fires rapidly (0ms delay)
   - Verify auto-transition to monitor phase after 50 rounds
   - Verify footer shows phase-aware label
   - Verify settings drawer has burst rounds + monitor interval fields
   - Verify no console errors
5. Compare jitter to S80 — burst phase should show comparable stability.

---

## File Change Summary

| File | Action | Task |
|------|--------|------|
| `src/lib/types.ts` | Modify | 1 |
| `src/lib/utils/persistence.ts` | Modify | 2 |
| `src/lib/engine/worker.ts` | Modify | 3 |
| `src/lib/engine/measurement-engine.ts` | Modify | 4 |
| `src/lib/stores/settings.ts` | Modify | 5 |
| `src/lib/components/SettingsDrawer.svelte` | Modify | 6 |
| `src/lib/components/FooterBar.svelte` | Modify | 7 |
| `src/lib/components/SummaryCard.svelte` | Modify | 8 |
| `tests/unit/persistence.test.ts` | Create/Modify | 2 |
| `tests/unit/worker.test.ts` | Modify | 3 |
| `tests/unit/measurement-engine.test.ts` | Modify | 4 |
