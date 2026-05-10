import { describe, expect, it } from 'vitest';
import {
  autoStartDecision,
  selectInvestigationEndpointId,
} from '../../../src/lib/utils/status-intent';
import type {
  Endpoint,
  EndpointStatistics,
  MeasurementSample,
  MeasurementState,
  SampleBuffer,
  StatisticsState,
} from '../../../src/lib/types';

const ep = (id: string, url = `https://${id}.example.com`): Endpoint => ({
  id,
  url,
  enabled: true,
  label: id,
  color: '#fff',
});

const stat = (endpointId: string, p95: number, ready = true): EndpointStatistics => ({
  endpointId,
  sampleCount: ready ? 30 : 0,
  p50: p95 / 2,
  p95,
  p99: p95,
  p25: p95 / 3,
  p75: p95 * 0.75,
  p90: p95 * 0.9,
  min: 1,
  max: p95,
  stddev: 2,
  ci95: { lower: 1, upper: p95, margin: 1 },
  connectionReuseDelta: null,
  lossPercent: 0,
  ready,
});

function sample(round: number): MeasurementSample {
  return {
    round,
    latency: 50 + round,
    status: 'ok',
    timestamp: round,
  };
}

function buffer(samples: readonly MeasurementSample[]): SampleBuffer {
  return {
    length: samples.length,
    tailIndex: samples.length,
    at: (index: number) => samples[index],
    filter: samples.filter.bind(samples),
    map: samples.map.bind(samples),
    find: samples.find.bind(samples),
    reduce: samples.reduce.bind(samples) as SampleBuffer['reduce'],
    slice: samples.slice.bind(samples),
    forEach: samples.forEach.bind(samples),
    toArray: () => [...samples],
    [Symbol.iterator]: samples[Symbol.iterator].bind(samples),
  } as SampleBuffer;
}

function measurementState(samplesByEndpoint: Record<string, readonly MeasurementSample[]>): MeasurementState {
  const endpoints: MeasurementState['endpoints'] = {};
  for (const [endpointId, samples] of Object.entries(samplesByEndpoint)) {
    const last = samples.at(-1);
    endpoints[endpointId] = {
      endpointId,
      samples: buffer(samples),
      lastLatency: last?.latency ?? null,
      lastStatus: last?.status ?? null,
      lastErrorMessage: null,
      tierLevel: 1,
    };
  }
  return {
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: 30,
    endpoints,
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
  };
}

describe('autoStartDecision', () => {
  it('auto-starts normal public endpoint sessions', () => {
    expect(
      autoStartDecision({
        endpoints: [ep('api')],
        isSharedView: false,
        sharedReportMode: false,
        hasPendingShare: false,
      }),
    ).toEqual({ shouldStart: true, reason: null });
  });

  it('suppresses shared report mode', () => {
    expect(
      autoStartDecision({
        endpoints: [ep('api')],
        isSharedView: true,
        sharedReportMode: true,
        hasPendingShare: false,
      }),
    ).toEqual({ shouldStart: false, reason: 'shared-report' });
  });

  it('suppresses staged config share pending', () => {
    expect(
      autoStartDecision({
        endpoints: [ep('api')],
        isSharedView: false,
        sharedReportMode: false,
        hasPendingShare: true,
      }),
    ).toEqual({ shouldStart: false, reason: 'pending-share' });
  });

  it('suppresses when no endpoints are enabled', () => {
    expect(
      autoStartDecision({
        endpoints: [{ ...ep('api'), enabled: false }],
        isSharedView: false,
        sharedReportMode: false,
        hasPendingShare: false,
      }),
    ).toEqual({ shouldStart: false, reason: 'no-enabled-endpoints' });
  });

  it('suppresses local, private, and link-local endpoint URLs', () => {
    for (const url of ['http://192.168.1.1', 'http://localhost', 'http://169.254.169.254']) {
      expect(
        autoStartDecision({
          endpoints: [ep('api', url)],
          isSharedView: false,
          sharedReportMode: false,
          hasPendingShare: false,
        }),
      ).toEqual({ shouldStart: false, reason: 'local-endpoint' });
    }
  });

  it('ignores disabled unsafe endpoints when an enabled public endpoint exists', () => {
    expect(
      autoStartDecision({
        endpoints: [{ ...ep('router', 'http://192.168.1.1'), enabled: false }, ep('api')],
        isSharedView: false,
        sharedReportMode: false,
        hasPendingShare: false,
      }),
    ).toEqual({ shouldStart: true, reason: null });
  });
});

describe('selectInvestigationEndpointId', () => {
  const monitored = [ep('api'), ep('cdn'), ep('search')];
  const emptyMeasurements = measurementState({});

  function select(overrides: {
    stats?: StatisticsState;
    measurements?: MeasurementState;
    currentFocusedId?: string | null;
    worstEpId?: string | null;
    recentEventEndpointIds?: readonly string[];
    monitored?: readonly Endpoint[];
  }) {
    return selectInvestigationEndpointId({
      monitored: overrides.monitored ?? monitored,
      stats: overrides.stats ?? {},
      measurements: overrides.measurements ?? emptyMeasurements,
      currentFocusedId: overrides.currentFocusedId ?? null,
      worstEpId: overrides.worstEpId,
      recentEventEndpointIds: overrides.recentEventEndpointIds,
    });
  }

  it('preserves an existing valid focus over automatic choices', () => {
    expect(
      select({
        currentFocusedId: 'cdn',
        worstEpId: 'api',
        stats: { api: stat('api', 900), cdn: stat('cdn', 100), search: stat('search', 800) },
      }),
    ).toBe('cdn');
  });

  it('prefers explicit worstEpId when no valid focus exists', () => {
    expect(
      select({
        currentFocusedId: 'stale',
        worstEpId: 'search',
        stats: { api: stat('api', 900), cdn: stat('cdn', 100), search: stat('search', 800) },
      }),
    ).toBe('search');
  });

  it('falls back to the highest ready p95', () => {
    expect(
      select({
        stats: { api: stat('api', 110), cdn: stat('cdn', 300), search: stat('search', 250) },
        recentEventEndpointIds: ['search'],
        measurements: measurementState({
          api: [sample(1)],
        }),
      }),
    ).toBe('cdn');
  });

  it('falls back to the newest valid threshold event endpoint when there is no ready p95', () => {
    expect(
      select({
        stats: { api: stat('api', 110, false), cdn: stat('cdn', 300, false) },
        recentEventEndpointIds: ['stale', 'search', 'api'],
        measurements: measurementState({
          cdn: [sample(1)],
        }),
      }),
    ).toBe('search');
  });

  it('falls back to the first monitored endpoint with samples', () => {
    expect(
      select({
        measurements: measurementState({
          cdn: [sample(1)],
          search: [sample(1), sample(2)],
        }),
      }),
    ).toBe('cdn');
  });

  it('falls back to the first monitored endpoint', () => {
    expect(select({})).toBe('api');
  });

  it('returns null when there are no monitored endpoints', () => {
    expect(select({ monitored: [] })).toBeNull();
  });
});
