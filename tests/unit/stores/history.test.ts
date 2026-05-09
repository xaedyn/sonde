import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createHistoryStore, type HistoryStorage } from '../../../src/lib/stores/history';
import type { HistorySessionSummary } from '../../../src/lib/history/session-summary';

function session(over: Partial<HistorySessionSummary> = {}): HistorySessionSummary {
  return {
    id: 'hist-1',
    createdAt: 1_765_000_000_000,
    startedAt: 1_765_000_000_000 - 10_000,
    stoppedAt: 1_765_000_000_000,
    durationMs: 10_000,
    lifecycle: 'completed',
    roundCount: 40,
    endpointCount: 1,
    baselineEligibleEndpointCount: 1,
    endpointKeys: ['https://api.example.com/status'],
    settings: {
      healthThreshold: 120,
      corsMode: 'no-cors',
      timeout: 5000,
    },
    verdict: {
      headline: 'No endpoint is clearly slow',
      kind: 'healthy',
      confidence: 'high',
    },
    endpoints: [{
      endpointId: 'api',
      key: 'https://api.example.com/status',
      url: 'https://api.example.com/status',
      label: 'API',
      enabled: true,
      sampleCount: 40,
      okCount: 40,
      lossPercent: 0,
      p50: 100,
      p95: 150,
      p99: 180,
      stddev: 10,
      lastLatency: 100,
      baselineEligible: true,
    }],
    ...over,
  };
}

describe('historyStore', () => {
  it('hydrates, saves, and sorts local sessions by newest first', async () => {
    const saved: HistorySessionSummary[] = [session({ id: 'old', createdAt: 1 })];
    const storage: HistoryStorage = {
      list: vi.fn(async () => saved),
      save: vi.fn(async (next) => { saved.push(next); return true; }),
      delete: vi.fn(async () => true),
      clear: vi.fn(async () => true),
      prune: vi.fn(async () => true),
    };
    const store = createHistoryStore(storage);

    await store.hydrate();
    expect(get(store).sessions.map((item) => item.id)).toEqual(['old']);

    await store.saveSession(session({ id: 'new', createdAt: 2 }));

    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
    expect(storage.prune).toHaveBeenCalled();
    expect(get(store).sessions.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('keeps the UI usable when storage fails', async () => {
    const storage: HistoryStorage = {
      list: vi.fn(async () => { throw new Error('blocked'); }),
      save: vi.fn(async () => { throw new Error('blocked'); }),
      delete: vi.fn(async () => true),
      clear: vi.fn(async () => true),
      prune: vi.fn(async () => true),
    };
    const store = createHistoryStore(storage);

    await expect(store.hydrate()).resolves.toEqual([]);
    await expect(store.saveSession(session())).resolves.toBe(false);

    expect(get(store).error).toContain('blocked');
  });
});
