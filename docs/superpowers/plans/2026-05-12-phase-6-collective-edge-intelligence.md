# Phase 6 Collective Edge Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explore opt-in aggregate internet health intelligence without creating surveillance creep or hidden collection.

**Architecture:** Start with a privacy and consent contract, then build local anonymization, bounded ingest, and aggregate summary surfaces. No background collection ships before explicit opt-in UI, schema tests, privacy tests, and server-side rejection of raw private data.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Cloudflare Pages Functions, optional D1/KV binding for aggregate counters, existing share/report models.

---

## File Structure

- Create `docs/vision/collective-edge-intelligence-privacy.md`.
- Create `src/lib/intelligence/consent.ts` and `tests/unit/intelligence/consent.test.ts`.
- Create `src/lib/intelligence/payload.ts` and `tests/unit/intelligence/payload.test.ts`.
- Create `src/lib/stores/intelligence.ts` if UI state needs persistence.
- Create `functions/_shared/intelligence.ts`.
- Create `functions/api/intelligence/ingest.ts`.
- Create `functions/api/intelligence/summary.ts`.
- Create or modify component surfaces only after privacy tests pass:
  - `src/lib/components/SharePopover.svelte`
  - `src/lib/components/ReportView.svelte`
  - optional `src/lib/components/IntelligencePanel.svelte`

## Task 1: Privacy Model And Consent Contract

**Files:**
- Create: `docs/vision/collective-edge-intelligence-privacy.md`
- Create: `src/lib/intelligence/consent.ts`
- Create: `tests/unit/intelligence/consent.test.ts`

- [ ] **Step 1: Write consent tests**

Create `tests/unit/intelligence/consent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canContributeIntelligence, contributionCopy } from '../../../src/lib/intelligence/consent';

describe('collective intelligence consent', () => {
  it('blocks contribution when explicit opt-in is absent', () => {
    expect(canContributeIntelligence({ optedIn: false, reportHasResults: true })).toBe(false);
  });

  it('blocks contribution when no measured results exist', () => {
    expect(canContributeIntelligence({ optedIn: true, reportHasResults: false })).toBe(false);
  });

  it('uses explicit consent copy', () => {
    expect(contributionCopy()).toContain('optional');
    expect(contributionCopy()).toContain('anonymous aggregate');
  });
});
```

- [ ] **Step 2: Implement consent helper**

Create `src/lib/intelligence/consent.ts`:

```ts
export function canContributeIntelligence(input: { readonly optedIn: boolean; readonly reportHasResults: boolean }): boolean {
  return input.optedIn && input.reportHasResults;
}

export function contributionCopy(): string {
  return 'Optional: contribute anonymous aggregate timing evidence. Chronoscope will not send full URLs, WiFi identifiers, local history, or private network targets.';
}
```

- [ ] **Step 3: Write privacy doc**

Create `docs/vision/collective-edge-intelligence-privacy.md` with these rules:

- no collection without explicit opt-in
- no full URLs
- no local/private hosts
- no WiFi SSID/BSSID
- no companion history
- no raw IP addresses in public summaries
- named public endpoint contribution requires separate visible consent
- users can use reports without contributing

- [ ] **Step 4: Run consent tests**

Run:

```bash
npm test -- tests/unit/intelligence/consent.test.ts
```

Expected: consent tests pass.

## Task 2: Local Aggregate Payload Builder

**Files:**
- Create: `src/lib/intelligence/payload.ts`
- Create: `tests/unit/intelligence/payload.test.ts`

- [ ] **Step 1: Write payload privacy tests**

Create `tests/unit/intelligence/payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildIntelligencePayload } from '../../../src/lib/intelligence/payload';

describe('buildIntelligencePayload', () => {
  it('strips path, query, fragment, and private fields', () => {
    const payload = buildIntelligencePayload({
      endpointUrl: 'https://api.example.com/private/path?fixture=redacted#hash',
      p50: 42,
      p95: 80,
      lossPercent: 0,
      sampleCount: 35,
      createdAt: 1778352000000,
      consent: 'anonymous-aggregate',
    });

    expect(JSON.stringify(payload)).not.toContain('private');
    expect(JSON.stringify(payload)).not.toContain('fixture=');
    expect(payload.originHost).toBeNull();
    expect(payload.publicOriginHash).toBeNull();
  });

  it('includes named public endpoint only with named consent', () => {
    const payload = buildIntelligencePayload({
      endpointUrl: 'https://api.example.com/path',
      p50: 42,
      p95: 80,
      lossPercent: 0,
      sampleCount: 35,
      createdAt: 1778352000000,
      consent: 'named-public-endpoint',
    });

    expect(payload.originHost).toBe('api.example.com');
  });
});
```

- [ ] **Step 2: Implement payload builder**

Create `src/lib/intelligence/payload.ts`:

