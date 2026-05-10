// src/lib/utils/diagnostic-narrative.ts
// Pure diagnostic narrative layer. It enriches the existing causal verdict with
// confidence, supporting evidence, browser visibility limits, and next steps.

import type { MeasurementSample, Settings } from '../types';
import { computeCausalVerdict, PHASE_LABELS, type Verdict, type VerdictRow } from './verdict';

export type DiagnosticKind =
  | 'collecting'
  | 'healthy'
  | 'isolated-endpoint'
  | 'shared-network'
  | 'packet-loss'
  | 'jitter'
  | 'multiple-slow';

export type DiagnosticSeverity = 'healthy' | 'watch' | 'degraded';
export type DiagnosticConfidence = 'low' | 'medium' | 'high';

export interface DiagnosticEvidence {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}

export interface DiagnosticLimitation {
  readonly id: 'browser-sandbox' | 'timing-visibility';
  readonly headline: string;
  readonly detail: string;
  readonly action?: string;
}

export interface TimingVisibility {
  readonly level: 'none' | 'total-only' | 'mixed' | 'phase';
  readonly headline: string;
  readonly detail: string;
  readonly action?: string;
  readonly okSampleCount: number;
  readonly phaseSampleCount: number;
}

export interface DiagnosticNarrative {
  readonly verdict: Verdict;
  readonly kind: DiagnosticKind;
  readonly severity: DiagnosticSeverity;
  readonly confidence: DiagnosticConfidence;
  readonly confidenceLabel: string;
  readonly confidenceReason: string;
  readonly explanation: string;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly limitations: readonly DiagnosticLimitation[];
  readonly nextSteps: readonly string[];
  readonly timingVisibility: TimingVisibility;
}

interface DiagnosticInput {
  readonly rows: readonly VerdictRow[];
  readonly threshold: number;
  readonly corsMode: Settings['corsMode'];
  readonly samplesByEndpoint: Readonly<Record<string, readonly MeasurementSample[]>>;
  readonly monitoredEndpointCount: number;
}

const LOSS_WARN_PERCENT = 1;
const JITTER_WARN_MS = 25;

function fmtMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function hasMeaningfulTier2(sample: MeasurementSample): boolean {
  if (sample.status !== 'ok' || sample.tier2 === undefined) return false;
  const t = sample.tier2;
  return [t.dnsLookup, t.tcpConnect, t.tlsHandshake, t.ttfb, t.contentTransfer]
    .some((value) => Number.isFinite(value) && value > 0);
}

export function describeTimingVisibility(
  samples: readonly MeasurementSample[],
  corsMode: Settings['corsMode'],
): TimingVisibility {
  let okSampleCount = 0;
  let phaseSampleCount = 0;

  for (const sample of samples) {
    if (sample.status !== 'ok') continue;
    okSampleCount++;
    if (hasMeaningfulTier2(sample)) phaseSampleCount++;
  }

  if (okSampleCount === 0) {
    return {
      level: 'none',
      headline: 'No successful browser timing yet',
      detail: 'Chronoscope needs at least one successful fetch before it can explain what the browser can see.',
      action: 'Run for a few more rounds or check whether the endpoint is reachable from this browser.',
      okSampleCount,
      phaseSampleCount,
    };
  }

  if (phaseSampleCount === 0) {
    const noCorsDetail =
      'Current no-cors mode can compare total browser fetch latency broadly, but it usually hides DNS, TCP, TLS, server, and transfer timing.';
    const corsDetail =
      'The browser received total fetch timing, but this endpoint did not expose phase timing through Resource Timing.';
    return {
      level: 'total-only',
      headline: 'Total latency only',
      detail: corsMode === 'no-cors' ? noCorsDetail : corsDetail,
      action: 'For endpoints you control, send Timing-Allow-Origin for this origin; use CORS mode only when the endpoint allows browser CORS.',
      okSampleCount,
      phaseSampleCount,
    };
  }

  if (phaseSampleCount < okSampleCount) {
    return {
      level: 'mixed',
      headline: 'Some phase timing is visible',
      detail: `${phaseSampleCount} of ${okSampleCount} successful ${plural(okSampleCount, 'sample')} exposed DNS/TCP/TLS/server timing. Warm reused connections can still report zero for DNS, TCP, or TLS.`,
      action: 'Use endpoints that consistently send Timing-Allow-Origin when you need phase-level evidence.',
      okSampleCount,
      phaseSampleCount,
    };
  }

  return {
    level: 'phase',
    headline: 'Phase timing visible',
    detail: 'The browser is exposing Resource Timing detail for successful samples. Warm reused connections may still show zero for DNS, TCP, or TLS.',
    okSampleCount,
    phaseSampleCount,
  };
}

function allSamples(samplesByEndpoint: Readonly<Record<string, readonly MeasurementSample[]>>): MeasurementSample[] {
  const out: MeasurementSample[] = [];
  for (const samples of Object.values(samplesByEndpoint)) out.push(...samples);
  return out;
}

