---
date: 2026-04-10
feature: optimal-measurement
type: spec
---

# Spec — Optimal Measurement Engine

## Problem

Sonde's measurement engine produces significantly higher variance and less stable readings than comparable tools (S80). Root causes: time-gated round dispatch creates overlapping rounds with self-inflicted network contention, Resource Timing buffer grows unbounded causing O(n) scans, and a fixed delay provides no distinction between baseline establishment and ongoing monitoring. Users see noisy charts and unreliable statistics that don't reflect true connection quality.

## Success Metrics

- **Burst phase jitter**: P75-P25 (IQR) of latency during burst phase is ≤15ms for endpoints with <50ms baseline RTT (Google, GitHub)
- **No round overlap**: Zero concurrent in-flight rounds at any point during measurement
- **Resource Timing buffer**: Worker performance buffer stays at 0-1 entries regardless of session duration
- **Phase transition**: Engine automatically transitions from burst to monitor after configured round count
- **Backward compatibility**: Existing share URLs and localStorage settings load without error

## Out of Scope

- Bufferbloat / loaded latency testing (requires connection saturation)
- Changing default endpoint count (keep existing defaults; users configure their own)
- ICMP ping or traceroute (impossible from browser)
- Server-side measurement infrastructure
- Changing the statistics algorithms (percentile method, CI formula)

## Design

### 1. Response-Gated Round Dispatch

Replace time-gated scheduling with response-gated scheduling. Remove `_scheduleNextRound()` call from `_dispatchRound()`. Instead, call it from `_flushRound()` after all responses are processed.

Current flow:
```
_dispatchRound() → postMessage to workers → _scheduleNextRound() → setTimeout(delay)
                                           ↑ fires immediately, overlaps rounds
```

New flow:
```
_dispatchRound() → postMessage to workers → [wait for responses]
                                                    ↓
_flushRound() → addSamples() → _scheduleNextRound() → setTimeout(phaseDelay)
```

### 2. Two-Phase Cadence

Add `phase` state to MeasurementEngine: `'burst' | 'monitor'`.

**Burst phase** (default: first 50 rounds):
- Delay: 0ms between rounds
- Purpose: establish baseline RTT, warm connections, collect enough samples for confident statistics
- Transition: after `burstRounds` rounds dispatched, switch to monitor phase

**Monitor phase** (indefinite):
- Delay: configurable `monitorDelay` (default: 3000ms)
- Purpose: track stability, detect degradation, calculate rolling jitter/loss

Phase state is tracked in MeasurementEngine (not in the store — it's engine-internal scheduling logic). The store's `roundCounter` is sufficient for UI to derive which phase is active.

### 3. Settings Model Update

Add two new fields to `Settings`:
```typescript
burstRounds: number;   // default: 50, rounds before switching to monitor
monitorDelay: number;  // default: 3000ms, delay between rounds in monitor phase
```

Existing `delay` field is **kept for backward compatibility** — it becomes the monitor delay when `monitorDelay` is absent (migration path). New installs use `monitorDelay`.

Persistence version bumps from 2 → 3. Migration: v2 settings get `burstRounds: 50` and `monitorDelay: oldDelay || 3000`.

### 4. PerformanceObserver in Worker

Replace the poll-based Resource Timing extraction:

```typescript
// REMOVE:
await new Promise<void>(resolve => setTimeout(resolve, 0));
const entries = performance.getEntriesByType('resource');
const filtered = entries.filter(e => e.name === url);

// REPLACE WITH:
const entry = await raceObserverAgainstSignal(url, signal);
performance.clearResourceTimings();
```

The `raceObserverAgainstSignal` helper creates a PerformanceObserver that resolves when a matching entry arrives, raced against the AbortController signal. If the signal fires first (timeout, stop), the observer disconnects and falls back to wall-clock timing.

### 5. Resource Timing Buffer Cleanup

After extracting a Resource Timing entry (or on fallback), call `performance.clearResourceTimings()` in the worker. This keeps the buffer at 0-1 entries indefinitely.

### 6. Extended TimingPayload

Add two optional fields:
```typescript
interface TimingPayload {
  // ... existing fields unchanged ...
  connectionReused?: boolean;  // true when connectStart === connectEnd (and TAO present)
  protocol?: string;           // from nextHopProtocol (e.g., "h2", "h3", "http/1.1")
}
```

Both are null/undefined when TAO-blocked (cross-origin without Timing-Allow-Origin header). The existing `hasTao` detection logic determines availability.

### 7. Orphan Response Protection

Add `flushedRounds: Set<number>` to MeasurementEngine. After `_flushRound(roundId)`, add roundId to the set. In `_handleWorkerMessage`, discard messages whose roundId is in `flushedRounds`. Clear on `stop()`.

### 8. UI Updates

**FooterBar**: Show phase-aware label: "Burst · 12/50" during burst, "3.0s interval" during monitor.

**SettingsDrawer**: Add inputs for "Burst rounds" and "Monitor interval". Keep existing "Delay" label but rename to "Monitor interval" with the new field.

**SummaryCard**: When tier2 data includes `connectionReused` or `protocol`, display a small badge (e.g., "h2" or "H3") and connection reuse indicator. No change when TAO-blocked.

## Security Surface

No new attack surface. Pure client-side changes. No new endpoints, no auth, no PII. Settings stored in localStorage (existing pattern). Share URLs include new settings fields (public by design).

## Rollout

**Backward compatibility**: 
- Old localStorage (v2) migrated to v3 with sensible defaults
- Old share URLs without new fields handled by normalizer
- New optional TimingPayload fields are backward-compatible (undefined when absent)
- No breaking changes to any public interface

**Rollback plan**: Revert the commit. All changes are contained to engine/worker/types/settings layers. No data migration needed — v3 settings degrade gracefully to v2 behavior if `burstRounds`/`monitorDelay` are missing.

## Edge Cases

- **All endpoints disabled**: Engine starts but no workers spawn. Burst phase completes after `burstRounds` rounds with zero dispatches, transitions to monitor. No errors.
- **Single endpoint**: Burst and monitor work identically — just one worker per round.
- **Endpoint added mid-session**: New worker spawned, joins next round. Phase is not reset — new endpoint gets burst-level rapid sampling only if still in burst phase.
- **Stop during burst**: Engine stops, phase resets. Next start() begins fresh burst.
- **Resume after stop**: Engine preserves existing samples but restarts burst phase for fresh baseline.
- **PerformanceObserver never fires**: Raced against AbortController signal. Falls back to wall-clock timing after timeout.
- **Browser doesn't support PerformanceObserver in Worker**: Feature-detect. Fall back to existing `getEntriesByType` with `clearResourceTimings()` after each call.
- **Share URL with burstRounds=0**: Treated as "skip burst, go directly to monitor". Valid configuration.
