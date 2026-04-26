// Security guarantees for share-payload hydration. Maps to issue #79.
//
// Threat model: a crafted share link encodes attacker URLs + cadence knobs.
// Pre-fix, both modes silently mutated endpointStore + settingsStore on page
// load — one Start click weaponized the victim's browser as a small-scale
// flood / scanner. These tests pin the post-fix invariants:
//
//   1. Cadence settings (timeout/delay/burstRounds/monitorDelay/cap/corsMode)
//      from a payload NEVER reach settingsStore. The receiver always probes
//      at their own defaults.
//   2. Config-mode payloads STAGE — they do not write to endpointStore until
//      the user explicitly accepts. The rail keeps showing the user's actual
//      config until consent.
//   3. Results-mode payloads apply endpoints + samples for display (snapshot
//      is read-only), but still skip the cadence write.
//   4. Accept / dismiss the staged payload mutates only the documented
//      stores; cadence is never touched.

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  applySharePayload,
  acceptPendingShare,
  dismissPendingShare,
} from '../../../src/lib/share/hash-router';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { settingsStore } from '../../../src/lib/stores/settings';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { uiStore } from '../../../src/lib/stores/ui';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';
import type { SharePayload } from '../../../src/lib/types';
import { MAX_CAP } from '../../../src/lib/limits';

// Each field is deliberately distinct from DEFAULT_SETTINGS so the cadence-
// strip invariant fails closed: if a future change accidentally writes any
// field from a payload into settingsStore, the corresponding assertion
// flips. Picking values that overlap defaults (e.g. delay: 0 when
// DEFAULT_SETTINGS.delay is also 0) silently weakens the test.
const MALICIOUS_CADENCE = {
  timeout: 100,
  delay: 9999,
  burstRounds: 500,
  monitorDelay: 1,
  cap: 3000,  // in-range: passes schema validation → exercises apply-drops invariant (PR #81)
  corsMode: 'cors' as const,
};

const ATTACKER_URLS = [
  'https://victim-target.example.com/expensive',
  'https://other-victim.example.com/api',
];

function configPayload(): SharePayload {
  return {
    v: 1,
    mode: 'config',
    endpoints: ATTACKER_URLS.map((url) => ({ url, enabled: true })),
    settings: MALICIOUS_CADENCE,
  };
}

function resultsPayload(): SharePayload {
  return {
    v: 1,
    mode: 'results',
    endpoints: ATTACKER_URLS.map((url) => ({ url, enabled: true })),
    settings: MALICIOUS_CADENCE,
    results: ATTACKER_URLS.map(() => ({
      samples: Array.from({ length: 10 }, (_, i) => ({
        round: i,
        latency: 50,
        status: 'ok' as const,
      })),
    })),
  };
}

beforeEach(() => {
  endpointStore.setEndpoints([]);
  settingsStore.reset();
  measurementStore.reset();
  uiStore.reset();
});

describe('hash-router: share-payload schema rejects cap > MAX_CAP', () => {
  // AC4: schema-reject test — cap=3601 must be rejected by validateSharePayload
  // (This is distinct from the apply-drops test below, which uses cap=3000.
  // Both must exist; collapsing them loses coverage of the PR #81 invariant.)
  it('decodeSharePayload returns null for cap > MAX_CAP', async () => {
    const { decodeSharePayload } = await import('../../../src/lib/share/share-manager');
    const { default: LZString } = await import('lz-string');
    const malicious = {
      v: 1,
      mode: 'config',
      endpoints: [{ url: 'https://attacker.example.com', enabled: true }],
      settings: {
        timeout: 5000,
        delay: 0,
        cap: MAX_CAP + 1, // 3601 — above MAX_CAP, must be rejected
        corsMode: 'no-cors',
      },
    };
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(malicious));
    // AC4: validateSharePayload returns null for cap > MAX_CAP
    expect(decodeSharePayload(encoded)).toBeNull();
  });

  it('decodeSharePayload accepts cap === MAX_CAP (boundary)', async () => {
    const { decodeSharePayload } = await import('../../../src/lib/share/share-manager');
    const { default: LZString } = await import('lz-string');
    const atBoundary = {
      v: 1,
      mode: 'config',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000,
        delay: 0,
        cap: MAX_CAP, // 3600 — at boundary, must be accepted
        corsMode: 'no-cors',
      },
    };
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(atBoundary));
    expect(decodeSharePayload(encoded)).not.toBeNull();
  });
});

