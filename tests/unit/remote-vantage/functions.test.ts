// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleCreateHostedReport,
  handleDohDnsRequest,
  handleGetHostedReport,
  handleRemoteProbe,
  handleSaturationRequest,
  handleTopologyRequest,
} from '../../../functions/_shared/remote-vantage';
import type { SharePayload } from '../../../src/lib/types';

class FakeKV {
  private readonly values = new Map<string, string>();

  put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
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
    reportKind: 'support',
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('probes public targets from the edge and returns bounded evidence', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('ok', {
      status: 200,
      headers: {
        'content-type': 'text/plain',
        server: 'origin',
      },
    })));
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

  it('preserves the global fetch receiver when no fetcher is injected', async () => {
    const fetcher = vi.fn(function fetchWithRequiredReceiver(this: unknown) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    vi.stubGlobal('fetch', fetcher);
    const request = new Request('https://chronoscope.dev/api/vantage/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets: [{ id: 'ep-1', label: 'Origin', url: 'https://example.com/probe' }],
      }),
    });

    const response = await handleRemoteProbe(request, { now: () => 1778352000000 });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results[0]).toMatchObject({
      ok: true,
      status: 200,
      verdict: 'reachable',
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
          get: vi.fn(() => Promise.resolve({ body: largerObject, size: 2048 })),
        },
      },
    );

    expect(response.headers.get('Content-Length')).toBe('1024');
    expect((await response.arrayBuffer()).byteLength).toBe(1024);
  });

  it('resolves public hostnames through bounded Cloudflare DNS-over-HTTPS evidence', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      Status: 0,
      Answer: [
        { type: 1, data: '203.0.113.10' },
        { type: 28, data: '2001:db8::10' },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/dns-json' },
    })));
    const response = await handleDohDnsRequest(
      new Request('https://chronoscope.dev/api/vantage/dns?hostname=api.example.com'),
      {
        fetcher,
        now: () => 1778352000000,
        performanceNow: vi.fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(137),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      'https://cloudflare-dns.com/dns-query?name=api.example.com&type=A',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Accept: 'application/dns-json' }),
      }),
    );
    expect(payload).toMatchObject({
      ok: true,
      resolver: 'cloudflare-doh',
      hostname: 'api.example.com',
      recordType: 'A',
      records: ['203.0.113.10'],
      durationMs: 37,
      checkedAt: 1778352000000,
    });
  });

  it('rejects private names and IP literals before DNS-over-HTTPS fetch', async () => {
    const fetcher = vi.fn();

    const local = await handleDohDnsRequest(
      new Request('https://chronoscope.dev/api/vantage/dns?hostname=router.local'),
      { fetcher },
    );
    const ipLiteral = await handleDohDnsRequest(
      new Request('https://chronoscope.dev/api/vantage/dns?hostname=1.1.1.1'),
      { fetcher },
    );

    expect(local.status).toBe(400);
    expect(ipLiteral.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not expose raw resolver exception details in DNS responses', async () => {
    const response = await handleDohDnsRequest(
      new Request('https://chronoscope.dev/api/vantage/dns?hostname=api.example.com'),
      {
        fetcher: vi.fn(() => Promise.reject(new Error('stack detail with internal path'))),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toBe('Cloudflare DNS-over-HTTPS lookup did not complete.');
    expect(payload.error).not.toContain('internal path');
  });

  it('answers DNS CORS preflight requests', async () => {
    const response = await handleDohDnsRequest(
      new Request('https://chronoscope.dev/api/vantage/dns', { method: 'OPTIONS' }),
      {},
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('returns ASN topology context for a public hostname and public resolved IP', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        Answer: [{ type: 1, data: '104.20.23.154' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { asns: ['13335'], prefix: '104.20.16.0/20' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { holder: 'CLOUDFLARENET - Cloudflare, Inc.' },
      }), { status: 200 }));

    const response = await handleTopologyRequest(
      new Request('https://chronoscope.dev/api/vantage/topology?hostname=example.com'),
      {
        fetcher,
        now: () => 1778352000000,
        performanceNow: vi.fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(128),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://cloudflare-dns.com/dns-query?name=example.com&type=A',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://stat.ripe.net/data/network-info/data.json?resource=104.20.23.154',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      'https://stat.ripe.net/data/as-overview/data.json?resource=AS13335',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(payload).toMatchObject({
      ok: true,
      vantage: 'public-topology',
      hostname: 'example.com',
      ip: '104.20.23.154',
      prefix: '104.20.16.0/20',
      asn: 13335,
      organization: 'CLOUDFLARENET - Cloudflare, Inc.',
      durationMs: 28,
      checkedAt: 1778352000000,
    });
  });

  it('rejects topology lookups when DNS only returns private IPs', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      Answer: [{ type: 1, data: '10.0.0.10' }],
    }), { status: 200 })));

    const response = await handleTopologyRequest(
      new Request('https://chronoscope.dev/api/vantage/topology?hostname=example.com'),
      { fetcher },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('No public DNS A record was available for topology context.');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('answers topology CORS preflight requests', async () => {
    const response = await handleTopologyRequest(
      new Request('https://chronoscope.dev/api/vantage/topology', { method: 'OPTIONS' }),
      {},
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
