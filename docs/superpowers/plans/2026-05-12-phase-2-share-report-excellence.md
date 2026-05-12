# Phase 2 Share And Report Excellence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chronoscope reports feel like polished diagnostic artifacts with distinct support and snapshot/bragging modes.

**Architecture:** Extend report metadata with a validated `reportKind`, add pure report-mode copy helpers, and render support versus snapshot reports from the same evidence model. The report must stay fact-first, compact, and readable for non-engineers while preserving inspectable evidence for network engineers.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Testing Library, Playwright visual tests, existing share payload validator and hosted report flow.

---

## File Structure

- Create `src/lib/utils/report-mode.ts` for support/snapshot copy and eligibility.
- Create `tests/unit/utils/report-mode.test.ts`.
- Modify `src/lib/types.ts` to add `ReportKind = 'support' | 'snapshot'` and `reportKind` metadata.
- Modify `src/lib/share/share-validator.ts` to allow and validate `reportKind`.
- Modify `src/lib/share/share-payload-builder.ts` to accept `reportKind`.
- Modify `src/lib/utils/diagnostic-report.ts` to expose mode-specific title, lede, and copy summary.
- Modify `src/lib/components/SharePopover.svelte` to choose Support report or Snapshot link intentionally.
- Modify `src/lib/components/ReportView.svelte` to render the selected report mode.
- Update `tests/unit/share-payload-builder.test.ts`, `tests/unit/share/share-payload-rejects-unknown-keys.test.ts`, `tests/unit/components/share-popover.test.ts`, and `tests/unit/utils/diagnostic-report.test.ts`.
- Update `tests/visual/ac-verification.spec.ts` for report modes.

## Task 1: Share Schema For Report Kind

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/share/share-validator.ts`
- Modify: `src/lib/share/share-payload-builder.ts`
- Modify: `tests/unit/share-payload-builder.test.ts`
- Modify: `tests/unit/share/share-payload-rejects-unknown-keys.test.ts`

- [ ] **Step 1: Add failing schema tests**

Add to `tests/unit/share-payload-builder.test.ts`:

```ts
it('stores the requested report kind in v2 result metadata', () => {
  const ep = endpoint('api');
  const built = buildResultsSharePayload(
    [ep],
    DEFAULT_SETTINGS,
    measurementState(ep.id, Array.from({ length: 12 }, (_, i) => ok(i + 1))),
    8000,
    1778352000000,
    { reportKind: 'snapshot' },
  );

  expect(built.payload.report?.reportKind).toBe('snapshot');
});
```

Add to `tests/unit/share/share-payload-rejects-unknown-keys.test.ts`:

```ts
it('accepts a bounded reportKind in v2 report metadata', () => {
  const payload: SharePayload = {
    v: 2,
    mode: 'results',
    endpoints: [{ url: 'https://example.com', enabled: true }],
    settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
    report: {
      createdAt: 1778352000000,
      healthThreshold: 120,
      corsMode: 'no-cors',
      roundCount: 1,
      totalSampleCount: 1,
      keptSampleCount: 1,
      truncated: false,
      reportKind: 'support',
    },
    results: [{ samples: [{ round: 0, latency: 42, status: 'ok' }] }],
  };

  expect(decodeSharePayload(encodeSharePayload(payload))).not.toBeNull();
});

