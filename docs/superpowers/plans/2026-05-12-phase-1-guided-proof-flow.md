# Phase 1 Guided Proof Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn report triage actions into a guided proof loop where remote and local proof actions update the evidence trail, card status, and share payload in place.

**Architecture:** Add a pure proof-flow utility that explains proof freshness and action state, then wire `ReportView.svelte`, `DiagnoseView.svelte`, `remote-vantage`, and companion state to it. Keep cause language out of proof summaries unless browser, outside, and local evidence support it.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Testing Library, Playwright visual tests, existing remote-vantage and companion stores.

---

## File Structure

- Create `src/lib/utils/proof-flow.ts` for proof freshness, action state labels, and safe proof summaries.
- Create `tests/unit/utils/proof-flow.test.ts`.
- Modify `src/lib/utils/evidence-trail.ts` to consume proof freshness and stale-state copy.
- Modify `src/lib/remote-vantage/insight.ts` to return safe outside-proof summaries.
- Modify `src/lib/stores/remote-vantage.ts` only if the store needs `lastProbeStartedAt` or `lastProbeCompletedAt`.
- Create `src/lib/components/LocalProofPanel.svelte` if focused local proof cannot stay cleanly inside `CompanionPanel.svelte`.
- Modify `src/lib/components/ReportView.svelte` to show focused proof states after each action.
- Modify `src/lib/components/DiagnoseView.svelte` to expose the same remote/local proof loop for the focused endpoint.
- Add or update `tests/unit/components/report-view-actions.test.ts`.
- Add `tests/unit/components/local-proof-panel.test.ts` if `LocalProofPanel.svelte` is created.
- Update `tests/visual/ac-verification.spec.ts` for 375px and 1440px proof-flow screenshots.

## Task 1: Proof State Contract

**Files:**
- Create: `src/lib/utils/proof-flow.ts`
- Create: `tests/unit/utils/proof-flow.test.ts`
- Modify: `src/lib/utils/evidence-trail.ts`

- [ ] **Step 1: Write failing tests for proof freshness and labels**

Create `tests/unit/utils/proof-flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildProofActionState,
  isProofStale,
  proofFreshnessLabel,
  summarizeRemoteProof,
} from '../../../src/lib/utils/proof-flow';
import type { RemoteVantageProbeResponse } from '../../../src/lib/remote-vantage/types';

const cleanProbe: RemoteVantageProbeResponse = {
  ok: true,
  generatedAt: 1778352005000,
  edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
  results: [{
    endpointId: 'api',
    label: 'API',
    url: 'https://api.example.com',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 42,
    checkedAt: 1778352005000,
    verdict: 'reachable',
    headers: {},
  }],
};

describe('proof-flow', () => {
  it('marks proof as stale when a report is newer than the captured proof', () => {
    expect(isProofStale({ reportCreatedAt: 2000, proofGeneratedAt: 1000 })).toBe(true);
    expect(isProofStale({ reportCreatedAt: 1000, proofGeneratedAt: 2000 })).toBe(false);
  });

  it('uses compact freshness labels', () => {
    expect(proofFreshnessLabel({ reportCreatedAt: 2000, proofGeneratedAt: 1000 })).toBe('Stale');
    expect(proofFreshnessLabel({ reportCreatedAt: 1000, proofGeneratedAt: 2000 })).toBe('Fresh');
    expect(proofFreshnessLabel({ reportCreatedAt: 1000, proofGeneratedAt: null })).toBe('Not run');
  });

  it('summarizes outside proof without causal overclaiming', () => {
    expect(summarizeRemoteProof(cleanProbe)).toMatchObject({
      tone: 'good',
      status: 'Captured',
      text: 'Cloudflare reached 1 endpoint without slow or failed results',
    });
  });

  it('maps running and failed actions to visible card states', () => {
    expect(buildProofActionState({ kind: 'remote', status: 'probing', hasProof: false, hasError: false })).toMatchObject({
      label: 'Running',
      disabled: true,
      tone: 'watch',
    });
    expect(buildProofActionState({ kind: 'remote', status: 'error', hasProof: false, hasError: true })).toMatchObject({
      label: 'Failed',
      disabled: false,
      tone: 'watch',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm test -- tests/unit/utils/proof-flow.test.ts
```

