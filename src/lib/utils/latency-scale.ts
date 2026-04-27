// src/lib/utils/latency-scale.ts
//
// Pure module: no store imports, no DOM access, no side effects.
// Computes the adaptive y-axis ceiling and tick array shared by
// ScopeCanvas, ChronographDial, and RacingStrip (live latency charts).

export interface LatencyScaleInput {
  /** p99 across all monitored endpoints (ms). Non-finite or negative values
   *  are coerced to 0 (defensive — see also output sandwich-clamp). */
  readonly p99Across: number;
  /** Settings.healthThreshold (ms). Non-finite or non-positive values are
   *  coerced to the project default of 120. */
  readonly threshold: number;
}

export interface LatencyScaleResult {
  /** Y-axis ceiling in milliseconds. Guaranteed `150 <= maxMs <= 10000`. */
  readonly maxMs: number;
  /** Tick values from 0 to maxMs inclusive. Always starts with 0 and ends
   *  with maxMs. Monotonically increasing. Length typically 5–7. */
  readonly ticks: readonly number[];
}

const DEFAULT_THRESHOLD = 120;
const ABSOLUTE_FLOOR = 150;
const ABSOLUTE_CEILING = 10000;

// 30ms-anchored tick step ladder. Every entry is a multiple of 30 so the
// ticks align cleanly with the AC `maxMs` exact values (which all live on
// the 30ms grid). Heckbert 1-2-5 was rejected because its `{1,2,5}×10^n`
// step family doesn't align with this grid.
const STEP_LADDER: readonly number[] = [30, 60, 120, 300, 600, 1500];

function niceStep(maxMs: number): number {
  // Pick the smallest step such that the resulting tick count
  // (ceil(maxMs / step) + 1) is in [4, 8] inclusive.
  for (const step of STEP_LADDER) {
    const count = Math.ceil(maxMs / step) + 1;
    if (count >= 4 && count <= 8) return step;
  }
  // Fallback for very large maxMs (unreachable under the 10000 output clamp,
  // but defends if the clamp is ever widened).
  return 1500;
}

export function latencyScale(input: LatencyScaleInput): LatencyScaleResult {
  // Defensive input coercion (see spec D3): non-finite/negative p99 → 0,
  // non-finite/non-positive threshold → DEFAULT_THRESHOLD.
  const p99 = Number.isFinite(input.p99Across) && input.p99Across >= 0 ? input.p99Across : 0;
  const thr = Number.isFinite(input.threshold) && input.threshold > 0 ? input.threshold : DEFAULT_THRESHOLD;

  // Floor candidate (threshold-pinned, "softMax" pattern from Grafana issue #5984)
  const floorCandidate = Math.ceil((thr * 1.25) / 30) * 30;
  // Headroom candidate (data-driven, 1.2x p99 — matches existing RacingStrip multiplier)
  const dataCandidate = Math.ceil((p99 * 1.2) / 30) * 30;

  // Output sandwich-clamp (see spec D2/D4): floor at 150, ceiling at 10000.
  const maxMs = Math.max(ABSOLUTE_FLOOR, Math.min(ABSOLUTE_CEILING, Math.max(floorCandidate, dataCandidate)));

  // Build ticks: [0, step, 2*step, ..., maxMs]. Last entry is maxMs even when
  // it isn't a multiple of step (visual rhythm preserved within step bounds).
  const step = niceStep(maxMs);
  const ticks: number[] = [0];
  for (let t = step; t < maxMs; t += step) {
    ticks.push(t);
  }
  ticks.push(maxMs);

  return { maxMs, ticks };
}
