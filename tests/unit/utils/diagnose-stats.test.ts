import { describe, it, expect } from 'vitest';
import { buildHistogram, buildCorrelation } from '../../../src/lib/utils/diagnose-stats';
import type { MeasurementSample } from '../../../src/lib/types';

const okSample = (round: number, latency: number): MeasurementSample => ({
  round,
  latency,
  status: 'ok',
  errorMessage: null,
  startedAt: 0,
  finishedAt: latency,
});

const badSample = (round: number, status: 'timeout' | 'error'): MeasurementSample => ({
  round,
  latency: null,
  status,
  errorMessage: status === 'error' ? 'failed' : null,
  startedAt: 0,
  finishedAt: 0,
});

describe('buildHistogram', () => {
  it('returns empty bins when fewer than 2 samples', () => {
    const h = buildHistogram([okSample(1, 50)]);
    expect(h.bins).toEqual([]);
    expect(h.maxCount).toBe(0);
    expect(h.total).toBe(1);
  });

  it('returns empty bins when all samples have the same latency', () => {
    const h = buildHistogram([okSample(1, 50), okSample(2, 50), okSample(3, 50)]);
    expect(h.bins).toEqual([]);
    expect(h.maxCount).toBe(0);
  });

  it('ignores non-OK samples', () => {
    const h = buildHistogram([okSample(1, 50), okSample(2, 100), badSample(3, 'timeout'), badSample(4, 'error')]);
    expect(h.total).toBe(2);
  });

  it('distributes samples across the requested bin count', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) => okSample(i, v));
    const h = buildHistogram(samples, 5);
    expect(h.bins).toHaveLength(5);
    // Bins evenly spaced from 10 to 100 → 90 / 5 = 18 ms each.
    expect(h.bins[0]?.fromMs).toBe(10);
    expect(h.bins[4]?.toMs).toBe(100);
    // Each bin should have 2 samples (last bin includes upper edge).
    expect(h.bins.every(b => b.count >= 1)).toBe(true);
    expect(h.maxCount).toBeGreaterThanOrEqual(1);
  });

  it('puts max-valued samples in the last bin (inclusive upper edge)', () => {
    const samples = [10, 100, 100].map((v, i) => okSample(i, v));
    const h = buildHistogram(samples, 5);
    // The max sample (100) must be counted somewhere — without the inclusive
    // last-bin rule it would fall through.
    const total = h.bins.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(3);
  });
});

describe('buildCorrelation', () => {
  const focused = {
    id: 'edge',
    label: 'Edge',
    samples: [okSample(1, 50), okSample(2, 52), okSample(3, 51), okSample(4, 200), okSample(5, 49)],
  };

  it('produces a row per endpoint with cells for each round in the window', () => {
    const others = [
      { id: 'g', label: 'Google', samples: [okSample(1, 80), okSample(2, 82), okSample(3, 79), okSample(4, 81), okSample(5, 78)] },
    ];
    const result = buildCorrelation(focused, others);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.endpointId).toBe('edge');
    expect(result.rows[1]?.endpointId).toBe('g');
    expect(result.rows[0]?.cells).toHaveLength(5);
  });

  it('marks a sample as a spike when it exceeds 1.5x the endpoint median', () => {
    const result = buildCorrelation(focused, []);
    const focusedRow = result.rows[0]!;
    // median of [50, 52, 51, 200, 49] is 51 → 1.5x = 76.5 → only 200 is a spike
    const spikeRounds = focusedRow.cells.filter(c => c.isSpike).map(c => c.round);
    expect(spikeRounds).toEqual([4]);
  });

  it('verdict says isolated when other endpoints did NOT spike on the focused-spike rounds', () => {
    const others = [
      { id: 'g', label: 'Google', samples: [okSample(1, 80), okSample(2, 82), okSample(3, 79), okSample(4, 81), okSample(5, 78)] },
      { id: 'a', label: 'AWS', samples: [okSample(1, 35), okSample(2, 36), okSample(3, 34), okSample(4, 36), okSample(5, 35)] },
    ];
    const result = buildCorrelation(focused, others);
    expect(result.verdict.focusedSpikeRounds).toEqual([4]);
    // Neither Google nor AWS spiked at round 4
    expect(result.verdict.otherSpikesPerFocusedSpike).toEqual([0]);
    expect(result.verdict.headline).toContain('isolated to Edge');
    expect(result.verdict.headline).toContain('that site');
  });

  it('verdict says network-wide when most others spiked alongside focused', () => {
    // Focused spikes on round 4 (200ms vs median 51).
    // Both others ALSO spike on round 4.
    const others = [
      { id: 'g', label: 'Google', samples: [okSample(1, 80), okSample(2, 82), okSample(3, 79), okSample(4, 250), okSample(5, 78)] },
      { id: 'a', label: 'AWS', samples: [okSample(1, 35), okSample(2, 36), okSample(3, 34), okSample(4, 100), okSample(5, 35)] },
    ];
    const result = buildCorrelation(focused, others);
    expect(result.verdict.focusedSpikeRounds).toEqual([4]);
    expect(result.verdict.otherSpikesPerFocusedSpike[0]).toBeGreaterThanOrEqual(1);
    expect(result.verdict.headline).toContain('network');
  });

  it('verdict acknowledges no spikes', () => {
    const steady = {
      id: 'edge',
      label: 'Edge',
      samples: [okSample(1, 50), okSample(2, 52), okSample(3, 51), okSample(4, 50), okSample(5, 53)],
    };
    const result = buildCorrelation(steady, [{ id: 'g', label: 'Google', samples: [okSample(1, 80), okSample(2, 82), okSample(3, 79), okSample(4, 81), okSample(5, 78)] }]);
    expect(result.verdict.focusedSpikeRounds).toEqual([]);
    expect(result.verdict.headline).toContain('steady');
    expect(result.verdict.headline).toContain('no notable spikes');
  });

  it('verdict prompts for comparison endpoints when only the focused one is provided', () => {
    const result = buildCorrelation(focused, []);
    expect(result.verdict.headline).toContain('compare');
  });

  it('cells with no sample for the round are null and not spikes', () => {
    const sparse = {
      id: 'edge',
      label: 'Edge',
      samples: [okSample(1, 50), okSample(3, 51)],
    };
    const others = [{ id: 'g', label: 'Google', samples: [okSample(1, 80), okSample(2, 82), okSample(3, 79)] }];
    const result = buildCorrelation(sparse, others, 5);
    const sparseRow = result.rows[0]!;
    // Round 2 (the gap in `sparse`) should be null
    const round2 = sparseRow.cells.find(c => c.round === 2);
    expect(round2?.latencyMs).toBeNull();
    expect(round2?.isSpike).toBe(false);
  });
});
