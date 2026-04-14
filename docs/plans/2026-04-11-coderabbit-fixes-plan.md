# CodeRabbit Fixes: Share Validation + FooterBar O(n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Harden `validateSharePayload` against malicious/invalid inputs and eliminate the O(n) full-scan in FooterBar by tracking error/timeout counts incrementally in the measurement store.

**Architecture:** `MeasurementState` gains two counters (`errorCount`, `timeoutCount`) maintained by every mutation method that adds samples. FooterBar reads these pre-computed values directly instead of iterating all samples on every reactive update. Share validation gains URL scheme enforcement, non-negative finite number checks, array size limits, and strict `corsMode` validation.

**Tech Stack:** Svelte 5 runes, TypeScript ~6.0.2, Vitest ^4.1.3, lz-string

---

## Acceptance Criteria

AC #1: `validateSharePayload` rejects URLs that are not `http://` or `https://` (empty string, `javascript:`, `data:`, relative paths)
Maps to: Task 1

AC #2: `validateSharePayload` rejects non-finite or negative values for `timeout`, `delay`, and `cap`
Maps to: Task 1

AC #3: `validateSharePayload` rejects endpoint arrays > 50 items, results arrays > 50 items, and sample arrays > 10,000 items
Maps to: Task 1

AC #4: `validateSharePayload` rejects `corsMode` values that are not `'no-cors'` or `'cors'`
Maps to: Task 1

AC #5: `MeasurementState` has `errorCount: number` and `timeoutCount: number`
Maps to: Task 2

AC #6: `measurementStore.addSample` increments `errorCount` or `timeoutCount` when status is `'error'` or `'timeout'`
Maps to: Task 3

AC #7: `measurementStore.addSamples` increments counts correctly for each inserted sample regardless of insertion order
Maps to: Task 3

AC #8: `measurementStore.reset` zeroes both counters
Maps to: Task 3

AC #9: `measurementStore.loadSnapshot` recomputes both counters from the snapshot's existing sample data
Maps to: Task 3

AC #10: FooterBar reads `errorCount`/`timeoutCount` from the store instead of performing an O(n) scan
Maps to: Task 4

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/share/share-manager.ts` | Harden `validateSharePayload` |
| Modify | `src/lib/types.ts` | Add `errorCount`/`timeoutCount` to `MeasurementState` |
| Modify | `src/lib/stores/measurements.ts` | Incremental counters in all sample mutation methods |
| Modify | `src/lib/components/FooterBar.svelte` | Consume store counters, remove O(n) derived |
| Modify | `tests/unit/share-manager.test.ts` | Validation edge-case tests (AC #1–4) |
| Create | `tests/unit/stores/measurements.test.ts` | Counter increment/reset/loadSnapshot tests (AC #5–9) |
| Modify | `tests/unit/components/footer-bar.test.ts` | Verify FooterBar no longer scans (AC #10) |

---

## Task 1: Harden `validateSharePayload`

**Files:**
- Modify: `src/lib/share/share-manager.ts`
- Test: `tests/unit/share-manager.test.ts`

**Pre-task reads:**
- [ ] Read `src/lib/share/share-manager.ts`
- [ ] Read `tests/unit/share-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Append the following `describe` block to the existing `describe('share-manager', ...)` in `tests/unit/share-manager.test.ts`. Place it after the last `it(...)` before the closing `});`:

