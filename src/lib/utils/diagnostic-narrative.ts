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
export type DiagnosticClaimKind = 'measured' | 'inferred' | 'limited' | 'next-validation';
export type DiagnosticEvidenceGate =
  | 'sample-ready'
  | 'sample-actionable'
  | 'sample-mature'
  | 'all-enabled-ready'
  | 'total-timing'
  | 'phase-timing'
  | 'remote-vantage'
  | 'baseline-ready'
  | 'local-agent';

export interface DiagnosticClaim {
  readonly id: string;
  readonly kind: DiagnosticClaimKind;
  readonly strength: DiagnosticConfidence;
  readonly text: string;
  readonly evidenceIds: readonly string[];
  readonly requiredEvidence: readonly DiagnosticEvidenceGate[];
}

export type PrimaryValidationActionId =
  | 'collect-more-samples'
  | 'explain-browser-visibility'
  | 'open-investigate'
  | 'run-remote-check'
  | 'compare-network'
  | 'share-support-report'
  | 'share-snapshot';

export interface PrimaryValidationAction {
  readonly id: PrimaryValidationActionId;
  readonly label: string;
  readonly reason: string;
  readonly claim: DiagnosticClaim;
  readonly endpointId?: string;
}

export interface SnapshotEligibility {
  readonly eligible: boolean;
  readonly reason: string;
  readonly facts: readonly DiagnosticEvidence[];
}

