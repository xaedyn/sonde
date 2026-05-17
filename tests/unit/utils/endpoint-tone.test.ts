import { describe, it, expect } from 'vitest';
import { deriveEndpointTone, type EndpointTone } from '../../../src/lib/utils/endpoint-tone';
import type { EndpointStatistics, SampleStatus } from '../../../src/lib/types';

// Test factory matching the EndpointStatistics shape used by the production
// store. We pass through only the fields deriveEndpointTone reads (ready,
// p95, stddev, lossPercent) and stub the rest with zero/empty defaults.
type StatsOverride = Partial<Pick<EndpointStatistics, 'ready' | 'p95' | 'stddev' | 'lossPercent'>>;

function makeStats(over: StatsOverride): EndpointStatistics {
  return {
    endpointId: 'e1',
    sampleCount: 12,
    p50: 50,
    p95: over.p95 ?? 80,
    p99: 100,
    p25: 40,
    p75: 70,
    p90: 85,
    min: 30,
    max: 120,
    stddev: over.stddev ?? 5,
    ci95: { lower: 45, upper: 55 },
    connectionReuseDelta: null,
    lossPercent: over.lossPercent ?? 0,
    ready: over.ready ?? true,
  };
}

const DEFAULT_THRESHOLD = 120;

describe('deriveEndpointTone', () => {
  describe('rule 1: bad (timeout / error / loss >= 1%)', () => {
    it('returns bad when lastStatus is timeout', () => {
      const tone: EndpointTone = deriveEndpointTone({
        stats: makeStats({}),
        lastStatus: 'timeout',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('bad');
    });

    it('returns bad when lastStatus is error', () => {
      const tone: EndpointTone = deriveEndpointTone({
        stats: makeStats({}),
        lastStatus: 'error',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('bad');
    });

    it('returns bad when lossPercent >= 1 and stats are ready', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ lossPercent: 1.5 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('bad');
    });

    it('does NOT return bad when lossPercent >= 1 but stats not ready', () => {
      // ready=false would normally collecting, but lossPercent rule requires ready=true
      const tone = deriveEndpointTone({
        stats: makeStats({ ready: false, lossPercent: 5 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('collecting');
    });

    it('does NOT return bad when lossPercent === 0.9 (below 1% threshold)', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ lossPercent: 0.9 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('good');
    });
  });

  describe('rule 2: collecting (stats null OR not ready)', () => {
    it('returns collecting when stats is null', () => {
      const tone = deriveEndpointTone({
        stats: null,
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('collecting');
    });

    it('returns collecting when stats.ready is false', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ ready: false }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('collecting');
    });

    it('returns collecting when stats null AND lastStatus null', () => {
      const tone = deriveEndpointTone({
        stats: null,
        lastStatus: null,
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('collecting');
    });
  });

  describe('rule 3: watch (p95 over threshold OR high stddev)', () => {
    it('returns watch when p95 > healthThreshold', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ p95: 150 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('watch');
    });

    it('returns watch when stddev >= 25', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ stddev: 25 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('watch');
    });

    it('returns watch on the boundary (p95 exactly above threshold)', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ p95: 121 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('watch');
    });

    it('does NOT return watch when p95 === threshold exactly', () => {
      // Strict >, not >=
      const tone = deriveEndpointTone({
        stats: makeStats({ p95: 120 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('good');
    });

    it('does NOT return watch when stddev === 24 (just under threshold)', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ stddev: 24 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('good');
    });
  });

  describe('rule 4: good (none of the above)', () => {
    it('returns good for healthy ready stats with no recent failure', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ p95: 50, stddev: 5, lossPercent: 0 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('good');
    });

    it('returns good when lastStatus is null but stats are healthy and ready', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ p95: 50, stddev: 5, lossPercent: 0 }),
        lastStatus: null,
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('good');
    });
  });

  describe('precedence', () => {
    it('bad wins over watch (recent timeout AND high p95)', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ p95: 500, stddev: 100 }),
        lastStatus: 'timeout',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('bad');
    });

    it('bad wins over collecting (recent timeout on fresh endpoint)', () => {
      // The Round 5 review precedence case — a freshly-added endpoint that
      // immediately times out shows bad, not collecting.
      const tone = deriveEndpointTone({
        stats: null,
        lastStatus: 'timeout',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('bad');
    });

    it('bad wins over collecting (timeout AND stats not ready)', () => {
      const tone = deriveEndpointTone({
        stats: makeStats({ ready: false }),
        lastStatus: 'timeout',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('bad');
    });

    it('collecting wins over watch (not ready, high p95)', () => {
      // p95 high looks like watch, but ready=false short-circuits to collecting.
      const tone = deriveEndpointTone({
        stats: makeStats({ ready: false, p95: 500 }),
        lastStatus: 'ok',
        healthThreshold: DEFAULT_THRESHOLD,
      });
      expect(tone).toBe('collecting');
    });
  });

  describe('contract surface', () => {
    it('handles all SampleStatus values without throwing', () => {
      const statuses: (SampleStatus | null)[] = ['ok', 'timeout', 'error', null];
      for (const s of statuses) {
        expect(() => deriveEndpointTone({
          stats: makeStats({}),
          lastStatus: s,
          healthThreshold: DEFAULT_THRESHOLD,
        })).not.toThrow();
      }
    });

    it('exported type EndpointTone is one of four values', () => {
      const tone: EndpointTone = 'good';
      const allowed: EndpointTone[] = ['good', 'watch', 'bad', 'collecting'];
      expect(allowed).toContain(tone);
    });
  });
});
