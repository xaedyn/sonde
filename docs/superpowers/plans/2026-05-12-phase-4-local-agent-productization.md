# Phase 4 Local Agent Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the optional local companion from a settings-panel utility into a first-class, privacy-safe proof engine.

**Architecture:** Keep loopback-only signed communication, but add typed probe results, guided pairing, focused proof UI, and explicit report redaction. The browser should explain what the agent can prove without exposing private WiFi or local history by default.

**Tech Stack:** Node local companion agent, Svelte 5, TypeScript, Vitest, Testing Library, existing HMAC companion protocol.

---

## File Structure

- Modify `src/lib/companion/protocol.ts` to type DNS, TLS, route, WiFi, and history results.
- Modify `companion/local-agent.cjs` to emit typed result shapes consistently.
- Create `src/lib/companion/sanitize.ts` for report-safe local proof redaction.
- Create `tests/unit/companion/sanitize.test.ts`.
- Modify `src/lib/stores/companion.ts` to track proof target, timestamps, and typed probe state if needed.
- Modify `src/lib/components/CompanionPanel.svelte` and `src/lib/components/LocalProofPanel.svelte`.
- Modify `src/lib/components/ReportView.svelte` and `src/lib/utils/evidence-trail.ts` for local proof evidence.
- Modify `docs/companion-local-agent.md`.
- Update `tests/unit/companion/protocol.test.ts`, `tests/unit/companion/local-agent.test.ts`, `tests/unit/components/CompanionPanel.test.ts`, and `tests/unit/components/local-proof-panel.test.ts`.

## Task 1: Typed Companion Probe Results

**Files:**
- Modify: `src/lib/companion/protocol.ts`
- Modify: `companion/local-agent.cjs`
- Modify: `tests/unit/companion/protocol.test.ts`
- Modify: `tests/unit/companion/local-agent.test.ts`

- [ ] **Step 1: Add protocol tests for typed result sections**

Add assertions to `tests/unit/companion/protocol.test.ts`:

```ts
import type { CompanionProbeResults } from '../../../src/lib/companion/protocol';

it('allows typed companion probe sections', () => {
  const results: CompanionProbeResults = {
    dns: { ok: true, durationMs: 12, value: { lookup: [{ address: '203.0.113.1', family: 4 }], a: ['203.0.113.1'], aaaa: [], cname: [] } },
    tls: { ok: true, durationMs: 28, value: { authorized: true, authorizationError: null, protocol: 'TLSv1.3', cipher: 'TLS_AES_128_GCM_SHA256', validFrom: 'Jan 1', validTo: 'Dec 31', subject: 'example.com', issuer: 'Example CA', fingerprint256: 'AA:BB' } },
    route: { ok: false, durationMs: 10000, error: 'traceroute command not found' },
    wifi: { ok: true, durationMs: 4, value: { ssid: 'redacted', bssid: 'redacted', rssi: -48, noise: -91 } },
  };

  expect(results.dns?.ok).toBe(true);
  expect(results.wifi?.value?.ssid).toBe('redacted');
});
```

- [ ] **Step 2: Implement protocol types**

In `src/lib/companion/protocol.ts`, replace `Record<string, unknown>` with typed sections:

```ts
export interface CompanionTimedResult<T> {
  readonly ok: boolean;
  readonly durationMs: number;
  readonly value?: T;
  readonly error?: string;
  readonly unavailable?: boolean;
  readonly reason?: string;
}

export interface CompanionProbeResults {
  readonly dns?: CompanionTimedResult<{
    readonly lookup: readonly { readonly address: string; readonly family: number }[];
    readonly a: readonly string[];
    readonly aaaa: readonly string[];
    readonly cname: readonly string[];
  }>;
  readonly tls?: CompanionTimedResult<{
    readonly authorized: boolean;
    readonly authorizationError: string | null;
    readonly protocol: string | null;
    readonly cipher: string | null;
    readonly validFrom: string | null;
    readonly validTo: string | null;
    readonly subject: string | null;
    readonly issuer: string | null;
    readonly fingerprint256: string | null;
  }>;
  readonly route?: CompanionTimedResult<{
    readonly tool: string;
    readonly hops: readonly { readonly raw: string }[];
    readonly stderr?: string;
  }>;
  readonly wifi?: CompanionTimedResult<{
    readonly ssid?: string;
    readonly bssid?: string;
    readonly rssi: number | null;
    readonly noise: number | null;
  }>;
}
```

Set `CompanionProbeResponse.results` to `CompanionProbeResults`.

- [ ] **Step 3: Normalize agent output**

In `companion/local-agent.cjs`, keep existing probe functions but make route and WiFi unavailable responses include `durationMs` through `timed` or wrapper helpers. Avoid leaking SSID/BSSID unless `includePrivateWifi` is true.

- [ ] **Step 4: Run companion protocol tests**

Run:

```bash
npm test -- tests/unit/companion/protocol.test.ts tests/unit/companion/local-agent.test.ts
```

Expected: all listed tests pass.

## Task 2: Privacy-Safe Local Proof Sanitizer

**Files:**
- Create: `src/lib/companion/sanitize.ts`
- Create: `tests/unit/companion/sanitize.test.ts`
- Modify: `src/lib/share/share-validator.ts` only if sanitized local proof is added to share payloads in this phase.

- [ ] **Step 1: Write sanitizer tests**

