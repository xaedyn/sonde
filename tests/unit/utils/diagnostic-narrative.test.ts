import { describe, it, expect } from 'vitest';
import {
  buildDiagnosticNarrative,
  describeTimingVisibility,
} from '../../../src/lib/utils/diagnostic-narrative';
import type { Endpoint, EndpointStatistics, MeasurementSample, TimingPayload } from '../../../src/lib/types';
import type { VerdictRow } from '../../../src/lib/utils/verdict';

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

function row(id: string, statOver: Partial<EndpointStatistics> = {}, label = id): VerdictRow {
  const ep = endpoint(id, label);
  return { ep, stats: stats({ endpointId: ep.id, ...statOver }) };
}

const tier2: TimingPayload = {
  total: 80,
  dnsLookup: 3,
  tcpConnect: 5,
  tlsHandshake: 8,
  ttfb: 40,
  contentTransfer: 24,
};

function ok(round: number, latency = 50, sampleOver: Partial<MeasurementSample> = {}): MeasurementSample {
  return {
    round,
    latency,
    status: 'ok',
    timestamp: 0,
    ...sampleOver,
  };
}

function samples(count: number, latency = 50, withTier2 = false): MeasurementSample[] {
  return Array.from({ length: count }, (_, i) => ok(i + 1, latency, withTier2 ? { tier2 } : {}));
}

describe('describeTimingVisibility', () => {
  it('reports total-only timing when no successful sample exposes Resource Timing phases', () => {
    const visibility = describeTimingVisibility(samples(3), 'no-cors');
    expect(visibility.level).toBe('total-only');
    expect(visibility.headline).toBe('Some timing details are hidden by the browser');
    expect(visibility.detail).toContain('browser usually hides DNS');
    expect(visibility.action).toContain('Timing-Allow-Origin');
  });

  it('reports phase timing when every successful sample has meaningful tier2 fields', () => {
    const visibility = describeTimingVisibility(samples(3, 50, true), 'cors');
    expect(visibility.level).toBe('phase');
    expect(visibility.phaseSampleCount).toBe(3);
    expect(visibility.action).toBeUndefined();
  });

  it('reports mixed visibility when only some samples expose phase timing', () => {
    const visibility = describeTimingVisibility([
      ok(1, 50, { tier2 }),
      ok(2, 52),
      ok(3, 54, { tier2 }),
    ], 'cors');
    expect(visibility.level).toBe('mixed');
    expect(visibility.headline).toBe('Some timing details are hidden by the browser');
    expect(visibility.detail).toContain('2 of 3');
  });
});

