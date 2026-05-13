import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import { createBufferbloatStore } from '../../../src/lib/stores/bufferbloat';
import type { Endpoint, MeasurementSample, Settings } from '../../../src/lib/types';

const endpoint: Endpoint = {
  id: 'api',
  label: 'API',
  url: 'https://api.example.test',
  enabled: true,
  color: '#67e8f9',
};

const settings: Pick<Settings, 'corsMode' | 'timeout'> = {
  corsMode: 'no-cors',
  timeout: 5000,
};

function ok(round: number, latency: number): MeasurementSample {
  return {
    round,
    latency,
    status: 'ok',
    timestamp: round,
  };
}

describe('bufferbloatStore', () => {
  it('downloads saturation bytes and grades loaded latency against idle samples', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]))));
    const measureLatency = vi.fn()
      .mockResolvedValueOnce(120)
      .mockResolvedValueOnce(140)
      .mockResolvedValueOnce(160);
    const store = createBufferbloatStore({
      fetcher,
      measureLatency,
      saturationBytes: 1024,
      loadedSampleTarget: 3,
    });

    await store.run({
      endpoint,
      idleSamples: [ok(1, 20), ok(2, 30), ok(3, 40)],
      settings,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/vantage/saturation?bytes=1024', expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
    }));
    expect(measureLatency).toHaveBeenCalledTimes(3);
    expect(measureLatency).toHaveBeenCalledWith(endpoint.url, expect.objectContaining({
      corsMode: 'no-cors',
      timeout: 5000,
    }));
    expect(get(store)).toMatchObject({
      status: 'complete',
      idleMedianMs: 30,
      loadedMedianMs: 140,
      grade: {
        grade: 'loaded-latency-high',
        deltaMs: 110,
      },
      error: null,
    });
  });

  it('aborts an in-flight saturation download without leaving an error state', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const store = createBufferbloatStore({
      fetcher,
      measureLatency: vi.fn(() => Promise.resolve(50)),
      loadedSampleTarget: 1,
    });

    const run = store.run({
      endpoint,
      idleSamples: [ok(1, 30), ok(2, 40), ok(3, 50)],
      settings,
    });

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    store.stop();
    await run;

    expect(capturedSignal?.aborted).toBe(true);
    expect(get(store)).toMatchObject({
      status: 'stopped',
      error: null,
    });
  });
});