export interface DiagnosticEvidence {
  readonly id?: string;
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
  readonly primaryAnswer: DiagnosticClaim;
  readonly claims: readonly DiagnosticClaim[];
  readonly primaryValidation: PrimaryValidationAction;
  readonly safeSummary: string;
  readonly snapshotEligibility: SnapshotEligibility;
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
export const MIN_READY_SAMPLES = 8;
export const MIN_ACTIONABLE_SAMPLES = 12;
export const MIN_MATURE_SAMPLES = 30;

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
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): DiagnosticConfidence {
  const { kind, rows, monitoredEndpointCount, overCount, timingVisibility, readiness } = input;
  if (rows.length === 0) return 'low';

  const minSamples = readiness.minSamples;
  const allEnabledReady = monitoredEndpointCount > 0 && rows.length === monitoredEndpointCount && readiness.allEnabledReady;
  if (!allEnabledReady) return 'low';
  if (minSamples < MIN_ACTIONABLE_SAMPLES) return 'low';

  let score = 0;
  if (rows.length >= 2 && monitoredEndpointCount >= 2) score++;
  if (rows.length >= 3 && monitoredEndpointCount >= 3) score++;
  if (minSamples >= MIN_ACTIONABLE_SAMPLES) score++;
  if (minSamples >= MIN_MATURE_SAMPLES) score++;
  if (timingVisibility.level === 'phase' || timingVisibility.level === 'mixed') score++;
  if (kind === 'isolated-endpoint' && rows.length >= 3) score++;
  if (kind === 'shared-network' && overCount >= 2) score++;
  if (kind === 'healthy' && rows.length >= 2) score++;

  if (kind === 'healthy' && minSamples >= MIN_MATURE_SAMPLES && rows.length >= 2) return 'high';
  if (kind === 'shared-network' && timingVisibility.level !== 'phase') return score >= 2 ? 'medium' : 'low';
  if (score >= 4 && minSamples >= MIN_MATURE_SAMPLES) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function confidenceReason(
  confidence: DiagnosticConfidence,
  rows: readonly VerdictRow[],
  monitoredEndpointCount: number,
  readiness: ReturnType<typeof sampleReadiness>,
): string {
  if (rows.length === 0) return 'Waiting for endpoints to collect enough successful samples.';
  const minSamples = readiness.minSamples;
  if (rows.length < monitoredEndpointCount) {
    return `${rows.length} of ${monitoredEndpointCount} enabled ${plural(monitoredEndpointCount, 'endpoint')} have enough samples for this answer.`;
  }
  if (minSamples < MIN_READY_SAMPLES) {
    return `Only ${minSamples} successful ${plural(minSamples, 'sample')} on the thinnest enabled endpoint.`;
  }
  if (minSamples < MIN_ACTIONABLE_SAMPLES) {
    return `The thinnest enabled endpoint has ${minSamples} samples; ${MIN_ACTIONABLE_SAMPLES} makes the answer actionable.`;
  }
  if (confidence === 'high') {
    return `${rows.length} enabled ${plural(rows.length, 'endpoint')} are mature; the thinnest has ${minSamples} samples.`;
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
      return 'Collecting browser-visible samples before making a diagnostic call.';
    case 'healthy':
      return 'Median latency, jitter, and failed requests are inside the current thresholds across ready endpoints.';
    case 'isolated-endpoint': {
      const bad = rows.find((row) => row.ep.id === verdict.worstEpId) ?? overRows[0];
      const label = bad?.ep.label ?? 'one endpoint';
      return `${label} is above ${fmtMs(threshold)} while the comparison endpoints are not in browser-visible data.`;
    }
    case 'shared-network':
      return 'Multiple endpoints are slow in the same browser-visible measurement window. That is shared symptom evidence, not hop-by-hop root-cause proof.';
    case 'packet-loss':
      return `Failed requests are elevated at ${fmtPct(avgLoss)}, even if median latency is still near normal.`;
    case 'jitter':
      return `Latency variance is elevated at ${fmtMs(avgJitter)}, so the connection is unstable even when the median looks acceptable.`;
    case 'multiple-slow':
      return `${overRows.length} endpoints are above ${fmtMs(threshold)}, but the browser evidence does not isolate one shared phase yet.`;
  }
}

function claimKindFor(kind: DiagnosticKind): DiagnosticClaimKind {
  switch (kind) {
    case 'collecting':
    case 'healthy':
    case 'packet-loss':
    case 'jitter':
      return 'measured';
    case 'isolated-endpoint':
    case 'shared-network':
    case 'multiple-slow':
      return 'inferred';
  }
}

function requiredEvidenceFor(kind: DiagnosticKind, timingVisibility: TimingVisibility): readonly DiagnosticEvidenceGate[] {
  const timingGate: DiagnosticEvidenceGate = timingVisibility.level === 'phase' ? 'phase-timing' : 'total-timing';
  switch (kind) {
    case 'collecting':
      return ['sample-ready'];
    case 'healthy':
      return ['all-enabled-ready', 'sample-mature', 'total-timing'];
    case 'isolated-endpoint':
      return ['all-enabled-ready', 'sample-actionable', timingGate];
    case 'shared-network':
      return ['all-enabled-ready', 'sample-actionable', 'phase-timing'];
    case 'packet-loss':
    case 'jitter':
    case 'multiple-slow':
      return ['all-enabled-ready', 'sample-actionable', 'total-timing'];
  }
}

function primaryAnswerFor(input: {
  readonly kind: DiagnosticKind;
  readonly confidence: DiagnosticConfidence;
  readonly rows: readonly VerdictRow[];
  readonly threshold: number;
  readonly verdict: Verdict;
  readonly timingVisibility: TimingVisibility;
}): DiagnosticClaim {
  const { kind, confidence, rows, threshold, verdict, timingVisibility } = input;
  const text = explanationFor(kind, rows, threshold, verdict);
  const evidenceIds: string[] = ['ready-endpoints', 'slow-endpoints', 'timing-visibility'];

  if (verdict.worstEpId !== undefined) evidenceIds.push('endpoint-to-inspect');
  if (verdict.phase !== undefined) evidenceIds.push('shared-signal');
  if (kind === 'packet-loss') evidenceIds.push('failed-requests');
  if (kind === 'jitter') evidenceIds.push('average-jitter');

  return {
    id: kind,
    kind: claimKindFor(kind),
    strength: confidence,
    text,
    evidenceIds,
    requiredEvidence: requiredEvidenceFor(kind, timingVisibility),
  };
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
      id: 'ready-endpoints',
      label: 'Ready endpoints',
      value: `${rows.length}/${monitoredEndpointCount}`,
      detail: rows.length === 0 ? 'waiting for samples' : 'ready for this answer',
    },
    {
      id: 'slow-endpoints',
      label: 'Slow endpoints',
      value: String(overRows.length),
      detail: `p50 above ${fmtMs(threshold)}`,
    },
    {
      id: 'timing-visibility',
      label: 'Timing visibility',
      value: timingVisibility.headline,
      detail: `${timingVisibility.phaseSampleCount}/${timingVisibility.okSampleCount} successful samples with phase timing`,
    },
  ];

  if (verdict.worstEpId !== undefined) {
    const row = rows.find((candidate) => candidate.ep.id === verdict.worstEpId);
    if (row) {
      evidence.push({
        id: 'endpoint-to-inspect',
        label: 'Endpoint to inspect',
        value: row.ep.label,
        detail: `p50 ${fmtMs(row.stats.p50)}`,
      });
    }
  }

  if (verdict.phase !== undefined) {
    evidence.push({
      id: 'shared-signal',
      label: 'Shared signal',
      value: PHASE_LABELS[verdict.phase],
      detail: 'dominant on multiple slow endpoints',
    });
  }

  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  if (avgLoss > LOSS_WARN_PERCENT) {
    evidence.push({ id: 'failed-requests', label: 'Failed requests', value: fmtPct(avgLoss) });
  }

  const avgJitter = mean(rows.map((row) => row.stats.stddev));
  if (avgJitter > JITTER_WARN_MS) {
    evidence.push({ id: 'average-jitter', label: 'Average jitter', value: fmtMs(avgJitter) });
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
      return ['Share a snapshot of these measured results, or keep it running if you are chasing an intermittent issue.'];
    case 'isolated-endpoint': {
      const row = rows.find((candidate) => candidate.ep.id === verdict.worstEpId);
      const label = row?.ep.label ?? 'the slow endpoint';
      return [
        `Open Investigate for ${label} and check whether spikes line up with other endpoints.`,
        'Compare the same endpoint from another network or outside vantage before assigning cause.',
      ];
    }
    case 'shared-network':
      return [
        'Compare from another network or run the local agent to narrow the shared browser-visible symptom.',
        'For endpoints you control, send Timing-Allow-Origin so Chronoscope can separate DNS, TCP, TLS, server, and transfer time.',
      ];
    case 'packet-loss':
      return ['Run longer to confirm the failure rate, then compare on another network or wired connection.'];
    case 'jitter':
      return ['Compare wired or another network, or run the local agent, to narrow the unstable browser-visible path.'];
    case 'multiple-slow':
      return ['Run longer and open Investigate on the worst endpoint to see whether the slow rounds correlate across sites.'];
  }
}

