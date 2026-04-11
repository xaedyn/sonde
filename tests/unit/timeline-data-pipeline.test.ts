import { describe, it, expect } from 'vitest';
import { prepareFrame, computeYRange, computeXTicks, normalizeLatency } from '../../src/lib/renderers/timeline-data-pipeline';
import type { MeasurementState, YRange } from '../../src/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMeasureState(
  endpointLatencies: Record<string, number[]>,
  overrides: Partial<MeasurementState> = {}
): MeasurementState {
  const endpoints: MeasurementState['endpoints'] = {};
  for (const [id, latencies] of Object.entries(endpointLatencies)) {
    endpoints[id] = {
      endpointId: id,
      samples: latencies.map((latency, i) => ({
        round: i + 1,
        latency,
        status: 'ok' as const,
        timestamp: Date.now() + i * 1000,
      })),
      lastLatency: latencies[latencies.length - 1] ?? null,
      lastStatus: 'ok',
      tierLevel: 1,
    };
  }
  return {
    lifecycle: 'running',
    epoch: 1,
    roundCounter: latencies_max(endpointLatencies),
    endpoints,
    startedAt: Date.now(),
    stoppedAt: null,
    freezeEvents: [],
    ...overrides,
  };
}

function latencies_max(endpointLatencies: Record<string, number[]>): number {
  return Math.max(0, ...Object.values(endpointLatencies).map(arr => arr.length));
}

// ── computeYRange ──────────────────────────────────────────────────────────

describe('computeYRange', () => {
  it('returns default range for empty input', () => {
    const yr = computeYRange([]);
    expect(yr.min).toBeGreaterThanOrEqual(0);
    expect(yr.max).toBeGreaterThan(yr.min);
    expect(yr.isLog).toBe(false);
    expect(yr.gridlines.length).toBeGreaterThan(0);
  });

  it('uses linear scale when P98/P2 ratio <= 50 (AC1)', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
    const yr = computeYRange(latencies);
    expect(yr.isLog).toBe(false);
  });

  it('uses log scale when P98/P2 ratio > 50 (AC1 — log branch)', () => {
    const latencies = [1, 2, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000];
    const yr = computeYRange(latencies);
    expect(yr.isLog).toBe(true);
  });

  it('linear range spans at least 10ms (minVisibleRangeMs)', () => {
    const yr = computeYRange([50, 50, 50, 50, 50]);
    expect(yr.max - yr.min).toBeGreaterThanOrEqual(10);
  });

  it('linear range includes P2–P98 values within visible area', () => {
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
    const yr = computeYRange(latencies);
    const normP2 = normalizeLatency(2, yr);
    const normP98 = normalizeLatency(98, yr);
    expect(normP2).toBeGreaterThanOrEqual(0);
    expect(normP98).toBeLessThanOrEqual(1);
  });

  it('canvas utilization >= 60% for typical web latency dataset (AC1)', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
    const yr = computeYRange(latencies);
    const norms = latencies.map(l => normalizeLatency(l, yr));
    const spread = Math.max(...norms) - Math.min(...norms);
    expect(spread).toBeGreaterThanOrEqual(0.6);
  });

  it('generates gridlines within the visible range', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
    const yr = computeYRange(latencies);
    for (const g of yr.gridlines) {
      expect(g.normalizedY).toBeGreaterThanOrEqual(0);
      expect(g.normalizedY).toBeLessThanOrEqual(1);
      expect(g.label.length).toBeGreaterThan(0);
    }
  });

  it('gridlines have "s" suffix for >= 1000ms values', () => {
    const latencies = [100, 500, 1000, 2000, 5000, 10000];
    const yr = computeYRange(latencies);
    const secondsGridlines = yr.gridlines.filter(g => g.ms >= 1000);
    for (const g of secondsGridlines) {
      expect(g.label).toMatch(/s$/);
    }
  });

  it('gridlines have "ms" suffix for < 1000ms values', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
    const yr = computeYRange(latencies);
    const msGridlines = yr.gridlines.filter(g => g.ms < 1000);
    for (const g of msGridlines) {
      expect(g.label).toMatch(/ms$/);
    }
  });
});

// ── normalizeLatency ──────────────────────────────────────────────────────