it('rejects unknown reportKind values', () => {
  const payload = {
    v: 2,
    mode: 'results',
    endpoints: [{ url: 'https://example.com', enabled: true }],
    settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' as const },
    report: {
      createdAt: 1778352000000,
      healthThreshold: 120,
      corsMode: 'no-cors' as const,
      roundCount: 1,
      totalSampleCount: 1,
      keptSampleCount: 1,
      truncated: false,
      reportKind: 'marketing',
    },
    results: [{ samples: [{ round: 0, latency: 42, status: 'ok' as const }] }],
  };

  expect(decodeSharePayload(encodeSharePayload(payload as never))).toBeNull();
});
```

- [ ] **Step 2: Implement report-kind metadata**

In `src/lib/types.ts`, add:

```ts
export type ReportKind = 'support' | 'snapshot';
```

Then add `readonly reportKind: ReportKind;` to `ShareReportMetadata` and `SharedReportContext`. Default legacy payloads to `support` when no value exists.

In `src/lib/share/share-validator.ts`, add `reportKind` to `ALLOWED_REPORT_KEYS` and validate:

```ts
if (report['reportKind'] !== 'support' && report['reportKind'] !== 'snapshot') return false;
```

In `buildResultsSharePayload`, default metadata to:

```ts
reportKind: reportMetadata.reportKind ?? 'support',
```

- [ ] **Step 3: Run schema tests**

Run:

```bash
npm test -- tests/unit/share-payload-builder.test.ts tests/unit/share/share-payload-rejects-unknown-keys.test.ts
```

Expected: all listed tests pass.

## Task 2: Pure Report Mode Copy

**Files:**
- Create: `src/lib/utils/report-mode.ts`
- Create: `tests/unit/utils/report-mode.test.ts`
- Modify: `src/lib/utils/diagnostic-report.ts`

- [ ] **Step 1: Write report-mode tests**

Create `tests/unit/utils/report-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reportModeCopy } from '../../../src/lib/utils/report-mode';

describe('reportModeCopy', () => {
  it('keeps support mode focused on facts, caveats, and next validation', () => {
    expect(reportModeCopy({
      reportKind: 'support',
      primaryAnswer: 'One site is slower than the others.',
      confidenceLabel: 'Medium confidence',
      sampleCount: 105,
      endpointCount: 3,
      timingHeadline: 'Some timing details are hidden by the browser',
    })).toMatchObject({
      kicker: 'Support report',
      primaryActionLabel: 'Copy Support Summary',
    });
  });

  it('keeps snapshot mode brag-friendly without dropping evidence', () => {
    expect(reportModeCopy({
      reportKind: 'snapshot',
      primaryAnswer: 'All measured sites look healthy.',
      confidenceLabel: 'High confidence',
      sampleCount: 180,
      endpointCount: 4,
      timingHeadline: 'Detailed timing visible',
    })).toMatchObject({
      kicker: 'Performance snapshot',
      primaryActionLabel: 'Copy Snapshot Summary',
    });
  });
});
```

- [ ] **Step 2: Implement `report-mode.ts`**

Create `src/lib/utils/report-mode.ts`:

```ts
import type { ReportKind } from '../types';

export interface ReportModeCopyInput {
  readonly reportKind: ReportKind;
  readonly primaryAnswer: string;
  readonly confidenceLabel: string;
  readonly sampleCount: number;
  readonly endpointCount: number;
  readonly timingHeadline: string;
}

export interface ReportModeCopy {
  readonly kicker: string;
  readonly lede: string;
  readonly primaryActionLabel: string;
}

