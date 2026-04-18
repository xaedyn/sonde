import { describe, it, expect, beforeEach } from 'vitest';
import { percentile, percentileSorted, stddev, confidenceInterval95, computeEndpointStatistics } from '../../src/lib/utils/statistics';
import { statisticsStore, resetStatisticsCache } from '../../src/lib/stores/statistics';
import { measurementStore } from '../../src/lib/stores/measurements';
import type { MeasurementSample, EndpointStatistics } from '../../src/lib/types';

// ── Pure function helpers ──────────────────────────────────────────────────

function makeSamples(latencies: number[]): MeasurementSample[] {
  return latencies.map((latency, i) => ({
    round: i + 1,
    latency,
    status: 'ok' as const,
    timestamp: Date.now() + i * 1000,
  }));
}

describe('percentile', () => {
  it('p50 of [1,2,3,4,5] is 3', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('p0 returns minimum value', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it('p100 returns maximum value', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it('p95 of 100 ascending values is near 95', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBe(95);
  });

  it('p99 of constant array returns that constant', () => {
    expect(percentile([42, 42, 42, 42, 42], 99)).toBe(42);
  });

  it('handles single-element array', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 100)).toBe(7);
  });

  it('works with unsorted input', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
  });
});

describe('stddev', () => {
  it('stddev of constant array is 0', () => {
    expect(stddev([5, 5, 5, 5, 5])).toBe(0);
  });

  it('stddev of [2,4,4,4,5,5,7,9] is 2 (population)', () => {
    // classic textbook example
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });

  it('stddev of single value is 0', () => {
    expect(stddev([100])).toBe(0);
  });

  it('stddev of two values [0,10] is 5', () => {
    expect(stddev([0, 10])).toBeCloseTo(5, 5);
  });

  it('stddev is always non-negative', () => {
    const values = [10, 200, 50, 1, 999];
    expect(stddev(values)).toBeGreaterThanOrEqual(0);
  });
});

describe('confidenceInterval95', () => {
  it('margin is z * (sd / sqrt(n))', () => {
    const median = 100;
    const sd = 10;
    const n = 25;
    const ci = confidenceInterval95(median, sd, n);
    const expectedMargin = 1.96 * (sd / Math.sqrt(n));
    expect(ci.margin).toBeCloseTo(expectedMargin, 5);
    expect(ci.lower).toBeCloseTo(median - expectedMargin, 5);
    expect(ci.upper).toBeCloseTo(median + expectedMargin, 5);
  });

  it('wider interval with fewer samples', () => {
    const ciLarge = confidenceInterval95(100, 10, 100);
    const ciSmall = confidenceInterval95(100, 10, 4);
    expect(ciSmall.margin).toBeGreaterThan(ciLarge.margin);
  });

  it('lower is always less than upper', () => {
    const ci = confidenceInterval95(50, 5, 10);
    expect(ci.lower).toBeLessThan(ci.upper);
  });

  it('zero stddev produces zero-width interval', () => {
    const ci = confidenceInterval95(100, 0, 30);
    expect(ci.margin).toBe(0);
    expect(ci.lower).toBe(100);
    expect(ci.upper).toBe(100);
  });
});

