# Phase 3 Trust Language System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unsupported diagnostic copy mechanically hard to write, review, or ship.

**Architecture:** Move diagnostic claims into a central claim registry with required evidence gates. Surfaces render claims through registry helpers instead of hand-written causal strings, and tests scan user-facing code for dangerous unsupported phrasing.

**Tech Stack:** TypeScript, Vitest, existing diagnostic narrative/report utilities, Svelte components that consume narrative output.

---

## File Structure

- Create `src/lib/utils/claim-registry.ts` for claim templates, evidence gates, and safe rendering.
- Create `tests/unit/utils/claim-registry.test.ts`.
- Modify `src/lib/utils/diagnostic-narrative.ts` to build claims through the registry.
- Modify `src/lib/utils/diagnostic-report.ts`, `src/lib/utils/evidence-trail.ts`, and `src/lib/remote-vantage/insight.ts` to consume registry-backed strings.
- Modify `src/lib/utils/history-baseline.ts` only where copy needs registry labels.
- Modify `tests/unit/user-facing-copy-safety.test.ts` to scan source and generated copy.
- Update focused tests for `diagnostic-narrative`, `diagnostic-report`, `evidence-trail`, `remote-vantage`, and history baseline.

## Task 1: Claim Registry

**Files:**
- Create: `src/lib/utils/claim-registry.ts`
- Create: `tests/unit/utils/claim-registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `tests/unit/utils/claim-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  canRenderClaim,
  renderClaim,
  type ClaimEvidenceState,
} from '../../../src/lib/utils/claim-registry';

const measured: ClaimEvidenceState = {
  sampleReady: true,
  sampleActionable: true,
  sampleMature: true,
  allEnabledReady: true,
  totalTiming: true,
  phaseTiming: false,
  remoteVantage: false,
  baselineReady: false,
  localAgent: false,
};

describe('claim-registry', () => {
  it('allows measured browser comparison claims when samples are ready', () => {
    expect(canRenderClaim('browser-measured-comparison', measured)).toBe(true);
    expect(renderClaim('browser-measured-comparison', measured, { endpointLabel: 'API' })?.text)
      .toContain('measured');
  });

  it('blocks local-path claims without outside proof or local proof', () => {
    expect(canRenderClaim('local-path-needs-proof', measured)).toBe(false);
    expect(renderClaim('local-path-needs-proof', measured, { endpointLabel: 'API' })).toBeNull();
  });

  it('renders next validation claims when evidence is missing', () => {
    expect(renderClaim('run-outside-check-next', measured, { endpointLabel: 'API' })).toMatchObject({
      kind: 'next-validation',
      text: 'Run an outside check for API to compare your browser path with a Cloudflare edge.',
    });
  });
});
```

- [ ] **Step 2: Implement registry contracts**

Create `src/lib/utils/claim-registry.ts`:

```ts
import type { DiagnosticClaim, DiagnosticClaimKind, DiagnosticConfidence, DiagnosticEvidenceGate } from './diagnostic-narrative';

export type ClaimId =
  | 'browser-measured-comparison'
  | 'browser-visibility-limited'
  | 'remote-vantage-measured'
  | 'local-path-needs-proof'
  | 'run-outside-check-next'
  | 'run-local-agent-next';

export interface ClaimEvidenceState {
  readonly sampleReady: boolean;
  readonly sampleActionable: boolean;
  readonly sampleMature: boolean;
  readonly allEnabledReady: boolean;
  readonly totalTiming: boolean;
  readonly phaseTiming: boolean;
  readonly remoteVantage: boolean;
  readonly baselineReady: boolean;
  readonly localAgent: boolean;
}

interface ClaimTemplate {
  readonly kind: DiagnosticClaimKind;
  readonly strength: DiagnosticConfidence;
  readonly requiredEvidence: readonly DiagnosticEvidenceGate[];
  readonly text: (vars: Record<string, string>) => string;
}

const templates: Record<ClaimId, ClaimTemplate> = {
  'browser-measured-comparison': {
    kind: 'measured',
    strength: 'medium',
    requiredEvidence: ['sample-ready', 'all-enabled-ready', 'total-timing'],
    text: (vars) => `Chronoscope measured ${vars.endpointLabel ?? 'this endpoint'} against the other enabled sites in this browser run.`,
  },
  'browser-visibility-limited': {
    kind: 'limited',
    strength: 'low',
    requiredEvidence: ['total-timing'],
    text: () => 'The browser can compare total load time, but some lower-level timing details are hidden.',
  },
  'remote-vantage-measured': {
    kind: 'measured',
    strength: 'medium',
    requiredEvidence: ['remote-vantage'],
    text: (vars) => `Cloudflare also measured ${vars.endpointLabel ?? 'this endpoint'} from outside this browser path.`,
  },
  'local-path-needs-proof': {
    kind: 'inferred',
    strength: 'low',
    requiredEvidence: ['sample-actionable', 'remote-vantage'],
    text: (vars) => `${vars.endpointLabel ?? 'This endpoint'} needs a local-agent or second-network check before naming the local path.`,
  },
  'run-outside-check-next': {
    kind: 'next-validation',
    strength: 'low',
    requiredEvidence: [],
    text: (vars) => `Run an outside check for ${vars.endpointLabel ?? 'this endpoint'} to compare your browser path with a Cloudflare edge.`,
  },
  'run-local-agent-next': {
    kind: 'next-validation',
    strength: 'low',
    requiredEvidence: [],
    text: (vars) => `Run the local agent for ${vars.endpointLabel ?? 'this endpoint'} to capture DNS, TLS, route, and WiFi evidence from this device.`,
  },
};

