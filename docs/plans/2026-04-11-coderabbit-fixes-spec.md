# CodeRabbit Fixes Spec — Share Validation + FooterBar O(n)

## Problem

Two remaining CodeRabbit findings:
1. `validateSharePayload` accepts malicious URLs (`javascript:`), non-finite/negative numbers, unbounded arrays, and doesn't validate `corsMode`
2. FooterBar rescans every sample O(n) per reactive update to count errors/timeouts

## Done State

- `validateSharePayload` rejects non-HTTP(S) URLs, non-finite/negative numeric fields, oversized arrays (endpoints > 50, results > 50, samples > 10,000), and invalid `corsMode` values
- `measurementStore` tracks `errorCount` and `timeoutCount` incrementally via `addSample`/`addSamples`/`reset`/`loadSnapshot`
- `MeasurementState` type gains `errorCount: number` and `timeoutCount: number`
- FooterBar reads pre-computed counts from the store instead of scanning
- All existing tests pass; new validation edge-case tests added

## Out of Scope

- Refactoring share encoding/compression
- Changing the `SharePayload` type contract
- Any UI changes beyond FooterBar consuming store counts

## Files Changing

1. **Modify:** `src/lib/share/share-manager.ts` — harden `validateSharePayload`
2. **Modify:** `src/lib/types.ts` — add `errorCount`/`timeoutCount` to `MeasurementState`
3. **Modify:** `src/lib/stores/measurements.ts` — incremental error/timeout counters in `addSample`, `addSamples`, `reset`, `loadSnapshot`
4. **Modify:** `src/lib/components/FooterBar.svelte` — consume store counters instead of O(n) scan
5. **Modify:** `tests/unit/share-manager.test.ts` — validation edge case tests

## Edge Cases

- `corsMode` is required in `SharePayload` type — validate strictly as `'no-cors' | 'cors'`
- `keepRounds=0` already handled with ternary — don't regress
- `addSamples` inserts out-of-order via splice; counter increment logic must still be correct (always +1 per sample regardless of insertion position)
- `loadSnapshot` must recompute counts from snapshot data (snapshot comes from share URLs with pre-existing samples)
- `reset` must zero out both counters
- URL validation: allow `http://` and `https://` only; reject empty strings, `javascript:`, `data:`, relative paths