Create `tests/unit/companion/sanitize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeCompanionProbeForReport } from '../../../src/lib/companion/sanitize';
import type { CompanionProbeResponse } from '../../../src/lib/companion/protocol';

const probe: CompanionProbeResponse = {
  ok: true,
  id: 'probe-1',
  targetHost: 'api.example.com',
  createdAt: 1778352000000,
  summary: 'DNS, TLS, ROUTE, WIFI completed.',
  results: {
    wifi: {
      ok: true,
      durationMs: 5,
      value: { ssid: 'HomeNetwork', bssid: 'aa:bb:cc:dd:ee:ff', rssi: -51, noise: -90 },
    },
  },
};

describe('sanitizeCompanionProbeForReport', () => {
  it('redacts private WiFi identifiers by default', () => {
    expect(sanitizeCompanionProbeForReport(probe, { includePrivateWifi: false }).results.wifi?.value)
      .toMatchObject({ ssid: 'redacted', bssid: 'redacted', rssi: -51, noise: -90 });
  });

  it('keeps private WiFi identifiers only when explicitly allowed', () => {
    expect(sanitizeCompanionProbeForReport(probe, { includePrivateWifi: true }).results.wifi?.value)
      .toMatchObject({ ssid: 'HomeNetwork', bssid: 'aa:bb:cc:dd:ee:ff' });
  });
});
```

- [ ] **Step 2: Implement sanitizer**

Create `src/lib/companion/sanitize.ts`:

```ts
import type { CompanionProbeResponse } from './protocol';

export function sanitizeCompanionProbeForReport(
  probe: CompanionProbeResponse,
  options: { readonly includePrivateWifi: boolean },
): CompanionProbeResponse {
  const wifi = probe.results.wifi;
  return {
    ...probe,
    results: {
      ...probe.results,
      ...(wifi?.value ? {
        wifi: {
          ...wifi,
          value: {
            ...wifi.value,
            ssid: options.includePrivateWifi ? wifi.value.ssid : wifi.value.ssid ? 'redacted' : undefined,
            bssid: options.includePrivateWifi ? wifi.value.bssid : wifi.value.bssid ? 'redacted' : undefined,
          },
        },
      } : {}),
    },
  };
}
```

- [ ] **Step 3: Run sanitizer tests**

Run:

```bash
npm test -- tests/unit/companion/sanitize.test.ts
```

Expected: sanitizer tests pass.

## Task 3: Guided Pairing And First-Run UX

**Files:**
- Modify: `src/lib/components/CompanionPanel.svelte`
- Modify: `src/lib/components/LocalProofPanel.svelte`
- Modify: `tests/unit/components/CompanionPanel.test.ts`
- Modify: `tests/unit/components/local-proof-panel.test.ts`
- Modify: `docs/companion-local-agent.md`

- [ ] **Step 1: Add UI tests for pairing guidance**

Assert that the companion panel shows:

- token file path guidance
- local-only safety statement
- health check state
- no private WiFi sharing by default

Use:

```ts
expect(getByText(/local-only/i)).toBeTruthy();
expect(getByText(/agent-token\.txt/i)).toBeTruthy();
expect(getByLabelText('Private WiFi')).not.toBeChecked();
```

- [ ] **Step 2: Implement concise pairing guidance**

Add visible copy near the token field:

```svelte
<p class="agent-note">Local-only: Chronoscope talks to 127.0.0.1 and signed probes require the pairing token from ~/.chronoscope/agent-token.txt.</p>
```

Keep it compact and avoid turning the settings panel into documentation.

- [ ] **Step 3: Update docs**

Update `docs/companion-local-agent.md` with:

- start command: `npm run companion`
- token path: `~/.chronoscope/agent-token.txt`
- loopback-only behavior
- signed request behavior
- private WiFi redaction behavior
- what each probe can and cannot prove

- [ ] **Step 4: Verify companion UI**

Run:

```bash
npm test -- tests/unit/components/CompanionPanel.test.ts tests/unit/components/local-proof-panel.test.ts
```

Expected: all listed tests pass.

## Task 4: Local Proof Report Integration

**Files:**
- Modify: `src/lib/utils/evidence-trail.ts`
- Modify: `src/lib/components/ReportView.svelte`
- Modify: `src/lib/share/share-payload-builder.ts` only if sanitized local proof is included in payloads.
- Modify: `src/lib/types.ts` and `src/lib/share/share-validator.ts` only if share schema changes.
- Modify: relevant tests.

- [ ] **Step 1: Decide payload scope in code**

Default behavior:

- Include local proof status and summary in the in-app evidence trail.
- Do not include local proof payload in public share payloads by default.
- Allow sanitized local proof export only behind an explicit checkbox.
- Never include companion history in public reports by default.

- [ ] **Step 2: Add tests for default privacy**

Add a test proving `buildResultsSharePayload` does not include `localCompanion` unless an explicit sanitized value is passed.

- [ ] **Step 3: Add explicit local proof export**

If export is shipped in this phase, add a bounded `localCompanion` payload with sanitized output only. Update validator allowlists and tests in the same PR.

- [ ] **Step 4: Verify local proof report behavior**

Run:

```bash
npm test -- tests/unit/utils/evidence-trail.test.ts tests/unit/share-payload-builder.test.ts tests/unit/share/share-payload-rejects-unknown-keys.test.ts
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

- [ ] **Step 2: Manual local-agent smoke**

Run:

```bash
npm run companion
```

In another terminal, run the app and verify:

- Health check connects.
- Probe runs against a focused endpoint.
- WiFi SSID/BSSID remain redacted unless explicitly allowed.
- History loads only after a token is configured.

Stop the companion process after the smoke test.

## Acceptance Criteria

- First-time users can connect the agent without reading the README.
- The product explains what DNS, TLS, route, WiFi, and history evidence can prove.
- Private WiFi identifiers and local history never leak by default.
- Local proof appears in the evidence trail with clear browser-limit context.
- Signed loopback communication remains required for probes and history.