describe('computeEndpointStatistics', () => {
  it('ready is false with fewer than 30 samples', () => {
    const samples = makeSamples(Array.from({ length: 29 }, () => 50));
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.ready).toBe(false);
  });

  it('ready is true with exactly 30 samples', () => {
    const samples = makeSamples(Array.from({ length: 30 }, () => 50));
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.ready).toBe(true);
  });

  it('ready is true with more than 30 samples', () => {
    const samples = makeSamples(Array.from({ length: 50 }, () => 50));
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.ready).toBe(true);
  });

  it('computes correct sampleCount', () => {
    const samples = makeSamples([10, 20, 30]);
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.sampleCount).toBe(3);
  });

  it('computes correct min and max', () => {
    const samples = makeSamples([100, 50, 200, 25]);
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.min).toBe(25);
    expect(stats.max).toBe(200);
  });

  it('computes p50 accurately', () => {
    const latencies = [10, 20, 30, 40, 50];
    const stats = computeEndpointStatistics('ep1', makeSamples(latencies));
    expect(stats.p50).toBe(30);
  });

  it('computes all percentile tiers', () => {
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
    const stats = computeEndpointStatistics('ep1', makeSamples(latencies));
    expect(stats.p25).toBeLessThan(stats.p50);
    expect(stats.p50).toBeLessThan(stats.p75);
    expect(stats.p75).toBeLessThan(stats.p90);
    expect(stats.p90).toBeLessThan(stats.p95);
    expect(stats.p95).toBeLessThan(stats.p99);
  });

  it('stddev is 0 for constant latency', () => {
    const samples = makeSamples(Array.from({ length: 10 }, () => 42));
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.stddev).toBe(0);
  });

  it('connectionReuseDelta is null with no tier2 data', () => {
    const samples = makeSamples([50, 60, 70]);
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.connectionReuseDelta).toBeNull();
  });

  it('connectionReuseDelta is the difference between cold and warm connections', () => {
    // First sample has tcp+tls overhead (cold), subsequent ones don't (warm/reused)
    const samples: MeasurementSample[] = [
      {
        round: 1, latency: 150, status: 'ok', timestamp: 1000,
        tier2: { total: 150, dnsLookup: 10, tcpConnect: 40, tlsHandshake: 30, ttfb: 60, contentTransfer: 10 },
      },
      {
        round: 2, latency: 70, status: 'ok', timestamp: 2000,
        tier2: { total: 70, dnsLookup: 0, tcpConnect: 0, tlsHandshake: 0, ttfb: 60, contentTransfer: 10 },
      },
      {
        round: 3, latency: 72, status: 'ok', timestamp: 3000,
        tier2: { total: 72, dnsLookup: 0, tcpConnect: 0, tlsHandshake: 0, ttfb: 62, contentTransfer: 10 },
      },
    ];
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.connectionReuseDelta).not.toBeNull();
    // Cold latency (150) vs warm average (~71) → delta ~79
    expect(stats.connectionReuseDelta as number).toBeGreaterThan(0);
  });

  it('computes tier2Averages when tier2 data is present', () => {
    const samples: MeasurementSample[] = [
      {
        round: 1, latency: 100, status: 'ok', timestamp: 1000,
        tier2: { total: 100, dnsLookup: 10, tcpConnect: 20, tlsHandshake: 15, ttfb: 45, contentTransfer: 10 },
      },
      {
        round: 2, latency: 90, status: 'ok', timestamp: 2000,
        tier2: { total: 90, dnsLookup: 5, tcpConnect: 25, tlsHandshake: 10, ttfb: 40, contentTransfer: 10 },
      },
    ];
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.tier2Averages).toBeDefined();
    expect(stats.tier2Averages?.dnsLookup).toBeCloseTo(7.5, 5);
    expect(stats.tier2Averages?.tcpConnect).toBeCloseTo(22.5, 5);
  });

  it('computes tier2P95 alongside tier2Averages (nearest-rank on each phase)', () => {
    const samples: MeasurementSample[] = Array.from({ length: 20 }, (_, i) => ({
      round: i + 1,
      latency: 100 + i,
      status: 'ok' as const,
      timestamp: 1000 + i,
      tier2: {
        total: 100 + i,
        dnsLookup:   i + 1,    // 1..20
        tcpConnect:  2 * i,    // 0..38
        tlsHandshake: i,       // 0..19
        ttfb:        40 + i,   // 40..59
        contentTransfer: 5,
      },
    }));
    const stats = computeEndpointStatistics('ep1', samples);
    expect(stats.tier2P95).toBeDefined();
    // nearest-rank p95 of 20 values → index ceil(0.95*20)-1 = 18
    expect(stats.tier2P95?.dnsLookup).toBe(19);       // sorted[18] of 1..20
    expect(stats.tier2P95?.tcpConnect).toBe(36);      // sorted[18] of 0,2,4,…,38
    expect(stats.tier2P95?.tlsHandshake).toBe(18);    // sorted[18] of 0..19
    expect(stats.tier2P95?.ttfb).toBe(58);            // sorted[18] of 40..59
    expect(stats.tier2P95?.contentTransfer).toBe(5);  // all identical
  });

  it('omits tier2P95 when no tier2 samples exist', () => {
    const stats = computeEndpointStatistics('ep1', makeSamples([100, 90, 80]));
    expect(stats.tier2Averages).toBeUndefined();
    expect(stats.tier2P95).toBeUndefined();
  });

  it('includes the endpointId in the result', () => {
    const stats = computeEndpointStatistics('my-endpoint', makeSamples([50]));
    expect(stats.endpointId).toBe('my-endpoint');
  });
});