Expected: the module import fails because `src/lib/utils/proof-flow.ts` does not exist.

- [ ] **Step 3: Implement the pure proof utility**

Create `src/lib/utils/proof-flow.ts` with these exported contracts:

```ts
import type { RemoteVantageProbeResponse } from '../remote-vantage/types';
import type { CompanionProbeResponse } from '../companion/protocol';
import type { RemoteVantageStatus } from '../stores/remote-vantage';
import type { CompanionStatus } from '../stores/companion';
import type { EvidenceTrailTone } from './evidence-trail';

export type ProofKind = 'remote' | 'local';

export interface ProofSummary {
  readonly status: string;
  readonly text: string;
  readonly tone: EvidenceTrailTone;
  readonly detail?: string;
}

export interface ProofActionState {
  readonly label: string;
  readonly tone: EvidenceTrailTone;
  readonly disabled: boolean;
}

export function isProofStale(input: { readonly reportCreatedAt: number | null; readonly proofGeneratedAt: number | null }): boolean {
  return input.reportCreatedAt !== null && input.proofGeneratedAt !== null && input.proofGeneratedAt < input.reportCreatedAt;
}

export function proofFreshnessLabel(input: { readonly reportCreatedAt: number | null; readonly proofGeneratedAt: number | null }): string {
  if (input.proofGeneratedAt === null) return 'Not run';
  return isProofStale(input) ? 'Stale' : 'Fresh';
}

export function summarizeRemoteProof(probe: RemoteVantageProbeResponse | null): ProofSummary {
  if (!probe) return { status: 'Not run', text: 'No Cloudflare outside check captured.', tone: 'neutral' };
  const problemCount = probe.results.filter((result) => result.verdict === 'slow' || result.verdict === 'http-error' || result.verdict === 'unreachable').length;
  const endpointWord = probe.results.length === 1 ? 'endpoint' : 'endpoints';
  return problemCount > 0
    ? { status: 'Captured', text: `${problemCount}/${probe.results.length} ${endpointWord} were slow or failed from Cloudflare`, tone: 'bad' }
    : { status: 'Captured', text: `Cloudflare reached ${probe.results.length} ${endpointWord} without slow or failed results`, tone: 'good' };
}

export function summarizeLocalProof(probe: CompanionProbeResponse | null): ProofSummary {
  if (!probe) return { status: 'Not run', text: 'No local agent probe captured.', tone: 'neutral' };
  return {
    status: 'Captured',
    text: `${probe.targetHost}: ${probe.summary}`,
    tone: probe.ok ? 'good' : 'watch',
  };
}

export function buildProofActionState(input: {
  readonly kind: ProofKind;
  readonly status: RemoteVantageStatus | CompanionStatus;
  readonly hasProof: boolean;
  readonly hasError: boolean;
}): ProofActionState {
  if (input.status === 'checking' || input.status === 'probing') return { label: 'Running', tone: 'watch', disabled: true };
  if (input.hasProof) return { label: 'Captured', tone: 'good', disabled: false };
  if (input.hasError) return { label: input.kind === 'local' ? 'Needs setup' : 'Failed', tone: 'watch', disabled: false };
  return { label: 'Not run', tone: 'neutral', disabled: false };
}
```

- [ ] **Step 4: Replace duplicate report state logic**

In `src/lib/components/ReportView.svelte`, import `buildProofActionState`, `summarizeRemoteProof`, and `summarizeLocalProof`. Replace the internal `remoteOutcome()` and `localAgentOutcome()` branches with calls to `buildProofActionState`, preserving the existing visible labels that tests already cover.

- [ ] **Step 5: Verify the helper and report action tests**

Run:

```bash
npm test -- tests/unit/utils/proof-flow.test.ts tests/unit/components/report-view-actions.test.ts tests/unit/utils/evidence-trail.test.ts
```

Expected: all listed tests pass.

## Task 2: Remote Proof Loop

**Files:**
- Modify: `src/lib/components/ReportView.svelte`
- Modify: `src/lib/components/DiagnoseView.svelte`
- Modify: `src/lib/remote-vantage/insight.ts`
- Modify: `tests/unit/components/report-view-actions.test.ts`
- Modify: `tests/unit/remote-vantage/insight.test.ts`

- [ ] **Step 1: Add tests for remote proof state after a triage action**

