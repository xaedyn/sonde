import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import { createNetworkContextStore } from '../../../src/lib/stores/network-context';
import type { Endpoint } from '../../../src/lib/types';

const endpoint: Endpoint = {
  id: 'api',
  label: 'API',
  url: 'https://api.example.com/private/path?fixture=redacted#hash',
  enabled: true,
  color: '#67e8f9',
};

describe('networkContextStore', () => {
  it('requests hostname-only context and labels the proof boundaries', async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/vantage/dns')) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          resolver: 'cloudflare-doh',
          hostname: 'api.example.com',
          recordType: 'A',
          records: ['203.0.113.10'],
          durationMs: 17,
          checkedAt: 1778352000000,
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        vantage: 'public-topology',
        hostname: 'api.example.com',
        ip: '203.0.113.10',
        prefix: '203.0.113.0/24',
        asn: 64500,
        organization: 'Example Network',
        durationMs: 42,
        checkedAt: 1778352000000,
      })));
    });
    const store = createNetworkContextStore({ fetcher });

    await store.run(endpoint);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/vantage/dns?hostname=api.example.com&type=A',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/vantage/topology?hostname=api.example.com',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private/path');
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('fixture=');
    expect(get(store)).toMatchObject({
      status: 'complete',
      hostname: 'api.example.com',
      dnsInsight: {
        vantage: 'outside-resolver',
        detail: expect.stringContaining('not your local DNS path'),
      },
      topologyInsight: expect.stringContaining('topology context, not active path proof'),
      error: null,
    });
  });

  it('keeps successful DNS context when public topology lookup is unavailable', async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/vantage/dns')) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          resolver: 'cloudflare-doh',
          hostname: 'api.example.com',
          recordType: 'A',
          records: ['203.0.113.10'],
          durationMs: 17,
          checkedAt: 1778352000000,
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        ok: false,
        error: 'No public DNS A record was available for topology context.',
      }), { status: 400 }));
    });
    const store = createNetworkContextStore({ fetcher });

    await store.run(endpoint);

    expect(get(store)).toMatchObject({
      status: 'complete',
      dnsInsight: expect.objectContaining({
        vantage: 'outside-resolver',
      }),
      topologyError: 'No public DNS A record was available for topology context.',
      error: null,
    });
  });

  it('reports dependency HTTP failures without leaking parser errors', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('<h1>Bad gateway</h1>', { status: 502 })));
    const store = createNetworkContextStore({ fetcher });

    await store.run(endpoint);

    expect(get(store)).toMatchObject({
      status: 'error',
      dnsError: 'Network context request failed with HTTP 502',
      topologyError: 'Network context request failed with HTTP 502',
      error: 'Network context did not complete.',
    });
  });
});
