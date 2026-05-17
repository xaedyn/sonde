// src/lib/utils/distribution-interpretation.ts
// Pure helper that turns a focused endpoint's recent OK latency samples into
// a plain-English interpretation of the distribution shape. The synthesis
// design contract requires this as the "what does the histogram actually
// mean" copy on the EndpointDetail surface (Arc C C5 / cohesiveness gap B7).
//
// The interpretation is intentionally narrow — five buckets, each with copy
// that names the endpoint (so the same module powers headline highlighting
// downstream) and quotes real measurements rather than hand-waved adjectives.
//
// All thresholds are explicit and documented inline; do not adjust without
// re-running the unit-test suite (`distribution-interpretation.test.ts`).

import type { MeasurementSample } from '../types';

export type DistributionInterpretationKind =
  | 'insufficient-data'
  | 'unimodal-tight'
  | 'unimodal-wide'
  | 'bimodal'
  | 'tail-spikes';

export interface DistributionInterpretation {
  readonly kind: DistributionInterpretationKind;
  readonly headline: string;
  readonly detail: string;
}

export interface DistributionInterpretationInput {
  readonly endpointLabel: string;
  readonly samples: readonly MeasurementSample[];
}

// Distribution-shape thresholds. Tuned for the typical 8-50 sample window the
// focused-endpoint panel surfaces; values are documented so the interpretation
// boundaries are reviewable without spelunking through git blame.
const MIN_SAMPLES = 8;
const TIGHT_SPREAD_RATIO = 0.25; // spreadDelta / p50 — below ⇒ clustered tightly
const WIDE_SPREAD_RATIO = 0.60;  // spreadDelta / p50 — above ⇒ wide spread (bimodal candidate)
const TAIL_SPIKE_FACTOR = 3;     // outlier ≥ TAIL_SPIKE_FACTOR × p50
const TAIL_SPIKE_MAX_SHARE = 0.20; // outliers must be ≤ 20 % of samples to count as tail (not a true second mode)

function okLatencies(samples: readonly MeasurementSample[]): number[] {
  const oks: number[] = [];
  for (const sample of samples) {
    if (sample.status !== 'ok') continue;
    if (!Number.isFinite(sample.latency) || sample.latency < 0) continue;
    oks.push(sample.latency);
  }
  return oks;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] as number;
  const clamped = Math.max(0, Math.min(1, p));
  const idx = clamped * (sorted.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low] as number;
  const frac = idx - low;
  return (sorted[low] as number) * (1 - frac) + (sorted[high] as number) * frac;
}

function round(value: number): number {
  return Math.round(value);
}

export function interpretDistribution(
  input: DistributionInterpretationInput,
): DistributionInterpretation {
  const { endpointLabel, samples } = input;
  const oks = okLatencies(samples);

  if (oks.length < MIN_SAMPLES) {
    return {
      kind: 'insufficient-data',
      headline: 'Not enough successful checks to characterize the distribution.',
      detail: `Collect at least ${MIN_SAMPLES} successful checks (currently ${oks.length}) to see this endpoint's typical spread.`,
    };
  }

  const sorted = [...oks].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const max = sorted[sorted.length - 1] as number;

  // Tail detection — large outliers above ≥ TAIL_SPIKE_FACTOR × p50 but only
  // a small share of the samples. A true second mode (bimodal) needs more
  // than TAIL_SPIKE_MAX_SHARE of samples in the upper cluster.
  const tailThreshold = p50 * TAIL_SPIKE_FACTOR;
  const tailSamples = sorted.filter((value) => value >= tailThreshold);
  const tailShare = tailSamples.length / sorted.length;

  // Spread ratio guards the "tight" / "wide" branching. Using p50 in the
  // denominator means a 5 ms median + 1 ms tail difference is "tight"
  // while a 200 ms median + 60 ms tail difference is "wide" — the ratio
  // matches what users perceive at very different latency scales.
  const spreadDelta = p95 - p50;
  const spreadRatio = p50 > 0 ? spreadDelta / p50 : 0;

  if (tailSamples.length > 0 && tailShare <= TAIL_SPIKE_MAX_SHARE) {
    const sharePercent = Math.round(tailShare * 100);
    return {
      kind: 'tail-spikes',
      headline: `${endpointLabel} mostly runs fast, with occasional spikes.`,
      detail: `${sharePercent}% of checks spike to ${round(tailThreshold)} ms or higher (max ${round(max)} ms); the rest cluster near ${round(p50)} ms.`,
    };
  }

  if (spreadRatio > WIDE_SPREAD_RATIO) {
    // Wide enough that the distribution is split rather than one fuzzy peak.
    const lowerHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const upperHalf = sorted.slice(Math.floor(sorted.length / 2));
    const lowerCenter = percentile(lowerHalf, 0.5);
    const upperCenter = percentile(upperHalf, 0.5);
    return {
      kind: 'bimodal',
      headline: `${endpointLabel}'s latency is split between two response times.`,
      detail: `Two clusters: one near ${round(lowerCenter)} ms and another near ${round(upperCenter)} ms — investigate what conditions trigger each.`,
    };
  }

  if (spreadRatio < TIGHT_SPREAD_RATIO) {
    return {
      kind: 'unimodal-tight',
      headline: `${endpointLabel}'s latency is consistent.`,
      detail: `Most checks land near ${round(p50)} ms (p95 ${round(p95)} ms) with little spread.`,
    };
  }

  return {
    kind: 'unimodal-wide',
    headline: `${endpointLabel}'s latency varies but stays unimodal.`,
    detail: `Spread is wider than typical (p50 ${round(p50)} ms, p95 ${round(p95)} ms) but there is a single broad cluster, not two distinct ones.`,
  };
}