describe('normalizeLatency', () => {
  it('returns 0 for min value in linear scale', () => {
    const yr: YRange = { min: 10, max: 110, isLog: false, gridlines: [] };
    expect(normalizeLatency(10, yr)).toBeCloseTo(0, 5);
  });

  it('returns 1 for max value in linear scale', () => {
    const yr: YRange = { min: 10, max: 110, isLog: false, gridlines: [] };
    expect(normalizeLatency(110, yr)).toBeCloseTo(1, 5);
  });

  it('clamps to 0 for values below range', () => {
    const yr: YRange = { min: 50, max: 150, isLog: false, gridlines: [] };
    expect(normalizeLatency(10, yr)).toBe(0);
  });

  it('clamps to 1 for values above range', () => {
    const yr: YRange = { min: 50, max: 150, isLog: false, gridlines: [] };
    expect(normalizeLatency(500, yr)).toBe(1);
  });

  it('maps log-scale correctly at midpoint', () => {
    const yr: YRange = { min: 1, max: 10000, isLog: true, gridlines: [] };
    const norm = normalizeLatency(100, yr);
    expect(norm).toBeCloseTo(0.5, 2);
  });
});

// ── computeXTicks ──────────────────────────────────────────────────────────

describe('computeXTicks', () => {
  it('returns empty array when maxRound <= 0', () => {
    expect(computeXTicks(0, 800)).toHaveLength(0);
    expect(computeXTicks(-1, 800)).toHaveLength(0);
  });

  it('always includes round 1 as first tick', () => {
    const ticks = computeXTicks(100, 800);
    expect(ticks[0]?.round).toBe(1);
  });

  it('always includes maxRound as last tick (when space permits)', () => {
    const ticks = computeXTicks(100, 800);
    const last = ticks[ticks.length - 1];
    expect(last?.round).toBe(100);
  });

  it('no overlapping labels at 375px width (AC4)', () => {
    const ticks = computeXTicks(200, 375);
    const minSpacing = 60;
    for (let i = 1; i < ticks.length; i++) {
      const prev = ticks[i - 1]!;
      const curr = ticks[i]!;
      const pixelDist = (curr.normalizedX - prev.normalizedX) * 375;
      expect(pixelDist).toBeGreaterThanOrEqual(minSpacing * 0.5);
    }
  });

  it('no overlapping labels at 800px width (AC4)', () => {
    const ticks = computeXTicks(1000, 800);
    const minSpacing = 60;
    for (let i = 1; i < ticks.length; i++) {
      const prev = ticks[i - 1]!;
      const curr = ticks[i]!;
      const pixelDist = (curr.normalizedX - prev.normalizedX) * 800;
      expect(pixelDist).toBeGreaterThanOrEqual(minSpacing * 0.5);
    }
  });

  it('tick labels are numeric strings', () => {
    const ticks = computeXTicks(50, 800);
    for (const tick of ticks) {
      expect(tick.label).toBe(String(tick.round));
    }
  });

  it('normalizedX is in [0, 1] for all ticks', () => {
    const ticks = computeXTicks(50, 800);
    for (const tick of ticks) {
      expect(tick.normalizedX).toBeGreaterThanOrEqual(0);
      expect(tick.normalizedX).toBeLessThanOrEqual(1);
    }
  });

  it('snaps to nice step values (not fractional steps)', () => {
    const ticks = computeXTicks(100, 800);
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const interior = ticks.slice(1, -1);
    if (interior.length > 1) {
      const step = interior[1]!.round - interior[0]!.round;
      expect(niceSteps.some(s => s === step)).toBe(true);
    }
  });
});

// ── prepareFrame ───────────────────────────────────────────────────────────