describe('buildDiagnosticNarrative', () => {
  it('stays low-confidence while collecting', () => {
    const narrative = buildDiagnosticNarrative({
      rows: [],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {},
      monitoredEndpointCount: 3,
    });

    expect(narrative.kind).toBe('collecting');
    expect(narrative.confidence).toBe('low');
    expect(narrative.verdict.headline).toBe('Measuring…');
    expect(narrative.primaryAnswer.text).toBe('Collecting enough data to call this test.');
    expect(narrative.primaryAnswer.kind).toBe('measured');
    expect(narrative.primaryValidation.id).toBe('collect-more-samples');
    expect(narrative.nextSteps[0]).toContain('12 successful checks');
  });

  it('marks healthy multi-endpoint evidence as high confidence when samples are mature', () => {
    const rows = [row('google'), row('cloudflare'), row('aws')];
    const narrative = buildDiagnosticNarrative({
      rows,
      threshold: 120,
      corsMode: 'cors',
      samplesByEndpoint: {
        google: samples(35, 40, true),
        cloudflare: samples(35, 50, true),
        aws: samples(35, 60, true),
      },
      monitoredEndpointCount: 3,
    });

    expect(narrative.kind).toBe('healthy');
    expect(narrative.severity).toBe('healthy');
    expect(narrative.confidence).toBe('high');
    expect(narrative.explanation).toBe('This test looks healthy.');
    expect(narrative.confidenceReason).toBe('Based on 35+ successful checks across 3 sites.');
    expect(narrative.snapshotEligibility.eligible).toBe(true);
    expect(narrative.primaryValidation.id).toBe('share-snapshot');
    expect(narrative.safeSummary).toContain('This browser test: This test looks healthy.');
  });

  it('explains isolated endpoint slowness with evidence-labeled endpoint and next validation step', () => {
    const rows = [
      row('api', { p50: 240, sampleCount: 18 }, 'API'),
      row('google', { p50: 45, sampleCount: 18 }, 'Google'),
      row('cloudflare', { p50: 35, sampleCount: 18 }, 'Cloudflare'),
    ];
    const narrative = buildDiagnosticNarrative({
      rows,
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        api: samples(18, 240),
        google: samples(18, 45),
        cloudflare: samples(18, 35),
      },
      monitoredEndpointCount: 3,
    });

    expect(narrative.kind).toBe('isolated-endpoint');
    expect(narrative.confidence).toBe('medium');
    expect(narrative.explanation).toBe('API is slower than the others in this test.');
    expect(narrative.primaryAnswer.text).toBe('API is slower than the others in this test.');
    expect(narrative.primaryAnswer.kind).toBe('inferred');
    expect(narrative.primaryValidation.id).toBe('explain-browser-visibility');
    expect(narrative.evidence.some((item) => item.label === 'Site to inspect' && item.value === 'API')).toBe(true);
    expect(narrative.safeSummary).not.toMatch(/likely (source|site|network|your network)/i);
    expect(narrative.nextSteps.join(' ')).toContain('Open Investigate');
  });

  it('adds CORS and Timing-Allow-Origin guidance when timing is total-only', () => {
    const narrative = buildDiagnosticNarrative({
      rows: [row('google'), row('cloudflare')],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        google: samples(12, 40),
        cloudflare: samples(12, 50),
      },
      monitoredEndpointCount: 2,
    });

    expect(narrative.timingVisibility.level).toBe('total-only');
    expect(narrative.limitations[0]?.headline).toBe('Some timing details are hidden by the browser');
    expect(narrative.limitations[0]?.detail).toContain('browser usually hides DNS');
    expect(narrative.limitations[0]?.action).toContain('Timing-Allow-Origin');
    expect(narrative.primaryValidation.id).toBe('explain-browser-visibility');
    expect(narrative.primaryValidation.reason).toBe('Chronoscope can compare total load time, but not every DNS, TCP, TLS, or server timing detail is visible.');
    expect(narrative.confidenceReason).toBe('Based on 12+ successful checks across 2 sites.');
  });

  it('estimates successful samples from loss when raw samples are unavailable', () => {
    const narrative = buildDiagnosticNarrative({
      rows: [
        row('google', { sampleCount: 30, lossPercent: 80 }),
        row('cloudflare', { sampleCount: 30, lossPercent: 80 }),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {},
      monitoredEndpointCount: 2,
    });

    expect(narrative.confidence).toBe('low');
    expect(narrative.primaryValidation.id).toBe('collect-more-samples');
    expect(narrative.primaryValidation.reason).toContain('6 successful checks');
    expect(narrative.snapshotEligibility.eligible).toBe(false);
  });

  it('names browser sandbox limits for shared-network calls', () => {
    const dominantDns = {
      dnsLookup: 120,
      tcpConnect: 5,
      tlsHandshake: 5,
      ttfb: 10,
      contentTransfer: 10,
    };
    const rows = [
      row('google', { p50: 220, tier2Averages: dominantDns }),
      row('cloudflare', { p50: 210, tier2Averages: dominantDns }),
      row('aws', { p50: 40, tier2Averages: tier2 }),
    ];
    const narrative = buildDiagnosticNarrative({
      rows,
      threshold: 120,
      corsMode: 'cors',
      samplesByEndpoint: {
        google: samples(35, 220, true),
        cloudflare: samples(35, 210, true),
        aws: samples(35, 40, true),
      },
      monitoredEndpointCount: 3,
    });

    expect(narrative.kind).toBe('shared-network');
    expect(narrative.limitations.some((limit) => limit.id === 'browser-sandbox')).toBe(true);
    expect(narrative.limitations.find((limit) => limit.id === 'browser-sandbox')?.detail).toContain('traceroute');
    expect(narrative.primaryAnswer.text).toBe('Several sites are slow in the same test window.');
    expect(narrative.primaryAnswer.text).not.toMatch(/\b(?:likely|ISP|VPN|Wi[- ]?Fi)\b/i);
    expect(narrative.primaryValidation.reason).toContain('browser');
    expect(narrative.nextSteps.join(' ')).toContain('Timing-Allow-Origin');
  });

  it('uses plain verdicts for failed requests, jitter, and unresolved slow sites', () => {
    const packetLoss = buildDiagnosticNarrative({
      rows: [
        row('google', { lossPercent: 2, sampleCount: 18 }),
        row('cloudflare', { lossPercent: 2, sampleCount: 18 }),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        google: samples(18, 50),
        cloudflare: samples(18, 55),
      },
      monitoredEndpointCount: 2,
    });
    expect(packetLoss.kind).toBe('packet-loss');
    expect(packetLoss.primaryAnswer.text).toBe('Some requests are failing.');

    const jitter = buildDiagnosticNarrative({
      rows: [
        row('google', { stddev: 35, sampleCount: 18 }),
        row('cloudflare', { stddev: 30, sampleCount: 18 }),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        google: samples(18, 50),
        cloudflare: samples(18, 55),
      },
      monitoredEndpointCount: 2,
    });
    expect(jitter.kind).toBe('jitter');
    expect(jitter.primaryAnswer.text).toBe('Latency is jumping around.');

    const multipleSlow = buildDiagnosticNarrative({
      rows: [
        row('google', { p50: 180, sampleCount: 18 }),
        row('cloudflare', { p50: 170, sampleCount: 18 }),
        row('aws', { p50: 50, sampleCount: 18 }),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        google: samples(18, 180),
        cloudflare: samples(18, 170),
        aws: samples(18, 50),
      },
      monitoredEndpointCount: 3,
    });
    expect(multipleSlow.kind).toBe('multiple-slow');
    expect(multipleSlow.primaryAnswer.text).toBe('Several sites are slower than your threshold.');
    expect(
      [
        packetLoss.primaryAnswer.text,
        jitter.primaryAnswer.text,
        multipleSlow.primaryAnswer.text,
      ].join(' '),
    ).not.toMatch(/elevated|browser-visible|root-cause|likely/i);
  });
});
