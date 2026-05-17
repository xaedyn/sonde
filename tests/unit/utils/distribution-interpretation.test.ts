import { describe, it, expect } from 'vitest';
import { interpretDistribution } from '../../../src/lib/utils/distribution-interpretation';
import type { MeasurementSample } from '../../../src/lib/types';

function ok(round: number, latency: number): MeasurementSample {
  return { round, latency, status: 'ok', timestamp: round * 1000 };
}

function failed(round: number): MeasurementSample {
  return { round, latency: 0, status: 'timeout', timestamp: round * 1000 };
}

describe('interpretDistribution', () => {
  it('returns insufficient-data below 8 successful samples', () => {
    const samples = [ok(1, 50), ok(2, 52), ok(3, 48), ok(4, 51), failed(5)];
    const interpretation = interpretDistribution({ endpointLabel: 'API', samples });
    expect(interpretation.kind).toBe('insufficient-data');
    expect(interpretation.headline).toContain('Not enough');
    expect(interpretation.detail).toContain('currently 4');
  });

  it('returns unimodal-tight when samples cluster within ~25% of the median', () => {
    // 10 samples between 48 and 56 ms — (p95 - p50) / p50 should be well
    // under TIGHT_SPREAD_RATIO (0.25).
    const samples = Array.from({ length: 10 }, (_, i) => ok(i + 1, 50 + i % 4));
    const interpretation = interpretDistribution({ endpointLabel: 'Google', samples });
    expect(interpretation.kind).toBe('unimodal-tight');
    expect(interpretation.headline).toBe("Google's latency is consistent.");
    expect(interpretation.detail).toMatch(/p95 \d+ ms/);
  });

  it('returns unimodal-wide when spread is moderate but no second cluster forms', () => {
    // p50 ≈ 60ms, p95 ≈ 90ms → spread ratio ≈ 0.5 (above tight, below wide).
    const samples: MeasurementSample[] = [];
    let r = 1;
    for (const latency of [45, 50, 55, 58, 60, 62, 65, 70, 80, 90]) {
      samples.push(ok(r++, latency));
    }
    const interpretation = interpretDistribution({ endpointLabel: 'API', samples });
    expect(interpretation.kind).toBe('unimodal-wide');
    expect(interpretation.headline).toBe("API's latency varies but stays unimodal.");
  });

  it('returns bimodal when samples form two clearly separated groups', () => {
    // Half clustered around 50 ms, half around 250 ms — spread ratio is huge
    // and the upper cluster is larger than 20 % of samples.
    const samples: MeasurementSample[] = [];
    let r = 1;
    for (const latency of [48, 50, 52, 50, 49, 51, 250, 245, 252, 248, 251, 250]) {
      samples.push(ok(r++, latency));
    }
    const interpretation = interpretDistribution({ endpointLabel: 'Cloudflare', samples });
    expect(interpretation.kind).toBe('bimodal');
    expect(interpretation.headline).toBe("Cloudflare's latency is split between two response times.");
    expect(interpretation.detail).toMatch(/two clusters/i);
  });

  it('returns tail-spikes when most samples cluster tight but a small fraction is much slower', () => {
    // 9 fast samples around 50ms, 1 outlier at 400ms — outlier is 8× p50 but
    // only 10 % of the sample count (≤ TAIL_SPIKE_MAX_SHARE of 20 %).
    const samples: MeasurementSample[] = [];
    let r = 1;
    for (const latency of [48, 50, 52, 49, 51, 50, 47, 53, 50, 400]) {
      samples.push(ok(r++, latency));
    }
    const interpretation = interpretDistribution({ endpointLabel: 'API', samples });
    expect(interpretation.kind).toBe('tail-spikes');
    expect(interpretation.headline).toBe('API mostly runs fast, with occasional spikes.');
    expect(interpretation.detail).toMatch(/max 400 ms/);
  });

  it('excludes failed samples from the OK count for the insufficient-data threshold', () => {
    // 7 OK + 4 failed = 7 successful. Should still be insufficient-data.
    const samples: MeasurementSample[] = [];
    let r = 1;
    for (let i = 0; i < 7; i++) samples.push(ok(r++, 50));
    for (let i = 0; i < 4; i++) samples.push(failed(r++));
    const interpretation = interpretDistribution({ endpointLabel: 'API', samples });
    expect(interpretation.kind).toBe('insufficient-data');
  });

  it('always names the focused endpoint in the headline', () => {
    const samples = Array.from({ length: 12 }, (_, i) => ok(i + 1, 50));
    const interpretation = interpretDistribution({ endpointLabel: 'My Custom Endpoint', samples });
    expect(interpretation.headline).toContain('My Custom Endpoint');
  });
});