function successfulSampleCount(samples: readonly MeasurementSample[] | undefined): number | null {
  if (samples === undefined) return null;
  return samples.filter((sample) => sample.status === 'ok').length;
}

function estimatedSuccessfulSampleCount(stats: VerdictRow['stats']): number {
  const lossRatio = Math.max(0, Math.min(100, stats.lossPercent)) / 100;
  return Math.round(stats.sampleCount * (1 - lossRatio));
}

function sampleReadiness(
  rows: readonly VerdictRow[],
  monitoredEndpointCount: number,
  samplesByEndpoint: Readonly<Record<string, readonly MeasurementSample[]>>,
): {
  readonly minSamples: number;
  readonly allEnabledReady: boolean;
  readonly allEnabledActionable: boolean;
  readonly allEnabledMature: boolean;
} {
  const counts = rows.map((row) => {
    const actualOkCount = successfulSampleCount(samplesByEndpoint[row.ep.id]);
    return actualOkCount ?? estimatedSuccessfulSampleCount(row.stats);
  });
  const minSamples = counts.length === 0 ? 0 : Math.min(...counts);
  const allEnabled = monitoredEndpointCount > 0 && rows.length === monitoredEndpointCount;
  return {
    minSamples,
    allEnabledReady: allEnabled && minSamples >= MIN_READY_SAMPLES,
    allEnabledActionable: allEnabled && minSamples >= MIN_ACTIONABLE_SAMPLES,
    allEnabledMature: allEnabled && minSamples >= MIN_MATURE_SAMPLES,
  };
}