describe('percentileSorted', () => {
  it('returns correct P50 from pre-sorted array', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentileSorted(sorted, 50)).toBe(30);
  });

  it('matches percentile() output for same data', () => {
    const data = [45, 12, 88, 3, 67, 23, 91, 55, 34, 76];
    const sorted = [...data].sort((a, b) => a - b);
    expect(percentileSorted(sorted, 25)).toBe(percentile(data, 25));
    expect(percentileSorted(sorted, 50)).toBe(percentile(data, 50));
    expect(percentileSorted(sorted, 75)).toBe(percentile(data, 75));
    expect(percentileSorted(sorted, 98)).toBe(percentile(data, 98));
  });

  it('returns 0 for empty array', () => {
    expect(percentileSorted([], 50)).toBe(0);
  });
});

describe('statisticsStore', () => {
  beforeEach(() => {
    measurementStore.reset();
    resetStatisticsCache();
  });

  it('is initially empty', () => {
    let state: Record<string, unknown> = {};
    statisticsStore.subscribe(s => { state = s; })();
    expect(Object.keys(state)).toHaveLength(0);
  });

  it('updates when measurements are added', () => {
    measurementStore.initEndpoint('ep-test');
    for (let i = 0; i < 5; i++) {
      measurementStore.addSample('ep-test', i + 1, 100 + i * 10, 'ok', Date.now() + i);
    }

    let stats: Record<string, unknown> = {};
    statisticsStore.subscribe(s => { stats = s; })();
    expect(stats['ep-test']).toBeDefined();
    expect((stats['ep-test'] as { sampleCount: number }).sampleCount).toBe(5);
  });

  it('reuses cached stats when sample count is unchanged for an endpoint', () => {
    // Set up endpoint with samples
    measurementStore.initEndpoint('ep-a');
    measurementStore.initEndpoint('ep-b');
    for (let i = 0; i < 3; i++) {
      measurementStore.addSample('ep-a', i + 1, 100 + i, 'ok', Date.now() + i);
      measurementStore.addSample('ep-b', i + 1, 200 + i, 'ok', Date.now() + i);
    }

    // First subscription captures initial stats
    let firstStats: Record<string, EndpointStatistics> = {};
    const unsub1 = statisticsStore.subscribe(s => { firstStats = s; });

    const epARef = firstStats['ep-a'];
    const epBRef = firstStats['ep-b'];
    expect(epARef).toBeDefined();
    expect(epBRef).toBeDefined();

    // Add a sample only to ep-b — ep-a should reuse its cached reference
    measurementStore.addSample('ep-b', 4, 210, 'ok', Date.now() + 100);

    let secondStats: Record<string, EndpointStatistics> = {};
    const unsub2 = statisticsStore.subscribe(s => { secondStats = s; });

    // ep-a was not changed — same object reference (memoized)
    expect(secondStats['ep-a']).toBe(epARef);
    // ep-b got a new sample — recomputed, different reference
    expect(secondStats['ep-b']).not.toBe(epBRef);
    expect(secondStats['ep-b'].sampleCount).toBe(4);

    unsub1();
    unsub2();
  });
});
