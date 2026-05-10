import { describe, expect, it, vi } from 'vitest';
import { createCompanionClient } from '../../../src/lib/companion/client';

describe('companion client', () => {
  it('sends health checks with an abort signal', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: true,
      version: '0.1.0',
      protocolVersion: 1,
      capabilities: {
        dns: true,
        tls: true,
        route: true,
        wifi: true,
        sqliteHistory: true,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    const client = createCompanionClient(fetcher);

    await client.checkHealth('http://127.0.0.1:47317');

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:47317/health', expect.objectContaining({
      method: 'GET',
      signal: expect.any(AbortSignal),
    }));
  });

  it('sends signed probe requests with an abort signal', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: true,
      id: 'probe-1',
      targetHost: 'example.com',
      createdAt: 1765300000000,
      summary: 'DNS completed.',
      results: { dns: { ok: true } },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    const client = createCompanionClient(fetcher);

    await client.runProbe('http://127.0.0.1:47317', 'secret', {
      targetUrl: 'https://example.com',
      probes: ['dns'],
      includePrivateWifi: false,
    });

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:47317/v1/probe', expect.objectContaining({
      method: 'POST',
      signal: expect.any(AbortSignal),
    }));
  });
});
