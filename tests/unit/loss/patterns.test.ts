import { describe, expect, it } from 'vitest';

import { classifyLossPattern } from '../../../src/lib/loss/patterns';
import type { MeasurementSample } from '../../../src/lib/types';

const ok = (round: number): MeasurementSample => ({
  round,
  latency: 40,
  status: 'ok',
  timestamp: round,
});

const timeout = (round: number): MeasurementSample => ({
  round,
  latency: 5000,
  status: 'timeout',
  timestamp: round,
});

describe('classifyLossPattern', () => {
  it('returns insufficient data for short runs', () => {
    expect(classifyLossPattern([ok(1), timeout(2)])).toMatchObject({
      kind: 'insufficient-data',
      failedCount: 1,
      totalCount: 2,
      safeSummary: 'More samples are needed before classifying failed requests.',
    });
  });

  it('reports no loss when every sample succeeds', () => {
    const samples = Array.from({ length: 12 }, (_, index) => ok(index + 1));

    expect(classifyLossPattern(samples)).toMatchObject({
      kind: 'none',
      failedCount: 0,
      totalCount: 12,
      safeSummary: 'No failed requests in this sample window.',
    });
  });

  it('classifies burst failures without implying cause', () => {
    const samples = [
      ok(1),
      ok(2),
      timeout(3),
      timeout(4),
      timeout(5),
      ok(6),
      ok(7),
      ok(8),
      ok(9),
      ok(10),
    ];

    expect(classifyLossPattern(samples)).toMatchObject({
      kind: 'burst',
      failedCount: 3,
      totalCount: 10,
      safeSummary: 'Failed requests are clustered in a short burst.',
    });
  });

  it('keeps duplicate failed rounds counted when classifying aggregate samples', () => {
    const samples = [
      ok(1),
      ok(2),
      timeout(3),
      timeout(3),
      timeout(4),
      timeout(4),
      timeout(5),
      timeout(5),
      ok(6),
      ok(7),
      ok(8),
      ok(9),
    ];

    expect(classifyLossPattern(samples)).toMatchObject({
      kind: 'burst',
      failedCount: 6,
      totalCount: 12,
      safeSummary: 'Failed requests are clustered in a short burst.',
    });
  });

  it('classifies periodic failures when gaps are regular', () => {
    const samples = Array.from({ length: 30 }, (_, index) =>
      (index + 1) % 5 === 0 ? timeout(index + 1) : ok(index + 1),
    );

    expect(classifyLossPattern(samples)).toMatchObject({
      kind: 'periodic',
      failedCount: 6,
      totalCount: 30,
      safeSummary: 'Failed requests appear at a repeating interval.',
    });
  });

  it('classifies scattered failures as random without guessing why', () => {
    const samples = Array.from({ length: 20 }, (_, index) =>
      [3, 9, 17].includes(index + 1) ? timeout(index + 1) : ok(index + 1),
    );

    expect(classifyLossPattern(samples)).toMatchObject({
      kind: 'random',
      failedCount: 3,
      totalCount: 20,
      safeSummary: 'Failed requests are scattered across the sample window.',
    });
  });
});
