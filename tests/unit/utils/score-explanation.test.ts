import { describe, expect, it } from 'vitest';
import { buildScoreExplanation } from '../../../src/lib/utils/score-explanation';
import type { Endpoint, EndpointStatistics } from '../../../src/lib/types';
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
    sampleCount: 40,
    p50: 40,
    p95: 80,
    p99: 100,
    p25: 32,
    p75: 52,
    p90: 70,
    min: 25,
    max: 110,
    stddev: 6,
    ci95: { lower: 36, upper: 44, margin: 4 },
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

describe('buildScoreExplanation()', () => {
  it('explains an 80 good score through visible endpoint contributions', () => {
    const explanation = buildScoreExplanation({
      rows: [
        row('google', {}, 'Google'),
        row('cloudflare', {}, 'Cloudflare'),
        row('aws', { p50: 48, p95: 175 }, 'AWS'),
        row('api', { p50: 52, p95: 170 }, 'API'),
      ],
      threshold: 120,
      score: 80,
      rawScore: 80,
    });

    expect(explanation).not.toBeNull();
    expect(explanation?.headline).toBe('Score 80 · Good');
    expect(explanation?.summary).toBe('2 sites clean; 2 have some slower checks.');
    expect(explanation?.contributions.map((item) => `${item.label} ${item.points}`)).toEqual([
      'Google 100',
      'Cloudflare 100',
      'AWS 60',
      'API 60',
    ]);
    expect(explanation?.detail).toContain('AWS 60: some slower checks');
    expect(explanation?.detail).not.toMatch(/cause|ISP|server is/i);
  });

  it('calls out when the displayed score is capped by a degraded diagnosis', () => {
    const explanation = buildScoreExplanation({
      rows: [
        row('google', {}, 'Google'),
        row('cloudflare', {}, 'Cloudflare'),
        row('api', { p50: 180, p95: 240 }, 'API'),
      ],
      threshold: 120,
      score: 79,
      rawScore: 87,
      capReason: 'API is slower than the others in this test.',
    });

    expect(explanation?.headline).toBe('Score 79 · Degraded');
    expect(explanation?.summary).toBe('2 sites clean; 1 is consistently above threshold. Score capped because API is slower than the others in this test.');
    expect(explanation?.detail).toContain('API 60: median above threshold');
  });

  it('keeps capped-score reasons plain when the diagnostic answer starts with a normal word', () => {
    const explanation = buildScoreExplanation({
      rows: [
        row('google', {}, 'Google'),
        row('edge', {}, 'Edge'),
      ],
      threshold: 120,
      score: 79,
      rawScore: 100,
      capReason: 'Latency is jumping around.',
    });

    expect(explanation?.summary).toBe('2 sites clean. Score capped because latency is jumping around.');
  });

  it('withholds explanation copy until a score can be shown', () => {
    const explanation = buildScoreExplanation({
      rows: [row('google', { ready: false }, 'Google')],
      threshold: 120,
      score: null,
      rawScore: null,
    });

    expect(explanation).toBeNull();
  });
});