describe('hash-router: cadence write invariant', () => {
  it('config mode: settingsStore stays at user defaults after apply', () => {
    applySharePayload(configPayload());
    const s = get(settingsStore);
    expect(s.timeout).toBe(DEFAULT_SETTINGS.timeout);
    expect(s.delay).toBe(DEFAULT_SETTINGS.delay);
    expect(s.burstRounds).toBe(DEFAULT_SETTINGS.burstRounds);
    expect(s.monitorDelay).toBe(DEFAULT_SETTINGS.monitorDelay);
    expect(s.cap).toBe(DEFAULT_SETTINGS.cap);
    expect(s.corsMode).toBe(DEFAULT_SETTINGS.corsMode);
  });

  it('config mode: settingsStore stays at user defaults after accept', () => {
    applySharePayload(configPayload());
    acceptPendingShare();
    const s = get(settingsStore);
    expect(s.timeout).toBe(DEFAULT_SETTINGS.timeout);
    expect(s.delay).toBe(DEFAULT_SETTINGS.delay);
    expect(s.burstRounds).toBe(DEFAULT_SETTINGS.burstRounds);
    expect(s.cap).toBe(DEFAULT_SETTINGS.cap);
    expect(s.corsMode).toBe(DEFAULT_SETTINGS.corsMode);
  });

  it('results mode: settingsStore stays at user defaults', () => {
    applySharePayload(resultsPayload());
    const s = get(settingsStore);
    expect(s.timeout).toBe(DEFAULT_SETTINGS.timeout);
    expect(s.delay).toBe(DEFAULT_SETTINGS.delay);
    expect(s.burstRounds).toBe(DEFAULT_SETTINGS.burstRounds);
    expect(s.monitorDelay).toBe(DEFAULT_SETTINGS.monitorDelay);
    expect(s.cap).toBe(DEFAULT_SETTINGS.cap);
    expect(s.corsMode).toBe(DEFAULT_SETTINGS.corsMode);
  });
});