describe('prepareFrame', () => {
  it('returns hasData: false when no endpoints have samples', () => {
    const state = makeMeasureState({});
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    expect(result.hasData).toBe(false);
  });

  it('returns hasData: true when any endpoint has at least one sample (AC6)', () => {
    const state = makeMeasureState({ ep1: [50] });
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    expect(result.hasData).toBe(true);
  });

  it('returns empty pointsByEndpoint when hasData is false', () => {
    const state = makeMeasureState({});
    const result = prepareFrame([], state);
    expect(result.pointsByEndpoint.size).toBe(0);
  });

  it('produces ScatterPoint.y values in [0, 1] for all points', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
    const state = makeMeasureState({ ep1: latencies });
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    const points = result.pointsByEndpoint.get('ep1') ?? [];
    for (const pt of points) {
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(1);
    }
  });

  it('produces maxRound equal to highest round number across all endpoints', () => {
    const state = makeMeasureState({ ep1: Array(30).fill(50), ep2: Array(20).fill(100) });
    const endpoints = [
      { id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' },
      { id: 'ep2', url: 'https://b.com', enabled: true, label: 'B', color: '#e06c75' },
    ];
    const result = prepareFrame(endpoints, state);
    expect(result.maxRound).toBe(30);
  });

  it('passes freezeEvents through from measureState', () => {
    const state = makeMeasureState({ ep1: [50] });
    state.freezeEvents = [{ round: 5, at: Date.now(), gapMs: 2000 }];
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    expect(result.freezeEvents).toHaveLength(1);
  });

  it('benchmark: prepareFrame completes in reasonable time for 10 endpoints x 1000 samples (AC7)', () => {
    // AC7 target: <2ms in production browser. jsdom adds overhead for
    // typed-array operations and object allocation. We test <200ms here to
    // catch O(n²) regressions under CI load; real-browser performance is
    // validated via RenderScheduler's built-in frame budget monitor.
    const eps: Record<string, number[]> = {};
    const endpoints = [];
    for (let i = 0; i < 10; i++) {
      eps[`ep${i}`] = Array.from({ length: 1000 }, () => Math.random() * 500 + 10);
      endpoints.push({ id: `ep${i}`, url: `https://ep${i}.com`, enabled: true, label: `EP${i}`, color: '#4a90d9' });
    }
    const state = makeMeasureState(eps);

    const start = performance.now();
    prepareFrame(endpoints, state);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});

// ── ribbons (AC3) ──────────────────────────────────────────────────────────

describe('ribbons (AC3)', () => {
  function makeStateWithSamples(n: number, latency = 50): MeasurementState {
    const latencies = Array(n).fill(latency);
    return makeMeasureState({ ep1: latencies });
  }

  it('no ribbon when endpoint has fewer than 20 samples (AC3)', () => {
    const state = makeStateWithSamples(19);
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    expect(result.ribbonsByEndpoint.has('ep1')).toBe(false);
  });

  it('ribbon present when endpoint has exactly 20 samples (AC3)', () => {
    const state = makeStateWithSamples(20);
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    expect(result.ribbonsByEndpoint.has('ep1')).toBe(true);
  });

  it('ribbon present when endpoint has more than 20 samples (AC3)', () => {
    const state = makeStateWithSamples(50);
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    expect(result.ribbonsByEndpoint.has('ep1')).toBe(true);
  });

  it('RibbonData has p25Path, p50Path, p75Path of equal length', () => {
    const state = makeStateWithSamples(30);
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    const ribbon = result.ribbonsByEndpoint.get('ep1');
    expect(ribbon).toBeDefined();
    expect(ribbon!.p25Path.length).toBe(ribbon!.p50Path.length);
    expect(ribbon!.p50Path.length).toBe(ribbon!.p75Path.length);
  });

  it('P25 normalized Y <= P50 normalized Y <= P75 normalized Y', () => {
    const latencies = Array.from({ length: 30 }, (_, i) => 10 + i * 5);
    const state = makeMeasureState({ ep1: latencies });
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    const ribbon = result.ribbonsByEndpoint.get('ep1');
    expect(ribbon).toBeDefined();
    for (let i = 0; i < ribbon!.p25Path.length; i++) {
      const y25 = ribbon!.p25Path[i]![1];
      const y50 = ribbon!.p50Path[i]![1];
      const y75 = ribbon!.p75Path[i]![1];
      expect(y25).toBeLessThanOrEqual(y50 + 0.001);
      expect(y50).toBeLessThanOrEqual(y75 + 0.001);
    }
  });

  it('ribbon collapses to line when all latencies identical (zero variance)', () => {
    const state = makeStateWithSamples(25, 100);
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    const ribbon = result.ribbonsByEndpoint.get('ep1');
    if (ribbon) {
      for (let i = 0; i < ribbon.p25Path.length; i++) {
        expect(ribbon.p25Path[i]![1]).toBeCloseTo(ribbon.p50Path[i]![1], 5);
        expect(ribbon.p50Path[i]![1]).toBeCloseTo(ribbon.p75Path[i]![1], 5);
      }
    }
  });

  it('ribbon path X values match sample round numbers', () => {
    const state = makeStateWithSamples(25);
    const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
    const result = prepareFrame(endpoints, state);
    const ribbon = result.ribbonsByEndpoint.get('ep1');
    expect(ribbon).toBeDefined();
    for (const [x] of ribbon!.p50Path) {
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(20);
    }
  });
});
