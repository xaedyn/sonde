import { describe, expect, it } from 'vitest';
import { buildHistorySessionSummary, normalizeHistoryEndpointKey } from '../../../src/lib/history/session-summary';
import type { Endpoint, EndpointStatistics, MeasurementState, Settings } from '../../../src/lib/types';

const settings: Settings = {
  timeout: 5000,
  delay: 0,
  burstRounds: 50,
  monitorDelay: 1000,
  cap: 3600,
  corsMode: 'no-cors',
  healthThreshold: 120,
};

function endpoint(over: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'api',
    url: 'https://API.Example.com/status/',
    enabled: true,
    label: 'API',
    color: '#67e8f9',
    ...over,
  };
}

function stats(over: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: 'api',
    sampleCount: 36,
    p50: 84,
    p95: 130,
    p99: 160,
    p25: 78,
    p75: 96,
    p90: 112,
    min: 70,
    max: 170,
    stddev: 12,
    ci95: { lower: 80, upper: 88, margin: 4 },
    connectionReuseDelta: null,
    lossPercent: 0,
    ready: true,
    ...over,
  };
}

function measurementState(over: Partial<MeasurementState> = {}): MeasurementState {
  const timestamp = 1_765_000_000_000;
  return {
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: 36,
    startedAt: timestamp - 12_000,
    stoppedAt: timestamp,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
    endpoints: {
      api: {
        endpointId: 'api',
        lastLatency: 90,
        lastStatus: 'ok',
        lastErrorMessage: null,
        tierLevel: 1,
        samples: {
          length: 36,
          tailIndex: 36,
          at: () => undefined,
          filter: () => [],
          map: () => [],
          find: () => undefined,
          reduce: (_callback, initial) => initial,
          slice: () => [],
          forEach: () => undefined,
          toArray: () => Array.from({ length: 36 }, (_, i) => ({
            round: i + 1,
            latency: 80 + (i % 4),
            status: 'ok' as const,
            timestamp: timestamp - 12_000 + i,
          })),
          [Symbol.iterator]: function* () {
            yield* this.toArray();
          },
        },
      },
    },
    ...over,
  };
}

describe('history session summaries', () => {
  it('normalizes endpoint URLs into stable local-history keys', () => {
    expect(normalizeHistoryEndpointKey(' HTTPS://API.Example.COM/status/?cache=1#frag '))
      .toBe('https://api.example.com/status');
    expect(normalizeHistoryEndpointKey('not a url')).toBe('not a url');
  });

  it('captures a compact, baseline-eligible session summary', () => {
    const summary = buildHistorySessionSummary({
      id: 'hist-fixed',
      now: 1_765_000_000_000,
      endpoints: [endpoint()],
      measurements: measurementState(),
      stats: { api: stats() },
      settings,
    });

    expect(summary?.id).toBe('hist-fixed');
    expect(summary?.roundCount).toBe(36);
    expect(summary?.baselineEligibleEndpointCount).toBe(1);
    expect(summary?.endpointKeys).toEqual(['https://api.example.com/status']);
    expect(summary?.endpoints[0]).toMatchObject({
      key: 'https://api.example.com/status',
      label: 'API',
      sampleCount: 36,
      okCount: 36,
      p50: 84,
      p95: 130,
      lastLatency: 90,
      baselineEligible: true,
    });
  });

  it('returns null when a session has no retained samples', () => {
    const summary = buildHistorySessionSummary({
      endpoints: [endpoint()],
      measurements: measurementState({
        roundCounter: 0,
        endpoints: {},
      }),
      stats: {},
      settings,
    });

    expect(summary).toBeNull();
  });
});
