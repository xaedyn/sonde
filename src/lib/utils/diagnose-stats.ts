// src/lib/utils/diagnose-stats.ts
// Pure helpers for the Diagnose view's distribution + cross-endpoint
// correlation panels. No store imports, no DOM, no side effects.

import type { MeasurementSample } from '../types';

// ── Histogram ────────────────────────────────────────────────────────────────

export interface HistogramBin {
  /** Lower edge of the bin in milliseconds, inclusive. */
  readonly fromMs: number;
  /** Upper edge of the bin in milliseconds, exclusive (except the last bin). */
  readonly toMs: number;
  /** Number of samples that fell into this bin. */
  readonly count: number;
}

export interface Histogram {
  readonly bins: readonly HistogramBin[];
  /** Highest bin count — for normalising bar heights at the call site. */
  readonly maxCount: number;
  /** Total OK-status samples that contributed to the histogram. */
  readonly total: number;
}

/**
 * Build a fixed-bin-count histogram of OK-status sample latencies. Returns
 * empty bins when there are fewer than two distinct samples — a one-bar chart
 * carries no visual information so we degrade gracefully.
 */
export function buildHistogram(
  samples: readonly MeasurementSample[],
  binCount = 10,
): Histogram {
  const oks: number[] = [];
  for (const s of samples) {
    if (s.status === 'ok' && typeof s.latency === 'number') oks.push(s.latency);
  }
  if (oks.length < 2) return { bins: [], maxCount: 0, total: oks.length };

  const min = Math.min(...oks);
  const max = Math.max(...oks);
  if (max === min) return { bins: [], maxCount: 0, total: oks.length };

  const span = max - min;
  const step = span / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const fromMs = min + step * i;
    const toMs = i === binCount - 1 ? max : min + step * (i + 1);
    let count = 0;
    for (const v of oks) {
      // Last bin is inclusive on the upper edge so max-valued samples land somewhere.
      if (i === binCount - 1 ? v >= fromMs && v <= toMs : v >= fromMs && v < toMs) count++;
    }
    bins.push({ fromMs, toMs, count });
  }
  let maxCount = 0;
  for (const b of bins) if (b.count > maxCount) maxCount = b.count;
  return { bins, maxCount, total: oks.length };
}

// ── Cross-endpoint correlation ───────────────────────────────────────────────

export interface CorrelationCell {
  readonly round: number;
  /** Latency in ms, or null when no sample landed for that endpoint+round. */
  readonly latencyMs: number | null;
  /** True when this endpoint's latency in this round is a spike for it. */
  readonly isSpike: boolean;
}

export interface CorrelationRow {
  readonly endpointId: string;
  readonly label: string;
  readonly cells: readonly CorrelationCell[];
}

export interface CorrelationVerdict {
  readonly headline: string;
  /** Spike rounds in the focused endpoint's window. */
  readonly focusedSpikeRounds: readonly number[];
  /**
   * For each focused-endpoint spike round, the count of OTHER endpoints that
   * also spiked in that same round. Same length as `focusedSpikeRounds`.
   */
  readonly otherSpikesPerFocusedSpike: readonly number[];
}

export interface CorrelationInput {
  readonly id: string;
  readonly label: string;
  readonly samples: readonly MeasurementSample[];
}

/**
 * Spike threshold: a sample is a spike when it exceeds 1.5× the endpoint's
 * own median over the window. We use median-relative rather than absolute
 * thresholds so endpoints with naturally-different baselines are compared on
 * the same footing.
 */
const SPIKE_FACTOR = 1.5;

/**
 * Minimum OK sample count before spike detection produces meaningful results.
 * Below this, the median is too noisy for the 1.5× threshold to be reliable —
 * a fresh endpoint with 2 samples could see its second sample marked a spike
 * just because the first one was unusually low. Surface "still learning" in
 * the verdict instead of mis-flagging early variance.
 */
const MIN_SAMPLES_FOR_SPIKE = 8;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const a = sorted[mid - 1] ?? 0;
    const b = sorted[mid] ?? 0;
    return (a + b) / 2;
  }
  return sorted[mid] ?? 0;
}