function kindFor(verdict: Verdict, rows: readonly VerdictRow[], threshold: number): DiagnosticKind {
  if (rows.length === 0) return 'collecting';
  if (verdict.tone === 'good') return 'healthy';
  if (verdict.worstEpId !== undefined) return 'isolated-endpoint';
  if (verdict.phase !== undefined) return 'shared-network';

  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  if (avgLoss > LOSS_WARN_PERCENT) return 'packet-loss';

  const avgJitter = mean(rows.map((row) => row.stats.stddev));
  if (avgJitter > JITTER_WARN_MS) return 'jitter';

  const overCount = rows.filter((row) => row.stats.p50 > threshold).length;
  return overCount > 0 ? 'multiple-slow' : 'healthy';
}

function severityFor(kind: DiagnosticKind): DiagnosticSeverity {
  if (kind === 'healthy') return 'healthy';
  if (kind === 'collecting') return 'watch';
  return 'degraded';
}

function confidenceFor(input: {
  readonly kind: DiagnosticKind;
  readonly rows: readonly VerdictRow[];
  readonly monitoredEndpointCount: number;
  readonly overCount: number;
  readonly timingVisibility: TimingVisibility;
}): DiagnosticConfidence {
  const { kind, rows, monitoredEndpointCount, overCount, timingVisibility } = input;
  if (rows.length === 0) return 'low';

  const minSamples = Math.min(...rows.map((row) => row.stats.sampleCount));
  if (minSamples < 8) return 'low';

  let score = 0;
  if (rows.length >= 2 && monitoredEndpointCount >= 2) score++;
  if (rows.length >= 3 && monitoredEndpointCount >= 3) score++;
  if (minSamples >= 12) score++;
  if (minSamples >= 30) score++;
  if (timingVisibility.level === 'phase' || timingVisibility.level === 'mixed') score++;
  if (kind === 'isolated-endpoint' && rows.length >= 3) score++;
  if (kind === 'shared-network' && overCount >= 2) score++;
  if (kind === 'healthy' && rows.length >= 2) score++;

  if (score >= 4 && minSamples >= 30) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function confidenceReason(
  confidence: DiagnosticConfidence,
  rows: readonly VerdictRow[],
  monitoredEndpointCount: number,
): string {
  if (rows.length === 0) return 'Waiting for endpoints to collect enough successful samples.';
  const minSamples = Math.min(...rows.map((row) => row.stats.sampleCount));
  if (minSamples < 8) {
    return `Only ${minSamples} successful ${plural(minSamples, 'sample')} on the thinnest ready endpoint.`;
  }
  if (rows.length < monitoredEndpointCount) {
    return `${rows.length} of ${monitoredEndpointCount} enabled ${plural(monitoredEndpointCount, 'endpoint')} have enough samples for the verdict.`;
  }
  if (confidence === 'high') {
    return `${rows.length} enabled ${plural(rows.length, 'endpoint')} are ready; the thinnest has ${minSamples} samples.`;
  }
  return `${rows.length} enabled ${plural(rows.length, 'endpoint')} are ready with at least ${minSamples} samples.`;
}

function explanationFor(
  kind: DiagnosticKind,
  rows: readonly VerdictRow[],
  threshold: number,
  verdict: Verdict,
): string {
  const overRows = rows.filter((row) => row.stats.p50 > threshold);
  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  const avgJitter = mean(rows.map((row) => row.stats.stddev));

  switch (kind) {
    case 'collecting':
      return 'Chronoscope is collecting enough samples before it makes a network or endpoint call.';
    case 'healthy':
      return 'Median latency, jitter, and failed requests are inside the current thresholds across ready endpoints.';
    case 'isolated-endpoint': {
      const bad = rows.find((row) => row.ep.id === verdict.worstEpId) ?? overRows[0];
      const label = bad?.ep.label ?? 'one endpoint';
      return `${label} is above ${fmtMs(threshold)} while the comparison endpoints are not, so the issue looks endpoint-specific.`;
    }
    case 'shared-network':
      return 'Multiple endpoints are slow in the same measurement window, which points toward your local network, ISP, VPN, DNS, or another shared path.';
    case 'packet-loss':
      return `Failed requests are elevated at ${fmtPct(avgLoss)}, even if median latency is still near normal.`;
    case 'jitter':
      return `Latency variance is elevated at ${fmtMs(avgJitter)}, so the connection is unstable even when the median looks acceptable.`;
    case 'multiple-slow':
      return `${overRows.length} endpoints are above ${fmtMs(threshold)}, but the browser evidence does not isolate one shared phase yet.`;
  }
}

function evidenceFor(input: {
  readonly rows: readonly VerdictRow[];
  readonly monitoredEndpointCount: number;
  readonly threshold: number;
  readonly overRows: readonly VerdictRow[];
  readonly verdict: Verdict;
  readonly timingVisibility: TimingVisibility;
}): DiagnosticEvidence[] {
  const { rows, monitoredEndpointCount, threshold, overRows, verdict, timingVisibility } = input;
  const evidence: DiagnosticEvidence[] = [
    {
      label: 'Ready endpoints',
      value: `${rows.length}/${monitoredEndpointCount}`,
      detail: rows.length === 0 ? 'waiting for samples' : 'feeding the verdict',
    },
    {
      label: 'Slow endpoints',
      value: String(overRows.length),
      detail: `p50 above ${fmtMs(threshold)}`,
    },
    {
      label: 'Timing visibility',
      value: timingVisibility.headline,
      detail: `${timingVisibility.phaseSampleCount}/${timingVisibility.okSampleCount} successful samples with phase timing`,
    },
  ];

  if (verdict.worstEpId !== undefined) {
    const row = rows.find((candidate) => candidate.ep.id === verdict.worstEpId);
    if (row) {
      evidence.push({
        label: 'Likely source',
        value: row.ep.label,
        detail: `p50 ${fmtMs(row.stats.p50)}`,
      });
    }
  }

  if (verdict.phase !== undefined) {
    evidence.push({
      label: 'Shared signal',
      value: PHASE_LABELS[verdict.phase],
      detail: 'dominant on multiple slow endpoints',
    });
  }

  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  if (avgLoss > LOSS_WARN_PERCENT) {
    evidence.push({ label: 'Failed requests', value: fmtPct(avgLoss) });
  }

  const avgJitter = mean(rows.map((row) => row.stats.stddev));
  if (avgJitter > JITTER_WARN_MS) {
    evidence.push({ label: 'Average jitter', value: fmtMs(avgJitter) });
  }

  return evidence;
}

function limitationsFor(
  kind: DiagnosticKind,
  timingVisibility: TimingVisibility,
): DiagnosticLimitation[] {
  const limitations: DiagnosticLimitation[] = [];

  if (timingVisibility.level === 'total-only' || timingVisibility.level === 'mixed') {
    limitations.push({
      id: 'timing-visibility',
      headline: timingVisibility.headline,
      detail: timingVisibility.detail,
      ...(timingVisibility.action ? { action: timingVisibility.action } : {}),
    });
  }

  if (kind === 'shared-network' || kind === 'multiple-slow') {
    limitations.push({
      id: 'browser-sandbox',
      headline: 'Browser cannot see the full path',
      detail: 'Chronoscope cannot run traceroute, MTR, packet capture, Wi-Fi radio checks, full DNS-chain tracing, or TLS certificate inspection from inside the browser.',
      action: 'Use OS or network tools for hop-by-hop proof when the browser evidence points to a shared path.',
    });
  }

  return limitations;
}

function nextStepsFor(kind: DiagnosticKind, verdict: Verdict, rows: readonly VerdictRow[]): readonly string[] {
  switch (kind) {
    case 'collecting':
      return ['Let the run continue until each enabled endpoint has at least 12 successful samples.'];
    case 'healthy':
      return ['Keep it running if you are chasing an intermittent issue, then share the result link with the current evidence.'];
    case 'isolated-endpoint': {
      const row = rows.find((candidate) => candidate.ep.id === verdict.worstEpId);
      const label = row?.ep.label ?? 'the slow endpoint';
      return [
        `Open Investigate for ${label} and check whether spikes line up with other endpoints.`,
        'Try the same endpoint from another network to confirm whether the origin or CDN is the source.',
      ];
    }
    case 'shared-network':
      return [
        'Compare from another network or disable VPN/Wi-Fi variables to see whether the shared slowdown follows you.',
        'For endpoints you control, send Timing-Allow-Origin so Chronoscope can separate DNS, TCP, TLS, server, and transfer time.',
      ];
    case 'packet-loss':
      return ['Run longer to confirm the failure rate, then compare on another network or wired connection.'];
    case 'jitter':
      return ['Check Wi-Fi, VPN, and local load first; high jitter often means the path is unstable rather than simply slow.'];
    case 'multiple-slow':
      return ['Run longer and open Investigate on the worst endpoint to see whether the slow rounds correlate across sites.'];
  }
}

export function buildDiagnosticNarrative(input: DiagnosticInput): DiagnosticNarrative {
  const verdict = computeCausalVerdict(input.rows, input.threshold);
  const samples = allSamples(input.samplesByEndpoint);
  const timingVisibility = describeTimingVisibility(samples, input.corsMode);
  const kind = kindFor(verdict, input.rows, input.threshold);
  const severity = severityFor(kind);
  const overRows = input.rows.filter((row) => row.stats.p50 > input.threshold);
  const confidence = confidenceFor({
    kind,
    rows: input.rows,
    monitoredEndpointCount: input.monitoredEndpointCount,
    overCount: overRows.length,
    timingVisibility,
  });

  return {
    verdict,
    kind,
    severity,
    confidence,
    confidenceLabel: `${confidence} confidence`,
    confidenceReason: confidenceReason(confidence, input.rows, input.monitoredEndpointCount),
    explanation: explanationFor(kind, input.rows, input.threshold, verdict),
    evidence: evidenceFor({
      rows: input.rows,
      monitoredEndpointCount: input.monitoredEndpointCount,
      threshold: input.threshold,
      overRows,
      verdict,
      timingVisibility,
    }),
    limitations: limitationsFor(kind, timingVisibility),
    nextSteps: nextStepsFor(kind, verdict, input.rows),
    timingVisibility,
  };
}
