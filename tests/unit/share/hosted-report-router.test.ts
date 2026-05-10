import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { initHostedReportRouter } from '../../../src/lib/share/hash-router';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { remoteVantageStore } from '../../../src/lib/stores/remote-vantage';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import type { SharePayload } from '../../../src/lib/types';

function hostedPayload(): SharePayload {
  return {
    v: 2,
    mode: 'results',
    endpoints: [{ url: 'https://edge.example.com', enabled: true }],
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
      roundCount: 1,
      totalSampleCount: 1,
      keptSampleCount: 1,
      truncated: false,
    },
    remoteVantage: {
      generatedAt: 1778352000500,
      edge: { colo: 'IAD', country: 'US', city: 'Ashburn' },
      results: [{
        endpointId: 'shared-ep-0',
        label: 'Edge',
        url: 'https://edge.example.com',
        ok: true,
        status: 200,
        statusText: 'OK',
        durationMs: 37,
        checkedAt: 1778352000500,
        verdict: 'reachable',
        headers: { 'content-type': 'text/plain' },
      }],
    },
    results: [{ samples: [{ round: 1, latency: 42, status: 'ok' }] }],
  };
}

beforeEach(() => {
  endpointStore.setEndpoints([]);
  measurementStore.reset();
  remoteVantageStore.reset();
  settingsStore.reset();
  uiStore.reset();
  history.replaceState(null, '', '/');
});

describe('initHostedReportRouter', () => {
  it('loads /r/:id reports from the Cloudflare report API', async () => {
    history.replaceState(null, '', '/r/report_123');
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      ok: true,
      payload: hostedPayload(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(initHostedReportRouter(fetcher)).resolves.toBe('results');

    expect(fetcher).toHaveBeenCalledWith('/api/reports/report_123', { method: 'GET' });
    expect(get(endpointStore).map((endpoint) => endpoint.url)).toEqual(['https://edge.example.com']);
    expect(get(uiStore).sharedReportMode).toBe(true);
    expect(get(measurementStore).roundCounter).toBe(1);
    expect(get(remoteVantageStore).lastProbe).toMatchObject({
      ok: true,
      edge: { colo: 'IAD', country: 'US', city: 'Ashburn' },
      results: [{ url: 'https://edge.example.com', durationMs: 37 }],
    });
    expect(window.location.pathname).toBe('/');
  });

  it('does nothing for normal app paths', async () => {
    history.replaceState(null, '', '/');
    const fetcher = vi.fn();

    await expect(initHostedReportRouter(fetcher)).resolves.toBeNull();

    expect(fetcher).not.toHaveBeenCalled();
  });
});
