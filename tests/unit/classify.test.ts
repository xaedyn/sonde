import { describe, it, expect } from 'vitest';
import { classify, networkQuality, HEALTH_STYLES } from '../../src/lib/utils/classify';
import type { EndpointStatistics } from '../../src/lib/types';

function mkStats(overrides: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: 'ep-1',
    sampleCount: 30,
    p50: 50,
    p95: 100,
    p99: 120,
    p25: 40,
    p75: 80,
    p90: 90,
    min: 10,
    max: 150,
    stddev: 15,
    ci95: { lower: 45, upper: 55, margin: 5 },
    connectionReuseDelta: null,
    ready: true,
    ...overrides,
  };
}

describe('classify — health bucket', () => {
  it('returns "unknown" when stats is null', () => {
    expect(classify(null, 120)).toBe('unknown');
  });

  it('returns "unknown" when stats.ready is false', () => {
    expect(classify(mkStats({ ready: false }), 120)).toBe('unknown');
  });

  it('returns "healthy" when p95 <= threshold AND p50 <= threshold/2', () => {
    // threshold=120: healthy band is p95<=120 AND p50<=60
    expect(classify(mkStats({ p50: 50, p95: 100 }), 120)).toBe('healthy');
    expect(classify(mkStats({ p50: 60, p95: 120 }), 120)).toBe('healthy'); // boundary
  });

  it('returns "degraded" when p95 > threshold but <= 2*threshold', () => {
    // p95=150, threshold=120 → 150 <= 240 → degraded
    expect(classify(mkStats({ p50: 80, p95: 150 }), 120)).toBe('degraded');
    expect(classify(mkStats({ p50: 50, p95: 240 }), 120)).toBe('degraded'); // boundary
  });

  it('returns "degraded" when p50 <= threshold but p95 > 2*threshold (OR branch)', () => {
    // p50=100 (<= 120) qualifies degraded even though p95 is very high
    expect(classify(mkStats({ p50: 100, p95: 500 }), 120)).toBe('degraded');
  });

  it('returns "degraded" when p50 is between threshold/2 and threshold (healthy p95 but elevated median)', () => {
    // p95=100<=120 but p50=80 > 60 → not healthy. 100<=240 → degraded branch.
    expect(classify(mkStats({ p50: 80, p95: 100 }), 120)).toBe('degraded');
  });

  it('returns "unhealthy" when p95 > 2*threshold AND p50 > threshold', () => {
    expect(classify(mkStats({ p50: 200, p95: 500 }), 120)).toBe('unhealthy');
  });

  it('treats missing p50/p95 as Infinity → unhealthy', () => {
    // Ready but no percentiles — pathological but must not throw.
    const stats = mkStats({ p50: undefined as unknown as number, p95: undefined as unknown as number });
    expect(classify(stats, 120)).toBe('unhealthy');
  });
});

describe('networkQuality — aggregate score', () => {
  it('returns null when no endpoints are supplied', () => {
    expect(networkQuality([], 120)).toBeNull();
  });

  it('returns null when no endpoint is ready', () => {
    expect(networkQuality([mkStats({ ready: false }), mkStats({ ready: false })], 120)).toBeNull();
  });

  it('excludes not-ready endpoints from the denominator', () => {
    const score = networkQuality(
      [mkStats({ p50: 50, p95: 100 }), mkStats({ ready: false })],
      120,
    );
    expect(score).toBe(100);
  });

  it('all healthy → 100', () => {
    expect(networkQuality([mkStats(), mkStats(), mkStats()], 120)).toBe(100);
  });

  it('all unhealthy → 20', () => {
    const bad = mkStats({ p50: 500, p95: 1000 });
    expect(networkQuality([bad, bad], 120)).toBe(20);
  });

  it('mix healthy + unhealthy → weighted average rounded', () => {
    // 1 healthy (100) + 1 unhealthy (20) = 120/2 = 60
    expect(networkQuality([mkStats(), mkStats({ p50: 500, p95: 1000 })], 120)).toBe(60);
  });

  it('degraded contributes 60 to the aggregate', () => {
    expect(networkQuality([mkStats({ p50: 80, p95: 150 })], 120)).toBe(60);
  });
});

describe('HEALTH_STYLES — every bucket has a style entry', () => {
  it('covers healthy, degraded, unhealthy, unknown', () => {
    expect(HEALTH_STYLES.healthy).toBeDefined();
    expect(HEALTH_STYLES.degraded).toBeDefined();
    expect(HEALTH_STYLES.unhealthy).toBeDefined();
    expect(HEALTH_STYLES.unknown).toBeDefined();
  });

  it('each style exposes color, glow, label, tone', () => {
    for (const key of ['healthy', 'degraded', 'unhealthy', 'unknown'] as const) {
      const style = HEALTH_STYLES[key];
      expect(typeof style.color).toBe('string');
      expect(typeof style.glow).toBe('string');
      expect(typeof style.label).toBe('string');
      expect(typeof style.tone).toBe('string');
      expect(style.label.length).toBeGreaterThan(0);
    }
  });
});
