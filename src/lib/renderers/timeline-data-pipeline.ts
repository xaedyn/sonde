// src/lib/renderers/timeline-data-pipeline.ts
// Pure-function data pipeline: transforms MeasurementState into FrameData for renderers.
// No class, no mutable state. Entry point: prepareFrame().

import { tokens } from '$lib/tokens';
import { latencyToColor } from './color-map';
import type {
  Endpoint,
  MeasurementState,
  MeasurementSample,
  SampleStatus,
  FrameData,
  ScatterPoint,
  RibbonData,
  YRange,
  XTick,
  Gridline,
  HeatmapCellData,
  EndpointStatistics,
} from '$lib/types';

// ── Constants (all from tokens) ────────────────────────────────────────────

const WINDOW_SIZE = tokens.canvas.yAxis.rollingWindowSize;
const P_LOW = tokens.canvas.yAxis.percentileClampLow;
const P_HIGH = tokens.canvas.yAxis.percentileClampHigh;
const LOG_THRESHOLD = tokens.canvas.yAxis.logScaleThreshold;
const HEADROOM_PCT = tokens.canvas.yAxis.linearHeadroomPct;
const MIN_HEADROOM = tokens.canvas.yAxis.minHeadroomMs;
const MIN_VISIBLE_RANGE = tokens.canvas.yAxis.minVisibleRangeMs;
const TARGET_GRIDLINES = tokens.canvas.yAxis.targetGridlineCount;
const MIN_LABEL_SPACING = tokens.canvas.xAxis.minLabelSpacing;

const NICE_STEPS_LINEAR = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const;
const NICE_STEPS_LOG = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] as const;
const NICE_STEPS_XTICK = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

// ── Default Y range ────────────────────────────────────────────────────────

const DEFAULT_YRANGE: YRange = (() => {
  const min = 1;
  const max = 1000;
  const isLog = false;
  const yr: YRange = { min, max, isLog, gridlines: [] };
  const gridlines = computeGridlines(min, max, isLog, yr);
  return { min, max, isLog, gridlines };
})();

// ── Y-range computation ────────────────────────────────────────────────────

export function computeYRange(allLatencies: number[]): YRange {
  if (allLatencies.length === 0) return DEFAULT_YRANGE;
  const sorted = allLatencies.slice().sort((a, b) => a - b);
  return computeYRangeFromSorted(sorted);
}

