// src/lib/utils/diagnostic-narrative.ts
// Pure diagnostic narrative layer. It enriches the existing causal verdict with
// confidence, supporting evidence, browser visibility limits, and next steps.

import type { MeasurementSample, Settings } from '../types';
import { classifyLossPattern } from '../loss/patterns';
import { renderClaim, type ClaimEvidenceState, type ClaimId } from './claim-registry';
import { classify } from './classify';
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

export type DiagnosticTriageActionId =
  | 'collect-more-samples'
  | 'review-browser-visibility'
  | 'open-investigate'
  | 'run-remote-check'
  | 'compare-another-network'
  | 'run-local-agent'
  | 'share-support-report'
  | 'share-snapshot'
  | 'keep-running';

export interface DiagnosticTriageAction {
  readonly id: DiagnosticTriageActionId;
  readonly label: string;
  readonly action: string;
  readonly why: string;
  readonly watchFor: string;
  readonly requiredEvidence: readonly DiagnosticEvidenceGate[];
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
  readonly supportingSummary: string;
  readonly snapshotEligibility: SnapshotEligibility;
  readonly explanation: string;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly limitations: readonly DiagnosticLimitation[];
  readonly triageActions: readonly DiagnosticTriageAction[];
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
      headline: 'No successful checks yet',
      detail: 'Chronoscope needs at least one successful browser check before it can explain what timing details are visible.',
      action: 'Run for a few more rounds or check whether the site is reachable from this browser.',
      okSampleCount,
      phaseSampleCount,
    };
  }

  if (phaseSampleCount === 0) {
    const noCorsDetail =
      'Chronoscope can compare total load time, but the browser usually hides DNS, TCP, TLS, server, and transfer timing in no-cors mode.';
    const corsDetail =
      'Chronoscope can compare total load time, but this site has not exposed DNS, TCP, TLS, server, or transfer timing through Resource Timing.';
    return {
      level: 'total-only',
      headline: 'Some timing details are hidden by the browser',
      detail: corsMode === 'no-cors' ? noCorsDetail : corsDetail,
      action: 'For sites you control, send Timing-Allow-Origin when you need those details; use CORS mode only when the site allows browser CORS.',
      okSampleCount,
      phaseSampleCount,
    };
  }

  if (phaseSampleCount < okSampleCount) {
    return {
      level: 'mixed',
      headline: 'Some timing details are hidden by the browser',
      detail: `${phaseSampleCount} of ${okSampleCount} successful ${plural(okSampleCount, 'check')} exposed detailed timing. Browsers may hide DNS, TCP, TLS, server, or transfer timing on the rest.`,
      action: 'For sites you control, send Timing-Allow-Origin when you need those details.',
      okSampleCount,
      phaseSampleCount,
    };
  }

  return {
    level: 'phase',
    headline: 'Detailed timing visible',
    detail: 'The browser is exposing DNS, TCP, TLS, server, and transfer timing for successful checks. Reused connections may still show zero for DNS, TCP, or TLS.',
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

function hasHealthyVariation(rows: readonly VerdictRow[], threshold: number): boolean {
  return rows.some((row) => {
    const bucket = classify(row.stats, threshold);
    return bucket === 'degraded' || bucket === 'unhealthy';
  });
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
  rows: readonly VerdictRow[],
  monitoredEndpointCount: number,
  readiness: ReturnType<typeof sampleReadiness>,
): string {
  if (rows.length === 0) return 'Waiting for the first successful checks.';
  const minSamples = readiness.minSamples;
  if (rows.length < monitoredEndpointCount) {
    return `Based on ready data from ${rows.length} of ${monitoredEndpointCount} ${plural(monitoredEndpointCount, 'site')} so far.`;
  }
  if (minSamples < MIN_READY_SAMPLES) {
    return `Only ${minSamples} successful ${plural(minSamples, 'check')} on the least-sampled site so far.`;
  }
  if (minSamples < MIN_ACTIONABLE_SAMPLES) {
    return `Based on ${minSamples} successful ${plural(minSamples, 'check')} on the least-sampled site; ${MIN_ACTIONABLE_SAMPLES} makes this actionable.`;
  }
  return `Based on ${minSamples}+ successful checks across ${rows.length} ${plural(rows.length, 'site')}.`;
}

function explanationFor(
  kind: DiagnosticKind,
  rows: readonly VerdictRow[],
  threshold: number,
  verdict: Verdict,
): string {
  const overRows = rows.filter((row) => row.stats.p50 > threshold);

  switch (kind) {
    case 'collecting':
      return 'Collecting enough data to call this test.';
    case 'healthy':
      return hasHealthyVariation(rows, threshold)
        ? 'Looks good, with minor variation.'
        : 'This test looks healthy.';
    case 'isolated-endpoint': {
      const bad = rows.find((row) => row.ep.id === verdict.worstEpId) ?? overRows[0];
      const label = bad?.ep.label ?? 'One site';
      if (rows.length < 2) return `${label} is slower than your threshold.`;
      return `${label} is slower than the others in this test.`;
    }
    case 'shared-network':
      return 'Several sites are slow in the same test window.';
    case 'packet-loss':
      return 'Some requests are failing.';
    case 'jitter':
      return 'Latency is jumping around.';
    case 'multiple-slow':
      return 'Several sites are slower than your threshold.';
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
  readonly samplesByEndpoint: Readonly<Record<string, readonly MeasurementSample[]>>;
}): DiagnosticEvidence[] {
  const { rows, monitoredEndpointCount, threshold, overRows, verdict, timingVisibility } = input;
  const evidence: DiagnosticEvidence[] = [
    {
      id: 'ready-endpoints',
      label: 'Ready sites',
      value: `${rows.length}/${monitoredEndpointCount}`,
      detail: rows.length === 0 ? 'waiting for successful checks' : 'enough checks for this answer',
    },
    {
      id: 'slow-endpoints',
      label: 'Slow sites',
      value: String(overRows.length),
      detail: `median above ${fmtMs(threshold)}`,
    },
    {
      id: 'timing-visibility',
      label: 'Timing visibility',
      value: timingVisibility.headline,
      detail: `${timingVisibility.phaseSampleCount}/${timingVisibility.okSampleCount} successful checks with detailed timing`,
    },
  ];

  if (verdict.worstEpId !== undefined) {
    const row = rows.find((candidate) => candidate.ep.id === verdict.worstEpId);
    if (row) {
      evidence.push({
        id: 'endpoint-to-inspect',
        label: 'Site to inspect',
        value: row.ep.label,
        detail: `median ${fmtMs(row.stats.p50)}`,
      });
    }
  }

  if (verdict.phase !== undefined) {
    evidence.push({
      id: 'shared-signal',
      label: 'Shared signal',
      value: PHASE_LABELS[verdict.phase],
      detail: 'dominant on multiple slow sites',
    });
  }

  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  if (avgLoss > LOSS_WARN_PERCENT) {
    const lossySamples = rows
      .filter((row) => row.stats.lossPercent > LOSS_WARN_PERCENT)
      .flatMap((row) => input.samplesByEndpoint[row.ep.id] ?? []);
    const lossPattern = classifyLossPattern(lossySamples);
    evidence.push({
      id: 'failed-requests',
      label: 'Failed requests',
      value: fmtPct(avgLoss),
      ...(lossPattern.kind === 'none' || lossPattern.totalCount === 0
        ? {}
        : { detail: lossPattern.safeSummary }),
    });
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
      return ['Let the test continue until each site has at least 12 successful checks.'];
    case 'healthy':
      return ['Share a snapshot of these measured results, or keep it running if the issue comes and goes.'];
    case 'isolated-endpoint': {
      const row = rows.find((candidate) => candidate.ep.id === verdict.worstEpId);
      const label = row?.ep.label ?? 'the slow site';
      return [
        `Open Investigate for ${label} to compare it with the same moments on other sites.`,
        'Try the same site from another network before assigning cause.',
      ];
    }
    case 'shared-network':
      return [
        'Compare from another network or run the local agent to narrow where the slowdown appears.',
        'For sites you control, send Timing-Allow-Origin so Chronoscope can separate DNS, TCP, TLS, server, and transfer time.',
      ];
    case 'packet-loss':
      return ['Run longer to confirm the failure rate, then compare on another network or wired connection.'];
    case 'jitter':
      return ['Compare wired or another network, or run the local agent, to narrow where latency is jumping around.'];
    case 'multiple-slow':
      return ['Run longer and open Investigate on the slowest site to see whether the slow moments line up.'];
  }
}

function browserVisibilityAction(timingVisibility: TimingVisibility): DiagnosticTriageAction | null {
  if (timingVisibility.level !== 'total-only' && timingVisibility.level !== 'mixed') return null;
  return {
    id: 'review-browser-visibility',
    label: 'Check visibility',
    action: 'Review what the browser can and cannot see.',
    why: 'Chronoscope can compare total load time, but the browser hides DNS, TCP, TLS, server, or transfer detail for some sites.',
    watchFor: 'If detailed timing appears, the next test can be stronger; otherwise treat this as a timing comparison.',
    requiredEvidence: ['total-timing'],
  };
}

function endpointLabelFor(verdict: Verdict, rows: readonly VerdictRow[]): string {
  return rows.find((row) => row.ep.id === verdict.worstEpId)?.ep.label ?? 'the slow site';
}

function claimEvidenceStateFor(
  readiness: ReturnType<typeof sampleReadiness>,
  timingVisibility: TimingVisibility,
): ClaimEvidenceState {
  return {
    sampleReady: readiness.minSamples >= MIN_READY_SAMPLES,
    sampleActionable: readiness.allEnabledActionable,
    sampleMature: readiness.allEnabledMature,
    allEnabledReady: readiness.allEnabledReady,
    totalTiming: timingVisibility.level !== 'none',
    phaseTiming: timingVisibility.level === 'phase' || timingVisibility.level === 'mixed',
    remoteVantage: false,
    baselineReady: false,
    localAgent: false,
  };
}

function appendRegistryClaim(
  claims: DiagnosticClaim[],
  id: ClaimId,
  evidence: ClaimEvidenceState,
  vars: Record<string, string> = {},
): void {
  const claim = renderClaim(id, evidence, vars);
  if (claim) claims.push(claim);
}

function registryClaimsFor(input: {
  readonly kind: DiagnosticKind;
  readonly verdict: Verdict;
  readonly rows: readonly VerdictRow[];
  readonly timingVisibility: TimingVisibility;
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): readonly DiagnosticClaim[] {
  const { kind, verdict, rows, timingVisibility, readiness } = input;
  const evidence = claimEvidenceStateFor(readiness, timingVisibility);
  const endpointLabel = endpointLabelFor(verdict, rows);
  const claims: DiagnosticClaim[] = [];

  if (kind === 'isolated-endpoint' && readiness.allEnabledActionable) {
    appendRegistryClaim(claims, 'browser-measured-comparison', evidence, { endpointLabel });
  }

  if (timingVisibility.level === 'total-only' || timingVisibility.level === 'mixed') {
    appendRegistryClaim(claims, 'browser-visibility-limited', evidence);
  }

  if (verdict.worstEpId !== undefined && readiness.allEnabledActionable) {
    appendRegistryClaim(claims, 'run-outside-check-next', evidence, { endpointLabel });
  }

  if (
    readiness.allEnabledActionable &&
    (kind === 'shared-network' || kind === 'multiple-slow' || kind === 'packet-loss' || kind === 'jitter')
  ) {
    appendRegistryClaim(claims, 'run-local-agent-next', evidence, { endpointLabel: 'this result' });
  }

  return claims;
}

function registryClaimById(
  claims: readonly DiagnosticClaim[],
  id: ClaimId,
): DiagnosticClaim | null {
  return claims.find((claim) => claim.id === id) ?? null;
}

function triageActionsFor(input: {
  readonly kind: DiagnosticKind;
  readonly verdict: Verdict;
  readonly rows: readonly VerdictRow[];
  readonly threshold: number;
  readonly timingVisibility: TimingVisibility;
  readonly primaryAnswer: DiagnosticClaim;
}): readonly DiagnosticTriageAction[] {
  const { kind, verdict, rows, threshold, timingVisibility, primaryAnswer } = input;
  const visibility = browserVisibilityAction(timingVisibility);
  const endpointLabel = endpointLabelFor(verdict, rows);
  const endpointId = verdict.worstEpId;

  if (kind === 'collecting') {
    return [{
      id: 'collect-more-samples',
      label: 'Keep collecting',
      action: 'Let the test keep running before acting on the answer.',
      why: 'Early samples can make one site look unusual before the set has enough successful checks.',
      watchFor: `Wait until each enabled site has at least ${MIN_ACTIONABLE_SAMPLES} successful checks.`,
      requiredEvidence: ['sample-ready'],
    }];
  }

  if (kind === 'healthy') {
    const withVariation = hasHealthyVariation(rows, threshold);
    return [
      {
        id: 'share-snapshot',
        label: 'Share result',
        action: withVariation ? 'Share this measured run with the variation visible.' : 'Share this clean measured run.',
        why: withVariation
          ? 'No enabled site is consistently slow or failing, but higher-latency checks are visible in the measurements.'
          : 'Every enabled site has mature checks and Chronoscope did not see slow medians or failed requests in this browser run.',
        watchFor: withVariation
          ? 'If one site or several sites start crossing the threshold, use the changed report instead of this measured snapshot.'
          : 'If the issue returns later, compare the new run against this clean snapshot.',
        requiredEvidence: ['all-enabled-ready', 'sample-mature', 'total-timing'],
      },
      {
        id: 'keep-running',
        label: 'Watch intermittent issues',
        action: 'Keep it running if the problem comes and goes.',
        why: 'Intermittent network symptoms often need more time before they show a repeatable pattern.',
        watchFor: 'If one site or several sites start crossing the threshold, use the changed report instead of this clean one.',
        requiredEvidence: ['sample-mature'],
      },
    ];
  }

  if (kind === 'isolated-endpoint') {
    return [
      ...(visibility ? [visibility] : []),
      {
        id: 'open-investigate',
        label: 'Inspect slow moments',
        action: `Open Investigate for ${endpointLabel} and compare slow moments across sites.`,
        why: 'This checks whether the slow moments are isolated or shared.',
        watchFor: `If only ${endpointLabel} stays slow, run the outside check before sharing; if several sites slow together, use shared-path tests.`,
        requiredEvidence: primaryAnswer.requiredEvidence,
        ...(endpointId ? { endpointId } : {}),
      },
      {
        id: 'run-remote-check',
        label: 'Run outside check',
        action: `Run a remote check for ${endpointLabel}.`,
        why: 'This separates what this browser path sees from what another network path sees.',
        watchFor: 'If the outside check is clean while this browser is slow, compare another local network; if both are slow, share the report.',
        requiredEvidence: ['all-enabled-ready', 'sample-actionable', 'total-timing'],
        ...(endpointId ? { endpointId } : {}),
      },
      {
        id: 'compare-another-network',
        label: 'Compare location',
        action: 'Try the same check from another network or device.',
        why: 'A second local vantage shows whether the pattern follows this connection.',
        watchFor: `If ${endpointLabel} is slow from multiple networks, the report is stronger; if it is only slow here, continue local-path checks.`,
        requiredEvidence: ['all-enabled-ready', 'sample-actionable', 'total-timing'],
        ...(endpointId ? { endpointId } : {}),
      },
    ];
  }

  if (kind === 'shared-network' || kind === 'multiple-slow') {
    const actions: DiagnosticTriageAction[] = [
      ...(visibility ? [visibility] : []),
      {
        id: 'compare-another-network',
        label: 'Compare location',
        action: 'Run the same set from another network.',
        why: 'A second network shows whether the symptom follows this path.',
        watchFor: 'If the second network is clean, deepen local-path checks; if both show the same pattern, share the measured report.',
        requiredEvidence: primaryAnswer.requiredEvidence,
      },
      {
        id: 'run-local-agent',
        label: 'Deepen local proof',
        action: 'Run the local agent for DNS trace, route hops, TLS, and Wi-Fi details.',
        why: 'The browser cannot see route hops, DNS-chain, certificate, or radio details by itself.',
        watchFor: 'hop-by-hop loss, DNS failures, certificate errors, or weak Wi-Fi signal would make the local-path case stronger.',
        requiredEvidence: ['sample-actionable', 'local-agent'],
      },
      {
        id: 'share-support-report',
        label: 'Share measured facts',
        action: 'Share the support report with the evidence and browser limits included.',
        why: 'The report is useful when it separates measured facts from what Chronoscope cannot see.',
        watchFor: 'A responder should be able to see which sites were slow, how many samples were kept, and which timing details were hidden.',
        requiredEvidence: ['all-enabled-ready', 'sample-actionable', 'total-timing'],
      },
    ];
    return actions.slice(0, 4);
  }

  if (kind === 'packet-loss') {
    return [
      {
        id: 'compare-another-network',
        label: 'Confirm failures',
        action: 'Run longer, then compare on another network or a wired connection.',
        why: 'Failed requests need repeatability before they point to a useful next test.',
        watchFor: 'If failures continue across networks, share the report; if they stop on another path, deepen local checks.',
        requiredEvidence: primaryAnswer.requiredEvidence,
      },
      {
        id: 'run-local-agent',
        label: 'Check local path',
        action: 'Run the local agent if failures keep appearing here.',
        why: 'Local packet loss needs OS-level route and interface evidence that the browser cannot collect.',
        watchFor: 'Hop-by-hop loss or interface errors would make the local-path case stronger.',
        requiredEvidence: ['sample-actionable', 'local-agent'],
      },
    ];
  }

  if (kind === 'jitter') {
    return [
      {
        id: 'compare-another-network',
        label: 'Compare stability',
        action: 'Compare wired, Wi-Fi, or another network while watching jitter.',
        why: 'Latency swings can come from local radio, congestion, or the service path, so the next test is whether they follow this connection.',
        watchFor: 'If jitter drops on another path, continue local checks; if it follows the same site set, share the report.',
        requiredEvidence: primaryAnswer.requiredEvidence,
      },
      {
        id: 'run-local-agent',
        label: 'Measure deeper',
        action: 'Run the local agent to add route and Wi-Fi signal evidence.',
        why: 'The browser can show jumping latency, but not radio quality or hop-level variation.',
        watchFor: 'Weak signal, changing route latency, or hop-level spikes would narrow the next support conversation.',
        requiredEvidence: ['sample-actionable', 'local-agent'],
      },
    ];
  }

  return [{
    id: 'share-support-report',
    label: 'Share measured facts',
    action: 'Share the report after one more run confirms the same pattern.',
    why: 'A repeated run makes unresolved slow-site evidence more useful without overstating why it happened.',
    watchFor: 'If the same endpoints cross the threshold again, the report is stronger; if the pattern changes, keep collecting.',
    requiredEvidence: primaryAnswer.requiredEvidence,
  }];
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
  readonly threshold: number;
  readonly evidence: readonly DiagnosticEvidence[];
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): SnapshotEligibility {
  const { kind, confidence, rows, threshold, evidence, readiness } = input;
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
      reason: `Wait until every site has at least ${MIN_MATURE_SAMPLES} successful checks.`,
      facts: [],
    };
  }
  const avgLoss = mean(rows.map((row) => row.stats.lossPercent));
  if (avgLoss > LOSS_WARN_PERCENT) {
    return {
      eligible: false,
      reason: 'Some requests are failing, so this run is better shared as a support report.',
      facts: [],
    };
  }
  const avgJitter = mean(rows.map((row) => row.stats.stddev));
  if (avgJitter >= JITTER_WARN_MS) {
    return {
      eligible: false,
      reason: 'Latency is jumping around, so this run is better shared as a support report.',
      facts: [],
    };
  }
  return {
    eligible: true,
    reason: hasHealthyVariation(rows, threshold)
      ? 'This run has enough checks for a measured snapshot, with the variation included.'
      : 'This run has enough clean checks for a snapshot link.',
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
  readonly registryClaims: readonly DiagnosticClaim[];
  readonly snapshotEligibility: SnapshotEligibility;
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): PrimaryValidationAction {
  const {
    kind,
    rows,
    monitoredEndpointCount,
    timingVisibility,
    verdict,
    claim,
    registryClaims,
    snapshotEligibility,
    readiness,
  } = input;
  const minSamples = readiness.minSamples;

  // Priority 1: sample readiness outranks every other action so the UI does not
  // turn sparse data into a diagnostic recommendation.
  if (!readiness.allEnabledActionable) {
    const missingEndpoints = Math.max(monitoredEndpointCount - rows.length, 0);
    const reason = missingEndpoints > 0
      ? `${rows.length} of ${monitoredEndpointCount} ${plural(monitoredEndpointCount, 'site')} have enough checks so far. Wait for the rest before acting on this answer.`
      : `The least-sampled site has ${minSamples} successful ${plural(minSamples, 'check')}; ${MIN_ACTIONABLE_SAMPLES} makes this actionable.`;
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
      reason: 'Chronoscope can compare total load time, but not every DNS, TCP, TLS, or server timing detail is visible.',
      claim: registryClaimById(registryClaims, 'browser-visibility-limited') ?? claim,
      ...(verdict.worstEpId ? { endpointId: verdict.worstEpId } : {}),
    };
  }

  // Priority 4: one endpoint above threshold needs outside-vantage validation
  // before Chronoscope implies anything about origin, CDN, or local path.
  if (verdict.worstEpId !== undefined) {
    return {
      id: 'run-remote-check',
      label: 'Run remote check',
      reason: 'Compare this test from outside your network before assigning cause.',
      claim: registryClaimById(registryClaims, 'run-outside-check-next') ?? claim,
      endpointId: verdict.worstEpId,
    };
  }

  // Priority 5: shared browser-visible symptoms need a second network or the
  // local agent to narrow where the symptom appears.
  if (kind === 'shared-network' || kind === 'multiple-slow' || kind === 'jitter' || kind === 'packet-loss') {
    return {
      id: 'compare-network',
      label: 'Compare another network',
      reason: 'This browser test shows the symptom; another network or the local agent can narrow where it appears.',
      claim: registryClaimById(registryClaims, 'run-local-agent-next') ?? claim,
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
  return `This browser test: ${claim.text} (${claim.strength} confidence; ${confidenceReasonText})`;
}

function timingSummaryFor(timingVisibility: TimingVisibility): string {
  switch (timingVisibility.level) {
    case 'none':
      return 'no successful timing yet';
    case 'total-only':
      return 'total timing only';
    case 'mixed':
      return `${timingVisibility.phaseSampleCount}/${timingVisibility.okSampleCount} checks show detailed timing`;
    case 'phase':
      return 'detailed timing visible';
  }
}

function sampleScopeFor(
  rows: readonly VerdictRow[],
  monitoredEndpointCount: number,
  readiness: ReturnType<typeof sampleReadiness>,
): string {
  if (rows.length === 0) {
    return monitoredEndpointCount === 0
      ? 'no enabled sites'
      : `waiting for checks across ${monitoredEndpointCount} ${plural(monitoredEndpointCount, 'site')}`;
  }

  if (rows.length < monitoredEndpointCount) {
    return `${rows.length}/${monitoredEndpointCount} ${plural(monitoredEndpointCount, 'site')} ready`;
  }

  return `${readiness.minSamples}+ successful checks across ${rows.length} ${plural(rows.length, 'site')}`;
}

function supportingSummaryFor(input: {
  readonly kind: DiagnosticKind;
  readonly confidence: DiagnosticConfidence;
  readonly rows: readonly VerdictRow[];
  readonly threshold: number;
  readonly monitoredEndpointCount: number;
  readonly timingVisibility: TimingVisibility;
  readonly readiness: ReturnType<typeof sampleReadiness>;
}): string {
  const { kind, confidence, rows, threshold, monitoredEndpointCount, timingVisibility, readiness } = input;
  const sampleScope = sampleScopeFor(rows, monitoredEndpointCount, readiness);

  if (kind === 'collecting') {
    return `Collecting: ${sampleScope}.`;
  }

  if (kind === 'healthy' && confidence === 'high' && readiness.allEnabledMature && hasHealthyVariation(rows, threshold)) {
    return `Good browser-visible run with variation: no site is consistently slow; ${sampleScope}.`;
  }

  if (kind === 'healthy' && confidence === 'high' && readiness.allEnabledMature) {
    return `Clean browser-visible run: ${sampleScope}.`;
  }

  return `Evidence: ${sampleScope}; ${timingSummaryFor(timingVisibility)}.`;
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
  const confidenceReasonText = confidenceReason(input.rows, input.monitoredEndpointCount, readiness);
  const primaryAnswer = primaryAnswerFor({
    kind,
    confidence,
    rows: input.rows,
    threshold: input.threshold,
    verdict,
    timingVisibility,
  });
  const registryClaims = registryClaimsFor({
    kind,
    verdict,
    rows: input.rows,
    timingVisibility,
    readiness,
  });
  const evidence = evidenceFor({
    rows: input.rows,
    monitoredEndpointCount: input.monitoredEndpointCount,
    threshold: input.threshold,
    overRows,
    verdict,
    timingVisibility,
    samplesByEndpoint: input.samplesByEndpoint,
  });
  const snapshotEligibility = snapshotEligibilityFor({
    kind,
    confidence,
    rows: input.rows,
    threshold: input.threshold,
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
    registryClaims,
    snapshotEligibility,
    readiness,
  });
  const triageActions = triageActionsFor({
    kind,
    verdict,
    rows: input.rows,
    threshold: input.threshold,
    timingVisibility,
    primaryAnswer,
  });

  return {
    verdict,
    kind,
    severity,
    confidence,
    confidenceLabel: `${confidence} confidence`,
    confidenceReason: confidenceReasonText,
    primaryAnswer,
    claims: [primaryAnswer, ...registryClaims],
    primaryValidation,
    safeSummary: safeSummaryFor(primaryAnswer, confidenceReasonText),
    supportingSummary: supportingSummaryFor({
      kind,
      confidence,
      rows: input.rows,
      threshold: input.threshold,
      monitoredEndpointCount: input.monitoredEndpointCount,
      timingVisibility,
      readiness,
    }),
    snapshotEligibility,
    explanation: primaryAnswer.text,
    evidence,
    limitations: limitationsFor(kind, timingVisibility),
    triageActions,
    nextSteps: nextStepsFor(kind, verdict, input.rows),
    timingVisibility,
  };
}
