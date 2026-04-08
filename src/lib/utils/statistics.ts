// src/lib/utils/statistics.ts
// Pure statistical functions. No side effects, no store imports.
// All functions operate on plain arrays and return plain values.

import type {
  MeasurementSample,
  EndpointStatistics,
  ConfidenceInterval,
} from '../types';

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

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const p25 = percentile(latencies, 25);
  const p75 = percentile(latencies, 75);
  const p90 = percentile(latencies, 90);
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const sd = stddev(latencies);
  const ci95 = confidenceInterval95(p50, sd, count);

  // ── Connection reuse delta ────────────────────────────────────────────
  // Compare first sample (likely cold/DNS+TCP) against subsequent warm connections.
  // Requires tier2 data. Delta = cold_latency - warm_avg_latency.
  const tier2Samples = okSamples.filter(s => s.tier2 !== undefined);
  let connectionReuseDelta: number | null = null;

  if (tier2Samples.length >= 2) {
    const first = tier2Samples[0];
    const rest = tier2Samples.slice(1);

    // Cold: has TCP or TLS overhead
    const firstHasColdOverhead =
      (first.tier2!.tcpConnect > 0 || first.tier2!.tlsHandshake > 0);

    // Warm: rest with no TCP reconnect
    const warmSamples = rest.filter(
      s => s.tier2!.tcpConnect === 0 && s.tier2!.tlsHandshake === 0
    );

    if (firstHasColdOverhead && warmSamples.length > 0) {
      const warmAvg =
        warmSamples.reduce((sum, s) => sum + s.latency, 0) / warmSamples.length;
      connectionReuseDelta = first.latency - warmAvg;
    }
  }

  // ── Tier 2 averages ───────────────────────────────────────────────────
  let tier2Averages: EndpointStatistics['tier2Averages'];
  if (tier2Samples.length > 0) {
    const avg = (field: keyof NonNullable<MeasurementSample['tier2']>) =>
      tier2Samples.reduce((sum, s) => sum + s.tier2![field], 0) / tier2Samples.length;

    tier2Averages = {
      dnsLookup: avg('dnsLookup'),
      tcpConnect: avg('tcpConnect'),
      tlsHandshake: avg('tlsHandshake'),
      ttfb: avg('ttfb'),
      contentTransfer: avg('contentTransfer'),
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
    ready,
  };
}
