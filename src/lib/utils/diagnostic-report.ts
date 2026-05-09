// src/lib/utils/diagnostic-report.ts
// Pure report model for shared result snapshots. It turns the live diagnostic
// narrative into a support-ready, read-only artifact.

import type {
  Endpoint,
  EndpointStatistics,
  MeasurementSample,
  MeasurementState,
  Settings,
  SharedReportContext,
  StatisticsState,
} from '../types';
import { buildDiagnosticNarrative, type DiagnosticNarrative } from './diagnostic-narrative';
import type { VerdictRow } from './verdict';

export interface ReportEndpointRow {
  readonly endpointId: string;
  readonly label: string;
  readonly url: string;
  readonly color: string;
  readonly enabled: boolean;
  readonly sampleCount: number;
  readonly okCount: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly jitter: number | null;
  readonly lossPercent: number;
  readonly lastLatency: number | null;
  readonly status: 'ok' | 'slow' | 'loss' | 'unready' | 'disabled';
  readonly implicated: boolean;
}

export interface DiagnosticReport {
  readonly diagnosis: DiagnosticNarrative;
  readonly endpointRows: readonly ReportEndpointRow[];
  readonly threshold: number;
  readonly thresholdSource: 'shared' | 'local-default';
  readonly corsMode: Settings['corsMode'];
  readonly corsModeSource: 'shared' | 'payload-settings' | 'local-default';
  readonly roundCount: number;
  readonly totalSampleCount: number;
  readonly keptSampleCount: number;
  readonly truncated: boolean;
  readonly createdAt: number | null;
  readonly createdLabel: string;
  readonly copySummary: string;
}

interface DiagnosticReportInput {
  readonly endpoints: readonly Endpoint[];
  readonly stats: StatisticsState;
  readonly measurements: MeasurementState;
  readonly settings: Settings;
  readonly context: SharedReportContext | null;
}