function buildCells(
  samples: readonly MeasurementSample[],
  rounds: readonly number[],
  endpointMedian: number,
  okSampleCount: number,
): CorrelationCell[] {
  const byRound = new Map<number, MeasurementSample>();
  for (const s of samples) byRound.set(s.round, s);
  // Skip spike detection entirely until we have enough OK samples for the
  // median-relative threshold to be reliable. Without this guard, an endpoint
  // with 2 samples [40, 65] would produce median=52.5 and flag any 80ms+
  // sample as a "spike" — wild call from a 2-point baseline.
  const spikesEnabled = okSampleCount >= MIN_SAMPLES_FOR_SPIKE;
  return rounds.map((round) => {
    const s = byRound.get(round);
    if (!s || s.status !== 'ok' || typeof s.latency !== 'number') {
      return { round, latencyMs: null, isSpike: false };
    }
    const isSpike = spikesEnabled && endpointMedian > 0 && s.latency > endpointMedian * SPIKE_FACTOR;
    return { round, latencyMs: s.latency, isSpike };
  });
}

/**
 * Build the per-round correlation grid for the focused endpoint (first input)
 * and all comparison endpoints (rest). Window covers the most recent
 * `windowRounds` rounds across the union of all inputs.
 *
 * Returns the grid + a one-line verdict explaining whether the focused
 * endpoint's spikes correlate with others (network-wide) or are isolated
 * (endpoint-specific).
 */
export function buildCorrelation(
  focused: CorrelationInput,
  others: readonly CorrelationInput[],
  windowRounds = 16,
): { rows: readonly CorrelationRow[]; verdict: CorrelationVerdict } {
  // Determine the round window: the highest `windowRounds` round values across
  // all endpoints, oldest-first.
  const allRounds = new Set<number>();
  for (const ep of [focused, ...others]) for (const s of ep.samples) allRounds.add(s.round);
  const rounds = [...allRounds].sort((a, b) => a - b).slice(-windowRounds);

  const focusedOks: number[] = [];
  for (const s of focused.samples) {
    if (s.status === 'ok' && typeof s.latency === 'number') focusedOks.push(s.latency);
  }
  const focusedMedian = median(focusedOks);

  const focusedRow: CorrelationRow = {
    endpointId: focused.id,
    label: focused.label,
    cells: buildCells(focused.samples, rounds, focusedMedian, focusedOks.length),
  };
  const otherRows: CorrelationRow[] = others.map((ep) => {
    const oks: number[] = [];
    for (const s of ep.samples) {
      if (s.status === 'ok' && typeof s.latency === 'number') oks.push(s.latency);
    }
    return {
      endpointId: ep.id,
      label: ep.label,
      cells: buildCells(ep.samples, rounds, median(oks), oks.length),
    };
  });

  // Verdict: for each spike on the focused row, count how many *known* (non-null)
  // comparators also spiked. Treating a null cell as "did not spike" silently
  // misclassifies network-wide events: when comparators time out alongside the
  // focused endpoint, their cells are null and the verdict drifts toward
  // "isolated" — the opposite of the truth.
  const focusedSpikeRounds: number[] = [];
  const otherSpikesPerFocusedSpike: number[] = [];
  const knownComparatorsPerSpike: number[] = [];
  for (let i = 0; i < focusedRow.cells.length; i++) {
    const focusedCell = focusedRow.cells[i];
    if (!focusedCell || !focusedCell.isSpike) continue;
    focusedSpikeRounds.push(focusedCell.round);
    let coCount = 0;
    let knownCount = 0;
    for (const row of otherRows) {
      const cell = row.cells[i];
      if (cell?.latencyMs !== null && cell?.latencyMs !== undefined) knownCount++;
      if (cell?.isSpike) coCount++;
    }
    otherSpikesPerFocusedSpike.push(coCount);
    knownComparatorsPerSpike.push(knownCount);
  }

  // Count of focused-row cells that landed within the visible window with a
  // known (non-null) latency. This is distinct from `focusedOks.length` (which
  // counts OK samples across the full history): if the user paused the run
  // and resumed against a different endpoint, the focused endpoint may have
  // OK samples in its history but zero known cells in the current window.
  // Gating "steady" on this count prevents the verdict from claiming health
  // for a window where focused produced no data at all.
  const focusedKnownInWindow = focusedRow.cells.filter(c => c.latencyMs !== null).length;

  const headline = correlationHeadline({
    focusedLabel: focused.label,
    focusedOksCount: focusedOks.length,
    focusedKnownInWindow,
    focusedSpikeCount: focusedSpikeRounds.length,
    otherSpikesPerFocusedSpike,
    knownComparatorsPerSpike,
    otherCount: otherRows.length,
  });

  return {
    rows: [focusedRow, ...otherRows],
    verdict: { headline, focusedSpikeRounds, otherSpikesPerFocusedSpike },
  };
}

