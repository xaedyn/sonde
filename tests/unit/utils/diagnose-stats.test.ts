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

// Convenience wrapper around the existing `okSample` factory at the top of
// the file — most new tests don't care about per-sample round numbering.
const ok = (latency: number, round = 0): MeasurementSample => okSample(round, latency);

describe('buildHistogram() — 1-2-5 log-bin schema', () => {

  // ── Degrade gate (AC #10) ───────────────────────────────────────────────

  it('AC #10: fewer than 2 OK samples returns empty histogram', () => {
    expect(buildHistogram([])).toEqual({ bins: [], maxCount: 0, total: 0 });
    expect(buildHistogram([ok(50)])).toEqual({ bins: [], maxCount: 0, total: 1 });
  });

  it('AC #10: all-equal latency returns empty histogram', () => {
    const result = buildHistogram([ok(50), ok(50), ok(50)]);
    expect(result).toEqual({ bins: [], maxCount: 0, total: 3 });
  });

  it('AC #10: 3 distinct samples are NOT degraded (e.g. [0.1, 0.2, 0.3])', () => {
    const result = buildHistogram([ok(0.1), ok(0.2), ok(0.3)]);
    expect(result.total).toBe(3);
    expect(result.bins.length).toBeGreaterThan(0);
    const bin0 = result.bins.find(b => b.fromMs === 0 && b.toMs === 2);
    expect(bin0?.count).toBe(3);
  });

  it('AC #10: non-ok samples are excluded from the histogram', () => {
    const samples: MeasurementSample[] = [
      ok(50),
      { round: 1, latency: 9999, status: 'timeout', timestamp: 0 },
      ok(100),
    ];
    const result = buildHistogram(samples);
    expect(result.total).toBe(2);
  });

  // ── NaN / non-finite filter (AC #17) ───────────────────────────────────

  it('AC #17: NaN latency is excluded even though typeof NaN === "number"', () => {
    const samples: MeasurementSample[] = [ok(50), ok(NaN), ok(100)];
    const result = buildHistogram(samples);
    expect(result.total).toBe(2);
    const binCountSum = result.bins.reduce((acc, b) => acc + b.count, 0);
    expect(binCountSum).toBe(result.total);
  });

  it('AC #17: Infinity, -Infinity, negative values are excluded', () => {
    const samples: MeasurementSample[] = [
      ok(50),
      ok(Infinity),
      ok(-Infinity),
      ok(-1),
      ok(-0.001),
      ok(100),
    ];
    const result = buildHistogram(samples);
    expect(result.total).toBe(2);
    const binCountSum = result.bins.reduce((acc, b) => acc + b.count, 0);
    expect(binCountSum).toBe(result.total);
  });

  // ── Bin assignment (AC #1, #2, #3, #4) ────────────────────────────────

  it('AC #1: [3,7,15,80,250] produces exactly 9 bins with correct counts', () => {
    const result = buildHistogram([ok(3), ok(7), ok(15), ok(80), ok(250)]);
    expect(result.total).toBe(5);
    expect(result.maxCount).toBe(1);
    expect(result.bins).toHaveLength(9);

    const expected = [
      { fromMs: 0,   toMs: 2,    count: 0 },
      { fromMs: 2,   toMs: 5,    count: 1 },
      { fromMs: 5,   toMs: 10,   count: 1 },
      { fromMs: 10,  toMs: 20,   count: 1 },
      { fromMs: 20,  toMs: 50,   count: 0 },
      { fromMs: 50,  toMs: 100,  count: 1 },
      { fromMs: 100, toMs: 200,  count: 0 },
      { fromMs: 200, toMs: 500,  count: 1 },
      { fromMs: 500, toMs: 1000, count: 0 },
    ];
    for (let i = 0; i < expected.length; i++) {
      expect(result.bins[i]).toMatchObject(expected[i]!);
    }
  });

  it('AC #2: sub-1ms sample lands in bin 0 (<2ms), not relabeled', () => {
    const result = buildHistogram([ok(0.3), ok(50)]);
    const bin0 = result.bins.find(b => b.fromMs === 0 && b.toMs === 2);
    expect(bin0).toBeDefined();
    expect(bin0?.count).toBe(1);
  });

  it('AC #3: sample at 9999ms lands in bin 10 [2000, +∞)', () => {
    const result = buildHistogram([ok(50), ok(9999)]);
    const bin10 = result.bins.find(b => b.fromMs === 2000 && !Number.isFinite(b.toMs));
    expect(bin10).toBeDefined();
    expect(bin10?.count).toBe(1);
  });

  it('AC #4: edge values follow Decision 6 tie-break table', () => {
    const r1 = buildHistogram([ok(0.0), ok(50)]);
    expect(r1.bins.find(b => b.fromMs === 0 && b.toMs === 2)?.count).toBe(1);

    const r2 = buildHistogram([ok(2.0), ok(50)]);
    expect(r2.bins.find(b => b.fromMs === 2 && b.toMs === 5)?.count).toBe(1);

    const r3 = buildHistogram([ok(50), ok(1999.999)]);
    expect(r3.bins.find(b => b.fromMs === 1000 && b.toMs === 2000)?.count).toBe(1);

    const r4 = buildHistogram([ok(50), ok(5000.0)]);
    expect(r4.bins.find(b => b.fromMs === 2000 && !Number.isFinite(b.toMs))?.count).toBe(1);
  });

  // ── Trimming behaviour (AC #5, #6, #7) ────────────────────────────────

  it('AC #5: [40,60,80] — outer trim with padding; internal empties preserved', () => {
    const result = buildHistogram([ok(40), ok(60), ok(80)]);
    const fromMs = result.bins.map(b => b.fromMs);
    expect(fromMs).toEqual([10, 20, 50, 100]);
    expect(result.bins.find(b => b.fromMs === 10)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 20)?.count).toBe(1);
    expect(result.bins.find(b => b.fromMs === 50)?.count).toBe(2);
    expect(result.bins.find(b => b.fromMs === 100)?.count).toBe(0);
  });

  it('AC #6: [15, 800] — internal empty bins preserved across wide range', () => {
    const result = buildHistogram([ok(15), ok(800)]);
    const fromMsArr = result.bins.map(b => b.fromMs);
    expect(fromMsArr).toEqual([5, 10, 20, 50, 100, 200, 500, 1000]);
    expect(result.bins.find(b => b.fromMs === 5)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 10)?.count).toBe(1);
    expect(result.bins.find(b => b.fromMs === 20)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 50)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 100)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 200)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 500)?.count).toBe(1);
    expect(result.bins.find(b => b.fromMs === 1000)?.count).toBe(0);
  });

  it('AC #7: data in bin 0 — protected, no padding to the left; padding to the right', () => {
    const result = buildHistogram([ok(0.5), ok(50)]);
    const fromMsArr = result.bins.map(b => b.fromMs);
    expect(fromMsArr).toEqual([0, 2, 5, 10, 20, 50, 100]);
    expect(result.bins.find(b => b.fromMs === 0)?.count).toBe(1);
    expect(result.bins.find(b => b.fromMs === 2)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 5)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 10)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 20)?.count).toBe(0);
    expect(result.bins.find(b => b.fromMs === 50)?.count).toBe(1);
    expect(result.bins.find(b => b.fromMs === 100)?.count).toBe(0);
  });

  // ── Smoke tests (AC #8, #9) ────────────────────────────────────────────

  it('AC #8: bimodal dataset renders two distinct non-zero peaks separated by an empty trough', () => {
    // Schema: bin 4 = [20,50), bin 5 = [50,100), bin 6 = [100,200), bin 7 = [200,500).
    // Cluster A: 30 samples in 25–33ms — all in bin 4. Cluster B: 30 samples in 380–388ms — all in bin 7.
    const samples: MeasurementSample[] = [
      ...Array.from({ length: 30 }, (_, i) => ok(25 + i * 0.3)),
      ...Array.from({ length: 30 }, (_, i) => ok(380 + i * 0.3)),
    ];
    const result = buildHistogram(samples);
    const bin4 = result.bins.find(b => b.fromMs === 20 && b.toMs === 50);
    const bin5 = result.bins.find(b => b.fromMs === 50 && b.toMs === 100);
    const bin6 = result.bins.find(b => b.fromMs === 100 && b.toMs === 200);
    const bin7 = result.bins.find(b => b.fromMs === 200 && b.toMs === 500);
    expect(bin4?.count).toBe(30);
    expect(bin5?.count ?? 0).toBe(0);
    expect(bin6?.count ?? 0).toBe(0);
    expect(bin7?.count).toBe(30);
  });

  it('AC #9: single 4500ms outlier alongside 50 samples in 50–75ms range — cluster intact + bin 10 visible', () => {
    // 50 + i*0.5 for i=0..49 produces 50.0..74.5 — all in bin 5 [50,100), no edge ambiguity.
    const samples: MeasurementSample[] = [
      ...Array.from({ length: 50 }, (_, i) => ok(50 + i * 0.5)),
      ok(4500),
    ];
    const result = buildHistogram(samples);
    const bin5 = result.bins.find(b => b.fromMs === 50 && b.toMs === 100);
    expect(bin5?.count).toBe(50);
    const bin10 = result.bins.find(b => b.fromMs === 2000 && !Number.isFinite(b.toMs));
    expect(bin10?.count).toBe(1);
    expect(result.total).toBe(51);
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
    expect(result.verdict.headline).toContain('limited to Edge');
    expect(result.verdict.headline).toContain('browser-visible comparison');
    expect(result.verdict.headline).not.toMatch(/likely that site/i);
  });

  it('verdict says network-wide when most others spiked alongside focused', () => {
    const focusedLong = longSeries('Edge', 50, 8, 200);
    const others = [longSeries('Google', 80, 8, 250), longSeries('AWS', 35, 8, 100)];
    const result = buildCorrelation(focusedLong, others);
    expect(result.verdict.focusedSpikeRounds).toEqual([8]);
    expect(result.verdict.otherSpikesPerFocusedSpike[0]).toBeGreaterThanOrEqual(1);
    expect(result.verdict.headline).toContain('shared browser-visible');
    expect(result.verdict.headline).not.toMatch(/likely your network/i);
  });

  it('verdict acknowledges no spikes', () => {
    const steady = {
      id: 'edge', label: 'Edge',
      samples: Array.from({ length: 12 }, (_, i) => okSample(i + 1, 50 + (i % 3))),
    };
    const result = buildCorrelation(steady, [longSeries('Google', 80, 0, 0)]);
    expect(result.verdict.focusedSpikeRounds).toEqual([]);
    expect(result.verdict.headline).toContain('no notable spikes');
    expect(result.verdict.headline).not.toContain('steady');
  });

  it('verdict calls out slow-but-steady latency when the focused endpoint stays above threshold', () => {
    const slowSteady = {
      id: 'api', label: 'api.example.com',
      samples: Array.from({ length: 16 }, (_, i) => okSample(i + 1, 240)),
    };
    const others = [longSeries('Google', 45, 0, 0), longSeries('Cloudflare', 38, 0, 0)];
    const result = buildCorrelation(slowSteady, others, 16, { slowThresholdMs: 120 });
    expect(result.verdict.focusedSpikeRounds).toEqual([]);
    expect(result.verdict.headline).toContain('consistently above your 120 ms threshold');
    expect(result.verdict.headline).toContain('staying slow');
    expect(result.verdict.headline).not.toContain('steady');
  });

  it('verdict calls out relative slow-but-steady latency when no threshold is provided', () => {
    const slowSteady = {
      id: 'api', label: 'api.example.com',
      samples: Array.from({ length: 16 }, (_, i) => okSample(i + 1, 240)),
    };
    const others = [longSeries('Google', 45, 0, 0), longSeries('Cloudflare', 38, 0, 0)];
    const result = buildCorrelation(slowSteady, others);
    expect(result.verdict.focusedSpikeRounds).toEqual([]);
    expect(result.verdict.headline).toContain('consistently slower than the comparison endpoints');
    expect(result.verdict.headline).toContain('staying slow');
    expect(result.verdict.headline).not.toContain('steady');
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