function snapshotEligibilityFor(input: {
  readonly kind: DiagnosticKind;
  readonly confidence: DiagnosticConfidence;
  readonly rows: readonly VerdictRow[];
  readonly evidence: readonly DiagnosticEvidence[];
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): SnapshotEligibility {
  const { kind, confidence, rows, evidence, readiness } = input;
  if (kind !== 'healthy') {
    return {
      eligible: false,
      reason: 'Snapshots are reserved for clean measured runs or explicit support reports.',
      facts: [],
    };
  }
  if (!readiness.allEnabledMature || confidence !== 'high') {
    return {
      eligible: false,
      reason: `Wait until every enabled endpoint has at least ${MIN_MATURE_SAMPLES} samples.`,
      facts: [],
    };
  }
  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  if (avgLoss > LOSS_WARN_PERCENT) {
    return {
      eligible: false,
      reason: 'Failed requests are elevated, so this run is better shared as a support report.',
      facts: [],
    };
  }
  const avgJitter = mean(rows.map((row) => row.stats.stddev));
  if (avgJitter >= JITTER_WARN_MS) {
    return {
      eligible: false,
      reason: 'Latency variance is elevated, so this run is better shared as a support report.',
      facts: [],
    };
  }
  return {
    eligible: true,
    reason: 'Mature browser-visible measurements are clean enough for a snapshot link.',
    facts: evidence.filter((item) => (
      item.id === 'ready-endpoints' || item.id === 'slow-endpoints' || item.id === 'timing-visibility'
    )),
  };
}

function primaryValidationFor(input: {
  readonly kind: DiagnosticKind;
  readonly rows: readonly VerdictRow[];
  readonly monitoredEndpointCount: number;
  readonly timingVisibility: TimingVisibility;
  readonly verdict: Verdict;
  readonly claim: DiagnosticClaim;
  readonly snapshotEligibility: SnapshotEligibility;
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): PrimaryValidationAction {
  const { kind, rows, monitoredEndpointCount, timingVisibility, verdict, claim, snapshotEligibility, readiness } = input;
  const minSamples = readiness.minSamples;

  // Priority 1: sample readiness outranks every other action so the UI does not
  // turn sparse data into a diagnostic recommendation.
  if (!readiness.allEnabledActionable) {
    const missingEndpoints = Math.max(monitoredEndpointCount - rows.length, 0);
    const reason = missingEndpoints > 0
      ? `${rows.length} of ${monitoredEndpointCount} enabled endpoints are ready; wait for the rest before acting on the answer.`
      : `The thinnest enabled endpoint has ${minSamples} samples; ${MIN_ACTIONABLE_SAMPLES} successful samples makes the answer actionable.`;
    return {
      id: 'collect-more-samples',
      label: 'Collect more samples',
      reason,
      claim,
    };
  }

  // Priority 2: a clean, mature run can be shared as measured results before
  // falling through to support-oriented guidance.
  if (snapshotEligibility.eligible) {
    return {
      id: 'share-snapshot',
      label: 'Copy Snapshot Link',
      reason: snapshotEligibility.reason,
      claim,
    };
  }

  // Priority 3: hidden browser timing phases limit what the product can claim,
  // so explain visibility before suggesting stronger validation.
  if (timingVisibility.level === 'total-only' || timingVisibility.level === 'mixed') {
    return {
      id: 'explain-browser-visibility',
      label: 'Review browser visibility',
      reason: `${timingVisibility.headline}: the browser can compare total fetch time, but hidden phases limit root-cause claims.`,
      claim,
      ...(verdict.worstEpId ? { endpointId: verdict.worstEpId } : {}),
    };
  }

  // Priority 4: one endpoint above threshold needs outside-vantage validation
  // before Chronoscope implies anything about origin, CDN, or local path.
  if (verdict.worstEpId !== undefined) {
    return {
      id: 'run-remote-check',
      label: 'Run remote check',
      reason: 'Compare this browser-visible result against an outside vantage before assigning cause.',
      claim,
      endpointId: verdict.worstEpId,
    };
  }

  // Priority 5: shared browser-visible symptoms need a second network or the
  // local agent to narrow where the symptom appears.
  if (kind === 'shared-network' || kind === 'multiple-slow' || kind === 'jitter' || kind === 'packet-loss') {
    return {
      id: 'compare-network',
      label: 'Compare another network',
      reason: 'The browser evidence shows the symptom; another network or the local agent can narrow where it appears.',
      claim,
    };
  }

  return {
    id: 'share-support-report',
    label: 'Create Support Report',
    reason: 'Share the measured facts and browser visibility caveats without overstating cause.',
    claim,
  };
}

function safeSummaryFor(claim: DiagnosticClaim, confidenceReasonText: string): string {
  return `browser-visible answer: ${claim.text} (${claim.strength} confidence; ${confidenceReasonText})`;
}

export function buildDiagnosticNarrative(input: DiagnosticInput): DiagnosticNarrative {
  const verdict = computeCausalVerdict(input.rows, input.threshold);
  const samples = allSamples(input.samplesByEndpoint);
  const timingVisibility = describeTimingVisibility(samples, input.corsMode);
  const kind = kindFor(verdict, input.rows, input.threshold);
  const severity = severityFor(kind);
  const overRows = input.rows.filter((row) => row.stats.p50 > input.threshold);
  const readiness = sampleReadiness(input.rows, input.monitoredEndpointCount, input.samplesByEndpoint);
  const confidence = confidenceFor({
    kind,
    rows: input.rows,
    monitoredEndpointCount: input.monitoredEndpointCount,
    overCount: overRows.length,
    timingVisibility,
    readiness,
  });
  const confidenceReasonText = confidenceReason(confidence, input.rows, input.monitoredEndpointCount, readiness);
  const primaryAnswer = primaryAnswerFor({
    kind,
    confidence,
    rows: input.rows,
    threshold: input.threshold,
    verdict,
    timingVisibility,
  });
  const evidence = evidenceFor({
    rows: input.rows,
    monitoredEndpointCount: input.monitoredEndpointCount,
    threshold: input.threshold,
    overRows,
    verdict,
    timingVisibility,
  });
  const snapshotEligibility = snapshotEligibilityFor({
    kind,
    confidence,
    rows: input.rows,
    evidence,
    readiness,
  });
  const primaryValidation = primaryValidationFor({
    kind,
    rows: input.rows,
    monitoredEndpointCount: input.monitoredEndpointCount,
    timingVisibility,
    verdict,
    claim: primaryAnswer,
    snapshotEligibility,
    readiness,
  });

  return {
    verdict,
    kind,
    severity,
    confidence,
    confidenceLabel: `${confidence} confidence`,
    confidenceReason: confidenceReasonText,
    primaryAnswer,
    claims: [primaryAnswer],
    primaryValidation,
    safeSummary: safeSummaryFor(primaryAnswer, confidenceReasonText),
    snapshotEligibility,
    explanation: primaryAnswer.text,
    evidence,
    limitations: limitationsFor(kind, timingVisibility),
    nextSteps: nextStepsFor(kind, verdict, input.rows),
    timingVisibility,
  };
}
