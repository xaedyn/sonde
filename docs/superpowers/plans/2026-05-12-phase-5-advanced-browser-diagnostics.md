# Phase 5 Advanced Browser Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add higher-value no-install diagnostics while keeping the browser-first promise honest.

**Architecture:** Add advanced evidence as optional Investigate modules that feed the evidence trail only when useful. Every module declares its vantage point: browser, Cloudflare function, outside resolver, or topology context. None of these features may imply true local packet path, WiFi, raw DNS trace, or TLS chain proof without the local agent.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Cloudflare Pages Functions, existing saturation endpoint, Playwright visual tests.

---

## File Structure

- Create `src/lib/loss/patterns.ts` and `tests/unit/loss/patterns.test.ts`.
- Create `src/lib/bufferbloat/bufferbloat-test.ts`, `src/lib/stores/bufferbloat.ts`, and tests under `tests/unit/bufferbloat`.
- Reuse `functions/api/vantage/saturation.ts` and `functions/_shared/remote-vantage.ts`.
- Create `functions/api/vantage/dns.ts` and shared DNS helper if DNS-over-HTTPS is implemented through Cloudflare Pages Functions.
- Create `src/lib/dns/doh-insight.ts` and `tests/unit/dns/doh-insight.test.ts`.
- Create `functions/api/vantage/topology.ts`, `src/lib/topology/asn-context.ts`, and `tests/unit/topology/asn-context.test.ts` for BGP/ASN context.
- Modify `src/lib/components/DiagnoseView.svelte` to place advanced modules behind compact optional controls.
- Modify `src/lib/components/ReportView.svelte` and `src/lib/utils/evidence-trail.ts` only when an advanced result is captured and useful.

## Task 1: Loss Pattern Classification

**Files:**
- Create: `src/lib/loss/patterns.ts`
- Create: `tests/unit/loss/patterns.test.ts`
- Modify: `src/lib/utils/diagnostic-narrative.ts` if loss pattern becomes a triage claim.

- [ ] **Step 1: Write loss pattern tests**

Create `tests/unit/loss/patterns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyLossPattern } from '../../../src/lib/loss/patterns';
import type { MeasurementSample } from '../../../src/lib/types';

const ok = (round: number): MeasurementSample => ({ round, latency: 40, status: 'ok', timestamp: round });
const timeout = (round: number): MeasurementSample => ({ round, latency: 5000, status: 'timeout', timestamp: round });

describe('classifyLossPattern', () => {
  it('returns insufficient data for short runs', () => {
    expect(classifyLossPattern([ok(1), timeout(2)])).toMatchObject({ kind: 'insufficient-data' });
  });

  it('classifies burst failures without implying cause', () => {
    const samples = [ok(1), ok(2), timeout(3), timeout(4), timeout(5), ok(6), ok(7), ok(8), ok(9), ok(10)];
    expect(classifyLossPattern(samples)).toMatchObject({
      kind: 'burst',
      safeSummary: 'Failed requests are clustered in a short burst.',
    });
  });

  it('classifies periodic failures when gaps are regular', () => {
    const samples = Array.from({ length: 30 }, (_, index) => (index + 1) % 5 === 0 ? timeout(index + 1) : ok(index + 1));
    expect(classifyLossPattern(samples)).toMatchObject({ kind: 'periodic' });
  });
});
```

- [ ] **Step 2: Implement loss classifier**

Create `src/lib/loss/patterns.ts`:

```ts
import type { MeasurementSample } from '../types';

export type LossPatternKind = 'none' | 'insufficient-data' | 'random' | 'burst' | 'periodic';

export interface LossPattern {
  readonly kind: LossPatternKind;
  readonly failedCount: number;
  readonly totalCount: number;
  readonly safeSummary: string;
}

export function classifyLossPattern(samples: readonly MeasurementSample[]): LossPattern {
  const failedRounds = samples.filter((sample) => sample.status !== 'ok').map((sample) => sample.round);
  if (samples.length < 10) return { kind: 'insufficient-data', failedCount: failedRounds.length, totalCount: samples.length, safeSummary: 'More samples are needed before classifying failed requests.' };
  if (failedRounds.length === 0) return { kind: 'none', failedCount: 0, totalCount: samples.length, safeSummary: 'No failed requests in this sample window.' };

  let longestRun = 1;
  let currentRun = 1;
  for (let index = 1; index < failedRounds.length; index++) {
    if (failedRounds[index] === failedRounds[index - 1] + 1) currentRun++;
    else currentRun = 1;
    longestRun = Math.max(longestRun, currentRun);
  }
  if (longestRun >= 3) return { kind: 'burst', failedCount: failedRounds.length, totalCount: samples.length, safeSummary: 'Failed requests are clustered in a short burst.' };

  const gaps = failedRounds.slice(1).map((round, index) => round - failedRounds[index]);
  const regularGap = gaps.length >= 3 && gaps.every((gap) => Math.abs(gap - gaps[0]) <= 1);
  if (regularGap) return { kind: 'periodic', failedCount: failedRounds.length, totalCount: samples.length, safeSummary: 'Failed requests appear at a repeating interval.' };

  return { kind: 'random', failedCount: failedRounds.length, totalCount: samples.length, safeSummary: 'Failed requests are scattered across the sample window.' };
}
```

