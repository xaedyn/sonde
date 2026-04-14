import { describe, it, expect, beforeEach } from 'vitest';
import { SessionHistoryStore } from '../../src/lib/stores/session-history';
import type { MeasurementSample } from '../../src/lib/types';

function makeSample(
  overrides: Partial<MeasurementSample> & { timestamp: number }
): MeasurementSample {
  return {
    round: 0,
    latency: 100,
    status: 'ok',
    ...overrides,
  };
}

// 2024-01-15T10:xx:xx.xxxZ → hourKey = "2024-01-15T10"
const BASE_TS = new Date('2024-01-15T10:30:00.000Z').getTime();
const HOUR_KEY = '2024-01-15T10';

// Different hour
const NEXT_HOUR_TS = new Date('2024-01-15T11:30:00.000Z').getTime();
const NEXT_HOUR_KEY = '2024-01-15T11';

describe('SessionHistoryStore', () => {
  let store: SessionHistoryStore;

  beforeEach(() => {
    store = new SessionHistoryStore();
  });

  it('getSummaries returns empty array for unknown endpoint', () => {
    expect(store.getSummaries('ep1')).toEqual([]);
  });

  it('hasHistory is false when no data accumulated', () => {
    expect(store.hasHistory).toBe(false);
  });

  it('hasHistory is true after accumulating a sample', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS }));
    expect(store.hasHistory).toBe(true);
  });

  it('accumulate stores sample in the correct hour bucket', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    const summaries = store.getSummaries('ep1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].hourKey).toBe(HOUR_KEY);
    expect(summaries[0].count).toBe(1);
  });

  it('ok samples update latency stats (min, max, sum)', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100, status: 'ok' }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 1000, latency: 200, status: 'ok' }));
    const s = store.getSummaries('ep1')[0];
    expect(s.min).toBe(100);
    expect(s.max).toBe(200);
    expect(s.mean).toBeCloseTo(150, 5);
  });

  it('error samples do not affect latency stats', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100, status: 'ok' }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 1000, latency: 9999, status: 'error' }));
    const s = store.getSummaries('ep1')[0];
    expect(s.min).toBe(100);
    expect(s.max).toBe(100);
    expect(s.mean).toBeCloseTo(100, 5);
  });

  it('timeout samples do not affect latency stats', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100, status: 'ok' }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 1000, latency: 9999, status: 'timeout' }));
    const s = store.getSummaries('ep1')[0];
    expect(s.min).toBe(100);
    expect(s.max).toBe(100);
  });

  it('error samples are counted separately', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, status: 'ok', latency: 50 }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 100, status: 'error', latency: 0 }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 200, status: 'error', latency: 0 }));
    const s = store.getSummaries('ep1')[0];
    expect(s.count).toBe(3);
    expect(s.errorCount).toBe(2);
  });

  it('timeout samples are counted separately', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, status: 'ok', latency: 50 }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 100, status: 'timeout', latency: 0 }));
    const s = store.getSummaries('ep1')[0];
    expect(s.timeoutCount).toBe(1);
  });

  it('samples in separate hours create separate buckets', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    store.accumulate('ep1', makeSample({ timestamp: NEXT_HOUR_TS, latency: 200 }));
    const summaries = store.getSummaries('ep1');
    expect(summaries).toHaveLength(2);
  });

  it('getSummaries returns buckets in chronological order', () => {
    // Accumulate out of order
    store.accumulate('ep1', makeSample({ timestamp: NEXT_HOUR_TS, latency: 200 }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    const summaries = store.getSummaries('ep1');
    expect(summaries[0].hourKey).toBe(HOUR_KEY);
    expect(summaries[1].hourKey).toBe(NEXT_HOUR_KEY);
  });

  it('p50 computation works correctly', () => {
    for (let i = 1; i <= 10; i++) {
      store.accumulate(
        'ep1',
        makeSample({ timestamp: BASE_TS + i * 100, latency: i * 10, status: 'ok' })
      );
    }
    const s = store.getSummaries('ep1')[0];
    // sorted: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] — p50 at ceil(0.5*10)=5 → index 4 = 50
    expect(s.p50).toBe(50);
  });

  it('p95 computation works correctly', () => {
    for (let i = 1; i <= 20; i++) {
      store.accumulate(
        'ep1',
        makeSample({ timestamp: BASE_TS + i * 100, latency: i * 10, status: 'ok' })
      );
    }
    const s = store.getSummaries('ep1')[0];
    // sorted: [10..200], p95 at ceil(0.95*20)=19 → index 18 → 190
    expect(s.p95).toBe(190);
  });

  it('p99 is clamped to max for small samples', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 50, status: 'ok' }));
    const s = store.getSummaries('ep1')[0];
    expect(s.p99).toBe(50);
  });

  it('getSummary returns single bucket by hourKey', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    const s = store.getSummary('ep1', HOUR_KEY);
    expect(s).toBeDefined();
    expect(s?.hourKey).toBe(HOUR_KEY);
  });

  it('getSummary returns undefined for unknown hourKey', () => {
    expect(store.getSummary('ep1', '2024-01-01T00')).toBeUndefined();
  });

  it('removeEndpoint removes only the specified endpoint', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    store.accumulate('ep2', makeSample({ timestamp: BASE_TS, latency: 200 }));
    store.removeEndpoint('ep1');
    expect(store.getSummaries('ep1')).toEqual([]);
    expect(store.getSummaries('ep2')).toHaveLength(1);
  });

  it('reset clears all data', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    store.accumulate('ep2', makeSample({ timestamp: BASE_TS, latency: 200 }));
    store.reset();
    expect(store.hasHistory).toBe(false);
    expect(store.getSummaries('ep1')).toEqual([]);
    expect(store.getSummaries('ep2')).toEqual([]);
  });

  it('jitter (variance) is non-negative', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100, status: 'ok' }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 1000, latency: 200, status: 'ok' }));
    const s = store.getSummaries('ep1')[0];
    expect(s.variance).toBeGreaterThanOrEqual(0);
  });

  it('min and max are 0 when all samples are errors', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 0, status: 'error' }));
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS + 100, latency: 0, status: 'error' }));
    const s = store.getSummaries('ep1')[0];
    expect(s.min).toBe(0);
    expect(s.max).toBe(0);
  });

  it('different endpoints have independent history', () => {
    store.accumulate('ep1', makeSample({ timestamp: BASE_TS, latency: 100 }));
    store.accumulate('ep2', makeSample({ timestamp: BASE_TS, latency: 200 }));
    store.accumulate('ep2', makeSample({ timestamp: BASE_TS + 500, latency: 300 }));
    expect(store.getSummaries('ep1')[0].count).toBe(1);
    expect(store.getSummaries('ep2')[0].count).toBe(2);
  });
});