describe('hash-router: config-mode staging', () => {
  it('does not write to endpointStore on apply', () => {
    expect(get(endpointStore)).toEqual([]);
    applySharePayload(configPayload());
    expect(get(endpointStore)).toEqual([]);
  });

  it('sets pendingShare on uiStore with the payload endpoints', () => {
    applySharePayload(configPayload());
    const ui = get(uiStore);
    expect(ui.pendingShare).not.toBeNull();
    expect(ui.pendingShare?.mode).toBe('config');
    expect(ui.pendingShare?.endpoints.map((e) => e.url)).toEqual(ATTACKER_URLS);
  });

  it('does not flip isSharedView (that flag is for read-only results)', () => {
    applySharePayload(configPayload());
    expect(get(uiStore).isSharedView).toBe(false);
  });

  it('acceptPendingShare populates endpointStore from staged payload', () => {
    applySharePayload(configPayload());
    acceptPendingShare();
    const eps = get(endpointStore);
    expect(eps.map((e) => e.url)).toEqual(ATTACKER_URLS);
    expect(get(uiStore).pendingShare).toBeNull();
  });

  it('acceptPendingShare does not flip isSharedView (back to interactive)', () => {
    applySharePayload(configPayload());
    acceptPendingShare();
    // Once accepted, the user is in normal interactive mode with new
    // endpoints — the "Shared results — read only" banner must not appear.
    expect(get(uiStore).isSharedView).toBe(false);
  });

  it('dismissPendingShare clears staging without applying', () => {
    applySharePayload(configPayload());
    dismissPendingShare();
    expect(get(endpointStore)).toEqual([]);
    expect(get(uiStore).pendingShare).toBeNull();
    expect(get(uiStore).isSharedView).toBe(false);
  });

  it('acceptPendingShare is a no-op when nothing is staged', () => {
    expect(() => acceptPendingShare()).not.toThrow();
    expect(get(endpointStore)).toEqual([]);
  });

  // Validation accepts duplicate URLs in the endpoints array (it only checks
  // each entry individually). Without dedupe, Svelte's keyed `#each` block
  // in the staging banner — and the rail after accept — would throw at
  // runtime on the second child with the same key, leaving the user
  // staring at a broken page. Worse, a default-Accept reflex would then
  // populate the rail from a partially-rendered banner.
  it('dedupes duplicate URLs in the staged payload', () => {
    const dupePayload: SharePayload = {
      v: 1,
      mode: 'config',
      endpoints: [
        { url: 'https://a.example.com', enabled: true },
        { url: 'https://a.example.com', enabled: false },
        { url: 'https://b.example.com', enabled: true },
        { url: 'https://a.example.com', enabled: true },
      ],
      settings: MALICIOUS_CADENCE,
    };
    applySharePayload(dupePayload);
    const staged = get(uiStore).pendingShare?.endpoints ?? [];
    expect(staged.map((e) => e.url)).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('accepted endpoints are unique even when the payload had duplicates', () => {
    const dupePayload: SharePayload = {
      v: 1,
      mode: 'config',
      endpoints: [
        { url: 'https://a.example.com', enabled: true },
        { url: 'https://a.example.com', enabled: true },
      ],
      settings: MALICIOUS_CADENCE,
    };
    applySharePayload(dupePayload);
    acceptPendingShare();
    expect(get(endpointStore).map((e) => e.url)).toEqual(['https://a.example.com']);
  });

  // URL host is case-insensitive per RFC 3986. Without lowercasing the
  // dedup key, a payload could smuggle ten "distinct" entries that all
  // resolve to the same host.
  it('dedupe is case-insensitive on the URL key', () => {
    const mixedCase: SharePayload = {
      v: 1,
      mode: 'config',
      endpoints: [
        { url: 'https://Example.com/path', enabled: true },
        { url: 'https://example.com/path', enabled: true },
        { url: 'https://EXAMPLE.com/path', enabled: true },
      ],
      settings: MALICIOUS_CADENCE,
    };
    applySharePayload(mixedCase);
    expect(get(uiStore).pendingShare?.endpoints).toHaveLength(1);
  });
});

describe('hash-router: results-mode invariants', () => {
  // Pre-fix, validateSharePayload accepted `mode: 'results'` with
  // `results: undefined`. The apply path then took its else branch and
  // skipped the snapshot load + sharedView flag — but endpoints had
  // already been written to endpointStore. Net: rail full of attacker
  // URLs, no banner, no read-only indicator. A half-open #79 variant.
  it('rejects results mode without a results array (via parseShareURL)', async () => {
    const { decodeSharePayload, encodeSharePayload } = await import('../../../src/lib/share/share-manager');
    // Hand-craft a payload that would have passed validation pre-fix.
    const malformed = {
      v: 1,
      mode: 'results',
      endpoints: [{ url: 'https://attacker.example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
      // results omitted
    };
    const encoded = encodeSharePayload(malformed as never);
    expect(decodeSharePayload(encoded)).toBeNull();
  });

  // The roundCounter clamp at hash-router.ts:148 is load-bearing — without
  // it, an attacker can push the counter to MAX_SAFE_INTEGER and break
  // downstream monotonicity / arithmetic. Pin the invariant so a future
  // refactor can't quietly drop the clamp.
  it('clamps roundCounter at MAX_SHARE_ROUND_COUNTER (1_000_000)', () => {
    const adversarial: SharePayload = {
      v: 1,
      mode: 'results',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: MALICIOUS_CADENCE,
      results: [
        {
          samples: [
            { round: Number.MAX_SAFE_INTEGER, latency: 50, status: 'ok' },
          ],
        },
      ],
    };
    applySharePayload(adversarial);
    const m = get(measurementStore);
    expect(m.roundCounter).toBeLessThanOrEqual(1_000_000);
  });
});

describe('hash-router: results-mode application', () => {
  it('applies endpoints to endpointStore for display', () => {
    applySharePayload(resultsPayload());
    const eps = get(endpointStore);
    expect(eps.map((e) => e.url)).toEqual(ATTACKER_URLS);
  });

  it('sets isSharedView so the read-only banner mounts', () => {
    applySharePayload(resultsPayload());
    expect(get(uiStore).isSharedView).toBe(true);
  });

  it('does not set pendingShare (results apply directly, no staging)', () => {
    applySharePayload(resultsPayload());
    expect(get(uiStore).pendingShare).toBeNull();
  });

  it('loads measurement snapshot for visualization', () => {
    applySharePayload(resultsPayload());
    const m = get(measurementStore);
    expect(m.lifecycle).toBe('completed');
  });
});