- [ ] **Step 3: Run loss tests**

Run:

```bash
npm test -- tests/unit/loss/patterns.test.ts
```

Expected: all loss pattern tests pass.

## Task 2: Bufferbloat Test

**Files:**
- Create: `src/lib/bufferbloat/bufferbloat-test.ts`
- Create: `src/lib/stores/bufferbloat.ts`
- Create: `tests/unit/bufferbloat/bufferbloat-test.test.ts`
- Modify: `src/lib/components/DiagnoseView.svelte`
- Modify: `tests/unit/remote-vantage/functions.test.ts` only if saturation endpoint behavior changes.

- [ ] **Step 1: Write bufferbloat classification tests**

Create `tests/unit/bufferbloat/bufferbloat-test.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gradeBufferbloat } from '../../../src/lib/bufferbloat/bufferbloat-test';

describe('gradeBufferbloat', () => {
  it('grades low latency increase as clean', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: 42 })).toMatchObject({
      grade: 'clean',
      deltaMs: 12,
    });
  });

  it('grades high latency increase as loaded-latency evidence', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: 180 })).toMatchObject({
      grade: 'loaded-latency-high',
      deltaMs: 150,
    });
  });
});
```

- [ ] **Step 2: Implement grading before network code**

Create `src/lib/bufferbloat/bufferbloat-test.ts` with pure grading:

```ts
export type BufferbloatGrade = 'clean' | 'watch' | 'loaded-latency-high' | 'insufficient-data';

export interface BufferbloatGradeInput {
  readonly idleMedianMs: number | null;
  readonly loadedMedianMs: number | null;
}

export function gradeBufferbloat(input: BufferbloatGradeInput): { readonly grade: BufferbloatGrade; readonly deltaMs: number | null; readonly summary: string } {
  if (input.idleMedianMs === null || input.loadedMedianMs === null) return { grade: 'insufficient-data', deltaMs: null, summary: 'Run idle and loaded checks before grading loaded latency.' };
  const deltaMs = Math.round(input.loadedMedianMs - input.idleMedianMs);
  if (deltaMs >= 100) return { grade: 'loaded-latency-high', deltaMs, summary: `Latency rose by ${deltaMs} ms during download load.` };
  if (deltaMs >= 40) return { grade: 'watch', deltaMs, summary: `Latency rose by ${deltaMs} ms during download load.` };
  return { grade: 'clean', deltaMs, summary: `Latency rose by ${deltaMs} ms during download load.` };
}
```

- [ ] **Step 3: Add the store and runner**

Create `src/lib/stores/bufferbloat.ts` to:

- collect idle browser samples from existing measurements
- fetch `/api/vantage/saturation?bytes=26214400`
- measure latency during the download window
- abort cleanly on stop
- expose `idleMedianMs`, `loadedMedianMs`, `grade`, `status`, and `error`

- [ ] **Step 4: Add compact Investigate UI**

Place the bufferbloat action in Investigate advanced tools, not on first load. Copy must say:

```text
This measures browser-visible latency while a download is running. It is loaded-latency evidence, not packet-level proof.
```

- [ ] **Step 5: Verify bufferbloat work**

Run:

```bash
npm test -- tests/unit/bufferbloat/bufferbloat-test.test.ts tests/unit/remote-vantage/functions.test.ts
npm run typecheck
```

Expected: listed tests and typecheck pass.

## Task 3: DNS-Over-HTTPS Approximation