Extend `tests/unit/components/report-view-actions.test.ts` with a mocked remote store that can emit `probing`, `connected`, and `error` states:

```ts
it('shows captured outside proof after a remote check resolves', async () => {
  const endpoints = seedIsolatedReport();
  mocks.runProbe.mockResolvedValue({
    ok: true,
    generatedAt: 1778352005000,
    edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
    results: endpoints.map((endpoint) => ({
      endpointId: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      ok: true,
      status: 200,
      statusText: 'OK',
      durationMs: endpoint.id === 'api' ? 310 : 45,
      checkedAt: 1778352005000,
      verdict: endpoint.id === 'api' ? 'slow' : 'reachable',
      headers: {},
    })),
  });

  const { getByRole, findByText } = render(ReportView);
  await fireEvent.click(getByRole('button', { name: /run outside check/i }));

  expect(await findByText(/captured/i)).toBeTruthy();
  expect(mocks.runProbe).toHaveBeenCalledWith(endpoints);
});
```

- [ ] **Step 2: Tighten remote-vantage insight copy**

Update `src/lib/remote-vantage/insight.ts` so every headline and action identifies vantage point. Keep these allowed patterns:

```ts
headline: `Cloudflare reached ${label} normally`
headline: `${label} was also slow from Cloudflare`
headline: `${label} failed from the Cloudflare outside check`
action: 'Use this as outside-vantage evidence, then compare from another network or the local agent before naming a cause.'
```

Do not use text that says the user's ISP, router, server, or origin is the cause.

- [ ] **Step 3: Wire remote check from Investigate**

In `src/lib/components/DiagnoseView.svelte`, reuse the same store call as reports:

```ts
await remoteVantageStore.runProbe(focusedEndpoint ? [focusedEndpoint] : get(endpointStore));
```

The visible state should use the same `buildProofActionState` labels as ReportView.

- [ ] **Step 4: Verify remote proof tests**

Run:

```bash
npm test -- tests/unit/components/report-view-actions.test.ts tests/unit/remote-vantage/insight.test.ts tests/unit/stores/remote-vantage.test.ts
```

Expected: all listed tests pass and no copied string contains unsupported cause language.

## Task 3: Focused Local Proof Panel

**Files:**
- Create: `src/lib/components/LocalProofPanel.svelte`
- Create: `tests/unit/components/local-proof-panel.test.ts`
- Modify: `src/lib/components/CompanionPanel.svelte`
- Modify: `src/lib/components/ReportView.svelte`
- Modify: `src/lib/components/SettingsDrawer.svelte` if the existing settings drawer owns companion placement.

- [ ] **Step 1: Write focused local proof panel tests**

Create `tests/unit/components/local-proof-panel.test.ts`:

```ts
import { fireEvent, render } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import LocalProofPanel from '../../../src/lib/components/LocalProofPanel.svelte';
import type { CompanionState, CompanionStore } from '../../../src/lib/stores/companion';

function fakeStore(): CompanionStore {
  const state = writable<CompanionState>({
    baseUrl: 'http://127.0.0.1:47317',
    hasSecret: false,
    status: 'idle',
    version: null,
    capabilities: null,
    lastProbe: null,
    history: [],
    error: null,
  });
  return {
    subscribe: state.subscribe,
    configure: vi.fn(),
    checkHealth: vi.fn(() => Promise.resolve(true)),
    runProbe: vi.fn(() => Promise.resolve(null)),
    loadHistory: vi.fn(() => Promise.resolve([])),
    clearSecret: vi.fn(),
  };
}

describe('LocalProofPanel', () => {
  it('preselects the implicated endpoint and runs selected probes', async () => {
    const store = fakeStore();
    const { getByLabelText, getByRole } = render(LocalProofPanel, {
      props: { agentStore: store, targetUrl: 'https://api.example.com' },
    });

    expect((getByLabelText('Probe URL') as HTMLInputElement).value).toBe('https://api.example.com');
    await fireEvent.input(getByLabelText('Pairing token'), { target: { value: 'example-pairing-value' } });
    await fireEvent.click(getByRole('button', { name: /run local proof/i }));

    const configured = vi.mocked(store.configure).mock.calls[0]?.[0];
    expect(configured?.baseUrl).toBe('http://127.0.0.1:47317');
    expect(configured?.['secret']).toBe('example-pairing-value');
    expect(store.runProbe).toHaveBeenCalledWith('https://api.example.com', {
      probes: ['dns', 'tls', 'route', 'wifi'],
      includePrivateWifi: false,
    });
  });
});
```

