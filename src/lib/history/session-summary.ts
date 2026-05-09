// src/lib/history/session-summary.ts
// Compact local-only summaries of completed measurement runs.

import type {
  Endpoint,
  EndpointStatistics,
  MeasurementSample,
  MeasurementState,
  Settings,
  StatisticsState,
  TestLifecycleState,
} from '../types';
import { buildDiagnosticNarrative, type DiagnosticNarrative } from '../utils/diagnostic-narrative';
import { percentileSorted, stddev } from '../utils/statistics';
import type { VerdictRow } from '../utils/verdict';

export interface HistoryEndpointSummary {
  readonly endpointId: string;
  readonly key: string;
  readonly url: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly sampleCount: number;
  readonly okCount: number;
  readonly lossPercent: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly stddev: number | null;
  readonly lastLatency: number | null;
  readonly baselineEligible: boolean;
}

export interface HistorySessionSummary {
  readonly id: string;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly stoppedAt: number | null;
  readonly durationMs: number | null;
  readonly lifecycle: TestLifecycleState;
  readonly roundCount: number;
  readonly endpointCount: number;
  readonly baselineEligibleEndpointCount: number;
  readonly endpointKeys: readonly string[];
  readonly settings: {
    readonly healthThreshold: number;
    readonly corsMode: Settings['corsMode'];
    readonly timeout: number;
  };
  readonly verdict: {
    readonly headline: string;
    readonly kind: DiagnosticNarrative['kind'];
    readonly confidence: DiagnosticNarrative['confidence'];
  };
  readonly endpoints: readonly HistoryEndpointSummary[];
}

export interface BuildHistorySessionSummaryInput {
  readonly id?: string;
  readonly now?: number;
  readonly endpoints: readonly Endpoint[];
  readonly measurements: MeasurementState;
  readonly stats: StatisticsState;
  readonly settings: Settings;
}

const BASELINE_MIN_TOTAL_SAMPLES = 30;
const BASELINE_MIN_OK_SAMPLES = 20;
const BASELINE_MAX_LOSS_PERCENT = 20;

function safePathname(pathname: string): string {
  if (pathname === '' || pathname === '/') return '';
  return pathname.replace(/\/+$/, '');
}

export function normalizeHistoryEndpointKey(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    return `${protocol}//${host}${safePathname(parsed.pathname)}`;
  } catch {
    return trimmed;
  }
}

function sampleArrayFor(measurements: MeasurementState, endpointId: string): readonly MeasurementSample[] {
  return measurements.endpoints[endpointId]?.samples.toArray() ?? [];
}

function computeFallbackStats(samples: readonly MeasurementSample[]): Pick<HistoryEndpointSummary, 'p50' | 'p95' | 'p99' | 'stddev'> {
  const latencies = samples
    .filter((sample) => sample.status === 'ok' && Number.isFinite(sample.latency))
    .map((sample) => sample.latency)
    .sort((a, b) => a - b);

  if (latencies.length === 0) {
    return { p50: null, p95: null, p99: null, stddev: null };
  }

  return {
    p50: percentileSorted(latencies, 50),
    p95: percentileSorted(latencies, 95),
    p99: percentileSorted(latencies, 99),
    stddev: stddev(latencies),
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function buildEndpointSummary(
  endpoint: Endpoint,
  stat: EndpointStatistics | undefined,
  measurements: MeasurementState,
): HistoryEndpointSummary {
  const samples = sampleArrayFor(measurements, endpoint.id);
  const okCount = samples.filter((sample) => sample.status === 'ok').length;
  const fallback = computeFallbackStats(samples);
  const sampleCount = samples.length;
  const lossPercent = sampleCount > 0
    ? ((sampleCount - okCount) / sampleCount) * 100
    : 0;
  const p50 = finiteOrNull(okCount > 0 ? (stat?.p50 ?? fallback.p50) : null);
  const p95 = finiteOrNull(okCount > 0 ? (stat?.p95 ?? fallback.p95) : null);
  const p99 = finiteOrNull(okCount > 0 ? (stat?.p99 ?? fallback.p99) : null);
  const sd = finiteOrNull(okCount > 0 ? (stat?.stddev ?? fallback.stddev) : null);
  const baselineEligible = endpoint.enabled
    && sampleCount >= BASELINE_MIN_TOTAL_SAMPLES
    && okCount >= BASELINE_MIN_OK_SAMPLES
    && lossPercent <= BASELINE_MAX_LOSS_PERCENT
    && p50 !== null
    && p95 !== null;

  return {
    endpointId: endpoint.id,
    key: normalizeHistoryEndpointKey(endpoint.url),
    url: endpoint.url,
    label: endpoint.label,
    enabled: endpoint.enabled,
    sampleCount,
    okCount,
    lossPercent,
    p50,
    p95,
    p99,
    stddev: sd,
    lastLatency: finiteOrNull(measurements.endpoints[endpoint.id]?.lastLatency),
    baselineEligible,
  };
}

function buildVerdict(input: BuildHistorySessionSummaryInput): HistorySessionSummary['verdict'] {
  const monitored = input.endpoints.filter((endpoint) => endpoint.enabled);
  const rows: VerdictRow[] = [];
  const samplesByEndpoint: Record<string, readonly MeasurementSample[]> = {};

  for (const endpoint of monitored) {
    const endpointStats = input.stats[endpoint.id];
    samplesByEndpoint[endpoint.id] = sampleArrayFor(input.measurements, endpoint.id);
    if (endpointStats?.ready) rows.push({ ep: endpoint, stats: endpointStats });
  }

  const diagnosis = buildDiagnosticNarrative({
    rows,
    threshold: input.settings.healthThreshold,
    corsMode: input.settings.corsMode,
    samplesByEndpoint,
    monitoredEndpointCount: monitored.length,
  });

  return {
    headline: diagnosis.verdict.headline,
    kind: diagnosis.kind,
    confidence: diagnosis.confidence,
  };
}

function makeHistoryId(now: number): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `hist_${now}_${random}`;
}

export function buildHistorySessionSummary(
  input: BuildHistorySessionSummaryInput,
): HistorySessionSummary | null {
  const now = input.now ?? Date.now();
  const endpointSummaries = input.endpoints.map((endpoint) => (
    buildEndpointSummary(endpoint, input.stats[endpoint.id], input.measurements)
  ));
  const totalSamples = endpointSummaries.reduce((sum, endpoint) => sum + endpoint.sampleCount, 0);
  if (totalSamples === 0) return null;

  const baselineEligibleEndpoints = endpointSummaries.filter((endpoint) => endpoint.baselineEligible);
  const uniqueEndpointKeys = [...new Set(endpointSummaries.map((endpoint) => endpoint.key))];
  const { startedAt, stoppedAt } = input.measurements;

  return {
    id: input.id ?? makeHistoryId(now),
    createdAt: now,
    startedAt,
    stoppedAt,
    durationMs: startedAt !== null && stoppedAt !== null ? Math.max(0, stoppedAt - startedAt) : null,
    lifecycle: input.measurements.lifecycle,
    roundCount: input.measurements.roundCounter,
    endpointCount: endpointSummaries.length,
    baselineEligibleEndpointCount: baselineEligibleEndpoints.length,
    endpointKeys: uniqueEndpointKeys,
    settings: {
      healthThreshold: input.settings.healthThreshold,
      corsMode: input.settings.corsMode,
      timeout: input.settings.timeout,
    },
    verdict: buildVerdict(input),
    endpoints: endpointSummaries,
  };
}

