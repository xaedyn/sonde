import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteVantageStore } from '../../../src/lib/stores/remote-vantage';
import type { RemoteVantageClient } from '../../../src/lib/remote-vantage/client';
import type { Endpoint } from '../../../src/lib/types';

const endpoints: Endpoint[] = [
  {
    id: 'ep-1',
    label: 'API',
    url: 'https://api.example.com',
    enabled: true,
    color: '#67e8f9',
  },
  {
    id: 'ep-2',
    label: 'Disabled',
    url: 'https://disabled.example.com',
    enabled: false,
    color: '#f9a8d4',
  },
];

describe('remoteVantageStore', () => {
  it('runs remote probes only for enabled endpoints and stores edge evidence', async () => {
    const client: RemoteVantageClient = {
      checkHealth: vi.fn(),
      runProbe: vi.fn(() => Promise.resolve({
        ok: true,
        generatedAt: 1778352000000,
        edge: { colo: 'IAD', country: 'US' },
        results: [{
          endpointId: 'ep-1',
          label: 'API',
          url: 'https://api.example.com',
          ok: true,
          status: 200,
          statusText: 'OK',
          durationMs: 44,
          checkedAt: 1778352000000,
          verdict: 'reachable',
          headers: {},
        }],
      })),
      createHostedReport: vi.fn(),
      loadHostedReport: vi.fn(),
    };
    const store = createRemoteVantageStore(client);

    await store.runProbe(endpoints);

    expect(client.runProbe).toHaveBeenCalledWith({
      targets: [{ id: 'ep-1', label: 'API', url: 'https://api.example.com' }],
    });
    expect(get(store)).toMatchObject({
      status: 'connected',
      lastProbe: {
        edge: { colo: 'IAD', country: 'US' },
      },
    });
  });

  it('falls back to hash sharing when hosted report persistence is unavailable', async () => {
    const client: RemoteVantageClient = {
      checkHealth: vi.fn(),
      runProbe: vi.fn(),
      createHostedReport: vi.fn(() => Promise.resolve({
        ok: false,
        fallback: 'hash',
        error: 'Report persistence is not configured.',
      })),
      loadHostedReport: vi.fn(),
    };
    const store = createRemoteVantageStore(client);

    await expect(store.createHostedReport({ v: 1, mode: 'config', endpoints: [], settings: {
      timeout: 5000,
      delay: 0,
      cap: 10,
      corsMode: 'no-cors',
    } })).resolves.toBeNull();
    expect(get(store).hostedReportFallback).toBe('hash');
  });
});