- [ ] **Step 2: Implement `LocalProofPanel.svelte` as a focused wrapper**

Use the existing `CompanionPanel.svelte` logic, but keep this component scoped to one proof flow:

```ts
interface Props {
  agentStore?: CompanionStore;
  targetUrl?: string;
  compact?: boolean;
}
```

Visible fields:

- Agent URL
- Pairing token
- Probe URL
- DNS, TLS, Route/MTR, WiFi toggles
- Private WiFi checkbox disabled unless WiFi is selected
- Check agent
- Run local proof
- Last result summary
- Error message

- [ ] **Step 3: Route report local-agent actions to the focused panel**

In `ReportView.svelte`, replace the primary `run-local-agent` action from `openSettingsWorkflow(action)` to opening an inline local proof panel or a compact report panel. Keep full Settings as a secondary link inside the panel.

- [ ] **Step 4: Verify local proof tests**

Run:

```bash
npm test -- tests/unit/components/local-proof-panel.test.ts tests/unit/components/CompanionPanel.test.ts tests/unit/stores/companion.test.ts
```

Expected: all listed tests pass.

## Task 4: Evidence Refresh And Stale State

**Files:**
- Modify: `src/lib/utils/evidence-trail.ts`
- Modify: `src/lib/share/share-payload-builder.ts`
- Modify: `src/lib/types.ts`
- Modify: `tests/unit/utils/evidence-trail.test.ts`
- Modify: `tests/unit/share/share-payload-builder-remote.test.ts`

- [ ] **Step 1: Add tests for stale outside proof**

Extend `tests/unit/utils/evidence-trail.test.ts`:

```ts
it('marks outside proof as stale when the report was created after the outside check', () => {
  const trail = buildEvidenceTrail({
    report: isolatedReport(),
    remoteVantage: {
      ...emptyRemote,
      status: 'connected',
      lastProbe: {
        ok: true,
        generatedAt: 1000,
        edge: { colo: 'IAD' },
        results: [],
      },
    },
    companion: emptyCompanion,
  });

  expect(trail.find((item) => item.id === 'outside-check')?.status).toBe('Stale');
});
```

- [ ] **Step 2: Update evidence trail freshness**

Use `proofFreshnessLabel` in `evidence-trail.ts` for remote and local proof. If `report.createdAt` is null, keep the existing non-stale labels.

- [ ] **Step 3: Keep share payloads synchronized after remote proof**

`ReportView.svelte` and `SharePopover.svelte` already pass `remoteVantageStore.lastProbe` into `buildResultsSharePayload`. Add tests that prove a newly captured remote probe appears in copied report payloads after `runProbe` resolves.

- [ ] **Step 4: Verify evidence refresh**

Run:

```bash
npm test -- tests/unit/utils/evidence-trail.test.ts tests/unit/share/share-payload-builder-remote.test.ts tests/unit/components/report-view-actions.test.ts
```

Expected: all listed tests pass.

## Task 5: Visual And Release Verification

**Files:**
- Modify: `tests/visual/ac-verification.spec.ts`

- [ ] **Step 1: Add visual states**

Extend `tests/visual/ac-verification.spec.ts` to capture:

- report proof actions at 375px
- report proof actions at 1440px
- local proof panel compact state
- remote proof captured state

- [ ] **Step 2: Run local verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:visual -- tests/visual/ac-verification.spec.ts
```

Expected: all commands pass.

- [ ] **Step 3: PR and deploy**

Open one PR per coherent slice. After each merge, confirm CI, CodeQL, DeepSource, Cloudflare Pages deploy, and a live smoke test on `chronoscope.dev` for the affected proof flow.

## Acceptance Criteria

- Every report triage action has visible before, running, captured, failed, and stale states where applicable.
- Remote proof uses outside-vantage language only.
- Local proof starts from the implicated endpoint when one exists.
- Failed proof actions produce a useful next step.
- Evidence trail and share payloads refresh after proof capture.
- 375px and 1440px layouts have no horizontal overflow.