const gateToState: Record<DiagnosticEvidenceGate, keyof ClaimEvidenceState> = {
  'sample-ready': 'sampleReady',
  'sample-actionable': 'sampleActionable',
  'sample-mature': 'sampleMature',
  'all-enabled-ready': 'allEnabledReady',
  'total-timing': 'totalTiming',
  'phase-timing': 'phaseTiming',
  'remote-vantage': 'remoteVantage',
  'baseline-ready': 'baselineReady',
  'local-agent': 'localAgent',
};

export function canRenderClaim(id: ClaimId, evidence: ClaimEvidenceState): boolean {
  return templates[id].requiredEvidence.every((gate) => evidence[gateToState[gate]]);
}

export function renderClaim(id: ClaimId, evidence: ClaimEvidenceState, vars: Record<string, string> = {}): DiagnosticClaim | null {
  const template = templates[id];
  if (!canRenderClaim(id, evidence)) return null;
  return {
    id,
    kind: template.kind,
    strength: template.strength,
    text: template.text(vars),
    evidenceIds: template.requiredEvidence,
    requiredEvidence: template.requiredEvidence,
  };
}
```

- [ ] **Step 3: Run registry tests**

Run:

```bash
npm test -- tests/unit/utils/claim-registry.test.ts
```

Expected: all registry tests pass.

## Task 2: Migrate Diagnostic Narrative To Registry Claims

**Files:**
- Modify: `src/lib/utils/diagnostic-narrative.ts`
- Modify: `tests/unit/utils/diagnostic-narrative.test.ts`

- [ ] **Step 1: Add narrative tests for registry-backed claims**

Add assertions that every claim produced by `buildDiagnosticNarrative` has:

```ts
expect(claim.requiredEvidence.length).toBeGreaterThanOrEqual(0);
expect(['measured', 'inferred', 'limited', 'next-validation']).toContain(claim.kind);
expect(claim.text).not.toMatch(/ISP is|router is|server is the cause|will fix/i);
```

- [ ] **Step 2: Build `ClaimEvidenceState` inside diagnostic narrative**

Map existing narrative inputs to registry evidence:

```ts
const evidenceState: ClaimEvidenceState = {
  sampleReady: readyRows.length > 0,
  sampleActionable: thinnestSampleCount >= MIN_ACTIONABLE_SAMPLES,
  sampleMature: thinnestSampleCount >= MIN_MATURE_SAMPLES,
  allEnabledReady: readyRows.length === input.monitoredEndpointCount && input.monitoredEndpointCount > 0,
  totalTiming: timingVisibility.okSampleCount > 0,
  phaseTiming: timingVisibility.level === 'phase',
  remoteVantage: false,
  baselineReady: false,
  localAgent: false,
};
```

Use `renderClaim` for primary measured, limited, and next-validation claims.

- [ ] **Step 3: Run narrative tests**

Run:

```bash
npm test -- tests/unit/utils/diagnostic-narrative.test.ts tests/unit/utils/claim-registry.test.ts
```

Expected: all listed tests pass.

## Task 3: Copy Safety Scanner

**Files:**
- Modify: `tests/unit/user-facing-copy-safety.test.ts`

- [ ] **Step 1: Expand the denylist**

Add patterns:

```ts
const forbiddenUserFacingPatterns = [
  /your ISP is/i,
  /your router is/i,
  /the server is the cause/i,
  /this will fix/i,
  /definitely/i,
  /guaranteed/i,
];
```

- [ ] **Step 2: Add generated-copy fixtures**

The test should import and exercise:

- `buildDiagnosticNarrative`
- `buildDiagnosticReport`
- `buildEvidenceTrail`
- `buildRemoteVantageInsight`
- `reportModeCopy`

Scan generated strings with the same denylist.

- [ ] **Step 3: Run copy safety tests**

Run:

```bash
npm test -- tests/unit/user-facing-copy-safety.test.ts
```

Expected: copy safety tests pass.

## Task 4: Surface Migration

**Files:**
- Modify: `src/lib/utils/diagnostic-report.ts`
- Modify: `src/lib/utils/evidence-trail.ts`
- Modify: `src/lib/remote-vantage/insight.ts`
- Modify: `src/lib/utils/history-baseline.ts`
- Update focused tests for each file.

- [ ] **Step 1: Replace ad hoc diagnostic phrases**

Search:

```bash
rg -n "likely|probably|cause|source|ISP|router|fix" src/lib tests/unit
```

Each user-facing match must be either removed, registry-backed, or explicitly evidence-limited.

- [ ] **Step 2: Use registry-backed copy in reports and evidence**

Where a surface needs a sentence about what happened, prefer:

```ts
const claim = renderClaim('browser-measured-comparison', evidenceState, { endpointLabel: row.label });
```

If `claim` is null, render a next-validation claim instead of an inferred claim.

- [ ] **Step 3: Run focused surface tests**

Run:

```bash
npm test -- tests/unit/utils/diagnostic-report.test.ts tests/unit/utils/evidence-trail.test.ts tests/unit/remote-vantage/insight.test.ts tests/unit/utils/history-baseline.test.ts
```

Expected: all listed tests pass.

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

- [ ] **Step 2: PR and live smoke**

Open a PR, wait for CI, patch review feedback, merge, confirm Cloudflare deploy, and smoke-test `chronoscope.dev` copy on Status, Investigate, Report, and Share surfaces.

## Acceptance Criteria

- New diagnostic copy must come from a claim registry or a plainly limited helper.
- Unsupported cause language is blocked by tests.
- Existing reports, share summaries, remote-vantage copy, and history summaries stay understandable.
- Strong claims require evidence gates.
- Missing evidence produces a next validation step instead of a stronger-sounding guess.
