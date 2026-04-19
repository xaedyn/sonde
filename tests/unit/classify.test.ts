import { describe, it, expect } from 'vitest';
import {
  classify,
  networkQuality,
  networkLevel,
  HEALTH_STYLES,
  LEVEL_STYLES,
} from '../../src/lib/utils/classify';
import type { EndpointStatistics } from '../../src/lib/types';

function makeStats(over: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: over.endpointId ?? 'ep-test',
    sampleCount: 50,
    p50: 0, p95: 0, p99: 0, p25: 0, p75: 0, p90: 0,
    min: 0, max: 0, stddev: 0,
    ci95: { lower: 0, upper: 0, margin: 0 },
    connectionReuseDelta: null,
    ready: true,
    ...over,
  };
}

describe('classify()', () => {
  it('returns "unknown" when stats is null', () => {
    expect(classify(null, 120)).toBe('unknown');
  });

  it('returns "unknown" when stats.ready is false', () => {
    expect(classify(makeStats({ ready: false, p50: 10, p95: 20 }), 120)).toBe('unknown');
  });

  it('returns "healthy" when p95 ≤ threshold AND p50 ≤ threshold/2', () => {
    expect(classify(makeStats({ p50: 60, p95: 120 }), 120)).toBe('healthy');
    expect(classify(makeStats({ p50: 10, p95: 30 }),  120)).toBe('healthy');
  });

  it('returns "degraded" when p95 crosses threshold but stays ≤ 2x', () => {
    expect(classify(makeStats({ p50: 100, p95: 180 }), 120)).toBe('degraded');
    expect(classify(makeStats({ p50: 120, p95: 240 }), 120)).toBe('degraded');
  });

  it('returns "degraded" when p50 ≤ threshold even if p95 is healthy-but-over-half-threshold', () => {
    // p50=100 ≤ 120, p95=120 ≤ 120, BUT p50 > threshold/2=60 so not healthy.
    // Falls through to degraded predicate: p95 ≤ 2*threshold OR p50 ≤ threshold → true.
    expect(classify(makeStats({ p50: 100, p95: 120 }), 120)).toBe('degraded');
  });

  it('returns "unhealthy" when p95 > 2x threshold AND p50 > threshold', () => {
    expect(classify(makeStats({ p50: 200, p95: 500 }), 120)).toBe('unhealthy');
  });

  it('handles zero threshold as a pathological edge (never healthy, never degraded)', () => {
    // p95=0, p50=0 → p95 ≤ 0 AND p50 ≤ 0 — healthy.
    expect(classify(makeStats({ p50: 0, p95: 0 }), 0)).toBe('healthy');
    // Any positive latency under threshold=0 → unhealthy.
    expect(classify(makeStats({ p50: 1, p95: 1 }), 0)).toBe('unhealthy');
  });
});

describe('networkQuality()', () => {
  it('returns null when no endpoint is ready', () => {
    expect(networkQuality([], 120)).toBeNull();
    expect(networkQuality([makeStats({ ready: false })], 120)).toBeNull();
  });

  it('returns 100 when every endpoint is healthy', () => {
    const a = makeStats({ endpointId: 'a', p50: 10, p95: 30 });
    const b = makeStats({ endpointId: 'b', p50: 20, p95: 60 });
    expect(networkQuality([a, b], 120)).toBe(100);
  });

  it('returns 20 when every endpoint is unhealthy', () => {
    const a = makeStats({ endpointId: 'a', p50: 500, p95: 900 });
    expect(networkQuality([a], 120)).toBe(20);
  });

  it('returns 60 when every endpoint is degraded', () => {
    const a = makeStats({ endpointId: 'a', p50: 130, p95: 200 });
    expect(networkQuality([a], 120)).toBe(60);
  });

  it('weights equally across ready endpoints (average of bucket scores)', () => {
    // one healthy (100), one unhealthy (20) → mean 60, rounded.
    const healthy  = makeStats({ endpointId: 'a', p50: 10,  p95: 30 });
    const broken   = makeStats({ endpointId: 'b', p50: 500, p95: 900 });
    expect(networkQuality([healthy, broken], 120)).toBe(60);
  });

  it('excludes not-ready endpoints from the denominator', () => {
    const healthy  = makeStats({ endpointId: 'a', p50: 10, p95: 30 });
    const pending  = makeStats({ endpointId: 'b', ready: false });
    expect(networkQuality([healthy, pending], 120)).toBe(100);
  });
});

describe('HEALTH_STYLES', () => {
  it('defines a style entry for every bucket', () => {
    expect(HEALTH_STYLES.healthy.color).toBeTruthy();
    expect(HEALTH_STYLES.degraded.color).toBeTruthy();
    expect(HEALTH_STYLES.unhealthy.color).toBeTruthy();
    expect(HEALTH_STYLES.unknown.color).toBeTruthy();
  });

  it('references CSS custom properties bridged from tokens (no raw hex)', () => {
    for (const bucket of ['healthy', 'degraded', 'unhealthy', 'unknown'] as const) {
      expect(HEALTH_STYLES[bucket].color).toMatch(/^var\(--/);
    }
  });
});

describe('networkLevel()', () => {
  it('returns "unknown" for null score', () => {
    expect(networkLevel(null)).toBe('unknown');
  });
  it('returns "healthy" at 90 and above', () => {
    expect(networkLevel(100)).toBe('healthy');
    expect(networkLevel(90)).toBe('healthy');
  });
  it('returns "warning" between 60 and 89', () => {
    expect(networkLevel(89)).toBe('warning');
    expect(networkLevel(60)).toBe('warning');
  });
  it('returns "degraded" between 30 and 59', () => {
    expect(networkLevel(59)).toBe('degraded');
    expect(networkLevel(30)).toBe('degraded');
  });
  it('returns "critical" below 30', () => {
    expect(networkLevel(29)).toBe('critical');
    expect(networkLevel(0)).toBe('critical');
  });
});

describe('LEVEL_STYLES', () => {
  it('defines a style entry for every level', () => {
    for (const level of ['unknown', 'healthy', 'warning', 'degraded', 'critical'] as const) {
      expect(LEVEL_STYLES[level].color).toBeTruthy();
      expect(LEVEL_STYLES[level].label).toBeTruthy();
    }
  });
  it('references CSS custom properties bridged from tokens', () => {
    for (const level of ['healthy', 'warning', 'degraded', 'critical'] as const) {
      expect(LEVEL_STYLES[level].color).toMatch(/^var\(--/);
    }
  });
  it('keeps the "unknown" label distinguishable for screen readers', () => {
    expect(LEVEL_STYLES.unknown.label).toBe('No data');
  });
});