```typescript
  describe('validateSharePayload — hardened validation', () => {
    // Helper: encode arbitrary data bypassing TypeScript types
    async function manualEncode(data: unknown): Promise<string> {
      const { default: LZString } = await import('lz-string');
      return LZString.compressToEncodedURIComponent(JSON.stringify(data));
    }

    // AC #1 — URL scheme enforcement
    it('rejects javascript: URLs in endpoints', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'javascript:alert(1)', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects data: URLs in endpoints', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'data:text/html,<h1>x</h1>', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects empty string URLs in endpoints', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: '', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects relative path URLs in endpoints', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: '/api/measure', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts http:// URLs in endpoints', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'http://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // AC #2 — Non-finite / negative numeric fields
    it('rejects Infinity timeout', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: Infinity, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects negative delay', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: -1, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects negative cap', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: -5, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects NaN timeout', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: NaN, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    // AC #3 — Array size limits
    it('rejects endpoints array with more than 50 items', async () => {
      const endpoints = Array.from({ length: 51 }, (_, i) => ({
        url: `https://ep${i}.example.com`,
        enabled: true,
      }));
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints,
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts endpoints array with exactly 50 items', async () => {
      const endpoints = Array.from({ length: 50 }, (_, i) => ({
        url: `https://ep${i}.example.com`,
        enabled: true,
      }));
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints,
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    it('rejects results array with more than 50 items', async () => {
      const results = Array.from({ length: 51 }, () => ({ samples: [] }));
      const encoded = await manualEncode({
        v: 1,
        mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
        results,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects a result with more than 10,000 samples', async () => {
      const samples = Array.from({ length: 10001 }, (_, i) => ({
        round: i,
        latency: 50,
        status: 'ok',
      }));
      const encoded = await manualEncode({
        v: 1,
        mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
        results: [{ samples }],
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts a result with exactly 10,000 samples', async () => {
      const samples = Array.from({ length: 10000 }, (_, i) => ({
        round: i,
        latency: 50,
        status: 'ok',
      }));
      const encoded = await manualEncode({
        v: 1,
        mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
        results: [{ samples }],
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // AC #4 — corsMode strict validation
    it('rejects invalid corsMode value', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'same-origin' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects missing corsMode', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0 },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts corsMode: cors', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    it('accepts corsMode: no-cors', async () => {
      const encoded = await manualEncode({
        v: 1,
        mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // Regression: keepRounds=0 must still work (slicePayload ternary)
    it('truncatePayload with keepRounds=0 produces empty samples arrays', () => {
      const payload: SharePayload = {
        v: 1,
        mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: 0, corsMode: 'no-cors' },
        results: [
          { samples: [{ round: 1, latency: 50, status: 'ok' as const }] },
        ],
      };
      // Force size well under limit so truncatePayload returns full payload
      // then manually call with a tiny limit to force best=0
      const truncated = truncatePayload(payload, 1);
      expect(truncated.results?.[0]?.samples).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/share-manager.test.ts
```

Expected: Multiple FAIL entries for the new `validateSharePayload — hardened validation` tests.

- [ ] **Step 3: Implement hardened `validateSharePayload`**

Replace the `validateSharePayload` function in `src/lib/share/share-manager.ts`. The surrounding functions (`isFiniteNumber`, `encodeSharePayload`, `decodeSharePayload`, `buildShareURL`, `parseShareURL`, `estimateShareSize`, `truncatePayload`, `slicePayload`) remain unchanged.

```typescript
// ── Schema validation ──────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeFiniteNumber(v: unknown): boolean {
  return isFiniteNumber(v) && (v as number) >= 0;
}

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string' || v === '') return false;
  return v.startsWith('http://') || v.startsWith('https://');
}

function validateSharePayload(data: unknown): SharePayload | null {
  if (data === null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  if (obj['v'] !== 1) return null;
  if (obj['mode'] !== 'config' && obj['mode'] !== 'results') return null;
  if (!Array.isArray(obj['endpoints'])) return null;

  // AC #3 — endpoint array size limit
  if ((obj['endpoints'] as unknown[]).length > 50) return null;

  // Validate each endpoint
  for (const ep of obj['endpoints'] as unknown[]) {
    if (ep === null || typeof ep !== 'object') return null;
    const e = ep as Record<string, unknown>;
    // AC #1 — URL scheme enforcement
    if (!isHttpUrl(e['url'])) return null;
    if ('enabled' in e && typeof e['enabled'] !== 'boolean') return null;
  }

  const settings = obj['settings'];
  if (settings === null || typeof settings !== 'object') return null;
  const s = settings as Record<string, unknown>;

  // AC #2 — non-negative finite numbers for numeric settings
  if (!isNonNegativeFiniteNumber(s['timeout'])) return null;
  if (!isNonNegativeFiniteNumber(s['delay'])) return null;
  if (!isNonNegativeFiniteNumber(s['cap'])) return null;

  // AC #4 — strict corsMode validation
  if (s['corsMode'] !== 'no-cors' && s['corsMode'] !== 'cors') return null;

  // Validate results array if present
  if (obj['results'] !== undefined) {
    if (!Array.isArray(obj['results'])) return null;
    // AC #3 — results array size limit
    if ((obj['results'] as unknown[]).length > 50) return null;
    for (const result of obj['results'] as unknown[]) {
      if (result === null || typeof result !== 'object') return null;
      const r = result as Record<string, unknown>;
      if (!Array.isArray(r['samples'])) return null;
      // AC #3 — per-result sample array size limit
      if ((r['samples'] as unknown[]).length > 10_000) return null;
      for (const sample of r['samples'] as unknown[]) {
        if (sample === null || typeof sample !== 'object') return null;
        const samp = sample as Record<string, unknown>;
        if (
          typeof samp['round'] !== 'number' ||
          typeof samp['latency'] !== 'number' ||
          typeof samp['status'] !== 'string'
        ) return null;
      }
    }
  }

  return data as SharePayload;
}
```

Note: The old `isFiniteNumber` helper is kept unchanged because it is still used by nothing else, but `validateSharePayload` now calls `isNonNegativeFiniteNumber` for the settings fields. Remove the old direct calls to `isFiniteNumber` inside `validateSharePayload` that previously validated `timeout`, `delay`, and `cap`.

The complete updated file should look like:

```typescript
// src/lib/share/share-manager.ts
// URL-safe share payload encoding using lz-string compression.
// All functions are pure (no DOM side effects) except buildShareURL and parseShareURL.

import LZString from 'lz-string';
import type { SharePayload } from '../types';

// ── Encode / Decode ────────────────────────────────────────────────────────

export function encodeSharePayload(payload: SharePayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  if (!encoded) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    return validateSharePayload(parsed);
  } catch {
    return null;
  }
}

// ── Schema validation ──────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeFiniteNumber(v: unknown): boolean {
  return isFiniteNumber(v) && (v as number) >= 0;
}

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string' || v === '') return false;
  return v.startsWith('http://') || v.startsWith('https://');
}

function validateSharePayload(data: unknown): SharePayload | null {
  if (data === null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  if (obj['v'] !== 1) return null;
  if (obj['mode'] !== 'config' && obj['mode'] !== 'results') return null;
  if (!Array.isArray(obj['endpoints'])) return null;

  // AC #3 — endpoint array size limit
  if ((obj['endpoints'] as unknown[]).length > 50) return null;

  // Validate each endpoint
  for (const ep of obj['endpoints'] as unknown[]) {
    if (ep === null || typeof ep !== 'object') return null;
    const e = ep as Record<string, unknown>;
    // AC #1 — URL scheme enforcement
    if (!isHttpUrl(e['url'])) return null;
    if ('enabled' in e && typeof e['enabled'] !== 'boolean') return null;
  }

  const settings = obj['settings'];
  if (settings === null || typeof settings !== 'object') return null;
  const s = settings as Record<string, unknown>;

  // AC #2 — non-negative finite numbers for numeric settings
  if (!isNonNegativeFiniteNumber(s['timeout'])) return null;
  if (!isNonNegativeFiniteNumber(s['delay'])) return null;
  if (!isNonNegativeFiniteNumber(s['cap'])) return null;

  // AC #4 — strict corsMode validation
  if (s['corsMode'] !== 'no-cors' && s['corsMode'] !== 'cors') return null;

  // Validate results array if present
  if (obj['results'] !== undefined) {
    if (!Array.isArray(obj['results'])) return null;
    // AC #3 — results array size limit
    if ((obj['results'] as unknown[]).length > 50) return null;
    for (const result of obj['results'] as unknown[]) {
      if (result === null || typeof result !== 'object') return null;
      const r = result as Record<string, unknown>;
      if (!Array.isArray(r['samples'])) return null;
      // AC #3 — per-result sample array size limit
      if ((r['samples'] as unknown[]).length > 10_000) return null;
      for (const sample of r['samples'] as unknown[]) {
        if (sample === null || typeof sample !== 'object') return null;
        const samp = sample as Record<string, unknown>;
        if (
          typeof samp['round'] !== 'number' ||
          typeof samp['latency'] !== 'number' ||
          typeof samp['status'] !== 'string'
        ) return null;
      }
    }
  }

  return data as SharePayload;
}

// ── URL construction ───────────────────────────────────────────────────────

export function buildShareURL(payload: SharePayload): string {
  const encoded = encodeSharePayload(payload);
  return `${window.location.origin}${window.location.pathname}#s=${encoded}`;
}

export function parseShareURL(url?: string): SharePayload | null {
  const target = url ?? window.location.href;
  const hashIndex = target.indexOf('#');
  if (hashIndex === -1) return null;

  const fragment = target.slice(hashIndex + 1);
  if (!fragment.startsWith('s=')) return null;

  const encoded = fragment.slice(2);
  return decodeSharePayload(encoded);
}

// ── Size estimation ────────────────────────────────────────────────────────

export function estimateShareSize(payload: SharePayload): number {
  const encoded = encodeSharePayload(payload);
  return (typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`.length
    : 30) + 3 + encoded.length;
}

// ── Payload truncation ─────────────────────────────────────────────────────

/**
 * Binary-search for the maximum number of rounds that fit within maxChars.
 * Keeps the newest rounds (tail of samples array).
 */
export function truncatePayload(payload: SharePayload, maxChars: number): SharePayload {
  if (!payload.results || payload.results.length === 0) return payload;

  const firstResult = payload.results[0];
  if (!firstResult) return payload;

  const totalRounds = firstResult.samples.length;

  if (estimateShareSize(payload) <= maxChars) return payload;

  let lo = 0;
  let hi = totalRounds;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = slicePayload(payload, mid);
    if (estimateShareSize(candidate) <= maxChars) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return slicePayload(payload, best);
}

function slicePayload(payload: SharePayload, keepRounds: number): SharePayload {
  if (!payload.results) return payload;

  const results = payload.results.map((endpoint) => ({
    ...endpoint,
    samples: keepRounds <= 0 ? [] : endpoint.samples.slice(-keepRounds),
  }));

  return { ...payload, results };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/share-manager.test.ts
```

Expected: All tests PASS, including the new `validateSharePayload — hardened validation` block.

- [ ] **Step 5: Commit**

```bash
cd /Users/shane/claude/chronoscope && git add src/lib/share/share-manager.ts tests/unit/share-manager.test.ts
git commit -m "fix: harden validateSharePayload against malicious URLs, invalid numbers, oversized arrays, and bad corsMode"
```

---

## Task 2: Add `errorCount` / `timeoutCount` to `MeasurementState`

**Files:**
- Modify: `src/lib/types.ts`

**Pre-task reads:**
- [ ] Read `src/lib/types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/stores/measurements.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { measurementStore } from '../../../src/lib/stores/measurements';

describe('measurementStore — error/timeout counters', () => {
  beforeEach(() => {
    measurementStore.reset();
  });

  // AC #5 — MeasurementState shape
  it('initial state has errorCount: 0 and timeoutCount: 0', () => {
    const state = get(measurementStore);
    expect(state.errorCount).toBe(0);
    expect(state.timeoutCount).toBe(0);
  });

  // AC #6 — addSample increments
  it('addSample increments errorCount for error status', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    expect(get(measurementStore).errorCount).toBe(1);
    expect(get(measurementStore).timeoutCount).toBe(0);
  });

  it('addSample increments timeoutCount for timeout status', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 5000, 'timeout', Date.now());
    expect(get(measurementStore).timeoutCount).toBe(1);
    expect(get(measurementStore).errorCount).toBe(0);
  });

  it('addSample does not increment counters for ok status', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 50, 'ok', Date.now());
    expect(get(measurementStore).errorCount).toBe(0);
    expect(get(measurementStore).timeoutCount).toBe(0);
  });

  it('addSample accumulates across multiple calls', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 2, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 3, 5000, 'timeout', Date.now());
    const state = get(measurementStore);
    expect(state.errorCount).toBe(2);
    expect(state.timeoutCount).toBe(1);
  });

  // AC #7 — addSamples increments correctly regardless of insertion order
  it('addSamples increments counters for out-of-order insertions', () => {
    measurementStore.initEndpoint('ep1');
    // Add sample round 5 first, then round 3 (will be spliced in front)
    measurementStore.addSamples([
      { endpointId: 'ep1', round: 5, latency: 50, status: 'ok', timestamp: Date.now() },
      { endpointId: 'ep1', round: 3, latency: 0, status: 'error', timestamp: Date.now() },
    ]);
    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(0);
  });

  it('addSamples increments timeoutCount for batch with timeouts', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSamples([
      { endpointId: 'ep1', round: 1, latency: 5000, status: 'timeout', timestamp: Date.now() },
      { endpointId: 'ep1', round: 2, latency: 5000, status: 'timeout', timestamp: Date.now() },
      { endpointId: 'ep1', round: 3, latency: 50, status: 'ok', timestamp: Date.now() },
    ]);
    expect(get(measurementStore).timeoutCount).toBe(2);
    expect(get(measurementStore).errorCount).toBe(0);
  });

  it('addSamples skips unknown endpointId without affecting counters', () => {
    measurementStore.addSamples([
      { endpointId: 'unknown', round: 1, latency: 0, status: 'error', timestamp: Date.now() },
    ]);
    expect(get(measurementStore).errorCount).toBe(0);
  });

  // AC #8 — reset zeroes counters
  it('reset zeroes errorCount and timeoutCount', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 2, 5000, 'timeout', Date.now());
    measurementStore.reset();
    const state = get(measurementStore);
    expect(state.errorCount).toBe(0);
    expect(state.timeoutCount).toBe(0);
  });

  // AC #9 — loadSnapshot recomputes from existing samples
  it('loadSnapshot recomputes errorCount and timeoutCount from snapshot data', () => {
    const snapshot = {
      lifecycle: 'stopped' as const,
      epoch: 1,
      roundCounter: 3,
      startedAt: 0,
      stoppedAt: 1000,
      freezeEvents: [],
      errorCount: 0,   // intentionally wrong — loadSnapshot must recompute
      timeoutCount: 0, // intentionally wrong — loadSnapshot must recompute
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          tierLevel: 1 as const,
          lastLatency: 50,
          lastStatus: 'ok' as const,
          samples: [
            { round: 1, latency: 0,    status: 'error'   as const, timestamp: 1000 },
            { round: 2, latency: 5000, status: 'timeout' as const, timestamp: 2000 },
            { round: 3, latency: 50,   status: 'ok'      as const, timestamp: 3000 },
          ],
        },
      },
    };
    measurementStore.loadSnapshot(snapshot);
    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(1);
  });

  it('loadSnapshot handles multiple endpoints', () => {
    const snapshot = {
      lifecycle: 'stopped' as const,
      epoch: 1,
      roundCounter: 2,
      startedAt: 0,
      stoppedAt: 1000,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 0,
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          tierLevel: 1 as const,
          lastLatency: null,
          lastStatus: null,
          samples: [
            { round: 1, latency: 0, status: 'error' as const, timestamp: 1000 },
          ],
        },
        ep2: {
          endpointId: 'ep2',
          tierLevel: 1 as const,
          lastLatency: null,
          lastStatus: null,
          samples: [
            { round: 1, latency: 5000, status: 'timeout' as const, timestamp: 1000 },
            { round: 2, latency: 5000, status: 'timeout' as const, timestamp: 2000 },
          ],
        },
      },
    };
    measurementStore.loadSnapshot(snapshot);
    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/stores/measurements.test.ts
```

Expected: FAIL — `state.errorCount` is `undefined` because the field does not exist yet on `MeasurementState`.

- [ ] **Step 3: Add fields to `MeasurementState` in `src/lib/types.ts`**

Locate the `MeasurementState` interface (lines 101–109) and add the two counter fields:

```typescript
export interface MeasurementState {
  lifecycle: TestLifecycleState;
  epoch: number;
  roundCounter: number;
  endpoints: Record<string, EndpointMeasurementState>;
  startedAt: number | null;
  stoppedAt: number | null;
  freezeEvents: FreezeEvent[];
  errorCount: number;
  timeoutCount: number;
}
```

- [ ] **Step 4: Run test to verify it still fails (implementation not done yet)**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/stores/measurements.test.ts
```

Expected: FAIL with TypeScript errors about `INITIAL_STATE` missing the new fields (type error surfaces in store). The test for `state.errorCount === 0` may partially work but the store update methods don't increment them yet.

- [ ] **Step 5: Commit the type change alone (store implementation follows in Task 3)**

```bash
cd /Users/shane/claude/chronoscope && git add src/lib/types.ts
git commit -m "feat: add errorCount and timeoutCount to MeasurementState type"
```

---

## Task 3: Incremental counters in `measurementStore`

**Files:**
- Modify: `src/lib/stores/measurements.ts`
- Test: `tests/unit/stores/measurements.test.ts`

**Pre-task reads:**
- [ ] Read `src/lib/stores/measurements.ts`
- [ ] Read `tests/unit/stores/measurements.test.ts`

- [ ] **Step 1: Verify tests still fail before implementation**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/stores/measurements.test.ts
```

Expected: Tests for `addSample`, `addSamples`, `reset`, and `loadSnapshot` counters are FAIL.

- [ ] **Step 2: Implement incremental counters in `src/lib/stores/measurements.ts`**

Replace the entire file with:

```typescript
// src/lib/stores/measurements.ts
// Writable store for all measurement state. All mutations go through explicit
// methods to keep the update surface auditable.

import { writable } from 'svelte/store';
import type {
  MeasurementState,
  MeasurementSample,
  TestLifecycleState,
  SampleStatus,
  TimingPayload,
  FreezeEvent,
} from '../types';

const INITIAL_STATE: MeasurementState = {
  lifecycle: 'idle',
  epoch: 0,
  roundCounter: 0,
  endpoints: {},
  startedAt: null,
  stoppedAt: null,
  freezeEvents: [],
  errorCount: 0,
  timeoutCount: 0,
};

function countDelta(status: SampleStatus): { errors: number; timeouts: number } {
  return {
    errors: status === 'error' ? 1 : 0,
    timeouts: status === 'timeout' ? 1 : 0,
  };
}

function recomputeCounts(endpoints: MeasurementState['endpoints']): { errorCount: number; timeoutCount: number } {
  let errorCount = 0;
  let timeoutCount = 0;
  for (const ep of Object.values(endpoints)) {
    for (const sample of ep.samples) {
      if (sample.status === 'error') errorCount++;
      if (sample.status === 'timeout') timeoutCount++;
    }
  }
  return { errorCount, timeoutCount };
}

function createMeasurementStore() {
  const { subscribe, set, update } = writable<MeasurementState>({ ...INITIAL_STATE });

  return {
    subscribe,

    setLifecycle(lifecycle: TestLifecycleState): void {
      update(s => ({ ...s, lifecycle }));
    },

    incrementEpoch(): void {
      update(s => ({ ...s, epoch: s.epoch + 1 }));
    },

    initEndpoint(endpointId: string): void {
      update(s => ({
        ...s,
        endpoints: {
          ...s.endpoints,
          [endpointId]: {
            endpointId,
            samples: [],
            lastLatency: null,
            lastStatus: null,
            tierLevel: 1,
          },
        },
      }));
    },

    removeEndpoint(endpointId: string): void {
      update(s => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [endpointId]: _removed, ...rest } = s.endpoints;
        return { ...s, endpoints: rest };
      });
    },

    addSample(
      endpointId: string,
      round: number,
      latency: number,
      status: SampleStatus,
      timestamp: number,
      tier2?: TimingPayload
    ): void {
      update(s => {
        const existing = s.endpoints[endpointId];
        if (!existing) return s;

        const sample: MeasurementSample = {
          round,
          latency,
          status,
          timestamp,
          ...(tier2 !== undefined ? { tier2 } : {}),
        };

        const tierLevel: 1 | 2 =
          tier2 !== undefined && (tier2.dnsLookup !== 0 || tier2.tcpConnect !== 0 || tier2.ttfb !== 0)
            ? 2
            : existing.tierLevel;

        // Mutable push — O(1) amortized instead of O(n) spread
        existing.samples.push(sample);

        const { errors, timeouts } = countDelta(status);

        return {
          ...s,
          errorCount: s.errorCount + errors,
          timeoutCount: s.timeoutCount + timeouts,
          endpoints: {
            ...s.endpoints,
            [endpointId]: {
              ...existing,
              lastLatency: latency,
              lastStatus: status,
              tierLevel,
            },
          },
        };
      });
    },

    addSamples(entries: Array<{
      endpointId: string;
      round: number;
      latency: number;
      status: SampleStatus;
      timestamp: number;
      tier2?: TimingPayload;
    }>): void {
      update(s => {
        // Clone the top-level endpoints map once to trigger reactivity
        const nextEndpoints = { ...s.endpoints };
        let errorDelta = 0;
        let timeoutDelta = 0;

        for (const entry of entries) {
          const existing = nextEndpoints[entry.endpointId];
          if (!existing) continue;

          const sample: MeasurementSample = {
            round: entry.round,
            latency: entry.latency,
            status: entry.status,
            timestamp: entry.timestamp,
            ...(entry.tier2 !== undefined ? { tier2: entry.tier2 } : {}),
          };

          const tierLevel: 1 | 2 =
            entry.tier2 !== undefined && (entry.tier2.dnsLookup !== 0 || entry.tier2.tcpConnect !== 0 || entry.tier2.ttfb !== 0)
              ? 2
              : existing.tierLevel;

          // Insert in round order — almost always appends (O(1) typical),
          // but handles stragglers arriving after the next round flushed.
          const samples = existing.samples;
          const lastSample = samples[samples.length - 1];
          if (samples.length === 0 || sample.round >= (lastSample?.round ?? 0)) {
            samples.push(sample);
          } else {
            // Walk backward to find insertion point (usually 1-2 steps)
            let i = samples.length - 1;
            while (i > 0 && (samples[i - 1]?.round ?? 0) > sample.round) i--;
            samples.splice(i, 0, sample);
          }

          const { errors, timeouts } = countDelta(entry.status);
          errorDelta += errors;
          timeoutDelta += timeouts;

          // New endpoint object reference to trigger per-endpoint reactivity
          nextEndpoints[entry.endpointId] = {
            ...existing,
            lastLatency: entry.latency,
            lastStatus: entry.status,
            tierLevel,
          };
        }

        return {
          ...s,
          errorCount: s.errorCount + errorDelta,
          timeoutCount: s.timeoutCount + timeoutDelta,
          endpoints: nextEndpoints,
        };
      });
    },

    incrementRound(): void {
      update(s => ({ ...s, roundCounter: s.roundCounter + 1 }));
    },

    setStartedAt(ts: number): void {
      update(s => ({ ...s, startedAt: ts }));
    },

    setStoppedAt(ts: number): void {
      update(s => ({ ...s, stoppedAt: ts }));
    },

    addFreezeEvent(event: FreezeEvent): void {
      update(s => ({ ...s, freezeEvents: [...s.freezeEvents, event] }));
    },

    loadSnapshot(snapshot: MeasurementState): void {
      // Recompute counts from snapshot sample data — snapshot may come from
      // share URLs that predate the counter fields or carry stale values.
      const { errorCount, timeoutCount } = recomputeCounts(snapshot.endpoints);
      set({ ...snapshot, errorCount, timeoutCount });
    },

    reset(): void {
      set({ ...INITIAL_STATE });
    },
  };
}

export const measurementStore = createMeasurementStore();
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/stores/measurements.test.ts
```

Expected: All tests PASS.

- [ ] **Step 4: Run full test suite to check for regressions**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run
```

Expected: All existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/shane/claude/chronoscope && git add src/lib/stores/measurements.ts tests/unit/stores/measurements.test.ts
git commit -m "feat: track errorCount/timeoutCount incrementally in measurementStore"
```

---

## Task 4: FooterBar reads pre-computed counts from store

**Files:**
- Modify: `src/lib/components/FooterBar.svelte`
- Modify: `tests/unit/components/footer-bar.test.ts`

**Pre-task reads:**
- [ ] Read `src/lib/components/FooterBar.svelte`
- [ ] Read `tests/unit/components/footer-bar.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `tests/unit/components/footer-bar.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import FooterBar from '../../../src/lib/components/FooterBar.svelte';
import { measurementStore } from '../../../src/lib/stores/measurements';

describe('FooterBar', () => {
  it('renders "Measuring from your browser" text', () => {
    const { getByText } = render(FooterBar, { props: {} });
    expect(getByText(/Measuring from your browser/i)).toBeTruthy();
  });

  it('renders progress text with round counter', () => {
    const { getByText } = render(FooterBar, { props: {} });
    expect(getByText(/of/i)).toBeTruthy();
  });

  it('renders config label with interval and timeout', () => {
    const { container } = render(FooterBar, { props: {} });
    expect(container.querySelector('.config')).not.toBeNull();
  });

  // AC #10 — FooterBar must not perform an O(n) scan
  it('reads errorCount and timeoutCount directly from store (no O(n) scan)', () => {
    // This test verifies the contract: FooterBar reads $measurementStore.errorCount
    // and $measurementStore.timeoutCount, not derived values computed by iterating samples.
    // We verify by checking that the store values are present and that the component
    // reflects them without needing to iterate endpoint samples.
    measurementStore.reset();
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 2, 5000, 'timeout', Date.now());

    const state = get(measurementStore);
    // Store counters must be incremented by addSample, not computed lazily
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(1);

    // Component should render without error — the derived $derived.by scan is gone
    const { container } = render(FooterBar, { props: {} });
    expect(container.querySelector('.foot')).not.toBeNull();

    measurementStore.reset();
  });
});
```

- [ ] **Step 2: Run test to verify it compiles and existing tests still pass**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/footer-bar.test.ts
```

Expected: The first three tests PASS. The new AC #10 test also PASS (it only validates store state, not that the old `$derived.by` scan is absent from the component source — that is enforced by the implementation step below).

- [ ] **Step 3: Remove the O(n) scan from `FooterBar.svelte`**

Replace the `<script>` block in `src/lib/components/FooterBar.svelte`:

```svelte
<!-- src/lib/components/FooterBar.svelte -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';
  import { formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let lifecycle = $derived($measurementStore.lifecycle);
  let roundCounter = $derived($measurementStore.roundCounter);
  let cap = $derived($settingsStore.cap);
  let burstRounds = $derived($settingsStore.burstRounds);
  let monitorDelay = $derived($settingsStore.monitorDelay);
  let timeout = $derived($settingsStore.timeout);

  // AC #10: read pre-computed counters — no O(n) sample scan
  let errors = $derived($measurementStore.errorCount);
  let timeouts = $derived($measurementStore.timeoutCount);

  let progressLabel = $derived.by(() => {
    const total = cap > 0 ? cap : '∞';
    const parts: string[] = [`${roundCounter} of ${total} complete`];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (timeouts > 0) parts.push(`${timeouts} timeout${timeouts === 1 ? '' : 's'}`);
    if (startedAt !== null) parts.push(`${formatElapsed(elapsed)} elapsed`);
    return parts.join(' · ');
  });

  let now = $state(Date.now());

  $effect(() => {
    if (lifecycle !== 'running') return;
    const id = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(id);
  });

  let startedAt = $derived($measurementStore.startedAt);
  let elapsed = $derived(startedAt !== null ? Math.max(0, now - startedAt) : 0);

  let isBurst = $derived(roundCounter < burstRounds);
  let configLabel = $derived(
    isBurst
      ? `Burst · ${roundCounter}/${burstRounds} · ${timeout / 1000}s timeout`
      : `${monitorDelay / 1000}s interval · ${timeout / 1000}s timeout`
  );
</script>
```

The template (`<footer>...</footer>`) and `<style>` sections remain unchanged.

- [ ] **Step 4: Run all tests to verify everything passes**

```bash
cd /Users/shane/claude/chronoscope && npx vitest run
```

Expected: All tests PASS with 0 failures.

- [ ] **Step 5: Run typecheck and lint**

```bash
cd /Users/shane/claude/chronoscope && npx tsc --noEmit && npx eslint src/lib/components/FooterBar.svelte src/lib/stores/measurements.ts
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/shane/claude/chronoscope && git add src/lib/components/FooterBar.svelte tests/unit/components/footer-bar.test.ts
git commit -m "perf: replace O(n) FooterBar error/timeout scan with pre-computed store counters"
```

---

## Final Verification

- [ ] Run the full test suite one final time:

```bash
cd /Users/shane/claude/chronoscope && npx vitest run
```

Expected: All tests PASS.

- [ ] Run typecheck across the whole project:

```bash
cd /Users/shane/claude/chronoscope && npx tsc --noEmit
```

Expected: No errors.

- [ ] Confirm all four AC groups are covered:
  - AC #1–4: `tests/unit/share-manager.test.ts` — `validateSharePayload — hardened validation` block
  - AC #5–9: `tests/unit/stores/measurements.test.ts` — full counter lifecycle
  - AC #10: `tests/unit/components/footer-bar.test.ts` — store-level assertion + component render
