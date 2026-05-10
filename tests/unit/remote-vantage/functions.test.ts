// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  handleCreateHostedReport,
  handleGetHostedReport,
  handleRemoteProbe,
  handleSaturationRequest,
} from '../../../functions/_shared/remote-vantage';
import type { SharePayload } from '../../../src/lib/types';

class FakeKV {
  private readonly values = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
}

const sharePayload: SharePayload = {
  v: 2,
  mode: 'results',
  endpoints: [{ url: 'https://example.com', enabled: true }],
  settings: {
    timeout: 5000,
    delay: 0,
    burstRounds: 10,
    monitorDelay: 1000,
    cap: 100,
    corsMode: 'no-cors',
  },
  report: {
    createdAt: 1778352000000,
    healthThreshold: 120,
    corsMode: 'no-cors',
    roundCount: 10,
    totalSampleCount: 10,
    keptSampleCount: 10,
    truncated: false,
  },
  results: [{ samples: [{ round: 1, latency: 42, status: 'ok' }] }],
};

describe('Cloudflare remote vantage functions', () => {
  it('probes public targets from the edge and returns bounded evidence', async () => {
    const fetcher = vi.fn(async () => new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain',
        server: 'origin',
      },
    }));
    const request = new Request('https://chronoscope.dev/api/vantage/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets: [{ id: 'ep-1', label: 'Origin', url: 'https://example.com/probe' }],
      }),
    });

    const response = await handleRemoteProbe(request, {
      cf: { colo: 'IAD', country: 'US', city: 'Ashburn' },
      fetcher,
      now: () => 1778352000000,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(payload).toMatchObject({
      ok: true,
      edge: { colo: 'IAD', country: 'US', city: 'Ashburn' },
      results: [{
        endpointId: 'ep-1',
        label: 'Origin',
        url: 'https://example.com/probe',
        ok: true,
        status: 200,
        verdict: 'reachable',
      }],
    });
    expect(payload.results[0].headers).toEqual({
      'content-type': 'text/plain',
      server: 'origin',
    });
  });

  it('rejects non-public probe URLs before fetching', async () => {
    const fetcher = vi.fn();
    const request = new Request('https://chronoscope.dev/api/vantage/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets: [{ id: 'ep-1', label: 'Router', url: 'http://127.0.0.1:8080' }],
      }),
    });

    const response = await handleRemoteProbe(request, { fetcher });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('public http(s)');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects IPv4-mapped IPv6 private probe URLs before fetching', async () => {
    const fetcher = vi.fn();
    const request = new Request('https://chronoscope.dev/api/vantage/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets: [{ id: 'ep-1', label: 'Router', url: 'http://[::ffff:127.0.0.1]/' }],
      }),
    });

    const response = await handleRemoteProbe(request, { fetcher });

    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stores and retrieves hosted reports when KV is bound', async () => {
    const kv = new FakeKV();
    const createRequest = new Request('https://chronoscope.dev/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: sharePayload }),
    });

    const created = await handleCreateHostedReport(createRequest, {
      reports: kv,
      idFactory: () => 'report_123',
      now: () => 1778352000000,
    });
    const createdPayload = await created.json();
    expect(created.status).toBe(201);
    expect(createdPayload).toMatchObject({
      ok: true,
      id: 'report_123',
      url: 'https://chronoscope.dev/r/report_123',
    });

    const fetched = await handleGetHostedReport(
      new Request('https://chronoscope.dev/api/reports/report_123'),
      { reports: kv, id: 'report_123' },
    );
    await expect(fetched.json()).resolves.toEqual({ ok: true, payload: sharePayload });
  });

  it('returns a structured error when a hosted report is corrupted', async () => {
    const kv = new FakeKV();
    await kv.put('report:report_123', '{not json');

    const fetched = await handleGetHostedReport(
      new Request('https://chronoscope.dev/api/reports/report_123'),
      { reports: kv, id: 'report_123' },
    );

    expect(fetched.status).toBe(500);
    await expect(fetched.json()).resolves.toMatchObject({
      ok: false,
      error: 'Stored report is invalid.',
    });
  });

  it('tells the browser to fall back to hash links when report KV is absent', async () => {
    const response = await handleCreateHostedReport(
      new Request('https://chronoscope.dev/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: sharePayload }),
      }),
      {},
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      fallback: 'hash',
    });
    expect(response.status).toBe(503);
  });

  it('serves a bounded saturation stream for bufferbloat checks', async () => {
    const response = await handleSaturationRequest(
      new Request('https://chronoscope.dev/api/vantage/saturation?bytes=1024'),
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('1024');
    expect((await response.arrayBuffer()).byteLength).toBe(1024);
  });

  it('answers saturation CORS preflight requests', async () => {
    const response = await handleSaturationRequest(
      new Request('https://chronoscope.dev/api/vantage/saturation', { method: 'OPTIONS' }),
      {},
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('generates saturation bytes when the optional R2 object size does not exactly match', async () => {
    const largerObject = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2048));
        controller.close();
      },
    });
    const response = await handleSaturationRequest(
      new Request('https://chronoscope.dev/api/vantage/saturation?bytes=1024'),
      {
        bucket: {
          get: vi.fn(async () => ({ body: largerObject, size: 2048 })),
        },
      },
    );

    expect(response.headers.get('Content-Length')).toBe('1024');
    expect((await response.arrayBuffer()).byteLength).toBe(1024);
  });
});
