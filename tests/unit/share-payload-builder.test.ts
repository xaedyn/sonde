import { describe, it, expect } from 'vitest';
import {
  buildConfigSharePayload,
  buildResultsSharePayload,
} from '../../src/lib/share/share-payload-builder';
import type { Endpoint, MeasurementSample, MeasurementState, SampleBuffer } from '../../src/lib/types';
import { DEFAULT_SETTINGS } from '../../src/lib/types';

function endpoint(id: string): Endpoint {
  return {
    id,
    url: `https://${id}.example.test`,
    label: id,
    enabled: true,
    color: '#67e8f9',
  };
}

function ok(round: number): MeasurementSample {
  return {
    round,
    latency: 50 + round,
    status: 'ok',
    timestamp: 0,
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

function measurementState(endpointId: string, samples: readonly MeasurementSample[]): MeasurementState {
  return {
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: samples.length,
    endpoints: {
      [endpointId]: {
        endpointId,
        samples: buffer(samples),
        lastLatency: samples.at(-1)?.latency ?? null,
        lastStatus: samples.at(-1)?.status ?? null,
        lastErrorMessage: null,
        tierLevel: 1,
      },
    },
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
  };
}

describe('share-payload-builder', () => {
  it('builds v1 config payloads', () => {
    const payload = buildConfigSharePayload([endpoint('api')], DEFAULT_SETTINGS);
    expect(payload.v).toBe(1);
    expect(payload.mode).toBe('config');
    expect(payload.report).toBeUndefined();
  });

  it('builds v2 result payloads with report metadata', () => {
    const ep = endpoint('api');
    const built = buildResultsSharePayload(
      [ep],
      DEFAULT_SETTINGS,
      measurementState(ep.id, Array.from({ length: 12 }, (_, i) => ok(i + 1))),
      8000,
      1778352000000,
    );

    expect(built.payload.v).toBe(2);
    expect(built.payload.report?.createdAt).toBe(1778352000000);
    expect(built.payload.report?.healthThreshold).toBe(DEFAULT_SETTINGS.healthThreshold);
    expect(built.payload.report?.keptSampleCount).toBe(12);
    expect(built.truncated).toBe(false);
  });

  it('preserves report metadata overrides when re-copying a report link', () => {
    const ep = endpoint('api');
    const built = buildResultsSharePayload(
      [ep],
      { ...DEFAULT_SETTINGS, healthThreshold: 999 },
      measurementState(ep.id, Array.from({ length: 4 }, (_, i) => ok(i + 1))),
      8000,
      1778352000000,
      {
        createdAt: 1778000000000,
        healthThreshold: 140,
        totalSampleCount: 40,
        truncated: true,
      },
    );

    expect(built.payload.report?.createdAt).toBe(1778000000000);
    expect(built.payload.report?.healthThreshold).toBe(140);
    expect(built.payload.report?.totalSampleCount).toBe(40);
    expect(built.payload.report?.keptSampleCount).toBe(4);
    expect(built.payload.report?.truncated).toBe(true);
  });

  it('keeps keptSampleCount within totalSampleCount when a caller passes a stale total override', () => {
    const ep = endpoint('api');
    const built = buildResultsSharePayload(
      [ep],
      DEFAULT_SETTINGS,
      measurementState(ep.id, Array.from({ length: 12 }, (_, i) => ok(i + 1))),
      8000,
      1778352000000,
      {
        totalSampleCount: 5,
      },
    );

    expect(built.payload.report?.keptSampleCount).toBe(12);
    expect(built.payload.report?.totalSampleCount).toBe(12);
  });
});