**Files:**
- Create: `functions/api/vantage/dns.ts`
- Create: `src/lib/dns/doh-insight.ts`
- Create: `tests/unit/dns/doh-insight.test.ts`
- Create or extend tests for Cloudflare function handling.

- [ ] **Step 1: Write DNS insight tests**

Create `tests/unit/dns/doh-insight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeDohInsight } from '../../../src/lib/dns/doh-insight';

describe('describeDohInsight', () => {
  it('labels DNS-over-HTTPS as outside resolver evidence', () => {
    expect(describeDohInsight({
      hostname: 'api.example.com',
      resolver: 'cloudflare-doh',
      records: ['203.0.113.10'],
      durationMs: 35,
    })).toMatchObject({
      vantage: 'outside-resolver',
      headline: 'Cloudflare DNS-over-HTTPS resolved api.example.com',
    });
  });
});
```

- [ ] **Step 2: Implement insight helper**

Create `src/lib/dns/doh-insight.ts`:

```ts
export interface DohInsightInput {
  readonly hostname: string;
  readonly resolver: 'cloudflare-doh';
  readonly records: readonly string[];
  readonly durationMs: number;
}

export function describeDohInsight(input: DohInsightInput) {
  return {
    vantage: 'outside-resolver' as const,
    headline: `Cloudflare DNS-over-HTTPS resolved ${input.hostname}`,
    detail: `${input.records.length} DNS ${input.records.length === 1 ? 'record' : 'records'} returned in ${Math.round(input.durationMs)} ms. This is outside resolver evidence, not your local DNS path.`,
  };
}
```

- [ ] **Step 3: Implement Cloudflare DNS function**

Create `functions/api/vantage/dns.ts` to accept a public hostname, reject private names and IP literals using the same safety rules as remote probe, call a bounded DNS-over-HTTPS request from the function, and return records plus duration.

- [ ] **Step 4: Verify DNS work**

Run:

```bash
npm test -- tests/unit/dns/doh-insight.test.ts tests/unit/remote-vantage/functions.test.ts
npm run typecheck:functions
```

Expected: listed tests and functions typecheck pass.

## Task 4: BGP/ASN Topology Context

**Files:**
- Create: `functions/api/vantage/topology.ts`
- Create: `src/lib/topology/asn-context.ts`
- Create: `tests/unit/topology/asn-context.test.ts`
- Modify: `src/lib/components/DiagnoseView.svelte`

- [ ] **Step 1: Write topology copy tests**

Create `tests/unit/topology/asn-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeTopologyContext } from '../../../src/lib/topology/asn-context';

describe('describeTopologyContext', () => {
  it('labels ASN data as topology context, not active path proof', () => {
    expect(describeTopologyContext({
      hostname: 'api.example.com',
      asn: 64500,
      organization: 'Example Network',
    })).toContain('topology context');
  });
});
```

- [ ] **Step 2: Implement topology helper**

Create `src/lib/topology/asn-context.ts`:

```ts
export function describeTopologyContext(input: { readonly hostname: string; readonly asn: number | null; readonly organization: string | null }): string {
  if (input.asn === null) return `No ASN context was found for ${input.hostname}. This does not prove reachability or route health.`;
  return `${input.hostname} maps to AS${input.asn}${input.organization ? ` (${input.organization})` : ''}. This is topology context, not active path proof.`;
}
```

- [ ] **Step 3: Implement topology function safely**

The function must:

- accept only public hostnames
- resolve to public IPs only
- fetch bounded ASN/RDAP context
- time out cleanly
- never store requests

- [ ] **Step 4: Verify topology work**

Run:

```bash
npm test -- tests/unit/topology/asn-context.test.ts
npm run typecheck:functions
```

Expected: listed tests and functions typecheck pass.

## Task 5: Release Verification

- [ ] **Step 1: Run full local verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:visual -- tests/visual/ac-verification.spec.ts
```

Expected: all commands pass.

- [ ] **Step 2: Live smoke after each PR**

On `chronoscope.dev`, verify:

- Advanced diagnostics are optional and do not crowd first-run UI.
- Every result says its vantage point.
- Evidence trail only includes advanced results when captured.
- No feature implies unavailable browser proof.

## Acceptance Criteria

- Loss patterns classify sample behavior without naming cause.
- Bufferbloat explains loaded latency, not packet proof.
- DNS-over-HTTPS is labeled outside resolver evidence.
- BGP/ASN data is labeled topology context.
- Advanced diagnostics remain optional and compact.
