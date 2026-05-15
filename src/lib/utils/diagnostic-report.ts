// src/lib/utils/diagnostic-report.ts
// Pure report model for shared result snapshots. It turns the live diagnostic
// narrative into a support-ready, read-only artifact.

import type {
  Endpoint,
  EndpointStatistics,
  MeasurementSample,
  MeasurementState,
  ReportKind,
  Settings,
  SharedReportContext,
  StatisticsState,
} from '../types';
import { buildDiagnosticNarrative, type DiagnosticNarrative } from './diagnostic-narrative';
import { reportModeCopy } from './report-mode';
import { buildRunStoryline, type RunStoryline, type StoryBeat } from './run-storyline';
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
  readonly statusLabel: string;
  readonly implicated: boolean;
}

export interface ReportTimelineEvent {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly severity: 'info' | 'watch' | 'bad' | 'good';
  readonly timeLabel: string;
}

export interface DiagnosticReport {
  readonly reportKind: ReportKind;
  readonly modeKicker: string;
  readonly modeLede: string;
  readonly copySummaryLabel: string;
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
  readonly timelineSummary: string;
  readonly timelineEvents: readonly ReportTimelineEvent[];
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

function statusLabelFor(status: ReportEndpointRow['status'], implicated: boolean): string {
  if (implicated) return 'inspect';
  switch (status) {
    case 'ok':
      return 'ok';
    case 'slow':
      return 'above threshold';
    case 'loss':
      return 'failed requests';
    case 'unready':
      return 'collecting';
    case 'disabled':
      return 'disabled';
  }
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
    const implicated = input.diagnosis.verdict.worstEpId === endpoint.id;

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
      statusLabel: statusLabelFor(status, implicated),
      implicated,
    };
  });
}

function buildCopySummary(report: Omit<DiagnosticReport, 'copySummary'>): string {
  const slowRows = report.endpointRows.filter((row) => row.status === 'slow' || row.implicated);
  const slowLine = slowRows.length > 0
    ? `Endpoints to inspect: ${slowRows.map((row) => `${row.label} (${fmtMs(row.p50)} median)`).join(', ')}.`
    : 'No endpoint is currently above the report threshold.';
  const visibility = report.diagnosis.timingVisibility;
  const limitation = report.diagnosis.limitations[0];
  const firstTriageAction = report.diagnosis.triageActions[0];
  const validationLine = report.diagnosis.primaryValidation.claim.id !== report.diagnosis.primaryAnswer.id
    ? `Next validation: ${report.diagnosis.primaryValidation.claim.text}`
    : firstTriageAction ? `First next test: ${firstTriageAction.action}` : '';
  const reportLabel = report.reportKind === 'snapshot'
    ? 'Chronoscope performance snapshot'
    : 'Chronoscope support report';

  return [
    `${reportLabel}: ${report.diagnosis.primaryAnswer.text} (${report.diagnosis.confidenceLabel}).`,
    `Trust: ${report.diagnosis.supportingSummary}`,
    slowLine,
    `Timeline: ${report.timelineSummary}`,
    `Evidence: ${report.keptSampleCount} samples kept across ${report.endpointRows.length} endpoints; threshold ${fmtMs(report.threshold)}; browser visibility: ${visibility.headline}.`,
    limitation ? `Caveat: ${limitation.detail}` : '',
    validationLine,
    firstTriageAction ? `Watch for: ${firstTriageAction.watchFor}` : '',
  ].filter(Boolean).join('\n');
}

function timelineTimeLabel(beat: StoryBeat, storyline: RunStoryline): string {
  const secondsBeforeEnd = Math.max(0, Math.round((storyline.windowEnd - beat.t) / 1000));
  if (secondsBeforeEnd <= 0) return 'latest';
  if (secondsBeforeEnd < 60) return `${secondsBeforeEnd}s before end`;
  const minutes = Math.floor(secondsBeforeEnd / 60);
  const seconds = secondsBeforeEnd % 60;
  return seconds === 0 ? `${minutes}m before end` : `${minutes}m ${seconds}s before end`;
}

function timelineEventsFor(storyline: RunStoryline): ReportTimelineEvent[] {
  return storyline.beats.slice(-4).map((beat) => ({
    id: beat.id,
    label: beat.label,
    detail: beat.evidence,
    severity: beat.severity,
    timeLabel: timelineTimeLabel(beat, storyline),
  }));
}

export function buildDiagnosticReport(input: DiagnosticReportInput): DiagnosticReport {
  const threshold = input.context?.healthThreshold ?? input.settings.healthThreshold;
  const thresholdSource = input.context?.healthThreshold != null ? 'shared' : 'local-default';
  const corsMode = input.context?.corsMode ?? input.settings.corsMode;
  const reportKind = input.context?.reportKind ?? 'support';
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
  const storyline = buildRunStoryline({
    endpoints: input.endpoints,
    samplesByEndpoint,
    threshold,
    runStart: input.measurements.startedAt,
    focusedEndpointId: diagnosis.verdict.worstEpId,
    maxVisibleRows: Math.min(4, Math.max(1, input.endpoints.length)),
  });

  const fallbackSampleCount = sumSamples(samplesByEndpoint);
  const totalSampleCount = input.context?.totalSampleCount ?? fallbackSampleCount;
  const keptSampleCount = input.context?.keptSampleCount ?? fallbackSampleCount;
  const modeCopy = reportModeCopy({
    reportKind,
    primaryAnswer: diagnosis.primaryAnswer.text,
    confidenceLabel: diagnosis.confidenceLabel,
    sampleCount: keptSampleCount,
    endpointCount: input.endpoints.length,
    timingHeadline: diagnosis.timingVisibility.headline,
  });
  const reportWithoutSummary: Omit<DiagnosticReport, 'copySummary'> = {
    reportKind,
    modeKicker: modeCopy.kicker,
    modeLede: modeCopy.lede,
    copySummaryLabel: modeCopy.primaryActionLabel,
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
    totalSampleCount,
    keptSampleCount,
    truncated: input.context?.truncated ?? false,
    createdAt: input.context?.createdAt ?? null,
    createdLabel: defaultCreatedLabel(input.context?.createdAt ?? null),
    timelineSummary: storyline.summary,
    timelineEvents: timelineEventsFor(storyline),
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