export function reportModeCopy(input: ReportModeCopyInput): ReportModeCopy {
  if (input.reportKind === 'snapshot') {
    return {
      kicker: 'Performance snapshot',
      lede: `${input.primaryAnswer} ${input.sampleCount} samples across ${input.endpointCount} endpoints support this snapshot. ${input.timingHeadline}.`,
      primaryActionLabel: 'Copy Snapshot Summary',
    };
  }
  return {
    kicker: 'Support report',
    lede: `${input.primaryAnswer} ${input.confidenceLabel}. Evidence includes ${input.sampleCount} samples across ${input.endpointCount} endpoints. ${input.timingHeadline}.`,
    primaryActionLabel: 'Copy Support Summary',
  };
}
```

- [ ] **Step 3: Expose report-mode copy from diagnostic reports**

In `src/lib/utils/diagnostic-report.ts`, add fields to `DiagnosticReport`:

```ts
readonly reportKind: ReportKind;
readonly modeKicker: string;
readonly modeLede: string;
readonly copySummaryLabel: string;
```

Use `reportModeCopy` when building the report. Derive `reportKind` from `input.context?.reportKind ?? 'support'`.

- [ ] **Step 4: Run report-mode tests**

Run:

```bash
npm test -- tests/unit/utils/report-mode.test.ts tests/unit/utils/diagnostic-report.test.ts
```

Expected: all listed tests pass.

## Task 3: Share Popover Mode Selection

**Files:**
- Modify: `src/lib/components/SharePopover.svelte`
- Modify: `tests/unit/components/share-popover.test.ts`

- [ ] **Step 1: Add SharePopover tests**

Add tests that prove:

- Support report calls `buildResultsSharePayload` with `reportKind: 'support'`.
- Snapshot link calls `buildResultsSharePayload` with `reportKind: 'snapshot'`.
- Snapshot link is disabled until results exist.

Use this assertion pattern:

```ts
expect(screen.getByText('Support report')).toBeTruthy();
expect(screen.getByText('Snapshot link')).toBeTruthy();
expect(screen.getByText('Configuration link')).toBeTruthy();
```

- [ ] **Step 2: Implement mode-specific payload calls**

In `SharePopover.svelte`, update the payload builder calls:

```ts
function buildResultsPayload(maxChars = MAX_SHARE_URL_CHARS, reportKind: ReportKind = 'support') {
  return buildResultsSharePayload(
    get(endpointStore),
    get(settingsStore),
    get(measurementStore),
    maxChars,
    Date.now(),
    { reportKind },
    get(remoteVantageStore).lastProbe,
  );
}
```

Use `support` for hosted reports and `snapshot` for compact snapshot links.

- [ ] **Step 3: Run SharePopover tests**

Run:

```bash
npm test -- tests/unit/components/share-popover.test.ts tests/unit/share-payload-builder.test.ts
```

Expected: all listed tests pass.

## Task 4: Report Rendering Modes

**Files:**
- Modify: `src/lib/components/ReportView.svelte`
- Modify: `tests/unit/components/report-view-actions.test.ts`
- Modify: `tests/unit/utils/diagnostic-report.test.ts`

- [ ] **Step 1: Add rendering tests**

Add tests that render a support report and a snapshot report. Expected copy:

```ts
expect(getByText('Support report')).toBeTruthy();
expect(getByRole('button', { name: /copy support summary/i })).toBeTruthy();
```

For snapshot:

```ts
expect(getByText('Performance snapshot')).toBeTruthy();
expect(getByRole('button', { name: /copy snapshot summary/i })).toBeTruthy();
```

- [ ] **Step 2: Render mode copy in ReportView**

Replace the hard-coded report kicker and copy button label:

```svelte
<div class="report-kicker">{report.modeKicker}</div>
<p class="report-lede">{report.modeLede}</p>
<button type="button" class="action" onclick={handleCopySummary}>
  {copyError === 'summary' ? 'Copy Failed' : copiedSummary ? 'Summary Copied' : report.copySummaryLabel}
</button>
```

- [ ] **Step 3: Run rendering tests**

Run:

```bash
npm test -- tests/unit/components/report-view-actions.test.ts tests/unit/utils/diagnostic-report.test.ts
```

Expected: all listed tests pass.

## Task 5: Copy Audit And Visual Verification

**Files:**
- Modify: `tests/unit/user-facing-copy-safety.test.ts`
- Modify: `tests/visual/ac-verification.spec.ts`

- [ ] **Step 1: Expand copy-safety coverage**

Add allowlisted terms for report modes and keep the denylist for cause claims. The test should reject:

```ts
const forbidden = [
  /your ISP is/i,
  /your router is/i,
  /the server is the cause/i,
  /this will fix/i,
];
```

- [ ] **Step 2: Add visual checks**

Add Playwright captures for:

- support report at 375px
- support report at 1440px
- snapshot report at 375px
- snapshot report at 1440px
- share popover at mobile width

- [ ] **Step 3: Run release verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:visual -- tests/visual/ac-verification.spec.ts
```

Expected: all commands pass.

## Acceptance Criteria

- Support reports and snapshot reports are visibly distinct.
- Snapshot mode supports bragging rights without hiding evidence.
- Support mode leads with facts, caveats, and next validation.
- A non-engineer can understand the report in under 20 seconds.
- A network engineer can inspect the evidence without needing hidden app state.
- Share payload validation rejects unknown report kinds.
