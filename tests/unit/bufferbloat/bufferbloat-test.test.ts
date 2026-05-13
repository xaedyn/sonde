import { describe, expect, it } from 'vitest';

import { gradeBufferbloat } from '../../../src/lib/bufferbloat/bufferbloat-test';

describe('gradeBufferbloat', () => {
  it('returns insufficient data until both idle and loaded medians exist', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: null })).toMatchObject({
      grade: 'insufficient-data',
      deltaMs: null,
      summary: 'Run idle and loaded checks before grading loaded latency.',
    });
  });

  it('grades low latency increase as clean', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: 42 })).toMatchObject({
      grade: 'clean',
      deltaMs: 12,
      summary: 'Latency rose by 12 ms during download load.',
    });
  });

  it('grades moderate latency increase as watch evidence', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: 85 })).toMatchObject({
      grade: 'watch',
      deltaMs: 55,
      summary: 'Latency rose by 55 ms during download load.',
    });
  });

  it('grades high latency increase as loaded-latency evidence', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: 180 })).toMatchObject({
      grade: 'loaded-latency-high',
      deltaMs: 150,
      summary: 'Latency rose by 150 ms during download load.',
    });
  });

  it('does not report a negative rise when loaded latency is lower', () => {
    expect(gradeBufferbloat({ idleMedianMs: 30, loadedMedianMs: 24 })).toMatchObject({
      grade: 'clean',
      deltaMs: 0,
      summary: 'Latency rose by 0 ms during download load.',
    });
  });
});
