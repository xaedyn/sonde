import { describe, it, expect } from 'vitest';
import { buildHistogram, buildCorrelation } from '../../../src/lib/utils/diagnose-stats';
import type { MeasurementSample } from '../../../src/lib/types';

// Test factories matched to the actual MeasurementSample shape:
// { round, latency: number, status, timestamp, tier2?, errorMessage?, timingFallback? }
const okSample = (round: number, latency: number): MeasurementSample => ({
  round,
  latency,
  status: 'ok',
  timestamp: 0,
});

const badSample = (round: number, status: 'timeout' | 'error'): MeasurementSample => ({
  round,
  latency: 0,
  status,
  timestamp: 0,
  ...(status === 'error' ? { errorMessage: 'failed' } : {}),
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

  it('does NOT mark spikes when focused has fewer than the minimum baseline samples', () => {
    // 5 samples is below the 8-sample minimum — median is too noisy to call spikes from
    const result = buildCorrelation(focused, []);
    const focusedRow = result.rows[0]!;
    const spikeRounds = focusedRow.cells.filter(c => c.isSpike).map(c => c.round);
    expect(spikeRounds).toEqual([]);
  });

  it('marks a sample as a spike once enough baseline samples exist', () => {
    // 10 samples — over the 8-sample threshold — with one obvious outlier.
    const wide = {
      id: 'edge', label: 'Edge',
      samples: [50, 52, 51, 49, 53, 50, 51, 52, 200, 49].map((v, i) => okSample(i + 1, v)),
    };
    const result = buildCorrelation(wide, []);
    const focusedRow = result.rows[0]!;
    const spikeRounds = focusedRow.cells.filter(c => c.isSpike).map(c => c.round);
    expect(spikeRounds).toEqual([9]); // round 9 = the 200ms outlier
  });

  // Helpers for the larger samples needed once spike detection requires ≥8 OK samples
  const longSeries = (label: string, normal: number, spikeAt: number, spikeMs: number): { id: string; label: string; samples: MeasurementSample[] } => ({
    id: label.toLowerCase(),
    label,
    samples: Array.from({ length: 16 }, (_, i) => okSample(i + 1, i + 1 === spikeAt ? spikeMs : normal)),
  });

  it('verdict says isolated when other endpoints did NOT spike on the focused-spike rounds', () => {
    const focusedLong = longSeries('Edge', 50, 8, 200);
    const others = [longSeries('Google', 80, 0, 0), longSeries('AWS', 35, 0, 0)];
    const result = buildCorrelation(focusedLong, others);
    expect(result.verdict.focusedSpikeRounds).toEqual([8]);
    expect(result.verdict.otherSpikesPerFocusedSpike).toEqual([0]);
    expect(result.verdict.headline).toContain('isolated to Edge');
    expect(result.verdict.headline).toContain('that site');
  });

  it('verdict says network-wide when most others spiked alongside focused', () => {
    const focusedLong = longSeries('Edge', 50, 8, 200);
    const others = [longSeries('Google', 80, 8, 250), longSeries('AWS', 35, 8, 100)];
    const result = buildCorrelation(focusedLong, others);
    expect(result.verdict.focusedSpikeRounds).toEqual([8]);
    expect(result.verdict.otherSpikesPerFocusedSpike[0]).toBeGreaterThanOrEqual(1);
    expect(result.verdict.headline).toContain('network');
  });

  it('verdict acknowledges no spikes', () => {
    const steady = {
      id: 'edge', label: 'Edge',
      samples: Array.from({ length: 12 }, (_, i) => okSample(i + 1, 50 + (i % 3))),
    };
    const result = buildCorrelation(steady, [longSeries('Google', 80, 0, 0)]);
    expect(result.verdict.focusedSpikeRounds).toEqual([]);
    expect(result.verdict.headline).toContain('steady');
    expect(result.verdict.headline).toContain('no notable spikes');
  });

  it('verdict prompts for comparison endpoints when only the focused one is provided', () => {
    const focusedLong = longSeries('Edge', 50, 0, 0);
    const result = buildCorrelation(focusedLong, []);
    expect(result.verdict.headline).toContain('compare');
  });

  // Silent-failure regression guards — these cases previously produced misleading
  // "steady" or "isolated" verdicts when the underlying data was actually broken
  // or sparse.

  it('verdict says "no successful samples" when focused has all-failed samples', () => {
    const allFailed = {
      id: 'edge', label: 'Edge',
      samples: Array.from({ length: 8 }, (_, i) => badSample(i + 1, 'timeout')),
    };
    const result = buildCorrelation(allFailed, [longSeries('Google', 80, 0, 0)]);
    // Must NOT say "steady" — that would conflict with the all-failed reality.
    expect(result.verdict.headline).not.toContain('steady');
    expect(result.verdict.headline).toContain('no successful samples');
  });

  it('verdict says "no recent samples in this window" when focused has history but the window is empty', () => {
    // Focused has plenty of OK samples but they're all in old rounds 1-12.
    // Comparators have data in rounds 50-65. The window slice picks the
    // highest 16 rounds (50-65) → focused has no cells, comparators do.
    const focusedOld = {
      id: 'edge', label: 'Edge',
      samples: Array.from({ length: 12 }, (_, i) => okSample(i + 1, 50)),
    };
    const recentComparator = {
      id: 'g', label: 'Google',
      samples: Array.from({ length: 16 }, (_, i) => okSample(i + 50, 80)),
    };
    const result = buildCorrelation(focusedOld, [recentComparator]);
    // Must NOT say "steady" — we have no data for focused in this window.
    expect(result.verdict.headline).not.toContain('steady');
    expect(result.verdict.headline).toContain('No recent samples');
    expect(result.verdict.headline).toContain('Edge');
  });

  it('verdict says "still learning baseline" when focused has too few OK samples', () => {
    const earlyDays = {
      id: 'edge', label: 'Edge',
      samples: [okSample(1, 50), okSample(2, 52), okSample(3, 51)],
    };
    const result = buildCorrelation(earlyDays, [longSeries('Google', 80, 0, 0)]);
    expect(result.verdict.headline).toContain('learning');
    expect(result.verdict.headline).toContain('Edge');
  });

  it('verdict acknowledges sparse comparator data when comparators have gaps on spike rounds', () => {
    // Focused has a clear spike at round 8. Both comparators happen to have
    // non-OK samples for that exact round → their cells are null. The old
    // logic would call this "isolated to Edge" because nulls counted as
    // "did not spike". The new logic flags it as inconclusive.
    const focusedLong = longSeries('Edge', 50, 8, 200);
    const sparseAtSpike = (label: string): { id: string; label: string; samples: MeasurementSample[] } => ({
      id: label.toLowerCase(),
      label,
      samples: Array.from({ length: 16 }, (_, i) => i + 1 === 8 ? badSample(i + 1, 'timeout') : okSample(i + 1, 80)),
    });
    const result = buildCorrelation(focusedLong, [sparseAtSpike('Google'), sparseAtSpike('AWS')]);
    expect(result.verdict.focusedSpikeRounds).toEqual([8]);
    // Headline must NOT confidently claim "isolated" when comparators had gaps.
    expect(result.verdict.headline).not.toContain('isolated');
    expect(result.verdict.headline).toContain('sparse');
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