```ts
export type IntelligenceConsent = 'anonymous-aggregate' | 'named-public-endpoint';

export interface IntelligencePayloadInput {
  readonly endpointUrl: string;
  readonly p50: number;
  readonly p95: number;
  readonly lossPercent: number;
  readonly sampleCount: number;
  readonly createdAt: number;
  readonly consent: IntelligenceConsent;
}

export interface IntelligencePayload {
  readonly v: 1;
  readonly consent: IntelligenceConsent;
  readonly originHost: string | null;
  readonly publicOriginHash: string | null;
  readonly p50: number;
  readonly p95: number;
  readonly lossPercent: number;
  readonly sampleCount: number;
  readonly createdAt: number;
}

export function buildIntelligencePayload(input: IntelligencePayloadInput): IntelligencePayload {
  const host = new URL(input.endpointUrl).hostname;
  return {
    v: 1,
    consent: input.consent,
    originHost: input.consent === 'named-public-endpoint' ? host : null,
    publicOriginHash: null,
    p50: Math.round(input.p50),
    p95: Math.round(input.p95),
    lossPercent: Number(input.lossPercent.toFixed(2)),
    sampleCount: input.sampleCount,
    createdAt: input.createdAt,
  };
}
```

This first version intentionally avoids hashing until the server privacy model chooses salt rotation and lookup behavior.

- [ ] **Step 3: Run payload tests**

Run:

```bash
npm test -- tests/unit/intelligence/payload.test.ts
```

Expected: payload privacy tests pass.

## Task 3: Server Ingest Rejection Rules

**Files:**
- Create: `functions/_shared/intelligence.ts`
- Create: `functions/api/intelligence/ingest.ts`
- Create tests under `tests/unit/intelligence/functions.test.ts` or extend an existing functions test file.

- [ ] **Step 1: Write server rejection tests**

Server tests must prove:

- missing consent is rejected
- full URL fields are rejected
- localhost/private hosts are rejected
- sample counts over a bounded limit are rejected
- accepted payload returns 202 and stores only aggregate counters

- [ ] **Step 2: Implement shared validator**

Create `functions/_shared/intelligence.ts` with:

```ts
export function validateIntelligencePayload(value: unknown): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'Invalid payload.' };
  const record = value as Record<string, unknown>;
  if (record.v !== 1) return { ok: false, error: 'Invalid version.' };
  if (record.consent !== 'anonymous-aggregate' && record.consent !== 'named-public-endpoint') return { ok: false, error: 'Consent is required.' };
  if ('url' in record || 'endpointUrl' in record || 'wifi' in record || 'history' in record) return { ok: false, error: 'Payload contains private fields.' };
  if (typeof record.sampleCount !== 'number' || record.sampleCount < 1 || record.sampleCount > 10000) return { ok: false, error: 'Invalid sample count.' };
  return { ok: true };
}
```

- [ ] **Step 3: Implement ingest function**

Create `functions/api/intelligence/ingest.ts` to:

- accept POST and OPTIONS only
- validate JSON content type
- call `validateIntelligencePayload`
- write aggregate counters when binding exists
- return 202 when accepted
- return 503 with a clear message if storage is not configured

- [ ] **Step 4: Run function tests**

Run:

```bash
npm test -- tests/unit/intelligence/functions.test.ts
npm run typecheck:functions
```

Expected: listed tests and functions typecheck pass.

## Task 4: Aggregate Summary Surface

**Files:**
- Create: `functions/api/intelligence/summary.ts`
- Create: `src/lib/components/IntelligencePanel.svelte`
- Modify: `src/lib/components/ReportView.svelte` or `src/lib/components/DiagnoseView.svelte` only after data and consent are safe.

- [ ] **Step 1: Add summary endpoint tests**

Tests should prove summary returns aggregate buckets only:

```ts
expect(JSON.stringify(payload)).not.toMatch(/https?:\/\//);
expect(JSON.stringify(payload)).not.toMatch(/ssid|bssid|history/i);
```

- [ ] **Step 2: Implement summary UI as optional context**

Add a compact panel that says:

```text
Aggregate context from opted-in reports. This is population-level context, not proof about your current path.
```

- [ ] **Step 3: Run summary tests**

Run:

```bash
npm test -- tests/unit/intelligence/functions.test.ts
npm run typecheck
```

Expected: listed tests and typecheck pass.

## Task 5: Release Verification

- [ ] **Step 1: Run full local verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Privacy review before merge**

Before merging any Phase 6 PR, run:

```bash
rg -n "endpointUrl|url|ssid|bssid|history|localStorage|indexedDB" src functions tests docs/vision/collective-edge-intelligence-privacy.md
```

Every match must be either a rejection test, privacy documentation, local-only source data before sanitization, or explicit named-endpoint consent.

## Acceptance Criteria

- No collection happens without explicit opt-in.
- Anonymous aggregate contribution sends no full URLs, WiFi identifiers, local history, or private targets.
- Named public endpoint contribution requires separate visible consent.
- Server ingest rejects private fields even if the client is bypassed.
- Public summaries expose aggregate context only.
- The product explains that aggregate context is not proof about the current user path.