interface HeadlineInput {
  readonly focusedLabel: string;
  readonly focusedOksCount: number;
  /**
   * Count of focused-row cells in the visible window with a non-null latency.
   * Distinct from focusedOksCount, which spans the full sample history.
   * Used to catch the case where focused has OK samples in history but zero
   * known data in the current window (so calling it "steady" would be wrong).
   */
  readonly focusedKnownInWindow: number;
  readonly focusedSpikeCount: number;
  readonly otherSpikesPerFocusedSpike: readonly number[];
  /**
   * For each focused-spike round, how many comparator endpoints had a known
   * (non-null) value in that round. Used to gate the shared/isolated verdict
   * on whether the panel actually has enough comparator coverage to call it.
   */
  readonly knownComparatorsPerSpike: readonly number[];
  readonly otherCount: number;
}

function correlationHeadline(input: HeadlineInput): string {
  const {
    focusedLabel,
    focusedOksCount,
    focusedKnownInWindow,
    focusedSpikeCount,
    otherSpikesPerFocusedSpike,
    knownComparatorsPerSpike,
    otherCount,
  } = input;

  // Confidence gates — branch on data quality first so we never produce a
  // confident-sounding verdict from inadequate data.
  if (otherCount === 0) {
    return `Add other endpoints to compare ${focusedLabel} against.`;
  }
  if (focusedOksCount === 0) {
    return `${focusedLabel} has no successful samples to compare — check the timeline for failures.`;
  }
  if (focusedKnownInWindow === 0) {
    // History has OK samples but the current window is empty for this endpoint.
    // Don't claim "steady" — we have no recent data to back it.
    return `No recent samples for ${focusedLabel} in this window — comparator data shown for context.`;
  }
  if (focusedOksCount < MIN_SAMPLES_FOR_SPIKE) {
    return `Still learning ${focusedLabel}'s baseline — ${focusedOksCount} of ${MIN_SAMPLES_FOR_SPIKE} samples.`;
  }
  if (focusedSpikeCount === 0) {
    return `${focusedLabel} has been steady — no notable spikes in this window.`;
  }

  // For each focused-spike round, decide whether comparators give us enough
  // coverage to make a shared/isolated call. A spike round with < 2 known
  // comparators is "inconclusive" — we don't know what the others were doing.
  const MIN_COMPARATORS_FOR_VERDICT = 2;
  const sharedThreshold = Math.ceil(otherCount / 2);
  let shared = 0;
  let conclusiveSpikes = 0;
  for (let i = 0; i < focusedSpikeCount; i++) {
    if ((knownComparatorsPerSpike[i] ?? 0) < MIN_COMPARATORS_FOR_VERDICT) continue;
    conclusiveSpikes++;
    if ((otherSpikesPerFocusedSpike[i] ?? 0) >= sharedThreshold) shared++;
  }

  if (conclusiveSpikes === 0) {
    // All spike rounds had comparator gaps — we can't make a network/site call.
    return `Spikes detected on ${focusedLabel}, but comparator data is sparse — try running for longer to compare.`;
  }

  const sharedPct = shared / conclusiveSpikes;
  if (sharedPct >= 0.6) {
    return 'Spikes happen across multiple sites at once — likely your network or local infrastructure.';
  }
  if (sharedPct <= 0.2) {
    return `Spikes are isolated to ${focusedLabel} — likely that site or its origin, not your connection.`;
  }
  return `Spikes are mixed — sometimes shared with other sites, sometimes ${focusedLabel}-specific.`;
}
