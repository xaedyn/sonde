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

function timeout(round: number): MeasurementSample {
  return {
    round,
    latency: 5000,
    status: 'timeout',
    timestamp: 0,
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
    expect(narrative.triageActions[0]).toMatchObject({
      id: 'collect-more-samples',
      label: 'Keep collecting',
      requiredEvidence: ['sample-ready'],
    });
    expect(narrative.triageActions[0].watchFor).toContain('12 successful checks');
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
    expect(narrative.supportingSummary).toBe('Clean browser-visible run: 35+ successful checks across 3 sites.');
    expect(narrative.triageActions.map((action) => action.id)).toEqual(['share-snapshot', 'keep-running']);
    expect(narrative.triageActions[0].action).toContain('Share this clean measured run');
    expect(narrative.triageActions[0].why).toContain('mature checks');
  });

  it('does not call a good run clean when tail latency lowers the score', () => {
    const rows = [
      row('google', { p50: 48, p95: 175, sampleCount: 35 }, 'Google'),
      row('cloudflare', { p50: 44, p95: 72, sampleCount: 35 }, 'Cloudflare'),
      row('aws', { p50: 46, p95: 74, sampleCount: 35 }, 'AWS'),
    ];
    const narrative = buildDiagnosticNarrative({
      rows,
      threshold: 120,
      corsMode: 'cors',
      samplesByEndpoint: {
        google: samples(35, 48, true),
        cloudflare: samples(35, 44, true),
        aws: samples(35, 46, true),
      },
      monitoredEndpointCount: 3,
    });

    expect(narrative.kind).toBe('healthy');
    expect(narrative.severity).toBe('healthy');
    expect(narrative.primaryAnswer.text).toBe('Looks good, with minor variation.');
    expect(narrative.supportingSummary).toBe(
      'Good browser-visible run with variation: no site is consistently slow; 35+ successful checks across 3 sites.',
    );
    expect(narrative.safeSummary).toContain('Looks good, with minor variation.');
    expect(narrative.triageActions[0].action).toBe('Share this measured run with the variation visible.');
    expect(narrative.triageActions[0].why).toContain('higher-latency checks');
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
    expect(narrative.primaryValidation.claim).toMatchObject({
      id: 'browser-visibility-limited',
      kind: 'limited',
      requiredEvidence: ['total-timing'],
    });
    expect(narrative.claims.map((claim) => claim.id)).toEqual([
      'isolated-endpoint',
      'browser-measured-comparison',
      'browser-visibility-limited',
      'run-outside-check-next',
    ]);
    expect(narrative.claims.find((claim) => claim.id === 'browser-measured-comparison')?.text).toBe(
      'Chronoscope measured API against the other enabled sites in this browser run.',
    );
    expect(narrative.evidence.some((item) => item.label === 'Site to inspect' && item.value === 'API')).toBe(true);
    expect(narrative.safeSummary).not.toMatch(/likely (source|site|network|your network)/i);
    // Post-hotfix (fix/synthesis-arc-hotfixes) the Measured Fact slot
    // surfaces actual measurements per kind rather than the prior generic
    // "Evidence: N+ successful checks across N sites; total timing only."
    // meta-count. For the isolated-endpoint kind, it now names the slowest
    // site by label and includes its p95.
    expect(narrative.supportingSummary).toBe(
      'Median latency is 45 ms across 3 sites; API is the slowest at p95 70 ms.',
    );
    expect(narrative.nextSteps.join(' ')).toContain('Open Investigate');
    expect(narrative.triageActions.map((action) => action.id)).toEqual([
      'review-browser-visibility',
      'open-investigate',
      'run-remote-check',
      'compare-another-network',
    ]);
    expect(narrative.triageActions[0].action).toContain('Review what the browser can and cannot see');
    expect(narrative.triageActions[1]).toMatchObject({
      endpointId: 'api',
      requiredEvidence: ['all-enabled-ready', 'sample-actionable', 'total-timing'],
    });
    expect(narrative.triageActions[2].watchFor).toContain('outside check');
  });

  it('uses a registry next-validation claim when phase timing supports remote validation', () => {
    const rows = [
      row('api', { p50: 240, sampleCount: 18 }, 'API'),
      row('google', { p50: 45, sampleCount: 18 }, 'Google'),
      row('cloudflare', { p50: 35, sampleCount: 18 }, 'Cloudflare'),
    ];
    const narrative = buildDiagnosticNarrative({
      rows,
      threshold: 120,
      corsMode: 'cors',
      samplesByEndpoint: {
        api: samples(18, 240, true),
        google: samples(18, 45, true),
        cloudflare: samples(18, 35, true),
      },
      monitoredEndpointCount: 3,
    });

    expect(narrative.primaryValidation.id).toBe('run-remote-check');
    expect(narrative.primaryValidation.claim).toMatchObject({
      id: 'run-outside-check-next',
      kind: 'next-validation',
      strength: 'low',
      requiredEvidence: [],
    });
    expect(narrative.primaryValidation.claim.text).toBe(
      'Run an outside check for API to compare your browser path with a Cloudflare edge.',
    );
    expect(narrative.claims.map((claim) => claim.id)).toEqual([
      'isolated-endpoint',
      'browser-measured-comparison',
      'run-outside-check-next',
    ]);
    expect(narrative.claims.map((claim) => claim.text).join(' ')).not.toMatch(/likely|will fix|the problem is/i);
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

  it('adds a compact loss pattern detail without guessing the cause', () => {
    const narrative = buildDiagnosticNarrative({
      rows: [
        row('google', { lossPercent: 20, sampleCount: 10 }),
        row('cloudflare', { lossPercent: 0, sampleCount: 10 }),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        google: [ok(1), ok(2), timeout(3), timeout(4), timeout(5), ok(6), ok(7), ok(8), ok(9), ok(10)],
        cloudflare: samples(10, 55),
      },
      monitoredEndpointCount: 2,
    });

    const lossEvidence = narrative.evidence.find((item) => item.id === 'failed-requests');
    expect(lossEvidence).toMatchObject({
      label: 'Failed requests',
      detail: 'Failed requests are clustered in a short burst.',
    });
    expect(lossEvidence?.detail).not.toMatch(/cause|because|router|ISP|Wi[- ]?Fi|server/i);
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
    expect(narrative.triageActions.map((action) => action.id)).toEqual([
      'compare-another-network',
      'run-local-agent',
      'share-support-report',
    ]);
    expect(narrative.triageActions[1].action).toContain('Run the local agent');
    expect(narrative.triageActions[1].watchFor).toContain('hop-by-hop');
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

  it('names the implicated endpoint in packet-loss and jitter headlines when one dominates', () => {
    // When a single endpoint clearly dominates the failure or jitter signal,
    // computeCausalVerdict sets worstEpId and the headline names that
    // endpoint per the synthesis design contract Section 2 ("specific verdict
    // headline" + inline highlighting). This is the spec-table failure copy
    // rendered as a real measured fact.
    const packetLoss = buildDiagnosticNarrative({
      rows: [
        row('api', { lossPercent: 8, sampleCount: 18 }, 'API'),
        row('google', { lossPercent: 0, sampleCount: 18 }, 'Google'),
        row('cloudflare', { lossPercent: 0, sampleCount: 18 }, 'Cloudflare'),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        api: samples(18, 60),
        google: samples(18, 45),
        cloudflare: samples(18, 38),
      },
      monitoredEndpointCount: 3,
    });
    expect(packetLoss.kind).toBe('packet-loss');
    expect(packetLoss.primaryAnswer.text).toBe('API is failing from your browser.');
    expect(packetLoss.highlightedEndpoint).toEqual({ id: 'api', label: 'API' });

    const jitter = buildDiagnosticNarrative({
      rows: [
        row('api', { stddev: 80, sampleCount: 18 }, 'API'),
        row('google', { stddev: 6, sampleCount: 18 }, 'Google'),
        row('cloudflare', { stddev: 5, sampleCount: 18 }, 'Cloudflare'),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        api: samples(18, 70),
        google: samples(18, 50),
        cloudflare: samples(18, 45),
      },
      monitoredEndpointCount: 3,
    });
    expect(jitter.kind).toBe('jitter');
    expect(jitter.primaryAnswer.text).toBe("API's latency is jumping around.");
    expect(jitter.highlightedEndpoint).toEqual({ id: 'api', label: 'API' });
  });

  it('exposes highlightedEndpoint for isolated-endpoint and omits it when no single endpoint is implicated', () => {
    const isolated = buildDiagnosticNarrative({
      rows: [
        row('api', { p50: 240, sampleCount: 18 }, 'API'),
        row('google', { p50: 45, sampleCount: 18 }, 'Google'),
        row('cloudflare', { p50: 38, sampleCount: 18 }, 'Cloudflare'),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        api: samples(18, 240),
        google: samples(18, 45),
        cloudflare: samples(18, 38),
      },
      monitoredEndpointCount: 3,
    });
    expect(isolated.kind).toBe('isolated-endpoint');
    expect(isolated.highlightedEndpoint).toEqual({ id: 'api', label: 'API' });
    expect(isolated.primaryAnswer.text).toContain('API');

    const healthy = buildDiagnosticNarrative({
      rows: [
        row('google', { p50: 45, sampleCount: 30 }),
        row('cloudflare', { p50: 38, sampleCount: 30 }),
      ],
      threshold: 120,
      corsMode: 'no-cors',
      samplesByEndpoint: {
        google: samples(30, 45),
        cloudflare: samples(30, 38),
      },
      monitoredEndpointCount: 2,
    });
    expect(healthy.kind).toBe('healthy');
    expect(healthy.highlightedEndpoint).toBeUndefined();
  });

  it('keeps the trust matrix concise and evidence-scoped across common scenarios', () => {
    const scenarios = [
      buildDiagnosticNarrative({
        rows: [],
        threshold: 120,
        corsMode: 'no-cors',
        samplesByEndpoint: {},
        monitoredEndpointCount: 3,
      }),
      buildDiagnosticNarrative({
        rows: [
          row('api', { p50: 240, sampleCount: 18 }, 'API'),
          row('google', { p50: 45, sampleCount: 18 }, 'Google'),
          row('cloudflare', { p50: 38, sampleCount: 18 }, 'Cloudflare'),
        ],
        threshold: 120,
        corsMode: 'no-cors',
        samplesByEndpoint: {
          api: samples(18, 240),
          google: samples(18, 45),
          cloudflare: samples(18, 38),
        },
        monitoredEndpointCount: 3,
      }),
      buildDiagnosticNarrative({
        rows: [
          row('google', { p50: 220, tier2Averages: { dnsLookup: 120, tcpConnect: 5, tlsHandshake: 5, ttfb: 10, contentTransfer: 10 } }),
          row('cloudflare', { p50: 210, tier2Averages: { dnsLookup: 120, tcpConnect: 5, tlsHandshake: 5, ttfb: 10, contentTransfer: 10 } }),
          row('aws', { p50: 40, tier2Averages: tier2 }),
        ],
        threshold: 120,
        corsMode: 'cors',
        samplesByEndpoint: {
          google: samples(35, 220, true),
          cloudflare: samples(35, 210, true),
          aws: samples(35, 40, true),
        },
        monitoredEndpointCount: 3,
      }),
      buildDiagnosticNarrative({
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
      }),
    ];

    for (const narrative of scenarios) {
      const { supportingSummary } = narrative;
      expect(supportingSummary).toBeTruthy();
      expect(supportingSummary!.length).toBeLessThanOrEqual(120);
      expect([
        narrative.primaryAnswer.text,
        supportingSummary,
        narrative.primaryValidation.reason,
        narrative.safeSummary,
        ...narrative.triageActions.flatMap((action) => [
          action.label,
          action.action,
          action.why,
          action.watchFor,
        ]),
      ].join(' ')).not.toMatch(/perfect internet|best connection|ISP is clean|No network issue exists|root cause|likely (?:that site|your network|source)/i);

      for (const action of narrative.triageActions) {
        expect(action.action).toBeTruthy();
        expect(action.why).toBeTruthy();
        expect(action.watchFor).toBeTruthy();
        expect(action.requiredEvidence.length).toBeGreaterThan(0);
        expect(`${action.action} ${action.why} ${action.watchFor}`).not.toMatch(/will fix|restart your router|the problem is your|your ISP is/i);
      }
    }
  });
});
