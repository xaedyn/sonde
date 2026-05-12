import { describe, it, expect } from 'vitest';
import {
  buildDiagnosticReport,
  formatReportMetric,
} from '../../../src/lib/utils/diagnostic-report';
import type {
  Endpoint,
  EndpointStatistics,
  MeasurementSample,
  MeasurementState,
  SampleBuffer,
  SharedReportContext,
} from '../../../src/lib/types';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';

function endpoint(id: string, label = id): Endpoint {
  return {
    id,
    label,
    url: `https://${id}.example.test`,
    enabled: true,
    color: '#67e8f9',
  };
}

function stats(over: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: over.endpointId ?? 'ep',
    sampleCount: 30,
    p50: 50,
    p95: 70,
    p99: 90,
    p25: 40,
    p75: 60,
    p90: 65,
    min: 35,
    max: 95,
    stddev: 5,
    ci95: { lower: 45, upper: 55, margin: 5 },
    connectionReuseDelta: null,
    lossPercent: 0,
    ready: true,
    ...over,
  };
}

function ok(round: number, latency = 50): MeasurementSample {
  return {
    round,
    latency,
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

const context: SharedReportContext = {
  reportKind: 'support',
  createdAt: 1778352000000,
  healthThreshold: 120,
  corsMode: 'no-cors',
  roundCount: 30,
  totalSampleCount: 90,
  keptSampleCount: 90,
  truncated: false,
  sourceVersion: 2,
};

describe('buildDiagnosticReport', () => {
  it('uses shared report metadata for threshold and timing mode without relying on local settings', () => {
    const endpoints = [
      endpoint('api', 'API'),
      endpoint('google', 'Google'),
      endpoint('cloudflare', 'Cloudflare'),
    ];
    const report = buildDiagnosticReport({
      endpoints,
      stats: {
        api: stats({ endpointId: 'api', p50: 240, p95: 280 }),
        google: stats({ endpointId: 'google', p50: 45, p95: 60 }),
        cloudflare: stats({ endpointId: 'cloudflare', p50: 38, p95: 55 }),
      },
      measurements: measurementState({
        api: Array.from({ length: 30 }, (_, i) => ok(i + 1, 240)),
        google: Array.from({ length: 30 }, (_, i) => ok(i + 1, 45)),
        cloudflare: Array.from({ length: 30 }, (_, i) => ok(i + 1, 38)),
      }),
      settings: { ...DEFAULT_SETTINGS, healthThreshold: 999, corsMode: 'cors' },
      context,
    });

    expect(report.threshold).toBe(120);
    expect(report.thresholdSource).toBe('shared');
    expect(report.corsMode).toBe('no-cors');
    expect(report.diagnosis.kind).toBe('isolated-endpoint');
    expect(report.endpointRows.find((row) => row.endpointId === 'api')?.implicated).toBe(true);
    expect(report.endpointRows.find((row) => row.endpointId === 'api')?.statusLabel).toBe('inspect');
    expect(report.copySummary).toContain('API');
    expect(report.copySummary).toContain('threshold 120 ms');
    expect(report.copySummary).not.toMatch(/likely (affected|source|site|network|your network)/i);
    expect(report.copySummary).not.toContain(report.diagnosis.verdict.headline);
    expect(report.copySummary).toContain(report.diagnosis.primaryAnswer.text);
    expect(report.copySummary).toContain('Trust: Evidence: 30+ successful checks across 3 sites; total timing only.');
    expect(report.copySummary).toContain('First next test: Review what the browser can and cannot see.');
    expect(report.copySummary).toContain('Watch for: If detailed timing appears');
    expect(report.copySummary.match(new RegExp(report.diagnosis.primaryAnswer.text, 'g'))).toHaveLength(1);
    expect(report.copySummary).not.toMatch(/This browser test: .*This browser test:/s);
    expect(report.copySummary).not.toMatch(/will fix|restart your router|the problem is your|your ISP is/i);
  });

  it('falls back to local defaults for legacy contexts without threshold metadata', () => {
    const ep = endpoint('google', 'Google');
    const report = buildDiagnosticReport({
      endpoints: [ep],
      stats: { google: stats({ endpointId: 'google', p50: 80 }) },
      measurements: measurementState({
        google: Array.from({ length: 30 }, (_, i) => ok(i + 1, 80)),
      }),
      settings: { ...DEFAULT_SETTINGS, healthThreshold: 90 },
      context: { ...context, sourceVersion: 1, healthThreshold: null, corsMode: 'cors' },
    });

    expect(report.threshold).toBe(90);
    expect(report.thresholdSource).toBe('local-default');
    expect(report.corsModeSource).toBe('payload-settings');
  });

  it('marks truncated reports and carries sample counts through the model', () => {
    const ep = endpoint('api', 'API');
    const report = buildDiagnosticReport({
      endpoints: [ep],
      stats: { api: stats({ endpointId: 'api' }) },
      measurements: measurementState({
        api: Array.from({ length: 10 }, (_, i) => ok(i + 1, 50)),
      }),
      settings: DEFAULT_SETTINGS,
      context: {
        ...context,
        totalSampleCount: 300,
        keptSampleCount: 10,
        truncated: true,
      },
    });

    expect(report.truncated).toBe(true);
    expect(report.totalSampleCount).toBe(300);
    expect(report.keptSampleCount).toBe(10);
  });
});

describe('formatReportMetric', () => {
  it('formats missing values as dash', () => {
    expect(formatReportMetric(null)).toBe('-');
  });

  it('formats percentages with one decimal place', () => {
    expect(formatReportMetric(1.234, '%')).toBe('1.2%');
  });
});
