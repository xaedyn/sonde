import type { MeasurementSample } from '../types';

export type LossPatternKind = 'none' | 'insufficient-data' | 'random' | 'burst' | 'periodic';

export interface LossPattern {
  readonly kind: LossPatternKind;
  readonly failedCount: number;
  readonly totalCount: number;
  readonly safeSummary: string;
}

const MINIMUM_CLASSIFICATION_SAMPLES = 10;
const MINIMUM_PERIODIC_FAILURES = 4;
const MINIMUM_BURST_LENGTH = 3;
const PERIODIC_GAP_TOLERANCE = 1;

export function classifyLossPattern(samples: readonly MeasurementSample[]): LossPattern {
  const failedSamples = samples.filter((sample) => sample.status !== 'ok');
  const failedRounds = [...new Set(failedSamples.map((sample) => sample.round))]
    .sort((left, right) => left - right);

  if (samples.length < MINIMUM_CLASSIFICATION_SAMPLES) {
    return {
      kind: 'insufficient-data',
      failedCount: failedSamples.length,
      totalCount: samples.length,
      safeSummary: 'More samples are needed before classifying failed requests.',
    };
  }

  if (failedRounds.length === 0) {
    return {
      kind: 'none',
      failedCount: 0,
      totalCount: samples.length,
      safeSummary: 'No failed requests in this sample window.',
    };
  }

  if (longestConsecutiveRun(failedRounds) >= MINIMUM_BURST_LENGTH) {
    return {
      kind: 'burst',
      failedCount: failedSamples.length,
      totalCount: samples.length,
      safeSummary: 'Failed requests are clustered in a short burst.',
    };
  }

  if (hasRegularFailureGap(failedRounds)) {
    return {
      kind: 'periodic',
      failedCount: failedSamples.length,
      totalCount: samples.length,
      safeSummary: 'Failed requests appear at a repeating interval.',
    };
  }

  return {
    kind: 'random',
    failedCount: failedSamples.length,
    totalCount: samples.length,
    safeSummary: 'Failed requests are scattered across the sample window.',
  };
}

function longestConsecutiveRun(rounds: readonly number[]): number {
  let longest = 0;
  let current = 0;
  let previousRound: number | null = null;

  for (const round of rounds) {
    if (previousRound !== null && round === previousRound + 1) {
      current += 1;
    } else {
      current = 1;
    }

    longest = Math.max(longest, current);
    previousRound = round;
  }

  return longest;
}

function hasRegularFailureGap(rounds: readonly number[]): boolean {
  if (rounds.length < MINIMUM_PERIODIC_FAILURES) {
    return false;
  }

  const gaps = rounds.slice(1).map((round, index) => round - rounds[index]);
  const referenceGap = gaps[0];

  return gaps.every((gap) => Math.abs(gap - referenceGap) <= PERIODIC_GAP_TOLERANCE);
}
