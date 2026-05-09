import { describe, expect, it } from 'vitest';
import { buildHistoryBaselineInsight } from '../../../src/lib/utils/history-baseline';
import type { Endpoint, EndpointStatistics } from '../../../src/lib/types';
import type { HistorySessionSummary } from '../../../src/lib/history/session-summary';

function endpoint(over: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'api',
    url: 'https://api.example.com/status',
    enabled: true,
    label: 'API',
    color: '#67e8f9',
    ...over,
  };
}

function stats(over: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: 'api',
    sampleCount: 40,
    p50: 100,
    p95: 150,
    p99: 180,
    p25: 90,
    p75: 120,
    p90: 140,
    min: 80,
    max: 200,
    stddev: 10,
    ci95: { lower: 95, upper: 105, margin: 5 },
    connectionReuseDelta: null,
    lossPercent: 0,
    ready: true,
    ...over,
  };
}

function session(id: string, p50: number, over: Partial<HistorySessionSummary['endpoints'][number]> = {}): HistorySessionSummary {
  const createdAt = 1_765_000_000_000 + Number(id.replace(/\D/g, '') || 0);
  const endpointKey = 'https://api.example.com/status';
  const endpointSummary = {
    endpointId: 'api',
    key: endpointKey,
    url: 'https://api.example.com/status',
    label: 'API',
    enabled: true,
    sampleCount: 40,
    okCount: 40,
    lossPercent: 0,
    p50,
    p95: p50 * 1.5,
    p99: p50 * 1.8,
    stddev: 10,
    lastLatency: p50,
    baselineEligible: true,
    ...over,
  };

  return {
    id,
    createdAt,
    startedAt: createdAt - 10_000,
    stoppedAt: createdAt,
    durationMs: 10_000,
    lifecycle: 'completed',
    roundCount: 40,
    endpointCount: 1,
    baselineEligibleEndpointCount: endpointSummary.baselineEligible ? 1 : 0,
    endpointKeys: [endpointKey],
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
    endpoints: [endpointSummary],
  };
}

describe('history baseline insight', () => {
  it('explains when no local baseline exists yet', () => {
    const insight = buildHistoryBaselineInsight({
      endpoints: [endpoint()],
      stats: { api: stats() },
      history: [],
    });

    expect(insight.status).toBe('no-history');
    expect(insight.headline).toContain('No local baseline');
  });

  it('marks the current run normal when it matches prior local sessions', () => {
    const insight = buildHistoryBaselineInsight({
      endpoints: [endpoint()],
      stats: { api: stats({ p50: 103, p95: 154 }) },
      history: [session('hist-1', 98), session('hist-2', 100), session('hist-3', 102)],
    });

    expect(insight.status).toBe('normal');
    expect(insight.headline).toContain('matches your local baseline');
    expect(insight.comparisons[0]?.baselineP50).toBe(100);
  });

  it('flags a severe baseline regression in plain language', () => {
    const insight = buildHistoryBaselineInsight({
      endpoints: [endpoint()],
      stats: { api: stats({ p50: 310, p95: 480 }) },
      history: [session('hist-1', 98), session('hist-2', 100), session('hist-3', 102)],
    });

    expect(insight.status).toBe('severe');
    expect(insight.headline).toContain('API');
    expect(insight.detail).toContain('3.1x');
    expect(insight.comparisons[0]?.status).toBe('severe');
  });

  it('ignores weak sessions and the current session when building baselines', () => {
    const currentStartedAt = 1_765_000_010_000;
    const insight = buildHistoryBaselineInsight({
      endpoints: [endpoint()],
      stats: { api: stats({ p50: 125, p95: 180 }) },
      currentStartedAt,
      history: [
        session('hist-1', 100),
        session('hist-2', 102),
        session('hist-3', 104, { baselineEligible: false, sampleCount: 6 }),
        { ...session('hist-current', 900), startedAt: currentStartedAt },
        session('hist-4', 101),
      ],
    });

    expect(insight.status).toBe('normal');
    expect(insight.comparisons[0]?.priorSessionCount).toBe(3);
    expect(insight.comparisons[0]?.baselineP50).toBe(101);
  });
});
