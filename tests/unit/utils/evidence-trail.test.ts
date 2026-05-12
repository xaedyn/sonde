import { describe, expect, it } from 'vitest';
import { buildEvidenceTrail } from '../../../src/lib/utils/evidence-trail';
import { buildDiagnosticReport } from '../../../src/lib/utils/diagnostic-report';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';
import type {
  Endpoint,
  EndpointStatistics,
  MeasurementSample,
  MeasurementState,
  SampleBuffer,
  SharedReportContext,
} from '../../../src/lib/types';
import type { CompanionState } from '../../../src/lib/stores/companion';
import type { RemoteVantageState } from '../../../src/lib/stores/remote-vantage';

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
    sampleCount: 35,
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
    roundCounter: 35,
    endpoints,
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
  };
}

const context: SharedReportContext = {
  createdAt: 1778352000000,
  healthThreshold: 120,
  corsMode: 'no-cors',
  roundCount: 35,
  totalSampleCount: 105,
  keptSampleCount: 105,
  truncated: false,
  sourceVersion: 2,
};

const emptyRemote: RemoteVantageState = {
  status: 'idle',
  health: null,
  lastProbe: null,
  hostedReport: null,
  hostedReportFallback: null,
  error: null,
};

const emptyCompanion: CompanionState = {
  baseUrl: 'http://127.0.0.1:47317',
  hasSecret: false,
  status: 'idle',
  version: null,
  capabilities: null,
  lastProbe: null,
  history: [],
  error: null,
};

function isolatedReport() {
  const endpoints = [
    endpoint('api', 'API'),
    endpoint('google', 'Google'),
    endpoint('cloudflare', 'Cloudflare'),
  ];

  return buildDiagnosticReport({
    endpoints,
    stats: {
      api: stats({ endpointId: 'api', p50: 240, p95: 280 }),
      google: stats({ endpointId: 'google', p50: 45, p95: 60 }),
      cloudflare: stats({ endpointId: 'cloudflare', p50: 38, p95: 55 }),
    },
    measurements: measurementState({
      api: Array.from({ length: 35 }, (_, i) => ok(i + 1, 240)),
      google: Array.from({ length: 35 }, (_, i) => ok(i + 1, 45)),
      cloudflare: Array.from({ length: 35 }, (_, i) => ok(i + 1, 38)),
    }),
    settings: DEFAULT_SETTINGS,
    context,
  });
}

describe('buildEvidenceTrail', () => {
  it('builds a compact proof receipt without speculative language', () => {
    const trail = buildEvidenceTrail({
      report: isolatedReport(),
      remoteVantage: emptyRemote,
      companion: emptyCompanion,
    });

    expect(trail).toHaveLength(5);
    expect(trail.map((item) => item.id)).toEqual([
      'browser-run',
      'current-answer',
      'browser-visibility',
      'outside-check',
      'local-agent',
    ]);
    expect(trail.find((item) => item.id === 'browser-run')).toMatchObject({
      source: 'Browser test',
      status: 'Measured',
      tone: 'good',
    });
    expect(trail.find((item) => item.id === 'outside-check')).toMatchObject({
      source: 'Outside check',
      status: 'Not run',
      tone: 'neutral',
    });

    for (const item of trail) {
      expect(item.source.length).toBeLessThanOrEqual(20);
      expect(item.status.length).toBeLessThanOrEqual(18);
      expect(item.fact.length).toBeLessThanOrEqual(96);
      expect(item.fact).not.toMatch(/likely|probably|wild goose chase|router|ISP/i);
    }
  });

  it('summarizes captured outside and local-agent evidence inline', () => {
    const trail = buildEvidenceTrail({
      report: isolatedReport(),
      remoteVantage: {
        ...emptyRemote,
        status: 'connected',
        lastProbe: {
          ok: true,
          generatedAt: 1778352000000,
          edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
          results: [
            {
              endpointId: 'api',
              label: 'API',
              url: 'https://api.example.test',
              ok: true,
              status: 200,
              statusText: 'OK',
              durationMs: 310,
              checkedAt: 1778352000000,
              verdict: 'slow',
              headers: {},
            },
            {
              endpointId: 'google',
              label: 'Google',
              url: 'https://google.example.test',
              ok: true,
              status: 200,
              statusText: 'OK',
              durationMs: 45,
              checkedAt: 1778352000000,
              verdict: 'reachable',
              headers: {},
            },
          ],
        },
      },
      companion: {
        ...emptyCompanion,
        status: 'connected',
        lastProbe: {
          ok: true,
          id: 'probe-1',
          targetHost: 'api.example.test',
          createdAt: 1778352000000,
          summary: 'DNS, TLS, route, and WiFi completed',
          results: {},
        },
      },
    });

    expect(trail.find((item) => item.id === 'outside-check')).toMatchObject({
      status: 'Captured',
      tone: 'bad',
      fact: '1 of 2 endpoints was slow or failed from IAD / Ashburn / US',
    });
    expect(trail.find((item) => item.id === 'local-agent')).toMatchObject({
      status: 'Captured',
      tone: 'good',
      fact: 'api.example.test: DNS, TLS, route, and WiFi completed',
    });
  });
});
