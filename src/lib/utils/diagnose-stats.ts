// src/lib/utils/diagnose-stats.ts
// Pure helpers for the Diagnose view's distribution + cross-endpoint
// correlation panels. No store imports, no DOM, no side effects.

import type { MeasurementSample } from '../types';

// ── Histogram ────────────────────────────────────────────────────────────────

export interface HistogramBin {
  /**
   * Lower edge of the bin in milliseconds, inclusive. Bin slots come from a
   * fixed log schema, NOT from data — `fromMs` does not equal `min(samples)`.
   * The first bin uses `fromMs === 0` as a convention for downstream renderers,
   * but represents the open interval (-∞, toMs); display label is "<{toMs} ms".
   */
  readonly fromMs: number;
  /**
   * Upper edge of the bin in milliseconds, exclusive. The last bin uses
   * `toMs === Number.POSITIVE_INFINITY` and represents [fromMs, +∞);
   * display label is "≥{fromMs}". All other bins are half-open [fromMs, toMs).
   */
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

// Fixed 1-2-5 log-spaced bin edges. There are 11 bins total:
//   bin 0:  (-∞, 2)       fromMs=0, toMs=2         "<2 ms"
//   bin 1:  [2, 5)        fromMs=2, toMs=5          "2–5 ms"
//   bin 2:  [5, 10)       fromMs=5, toMs=10         "5–10 ms"
//   bin 3:  [10, 20)      fromMs=10, toMs=20        "10–20 ms"
//   bin 4:  [20, 50)      fromMs=20, toMs=50        "20–50 ms"
//   bin 5:  [50, 100)     fromMs=50, toMs=100       "50–100 ms"
//   bin 6:  [100, 200)    fromMs=100, toMs=200      "100–200 ms"
//   bin 7:  [200, 500)    fromMs=200, toMs=500      "200–500 ms"
//   bin 8:  [500, 1000)   fromMs=500, toMs=1000     "500–1000 ms"
//   bin 9:  [1000, 2000)  fromMs=1000, toMs=2000    "1–2 s"
//   bin 10: [2000, +∞)    fromMs=2000, toMs=+∞      "≥2 s"
const BIN_EDGES_MS = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const;

const ALL_BINS: ReadonlyArray<{ readonly fromMs: number; readonly toMs: number }> = [
  { fromMs: 0, toMs: 2 },
  ...BIN_EDGES_MS.slice(0, -1).map((from, i) => ({ fromMs: from, toMs: BIN_EDGES_MS[i + 1] as number })),
  { fromMs: 2000, toMs: Number.POSITIVE_INFINITY },
];

/**
 * Build a log-spaced histogram of OK-status sample latencies using a fixed
 * 1-2-5 bin schema with open-ended outer bins. Returns empty bins when there
 * are fewer than 2 distinct OK-status samples — a one-bar chart carries no
 * visual information, so we degrade gracefully.
 *
 * Outer empty bins are trimmed, leaving one padding bin per side when one
 * exists in the schema. Internal empty bins are preserved — the gap between
 * two clusters is the bimodal signal. Bin 0 and bin 10 are protected from
 * trim when they contain data.
 *
 * Filter: `Number.isFinite(latency) && latency >= 0`. This explicitly
 * excludes NaN, ±Infinity, and negative values. `typeof NaN === 'number'`
 * is true, so the naive `typeof s.latency === 'number'` guard is insufficient.
 */
export function buildHistogram(samples: readonly MeasurementSample[]): Histogram {
  const oks: number[] = [];
  for (const s of samples) {
    if (s.status === 'ok' && Number.isFinite(s.latency) && s.latency >= 0) {
      oks.push(s.latency);
    }
  }

  if (oks.length < 2) return { bins: [], maxCount: 0, total: oks.length };

  const min = Math.min(...oks);
  const max = Math.max(...oks);
  if (max === min) return { bins: [], maxCount: 0, total: oks.length };

  // Assign each sample to a bin index via interval membership.
  // Bin 0 is open-low (catches v < 2). Bin 10 is open-high catch-all.
  const counts = new Array<number>(ALL_BINS.length).fill(0);
  for (const v of oks) {
    for (let i = 0; i < ALL_BINS.length; i++) {
      const b = ALL_BINS[i];
      if (b === undefined) break;
      if (i === 0) {
        if (v < b.toMs) { counts[i] = (counts[i] ?? 0) + 1; break; }
      } else if (!Number.isFinite(b.toMs)) {
        counts[i] = (counts[i] ?? 0) + 1; break;
      } else if (v >= b.fromMs && v < b.toMs) {
        counts[i] = (counts[i] ?? 0) + 1; break;
      }
    }
  }

  // Determine the leftmost and rightmost bin indices that contain data.
  let firstData = -1;
  let lastData = -1;
  for (let i = 0; i < counts.length; i++) {
    if ((counts[i] ?? 0) > 0) {
      if (firstData === -1) firstData = i;
      lastData = i;
    }
  }

  // Apply outer trim with one padding bin per side. Outer protected bins
  // (bin 0, bin 10) need no padding on their outer side — there is no bin
  // outside them in the schema.
  const sliceStart = Math.max(0, firstData - 1);
  const sliceEnd = Math.min(ALL_BINS.length - 1, lastData + 1);

  const bins: HistogramBin[] = [];
  for (let i = sliceStart; i <= sliceEnd; i++) {
    const def = ALL_BINS[i];
    if (def === undefined) break;
    bins.push({ fromMs: def.fromMs, toMs: def.toMs, count: counts[i] ?? 0 });
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

export interface CorrelationOptions {
  readonly slowThresholdMs?: number | null;
}

/**
 * Spike threshold: a sample is a spike when it exceeds 1.5× the endpoint's
 * own median over the window. We use median-relative rather than absolute
 * thresholds so endpoints with naturally-different baselines are compared on
 * the same footing.
 */
const SPIKE_FACTOR = 1.5;
const SLOWER_THAN_COMPARATORS_FACTOR = 1.5;
const SLOWER_THAN_COMPARATORS_DELTA_MS = 50;

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
 * endpoint's spikes correlate with others in the browser-visible window.
 */
export function buildCorrelation(
  focused: CorrelationInput,
  others: readonly CorrelationInput[],
  windowRounds = 16,
  options: CorrelationOptions = {},
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
  // misclassifies shared-window events: when comparators time out alongside the
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
  const focusedWindowLatencies = focusedRow.cells
    .map(c => c.latencyMs)
    .filter((latency): latency is number => latency !== null);
  const focusedKnownInWindow = focusedWindowLatencies.length;
  const focusedWindowMedian = median(focusedWindowLatencies);
  const otherWindowMedians = otherRows
    .map(row => median(
      row.cells
        .map(c => c.latencyMs)
        .filter((latency): latency is number => latency !== null),
    ))
    .filter((value) => value > 0);
  const slowThresholdMs = typeof options.slowThresholdMs === 'number' && Number.isFinite(options.slowThresholdMs)
    ? options.slowThresholdMs
    : null;

  const headline = correlationHeadline({
    focusedLabel: focused.label,
    focusedOksCount: focusedOks.length,
    focusedKnownInWindow,
    focusedWindowLatencies,
    focusedWindowMedian,
    focusedSpikeCount: focusedSpikeRounds.length,
    otherSpikesPerFocusedSpike,
    knownComparatorsPerSpike,
    otherCount: otherRows.length,
    otherWindowMedians,
    slowThresholdMs,
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
  readonly focusedWindowLatencies: readonly number[];
  readonly focusedWindowMedian: number;
  readonly focusedSpikeCount: number;
  readonly otherSpikesPerFocusedSpike: readonly number[];
  /**
   * For each focused-spike round, how many comparator endpoints had a known
   * (non-null) value in that round. Used to gate the shared/isolated verdict
   * on whether the panel actually has enough comparator coverage to call it.
   */
  readonly knownComparatorsPerSpike: readonly number[];
  readonly otherCount: number;
  readonly otherWindowMedians: readonly number[];
  readonly slowThresholdMs: number | null;
}

function isConsistentlyAboveThreshold(
  latencies: readonly number[],
  thresholdMs: number,
): boolean {
  return latencies.length > 0 && latencies.every((latency) => latency > thresholdMs);
}

function isConsistentlySlowerThanComparators(
  focusedWindowMedian: number,
  otherWindowMedians: readonly number[],
): boolean {
  const comparatorMedian = median(otherWindowMedians);
  if (focusedWindowMedian <= 0 || comparatorMedian <= 0) return false;
  return (
    focusedWindowMedian >= comparatorMedian * SLOWER_THAN_COMPARATORS_FACTOR &&
    focusedWindowMedian - comparatorMedian >= SLOWER_THAN_COMPARATORS_DELTA_MS
  );
}

function correlationHeadline(input: HeadlineInput): string {
  const {
    focusedLabel,
    focusedOksCount,
    focusedKnownInWindow,
    focusedWindowLatencies,
    focusedWindowMedian,
    focusedSpikeCount,
    otherSpikesPerFocusedSpike,
    knownComparatorsPerSpike,
    otherCount,
    otherWindowMedians,
    slowThresholdMs,
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
    if (slowThresholdMs !== null && focusedWindowMedian > slowThresholdMs) {
      const thresholdLabel = `${Math.round(slowThresholdMs)} ms`;
      const cadence = isConsistentlyAboveThreshold(focusedWindowLatencies, slowThresholdMs)
        ? 'consistently'
        : 'typically';
      return `${focusedLabel} is ${cadence} above your ${thresholdLabel} threshold. It is not spiking; it is staying slow.`;
    }
    if (isConsistentlySlowerThanComparators(focusedWindowMedian, otherWindowMedians)) {
      return `${focusedLabel} is consistently slower than the comparison endpoints. It is not spiking; it is staying slow.`;
    }
    return `${focusedLabel} has no notable spikes in this window.`;
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
    // All spike rounds had comparator gaps, so the comparison cannot support
    // shared or isolated language.
    return `Spikes detected on ${focusedLabel}, but comparator data is sparse — try running for longer to compare.`;
  }

  const sharedPct = shared / conclusiveSpikes;
  if (sharedPct >= 0.6) {
    return 'Spikes are shared browser-visible events across multiple sites in this window.';
  }
  if (sharedPct <= 0.2) {
    return `Spikes are limited to ${focusedLabel} in this browser-visible comparison.`;
  }
  return `Spikes are mixed — sometimes shared with other sites, sometimes ${focusedLabel}-specific.`;
}
