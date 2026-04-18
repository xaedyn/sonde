// src/lib/utils/statistics.ts
// Pure statistical functions. No side effects, no store imports.
// All functions operate on plain arrays and return plain values.

import type {
  MeasurementSample,
  EndpointStatistics,
  ConfidenceInterval,
  TimingPayload,
  SampleBuffer,
} from '../types';
import type { SortedInsertionBuffer } from './sorted-insertion-buffer';
import type { LossCounts } from './incremental-loss-counter';

// ── Percentile (nearest-rank method) ──────────────────────────────────────
// Returns the value at the given percentile p (0–100) in the provided array.
// Input does not need to be sorted.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  // Nearest-rank: ceiling of (p/100 * n), 1-based index
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[rank - 1];
}

/**
 * Nearest-rank percentile from a PRE-SORTED ascending array.
 * Caller must sort before calling — no internal copy or sort.
 */
export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Population standard deviation ─────────────────────────────────────────
export function stddev(values: number[]): number {
  if (values.length <= 1) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── 95% confidence interval (z = 1.96) ────────────────────────────────────
export function confidenceInterval95(
  median: number,
  sd: number,
  n: number
): ConfidenceInterval {
  const margin = 1.96 * (sd / Math.sqrt(n));
  return {
    lower: median - margin,
    upper: median + margin,
    margin,
  };
}

// ── Full endpoint statistics ───────────────────────────────────────────────
const READY_SAMPLE_GATE = 30;

export function computeEndpointStatistics(
  endpointId: string,
  samples: MeasurementSample[]
): EndpointStatistics {
  const okSamples = samples.filter(s => s.status === 'ok');
  const latencies = okSamples.map(s => s.latency);

  const count = latencies.length;
  const ready = samples.length >= READY_SAMPLE_GATE;

  if (count === 0) {
    return {
      endpointId,
      sampleCount: samples.length,
      p50: 0, p95: 0, p99: 0, p25: 0, p75: 0, p90: 0,
      min: 0, max: 0, stddev: 0,
      ci95: { lower: 0, upper: 0, margin: 0 },
      connectionReuseDelta: null,
      tier2Averages: undefined,
      ready,
    };
  }

  const sorted = latencies.slice().sort((a, b) => a - b);
  const p50 = percentileSorted(sorted, 50);
  const p95 = percentileSorted(sorted, 95);
  const p99 = percentileSorted(sorted, 99);
  const p25 = percentileSorted(sorted, 25);
  const p75 = percentileSorted(sorted, 75);
  const p90 = percentileSorted(sorted, 90);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sd = stddev(latencies);
  const ci95 = confidenceInterval95(p50, sd, count);

  // ── Connection reuse delta ────────────────────────────────────────────
  // Compare first sample (likely cold/DNS+TCP) against subsequent warm connections.
  // Requires tier2 data. Delta = cold_latency - warm_avg_latency.
  const tier2Samples = okSamples.filter(
    (s): s is MeasurementSample & { tier2: TimingPayload } => s.tier2 !== undefined
  );
  let connectionReuseDelta: number | null = null;

  if (tier2Samples.length >= 2) {
    const first = tier2Samples[0];
    const rest = tier2Samples.slice(1);

    if (first) {
      // Cold: has TCP or TLS overhead
      const firstHasColdOverhead =
        (first.tier2.tcpConnect > 0 || first.tier2.tlsHandshake > 0);

      // Warm: rest with no TCP reconnect
      const warmSamples = rest.filter(
        s => s.tier2.tcpConnect === 0 && s.tier2.tlsHandshake === 0
      );

      if (firstHasColdOverhead && warmSamples.length > 0) {
        const warmAvg =
          warmSamples.reduce((sum, s) => sum + s.latency, 0) / warmSamples.length;
        connectionReuseDelta = first.latency - warmAvg;
      }
    }
  }

  // ── Tier 2 averages + p95 ─────────────────────────────────────────────
  let tier2Averages: EndpointStatistics['tier2Averages'];
  let tier2P95:      EndpointStatistics['tier2P95'];
  if (tier2Samples.length > 0) {
    const avg = (field: 'dnsLookup' | 'tcpConnect' | 'tlsHandshake' | 'ttfb' | 'contentTransfer') =>
      tier2Samples.reduce((sum, s) => sum + s.tier2[field], 0) / tier2Samples.length;

    const p95Of = (field: 'dnsLookup' | 'tcpConnect' | 'tlsHandshake' | 'ttfb' | 'contentTransfer') => {
      const sortedField = tier2Samples.map(s => s.tier2[field]).sort((a, b) => a - b);
      return percentileSorted(sortedField, 95);
    };

    tier2Averages = {
      dnsLookup: avg('dnsLookup'),
      tcpConnect: avg('tcpConnect'),
      tlsHandshake: avg('tlsHandshake'),
      ttfb: avg('ttfb'),
      contentTransfer: avg('contentTransfer'),
    };
    tier2P95 = {
      dnsLookup: p95Of('dnsLookup'),
      tcpConnect: p95Of('tcpConnect'),
      tlsHandshake: p95Of('tlsHandshake'),
      ttfb: p95Of('ttfb'),
      contentTransfer: p95Of('contentTransfer'),
    };
  }

  return {
    endpointId,
    sampleCount: samples.length,
    p50, p95, p99, p25, p75, p90,
    min, max,
    stddev: sd,
    ci95,
    connectionReuseDelta,
    tier2Averages,
    tier2P95,
    ready,
  };
}

/**
 * Zero-allocation statistics from pre-sorted buffer + loss counter.
 * Reads directly from sortedBuffer.sorted — no intermediate arrays.
 */
export function computeEndpointStatisticsFromBuffer(
  endpointId: string,
  sortedBuffer: SortedInsertionBuffer,
  lossCounts: LossCounts,
  totalSamples: number,
  samples: SampleBuffer,
): EndpointStatistics {
  const sorted = sortedBuffer.sorted;
  const count = sorted.length;
  const ready = totalSamples >= READY_SAMPLE_GATE;

  if (count === 0) {
    return {
      endpointId,
      sampleCount: totalSamples,
      p50: 0, p95: 0, p99: 0, p25: 0, p75: 0, p90: 0,
      min: 0, max: 0, stddev: 0,
      ci95: { lower: 0, upper: 0, margin: 0 },
      connectionReuseDelta: null,
      tier2Averages: undefined,
      ready,
    };
  }

  const p50 = percentileSorted(sorted as number[], 50);
  const p95 = percentileSorted(sorted as number[], 95);
  const p99 = percentileSorted(sorted as number[], 99);
  const p25 = percentileSorted(sorted as number[], 25);
  const p75 = percentileSorted(sorted as number[], 75);
  const p90 = percentileSorted(sorted as number[], 90);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Stddev from sorted values
  let sumVal = 0;
  for (let i = 0; i < count; i++) sumVal += sorted[i];
  const mean = sumVal / count;
  let varianceSum = 0;
  for (let i = 0; i < count; i++) varianceSum += (sorted[i] - mean) ** 2;
  const sd = Math.sqrt(varianceSum / count);
  const ci95 = confidenceInterval95(p50, sd, count);

  // ── Connection reuse delta ────────────────────────────────────────────
  type Tier2Sample = MeasurementSample & { tier2: TimingPayload };
  const tier2Samples = samples.filter(
    s => s.status === 'ok' && s.tier2 !== undefined
  ) as Tier2Sample[];
  let connectionReuseDelta: number | null = null;

  if (tier2Samples.length >= 2) {
    const first = tier2Samples[0];
    const rest = tier2Samples.slice(1) as Tier2Sample[];

    if (first?.tier2) {
      const firstHasColdOverhead =
        (first.tier2.tcpConnect > 0 || first.tier2.tlsHandshake > 0);

      const warmSamples = rest.filter(
        s => s.tier2 && s.tier2.tcpConnect === 0 && s.tier2.tlsHandshake === 0
      );

      if (firstHasColdOverhead && warmSamples.length > 0) {
        const warmAvg =
          warmSamples.reduce((accum, s) => accum + s.latency, 0) / warmSamples.length;
        connectionReuseDelta = first.latency - warmAvg;
      }
    }
  }

  // ── Tier 2 averages + p95 ─────────────────────────────────────────────
  let tier2Averages: EndpointStatistics['tier2Averages'];
  let tier2P95:      EndpointStatistics['tier2P95'];
  if (tier2Samples.length > 0) {
    const avg = (field: 'dnsLookup' | 'tcpConnect' | 'tlsHandshake' | 'ttfb' | 'contentTransfer') =>
      tier2Samples.reduce((accum, sample) => accum + (sample.tier2?.[field] ?? 0), 0) / tier2Samples.length;

    const p95Of = (field: 'dnsLookup' | 'tcpConnect' | 'tlsHandshake' | 'ttfb' | 'contentTransfer') => {
      const sortedField = tier2Samples
        .map(s => s.tier2?.[field] ?? 0)
        .sort((a, b) => a - b);
      return percentileSorted(sortedField, 95);
    };

    tier2Averages = {
      dnsLookup: avg('dnsLookup'),
      tcpConnect: avg('tcpConnect'),
      tlsHandshake: avg('tlsHandshake'),
      ttfb: avg('ttfb'),
      contentTransfer: avg('contentTransfer'),
    };
    tier2P95 = {
      dnsLookup: p95Of('dnsLookup'),
      tcpConnect: p95Of('tcpConnect'),
      tlsHandshake: p95Of('tlsHandshake'),
      ttfb: p95Of('ttfb'),
      contentTransfer: p95Of('contentTransfer'),
    };
  }

  return {
    endpointId,
    sampleCount: totalSamples,
    p50, p95, p99, p25, p75, p90,
    min, max,
    stddev: sd,
    ci95,
    connectionReuseDelta,
    tier2Averages,
    tier2P95,
    ready,
  };
}
