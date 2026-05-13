// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  handleIntelligenceIngest,
  handleIntelligenceSummary,
  validateIntelligencePayload,
  type IntelligenceStore,
} from '../../../functions/_shared/intelligence';

class FakeIntelligenceStore implements IntelligenceStore {
  readonly values = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  list(options?: { readonly prefix?: string; readonly limit?: number }): Promise<{ readonly keys: readonly { readonly name: string }[] }> {
    const keys = [...this.values.keys()]
      .filter((name) => options?.prefix === undefined || name.startsWith(options.prefix))
      .slice(0, options?.limit ?? 1000)
      .map((name) => ({ name }));
    return Promise.resolve({ keys });
  }
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    consent: 'anonymous-aggregate',
    originHost: null,
    publicOriginHash: null,
    p50: 42,
    p95: 80,
    lossPercent: 0,
    sampleCount: 35,
    createdAt: 1778352000000,
    ...overrides,
  };
}

function ingestRequest(body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }): Request {
  return new Request('https://chronoscope.dev/api/intelligence/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('collective intelligence functions', () => {
  it('rejects missing consent', () => {
    expect(validateIntelligencePayload(validPayload({ consent: undefined }))).toEqual({
      ok: false,
      error: 'Consent is required.',
    });
  });

  it('rejects full URL and private fields', () => {
    for (const privateField of [
      { url: 'https://api.example.com/path' },
      { endpointUrl: 'https://api.example.com/private?token=secret' },
      { wifi: { ssid: 'HomeNetwork' } },
      { history: [{ url: 'https://private.example' }] },
      { localStorage: { chronoscope_settings: '{}' } },
      { indexedDB: { history: [] } },
    ]) {
      expect(validateIntelligencePayload(validPayload(privateField))).toEqual({
        ok: false,
        error: 'Payload contains private fields.',
      });
    }
  });

  it('rejects localhost and private named hosts', () => {
    for (const originHost of ['localhost', '192.168.1.1', 'router.local', '[::1]']) {
      expect(validateIntelligencePayload(validPayload({
        consent: 'named-public-endpoint',
        originHost,
      }))).toMatchObject({
        ok: false,
        error: 'Named endpoint must be a public hostname.',
      });
    }
  });

  it('rejects sample counts over the bounded limit', () => {
    expect(validateIntelligencePayload(validPayload({ sampleCount: 10001 }))).toEqual({
      ok: false,
      error: 'Invalid sample count.',
    });
  });

  it('returns 503 when aggregate storage is not configured', async () => {
    const response = await handleIntelligenceIngest(ingestRequest(validPayload()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Intelligence storage is not configured.',
    });
  });

  it('accepts aggregate-safe payloads and stores only counters', async () => {
    const store = new FakeIntelligenceStore();
    const response = await handleIntelligenceIngest(
      ingestRequest(validPayload({
        consent: 'named-public-endpoint',
        originHost: 'api.example.com',
      })),
      { store, now: () => 1778352060000 },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, accepted: true });
    expect(store.values.size).toBe(1);
    const stored = [...store.values.values()][0]!;
    expect(stored).toContain('"count":1');
    expect(stored).toContain('"sampleCount":35');
    expect(stored).not.toMatch(/https?:\/\//);
    expect(stored).not.toMatch(/endpointUrl|ssid|bssid|history|localStorage|indexedDB/i);
  });

  it('answers CORS preflight without storage', async () => {
    const response = await handleIntelligenceIngest(new Request('https://chronoscope.dev/api/intelligence/ingest', {
      method: 'OPTIONS',
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns aggregate summary buckets only', async () => {
    const store = new FakeIntelligenceStore();
    await store.put('intelligence:v1:2026-05-13:named-public-endpoint:host:api.example.com', JSON.stringify({
      v: 1,
      bucket: '2026-05-13',
      consent: 'named-public-endpoint',
      originHost: 'api.example.com',
      count: 2,
      sampleCount: 70,
      p50Sum: 90,
      p95Sum: 170,
      lossPercentSum: 1.5,
      updatedAt: 1778352060000,
    }));
    await store.put('unrelated', JSON.stringify({
      url: 'https://private.example/path',
      ssid: 'HomeNetwork',
    }));

    const response = await handleIntelligenceSummary(new Request('https://chronoscope.dev/api/intelligence/summary'), {
      store,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      buckets: [{
        bucket: '2026-05-13',
        consent: 'named-public-endpoint',
        originHost: 'api.example.com',
        count: 2,
        sampleCount: 70,
        p50Avg: 45,
        p95Avg: 85,
        lossPercentAvg: 0.75,
        updatedAt: 1778352060000,
      }],
    });
    expect(JSON.stringify(payload)).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(payload)).not.toMatch(/ssid|bssid|history/i);
  });

  it('returns 503 for summaries when aggregate storage cannot be listed', async () => {
    const response = await handleIntelligenceSummary(new Request('https://chronoscope.dev/api/intelligence/summary'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Intelligence summary storage is not configured.',
    });
  });
});