function fmtMs(value: number | null): string {
  return value === null ? '-' : `${Math.round(value)} ms`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function sampleArrayFor(measurements: MeasurementState, endpointId: string): readonly MeasurementSample[] {
  return measurements.endpoints[endpointId]?.samples.toArray() ?? [];
}

function okCount(samples: readonly MeasurementSample[]): number {
  return samples.filter((sample) => sample.status === 'ok').length;
}

function statusFor(input: {
  readonly endpoint: Endpoint;
  readonly stats: EndpointStatistics | undefined;
  readonly threshold: number;
  readonly samples: readonly MeasurementSample[];
}): ReportEndpointRow['status'] {
  const { endpoint, stats, threshold, samples } = input;
  if (!endpoint.enabled) return 'disabled';
  if (!stats?.ready || samples.length === 0) return 'unready';
  if (stats.lossPercent > 1) return 'loss';
  if (stats.p50 > threshold) return 'slow';
  return 'ok';
}

function sumSamples(samplesByEndpoint: Readonly<Record<string, readonly MeasurementSample[]>>): number {
  let total = 0;
  for (const samples of Object.values(samplesByEndpoint)) total += samples.length;
  return total;
}

function defaultCreatedLabel(createdAt: number | null): string {
  if (createdAt === null) return 'Shared snapshot';
  return new Date(createdAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildEndpointRows(input: {
  readonly endpoints: readonly Endpoint[];
  readonly stats: StatisticsState;
  readonly measurements: MeasurementState;
  readonly threshold: number;
  readonly diagnosis: DiagnosticNarrative;
}): ReportEndpointRow[] {
  return input.endpoints.map((endpoint) => {
    const stats = input.stats[endpoint.id];
    const samples = sampleArrayFor(input.measurements, endpoint.id);
    const status = statusFor({ endpoint, stats, threshold: input.threshold, samples });

    return {
      endpointId: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      color: endpoint.color,
      enabled: endpoint.enabled,
      sampleCount: samples.length,
      okCount: okCount(samples),
      p50: stats?.ready ? stats.p50 : null,
      p95: stats?.ready ? stats.p95 : null,
      p99: stats?.ready ? stats.p99 : null,
      jitter: stats?.ready ? stats.stddev : null,
      lossPercent: stats?.lossPercent ?? 0,
      lastLatency: input.measurements.endpoints[endpoint.id]?.lastLatency ?? null,
      status,
      implicated: input.diagnosis.verdict.worstEpId === endpoint.id,
    };
  });
}

function buildCopySummary(report: Omit<DiagnosticReport, 'copySummary'>): string {
  const slowRows = report.endpointRows.filter((row) => row.status === 'slow' || row.implicated);
  const slowLine = slowRows.length > 0
    ? `Likely affected: ${slowRows.map((row) => `${row.label} (${fmtMs(row.p50)} p50)`).join(', ')}.`
    : 'No endpoint is currently above the report threshold.';
  const visibility = report.diagnosis.timingVisibility;
  const limitation = report.diagnosis.limitations[0];
  const nextStep = report.diagnosis.nextSteps[0] ?? 'Run another comparison from the affected network.';

  return [
    `Chronoscope diagnostic report: ${report.diagnosis.verdict.headline} (${report.diagnosis.confidenceLabel}).`,
    report.diagnosis.explanation,
    slowLine,
    `Evidence: ${report.keptSampleCount} samples kept across ${report.endpointRows.length} endpoints; threshold ${fmtMs(report.threshold)}; browser visibility: ${visibility.headline}.`,
    limitation ? `Caveat: ${limitation.detail}` : '',
    `Next step: ${nextStep}`,
  ].filter(Boolean).join('\n');
}

export function buildDiagnosticReport(input: DiagnosticReportInput): DiagnosticReport {
  const threshold = input.context?.healthThreshold ?? input.settings.healthThreshold;
  const thresholdSource = input.context?.healthThreshold != null ? 'shared' : 'local-default';
  const corsMode = input.context?.corsMode ?? input.settings.corsMode;
  const corsModeSource = input.context?.corsMode != null
    ? (input.context.sourceVersion === 2 ? 'shared' : 'payload-settings')
    : 'local-default';

  const samplesByEndpoint: Record<string, readonly MeasurementSample[]> = {};
  for (const endpoint of input.endpoints) {
    samplesByEndpoint[endpoint.id] = sampleArrayFor(input.measurements, endpoint.id);
  }

  const monitored = input.endpoints.filter((endpoint) => endpoint.enabled);
  const rows: VerdictRow[] = [];
  for (const endpoint of monitored) {
    const endpointStats = input.stats[endpoint.id];
    if (endpointStats?.ready) rows.push({ ep: endpoint, stats: endpointStats });
  }

  const diagnosis = buildDiagnosticNarrative({
    rows,
    threshold,
    corsMode,
    samplesByEndpoint,
    monitoredEndpointCount: monitored.length,
  });

  const fallbackSampleCount = sumSamples(samplesByEndpoint);
  const reportWithoutSummary: Omit<DiagnosticReport, 'copySummary'> = {
    diagnosis,
    endpointRows: buildEndpointRows({
      endpoints: input.endpoints,
      stats: input.stats,
      measurements: input.measurements,
      threshold,
      diagnosis,
    }),
    threshold,
    thresholdSource,
    corsMode,
    corsModeSource,
    roundCount: input.context?.roundCount ?? input.measurements.roundCounter,
    totalSampleCount: input.context?.totalSampleCount ?? fallbackSampleCount,
    keptSampleCount: input.context?.keptSampleCount ?? fallbackSampleCount,
    truncated: input.context?.truncated ?? false,
    createdAt: input.context?.createdAt ?? null,
    createdLabel: defaultCreatedLabel(input.context?.createdAt ?? null),
  };

  return {
    ...reportWithoutSummary,
    copySummary: buildCopySummary(reportWithoutSummary),
  };
}

export function formatReportMetric(value: number | null, suffix: 'ms' | '%' = 'ms'): string {
  if (suffix === '%') return value === null ? '-' : fmtPct(value);
  return fmtMs(value);
}
