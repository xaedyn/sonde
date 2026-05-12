import { describe, expect, it } from 'vitest';
import { buildRemoteVantageInsight } from '../../../src/lib/remote-vantage/insight';
import type { Endpoint, EndpointStatistics } from '../../../src/lib/types';
import type { RemoteVantageProbeResponse } from '../../../src/lib/remote-vantage/types';

const endpoint: Endpoint = {
  id: 'ep-1',
  label: 'API',
  url: 'https://api.example.com',
  enabled: true,
  color: '#67e8f9',
};

const slowStats: EndpointStatistics = {
  endpointId: 'ep-1',
  sampleCount: 30,
  p50: 280,
  p95: 340,
  p99: 390,
  p25: 260,
  p75: 300,
  p90: 320,
  min: 220,
  max: 420,
  stddev: 24,
  ci95: { lower: 270, upper: 290, margin: 10 },
  connectionReuseDelta: null,
  lossPercent: 0,
  ready: true,
};

function remote(overrides: Partial<RemoteVantageProbeResponse['results'][number]>): RemoteVantageProbeResponse {
  return {
    ok: true,
    generatedAt: 1778352000000,
    edge: {
      colo: 'IAD',
      country: 'US',
      city: 'Ashburn',
      region: 'Virginia',
    },
    results: [{
      endpointId: 'ep-1',
      label: 'API',
      url: 'https://api.example.com',
      ok: true,
      status: 200,
      statusText: 'OK',
      durationMs: 48,
      checkedAt: 1778352000000,
      verdict: 'reachable',
      headers: {},
      ...overrides,
    }],
  };
}

function insightCopy(input: ReturnType<typeof buildRemoteVantageInsight>): string {
  return [input.headline, input.detail, input.action].join(' ');
}

describe('buildRemoteVantageInsight', () => {
  it('calls out local-path suspicion when the browser is slow but Cloudflare is fast', () => {
    const insight = buildRemoteVantageInsight({
      endpoint,
      stats: slowStats,
      threshold: 120,
      probe: remote({ durationMs: 48, verdict: 'reachable' }),
    });

    expect(insight.status).toBe('local-path');
    expect(insight.headline).toContain('outside check reached API within threshold');
    expect(insight.detail).toContain('browser p50 measured');
    expect(insight.detail).not.toMatch(/ISP|VPN|WiFi|local network/i);
  });

  it('calls out shared outside trouble when both local and remote vantage are slow', () => {
    const insight = buildRemoteVantageInsight({
      endpoint,
      stats: slowStats,
      threshold: 120,
      probe: remote({ durationMs: 410, verdict: 'slow' }),
    });

    expect(insight.status).toBe('remote-confirms');
    expect(insight.headline).toContain('was also slow from Cloudflare');
    expect(insight.detail).not.toMatch(/implicated|likely/i);
  });

  it('does not call the outside vantage healthy when only the remote side is slow', () => {
    const insight = buildRemoteVantageInsight({
      endpoint,
      stats: { ...slowStats, p50: 80 },
      threshold: 120,
      probe: remote({ durationMs: 410, verdict: 'slow' }),
    });

    expect(insight.status).toBe('remote-slow-only');
    expect(insight.detail).toContain('Only the outside check was elevated');
    expect(insight.action).not.toMatch(/blaming|likely/i);
  });

  it('returns a setup state before a remote probe exists', () => {
    const insight = buildRemoteVantageInsight({
      endpoint,
      stats: slowStats,
      threshold: 120,
      probe: null,
    });

    expect(insight.status).toBe('unavailable');
    expect(insight.action).toContain('Run a remote check');
  });

  it('keeps remote errors framed as outside-vantage evidence, not root cause', () => {
    const insight = buildRemoteVantageInsight({
      endpoint,
      stats: slowStats,
      threshold: 120,
      probe: remote({ ok: false, status: null, verdict: 'unreachable', durationMs: 5000 }),
    });

    expect(insight.status).toBe('remote-error');
    expect(insight.action).not.toMatch(/likely source/i);
    expect(insight.action).toContain('outside-vantage evidence');
  });

  it('keeps all outside-check states free of root-cause and overconfident wording', () => {
    const states = [
      buildRemoteVantageInsight({
        endpoint,
        stats: slowStats,
        threshold: 120,
        probe: remote({ durationMs: 48, verdict: 'reachable' }),
      }),
      buildRemoteVantageInsight({
        endpoint,
        stats: slowStats,
        threshold: 120,
        probe: remote({ durationMs: 410, verdict: 'slow' }),
      }),
      buildRemoteVantageInsight({
        endpoint,
        stats: { ...slowStats, p50: 80 },
        threshold: 120,
        probe: remote({ durationMs: 410, verdict: 'slow' }),
      }),
      buildRemoteVantageInsight({
        endpoint,
        stats: { ...slowStats, p50: 80 },
        threshold: 120,
        probe: remote({ durationMs: 48, verdict: 'reachable' }),
      }),
      buildRemoteVantageInsight({
        endpoint,
        stats: slowStats,
        threshold: 120,
        probe: remote({ ok: false, status: null, verdict: 'unreachable', durationMs: 5000 }),
      }),
    ];

    for (const insight of states) {
      expect(insightCopy(insight)).not.toMatch(/origin|cause|likely|healthy|local network|ISP|VPN/i);
      expect(insightCopy(insight)).not.toMatch(/reaches .* normally/i);
      expect(insightCopy(insight)).not.toMatch(/outside edge path/i);
    }
  });
});
