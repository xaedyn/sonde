// Tests for unknown-key rejection in validateSharePayload.
//
// Threat model: a crafted share link can inject unexpected keys (e.g. nickname
// harvesting, prototype-pollution surface, future round-trip footgun) at both
// the top level and per-entry level. The validator must reject any payload
// that contains keys outside the declared allowlists:
//   - Top-level:  { v, mode, endpoints, settings, results }
//   - Per-entry:  { url, enabled }
//
// Uses the encodeSharePayload / decodeSharePayload round-trip so the full
// compression + validation path is exercised.

import { describe, it, expect } from 'vitest';
import {
  encodeSharePayload,
  decodeSharePayload,
} from '../../../src/lib/share/share-manager';
import type { SharePayload } from '../../../src/lib/types';
import { MAX_CAP } from '../../../src/lib/limits';

// ── Per-entry rejection ────────────────────────────────────────────────────

describe('validateSharePayload: per-entry unknown key rejection', () => {
  it('rejects when a nickname is injected into an endpoint entry', () => {
    const payload = {
      v: 1,
      mode: 'config',
      endpoints: [
        { url: 'https://example.com', enabled: true, nickname: 'My Server' },
      ],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' as const },
    };
    const encoded = encodeSharePayload(payload as never);
    expect(decodeSharePayload(encoded)).toBeNull();
  });

  it('rejects when an arbitrary unknown key is present in an endpoint entry', () => {
    const payload = {
      v: 1,
      mode: 'config',
      endpoints: [
        { url: 'https://example.com', enabled: true, extra: 'injected' },
      ],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' as const },
    };
    const encoded = encodeSharePayload(payload as never);
    expect(decodeSharePayload(encoded)).toBeNull();
  });

  it('accepts an endpoint entry with only { url, enabled }', () => {
    const payload: SharePayload = {
      v: 1,
      mode: 'config',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
    };
    const encoded = encodeSharePayload(payload);
    expect(decodeSharePayload(encoded)).not.toBeNull();
  });
});

// ── Top-level rejection ────────────────────────────────────────────────────

describe('validateSharePayload: top-level unknown key rejection', () => {
  it('rejects when a top-level "nicknames" key is present', () => {
    const payload = {
      v: 1,
      mode: 'config',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' as const },
      nicknames: { 'https://example.com': 'My Server' },
    };
    const encoded = encodeSharePayload(payload as never);
    expect(decodeSharePayload(encoded)).toBeNull();
  });

  it('rejects when an arbitrary unknown top-level key is present', () => {
    const payload = {
      v: 1,
      mode: 'config',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' as const },
      injected: 'arbitrary',
    };
    const encoded = encodeSharePayload(payload as never);
    expect(decodeSharePayload(encoded)).toBeNull();
  });

  it('accepts { v, mode, endpoints, settings } (config mode baseline)', () => {
    const payload: SharePayload = {
      v: 1,
      mode: 'config',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
    };
    const encoded = encodeSharePayload(payload);
    expect(decodeSharePayload(encoded)).not.toBeNull();
  });

  it('accepts { v, mode, endpoints, settings, results } (results mode baseline)', () => {
    const payload: SharePayload = {
      v: 1,
      mode: 'results',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
      results: [
        {
          samples: [{ round: 0, latency: 42, status: 'ok' }],
        },
      ],
    };
    const encoded = encodeSharePayload(payload);
    expect(decodeSharePayload(encoded)).not.toBeNull();
  });
});

// ── PR #81 invariant preserved ─────────────────────────────────────────────

describe('validateSharePayload: PR #81 invariant preserved', () => {
  it('rejects results mode without a results array (existing invariant)', () => {
    const payload = {
      v: 1,
      mode: 'results',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' as const },
      // results intentionally omitted
    };
    const encoded = encodeSharePayload(payload as never);
    expect(decodeSharePayload(encoded)).toBeNull();
  });
});