/** Nearest-rank percentile from any sorted indexed collection — avoids Array.from() copy. */
function percentileRank(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

function computeYRangeFromSorted(sorted: ArrayLike<number> & { length: number }): YRange {
  if (sorted.length === 0) return DEFAULT_YRANGE;

  const p2 = percentileRank(sorted, P_LOW);
  const p98 = percentileRank(sorted, P_HIGH);

  const ratio = p98 / Math.max(p2, 0.1);
  const isLog = ratio > LOG_THRESHOLD;

  let min: number;
  let max: number;

  if (isLog) {
    min = Math.max(p2 * 0.5, 0.5);
    max = p98 * 2.0;
  } else {
    const span = p98 - p2;
    const headroom = Math.max(span * HEADROOM_PCT, MIN_HEADROOM);
    min = Math.max(p2 - headroom, 0);
    max = p98 + headroom;
  }

  if (max - min < MIN_VISIBLE_RANGE) {
    const center = (min + max) / 2;
    min = center - MIN_VISIBLE_RANGE / 2;
    max = center + MIN_VISIBLE_RANGE / 2;
    if (min < 0) {
      min = 0;
      max = MIN_VISIBLE_RANGE;
    }
  }

  const yr: YRange = { min, max, isLog, gridlines: [] };
  const gridlines = computeGridlines(min, max, isLog, yr);
  return { min, max, isLog, gridlines };
}

function computeGridlines(min: number, max: number, isLog: boolean, yr: YRange): Gridline[] {
  if (isLog) {
    let candidates = NICE_STEPS_LOG.filter(v => v >= min && v <= max);
    while (candidates.length > TARGET_GRIDLINES + 2) {
      candidates = candidates.filter((_, i) => i % 2 === 0);
    }
    return candidates.map(ms => ({
      ms,
      normalizedY: normalizeLatency(ms, yr),
      label: ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`,
    }));
  } else {
    const range = max - min;
    const rawStep = range / TARGET_GRIDLINES;
    const step = NICE_STEPS_LINEAR.find(s => s >= rawStep) ?? rawStep;
    const gridlines: Gridline[] = [];
    const start = Math.ceil(min / step) * step;
    for (let value = start; value <= max; value += step) {
      gridlines.push({
        ms: value,
        normalizedY: normalizeLatency(value, yr),
        label: value >= 1000 ? `${value / 1000}s` : `${Math.round(value)}ms`,
      });
    }
    return gridlines;
  }
}

// ── Normalization ──────────────────────────────────────────────────────────

export function normalizeLatency(ms: number, yRange: YRange): number {
  if (yRange.isLog) {
    const logMin = Math.log10(Math.max(yRange.min, 0.1));
    const logMax = Math.log10(yRange.max);
    const logVal = Math.log10(Math.max(ms, 0.1));
    return Math.min(1, Math.max(0, (logVal - logMin) / (logMax - logMin)));
  } else {
    return Math.min(1, Math.max(0, (ms - yRange.min) / (yRange.max - yRange.min)));
  }
}

// ── X-tick computation ─────────────────────────────────────────────────────

export function computeXTicks(maxRound: number, plotWidth: number): XTick[] {
  if (maxRound <= 0) return [];

  const maxLabels = Math.max(Math.floor(plotWidth / MIN_LABEL_SPACING), 2);
  const rawStep = maxRound / maxLabels;
  const step = NICE_STEPS_XTICK.find(s => s >= rawStep) ?? Math.ceil(rawStep);

  const ticks: XTick[] = [];

  ticks.push({ round: 1, normalizedX: 1 / maxRound, label: '1' });

  let start = Math.ceil(1 / step) * step;
  if (start === 1) start += step;
  for (let round = start; round < maxRound; round += step) {
    ticks.push({
      round,
      normalizedX: round / maxRound,
      label: `${round}`,
    });
  }

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick || (1.0 - lastTick.normalizedX) * plotWidth >= MIN_LABEL_SPACING * 0.6) {
    ticks.push({
      round: maxRound,
      normalizedX: 1.0,
      label: `${maxRound}`,
    });
  }

  return ticks;
}

// ── Ribbon computation ─────────────────────────────────────────────────────
// Exported separately — ribbon computation is O(n·w·log w) and should be
// invoked outside the per-frame hot path when sample counts are large.

export function computeRibbons(
  measureState: MeasurementState,
  yRange: YRange,
): Map<string, RibbonData> {
  const result = new Map<string, RibbonData>();
  // Pre-allocate a reusable buffer for sorting window latencies (avoids ~9800 allocations)
  const sortBuf = new Float64Array(WINDOW_SIZE);

  const yMin = yRange.min;
  const ySpan = yRange.max - yRange.min;
  const isLog = yRange.isLog;
  const logMin = isLog ? Math.log10(Math.max(yMin, 0.1)) : 0;
  const logSpan = isLog ? Math.log10(yRange.max) - logMin : 0;

  for (const [endpointId, epState] of Object.entries(measureState.endpoints)) {
    const { samples } = epState;
    if (samples.length < WINDOW_SIZE) continue;

    const p25Points: [number, number][] = [];
    const p50Points: [number, number][] = [];
    const p75Points: [number, number][] = [];

    // Inline normalization to avoid function call overhead per point
    const norm = (ms: number) => {
      if (isLog) {
        const logVal = Math.log10(Math.max(ms, 0.1));
        const v = (logVal - logMin) / logSpan;
        return v < 0 ? 0 : v > 1 ? 1 : v;
      }
      const v = (ms - yMin) / ySpan;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    };

    for (let i = WINDOW_SIZE - 1; i < samples.length; i++) {
      // Fill buffer with ok latencies from the window, count them
      let okCount = 0;
      for (let j = i - WINDOW_SIZE + 1; j <= i; j++) {
        const s = samples.at(j);
        if (s && s.status === 'ok') {
          sortBuf[okCount++] = s.latency;
        }
      }

      if (okCount < 3) continue;

      // Insertion sort on the small buffer (faster than Array.sort for n <= 20)
      for (let a = 1; a < okCount; a++) {
        const key = sortBuf[a] ?? 0;
        let b = a - 1;
        while (b >= 0 && (sortBuf[b] ?? 0) > key) {
          sortBuf[b + 1] = sortBuf[b] ?? 0;
          b--;
        }
        sortBuf[b + 1] = key;
      }

      // Nearest-rank percentiles directly from buffer
      const i25 = Math.max(0, Math.ceil((25 / 100) * okCount) - 1);
      const i50 = Math.max(0, Math.ceil((50 / 100) * okCount) - 1);
      const i75 = Math.max(0, Math.ceil((75 / 100) * okCount) - 1);

      const sample = samples.at(i);
      if (!sample) continue;
      const x = sample.round;

      p25Points.push([x, norm(sortBuf[i25] ?? 0)]);
      p50Points.push([x, norm(sortBuf[i50] ?? 0)]);
      p75Points.push([x, norm(sortBuf[i75] ?? 0)]);
    }

    if (p25Points.length > 0) {
      result.set(endpointId, {
        p25Path: p25Points,
        p50Path: p50Points,
        p75Path: p75Points,
      });
    }
  }

  return result;
}

/** Per-lane ribbon computation — each endpoint uses its own yRange for normalization. */
export function computeRibbonsPerLane(
  measureState: MeasurementState,
  yRangesByEndpoint: ReadonlyMap<string, YRange>,
): Map<string, RibbonData> {
  const result = new Map<string, RibbonData>();
  const sortBuf = new Float64Array(WINDOW_SIZE);

  for (const [endpointId, epState] of Object.entries(measureState.endpoints)) {
    const { samples } = epState;
    if (samples.length < WINDOW_SIZE) continue;

    const yRange = yRangesByEndpoint.get(endpointId);
    if (!yRange) continue;

    const yMin = yRange.min;
    const ySpan = yRange.max - yRange.min;
    const isLog = yRange.isLog;
    const logMin = isLog ? Math.log10(Math.max(yMin, 0.1)) : 0;
    const logSpan = isLog ? Math.log10(yRange.max) - logMin : 0;

    const norm = (ms: number) => {
      if (isLog) {
        const logVal = Math.log10(Math.max(ms, 0.1));
        const v = (logVal - logMin) / logSpan;
        return v < 0 ? 0 : v > 1 ? 1 : v;
      }
      const v = (ms - yMin) / ySpan;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    };

    const p25Points: [number, number][] = [];
    const p50Points: [number, number][] = [];
    const p75Points: [number, number][] = [];

    for (let i = WINDOW_SIZE - 1; i < samples.length; i++) {
      let okCount = 0;
      for (let j = i - WINDOW_SIZE + 1; j <= i; j++) {
        const s = samples.at(j);
        if (s && s.status === 'ok') {
          sortBuf[okCount++] = s.latency;
        }
      }
      if (okCount < 3) continue;

      for (let a = 1; a < okCount; a++) {
        const key = sortBuf[a] ?? 0;
        let b = a - 1;
        while (b >= 0 && (sortBuf[b] ?? 0) > key) {
          sortBuf[b + 1] = sortBuf[b] ?? 0;
          b--;
        }
        sortBuf[b + 1] = key;
      }

      const i25 = Math.max(0, Math.ceil((25 / 100) * okCount) - 1);
      const i50 = Math.max(0, Math.ceil((50 / 100) * okCount) - 1);
      const i75 = Math.max(0, Math.ceil((75 / 100) * okCount) - 1);

      const sample = samples.at(i);
      if (!sample) continue;
      const x = sample.round;

      p25Points.push([x, norm(sortBuf[i25] ?? 0)]);
      p50Points.push([x, norm(sortBuf[i50] ?? 0)]);
      p75Points.push([x, norm(sortBuf[i75] ?? 0)]);
    }

    if (p25Points.length > 0) {
      result.set(endpointId, {
        p25Path: p25Points,
        p50Path: p50Points,
        p75Path: p75Points,
      });
    }
  }

  return result;
}

// ── Elapsed time formatting ────────────────────────────────────────────────

export function formatElapsed(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor((ms / 1000) * 10) / 10;
  if (totalSec < 10) {
    return `${totalSec.toFixed(1)}s`;
  }
  const totalSecInt = Math.floor(totalSec);
  const hours = Math.floor(totalSecInt / 3600);
  const minutes = Math.floor((totalSecInt % 3600) / 60);
  const seconds = totalSecInt % 60;
  if (hours > 0) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
  }
  const ss = String(seconds).padStart(2, '0');
  return `${minutes}:${ss}`;
}

// ── Heatmap cell computation ───────────────────────────────────────────────

const HEATMAP_MAX_CELLS = 200;

export function computeHeatmapCells(
  samples: { readonly length: number; at(index: number): MeasurementSample | undefined },
  stats: EndpointStatistics,
  startedAt: number | null,
): readonly HeatmapCellData[] {
  if (samples.length === 0) return [];

  const totalRounds = samples.length;
  const bucketSize =
    totalRounds <= HEATMAP_MAX_CELLS ? 1
    : totalRounds <= 1000 ? 5
    : Math.ceil(totalRounds / HEATMAP_MAX_CELLS);

  const cellCount = Math.ceil(totalRounds / bucketSize);
  const result: HeatmapCellData[] = [];

  for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
    const startIdx = cellIdx * bucketSize;
    const endIdx = Math.min(startIdx + bucketSize - 1, totalRounds - 1);

    let worstLatency = 0;
    let worstStatus: SampleStatus = 'ok';

    for (let i = startIdx; i <= endIdx; i++) {
      const s = samples.at(i);
      if (!s) continue;
      if (s.latency > worstLatency) worstLatency = s.latency;
      if (s.status === 'timeout' || s.status === 'error') worstStatus = s.status;
    }

    const startSample = samples.at(startIdx);
    const endSample = samples.at(endIdx);
    const startRound = startSample?.round ?? startIdx + 1;
    const endRound = endSample?.round ?? endIdx + 1;
    const base = startedAt ?? 0;
    const startElapsed = base > 0 ? Math.max(0, (startSample?.timestamp ?? 0) - base) : 0;
    const endElapsed = base > 0 ? Math.max(0, (endSample?.timestamp ?? 0) - base) : 0;

    const color = heatmapColor(worstLatency, worstStatus);
    result.push({ startRound, endRound, worstLatency, worstStatus, startElapsed, endElapsed, color });
  }

  return result;
}

function heatmapColor(
  latency: number, status: SampleStatus,
): string {
  if (status === 'timeout' || status === 'error') return tokens.color.heatmap.timeout;
  return latencyToColor(latency);
}

// ── Main entry point ───────────────────────────────────────────────────────

export function prepareFrame(
  endpoints: Endpoint[],
  measureState: MeasurementState,
  skipRibbons = false,
): FrameData {
  const hasData = Object.values(measureState.endpoints).some(
    ep => ep.samples.length > 0,
  );

  if (!hasData) {
    return {
      pointsByEndpoint: new Map(),
      ribbonsByEndpoint: new Map(),
      yRange: DEFAULT_YRANGE,
      yRangesByEndpoint: new Map(),
      xTicks: [],
      maxRound: 0,
      freezeEvents: measureState.freezeEvents,
      hasData: false,
    };
  }

  // Per-endpoint y-ranges for independent lane scaling
  const yRangesByEndpoint = new Map<string, YRange>();
  const pointsByEndpoint = new Map<string, readonly ScatterPoint[]>();
  let maxRound = 0;

  // Shared yRange (union of all endpoints — kept for backward compat)
  const allLatencies: number[] = [];

  for (const ep of endpoints) {
    const epState = measureState.endpoints[ep.id];
    if (!epState || epState.samples.length === 0) {
      pointsByEndpoint.set(ep.id, []);
      yRangesByEndpoint.set(ep.id, DEFAULT_YRANGE);
      continue;
    }

    // Compute per-endpoint yRange from this endpoint's latencies only
    const { samples } = epState;
    const epLatencies = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      epLatencies[i] = samples.at(i)?.latency ?? 0;
    }
    epLatencies.sort();
    const epYRange = computeYRangeFromSorted(epLatencies);
    yRangesByEndpoint.set(ep.id, epYRange);

    // Collect for shared range
    for (let i = 0; i < epLatencies.length; i++) {
      allLatencies.push(epLatencies[i] ?? 0);
    }

    // Normalize points against this endpoint's own yRange
    const n = samples.length;
    const points: ScatterPoint[] = new Array(n);
    const epId = ep.id;
    const epColor = ep.color;
    for (let i = 0; i < n; i++) {
      const s = samples.at(i);
      if (!s) continue;
      const round = s.round;
      if (round > maxRound) maxRound = round;
      points[i] = {
        x: round,
        y: normalizeLatency(s.latency, epYRange),
        latency: s.latency,
        status: s.status,
        endpointId: epId,
        round,
        color: epColor,
        ...(s.errorMessage !== undefined ? { errorMessage: s.errorMessage } : {}),
      };
    }

    pointsByEndpoint.set(ep.id, points);
  }

  maxRound = Math.max(maxRound, 1);

  // Shared yRange for backward compat
  allLatencies.sort((a, b) => a - b);
  const yRange = allLatencies.length > 0
    ? computeYRangeFromSorted(new Float64Array(allLatencies))
    : DEFAULT_YRANGE;

  // Ribbons use per-endpoint yRanges
  const ribbonsByEndpoint = skipRibbons
    ? new Map<string, RibbonData>()
    : computeRibbonsPerLane(measureState, yRangesByEndpoint);
  const xTicks = computeXTicks(maxRound, 800);

  return {
    pointsByEndpoint,
    ribbonsByEndpoint,
    yRange,
    yRangesByEndpoint,
    xTicks,
    maxRound,
    freezeEvents: measureState.freezeEvents,
    hasData: true,
  };
}
