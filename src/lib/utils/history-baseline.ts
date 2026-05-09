// src/lib/utils/history-baseline.ts
// Local-history baseline comparison. Pure, deterministic, and share-safe.

import type { Endpoint, EndpointStatistics, StatisticsState } from '../types';
import type { HistoryEndpointSummary, HistorySessionSummary } from '../history/session-summary';
import { normalizeHistoryEndpointKey } from '../history/session-summary';
import { percentileSorted } from './statistics';

export type HistoryBaselineStatus = 'collecting' | 'no-history' | 'normal' | 'elevated' | 'severe';
export type EndpointBaselineStatus = 'no-history' | 'unready' | 'normal' | 'elevated' | 'severe';

export interface EndpointBaselineComparison {
  readonly endpointId: string;
  readonly key: string;
  readonly label: string;
  readonly status: EndpointBaselineStatus;
  readonly priorSessionCount: number;
  readonly baselineP50: number | null;
  readonly baselineP95: number | null;
  readonly baselineLossPercent: number | null;
  readonly currentP50: number | null;
  readonly currentP95: number | null;
  readonly currentLossPercent: number | null;
  readonly p50Ratio: number | null;
  readonly p95Ratio: number | null;
  readonly summary: string;
}

export interface HistoryBaselineInsight {
  readonly status: HistoryBaselineStatus;
  readonly headline: string;
  readonly detail: string;
  readonly privacyNote: string;
  readonly comparisons: readonly EndpointBaselineComparison[];
}

export interface BuildHistoryBaselineInsightInput {
  readonly endpoints: readonly Endpoint[];
  readonly stats: StatisticsState;
  readonly history: readonly HistorySessionSummary[];
  readonly currentStartedAt?: number | null;
  readonly minSessions?: number;
}

const DEFAULT_MIN_SESSIONS = 3;
const MAX_PRIOR_SESSIONS = 20;
const ELEVATED_P50_RATIO = 1.5;
const ELEVATED_P95_RATIO = 1.6;
const SEVERE_P50_RATIO = 2.5;
const SEVERE_P95_RATIO = 2.7;
const ELEVATED_LOSS_DELTA = 2;
const SEVERE_LOSS_DELTA = 5;
const PRIVACY_NOTE = 'Local to this browser; history is not included in shared links.';

function median(values: readonly number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  return percentileSorted(finite, 50);
}

function ratio(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline <= 0) return null;
  return current / baseline;
}

function fmtMs(value: number | null): string {
  return value === null ? '-' : `${Math.round(value)} ms`;
}

function fmtRatio(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(1)}x`;
}

function worstRatio(comparison: EndpointBaselineComparison): number | null {
  const ratios = [comparison.p50Ratio, comparison.p95Ratio]
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (ratios.length === 0) return null;
  return Math.max(...ratios);
}

function currentReady(stat: EndpointStatistics | undefined): boolean {
  return Boolean(stat?.ready && stat.sampleCount >= 30 && stat.p50 > 0 && stat.p95 > 0);
}

function sessionIsCurrent(session: HistorySessionSummary, currentStartedAt: number | null | undefined): boolean {
  return currentStartedAt != null && session.startedAt === currentStartedAt;
}

function findEligibleEndpointSummaries(
  history: readonly HistorySessionSummary[],
  endpointKey: string,
  currentStartedAt: number | null | undefined,
): HistoryEndpointSummary[] {
  return history
    .filter((session) => !sessionIsCurrent(session, currentStartedAt))
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((session) => session.endpoints.filter((endpoint) => (
      endpoint.key === endpointKey
      && endpoint.baselineEligible
      && endpoint.p50 !== null
      && endpoint.p95 !== null
    )))
    .slice(0, MAX_PRIOR_SESSIONS);
}

function classifyComparison(input: {
  readonly current: EndpointStatistics | undefined;
  readonly baselineP50: number | null;
  readonly baselineP95: number | null;
  readonly baselineLossPercent: number | null;
}): Pick<EndpointBaselineComparison, 'status' | 'p50Ratio' | 'p95Ratio' | 'summary'> {
  const { current, baselineP50, baselineP95, baselineLossPercent } = input;
  if (!current || !currentReady(current)) {
    return {
      status: 'unready',
      p50Ratio: null,
      p95Ratio: null,
      summary: 'Collecting enough current samples for a baseline comparison.',
    };
  }

  const p50Ratio = ratio(current.p50, baselineP50);
  const p95Ratio = ratio(current.p95, baselineP95);
  const lossDelta = baselineLossPercent === null ? 0 : current.lossPercent - baselineLossPercent;
  const severe = (p50Ratio !== null && p50Ratio >= SEVERE_P50_RATIO)
    || (p95Ratio !== null && p95Ratio >= SEVERE_P95_RATIO)
    || (current.lossPercent >= 5 && lossDelta >= SEVERE_LOSS_DELTA);
  const elevated = severe
    || (p50Ratio !== null && p50Ratio >= ELEVATED_P50_RATIO)
    || (p95Ratio !== null && p95Ratio >= ELEVATED_P95_RATIO)
    || (current.lossPercent >= 2 && lossDelta >= ELEVATED_LOSS_DELTA);

  if (severe) {
    return {
      status: 'severe',
      p50Ratio,
      p95Ratio,
      summary: `Current p50 is ${fmtRatio(p50Ratio)} baseline (${fmtMs(current.p50)} vs ${fmtMs(baselineP50)}).`,
    };
  }

  if (elevated) {
    return {
      status: 'elevated',
      p50Ratio,
      p95Ratio,
      summary: `Current p50 is ${fmtRatio(p50Ratio)} baseline (${fmtMs(current.p50)} vs ${fmtMs(baselineP50)}).`,
    };
  }

  return {
    status: 'normal',
    p50Ratio,
    p95Ratio,
    summary: `Current p50 is close to baseline (${fmtMs(current.p50)} vs ${fmtMs(baselineP50)}).`,
  };
}

function buildComparison(input: {
  readonly endpoint: Endpoint;
  readonly current: EndpointStatistics | undefined;
  readonly history: readonly HistorySessionSummary[];
  readonly currentStartedAt: number | null | undefined;
  readonly minSessions: number;
}): EndpointBaselineComparison {
  const key = normalizeHistoryEndpointKey(input.endpoint.url);
  const prior = findEligibleEndpointSummaries(input.history, key, input.currentStartedAt);

  if (prior.length < input.minSessions) {
    return {
      endpointId: input.endpoint.id,
      key,
      label: input.endpoint.label,
      status: currentReady(input.current) ? 'no-history' : 'unready',
      priorSessionCount: prior.length,
      baselineP50: null,
      baselineP95: null,
      baselineLossPercent: null,
      currentP50: currentReady(input.current) ? input.current?.p50 ?? null : null,
      currentP95: currentReady(input.current) ? input.current?.p95 ?? null : null,
      currentLossPercent: currentReady(input.current) ? input.current?.lossPercent ?? null : null,
      p50Ratio: null,
      p95Ratio: null,
      summary: `Needs ${input.minSessions} eligible prior runs; found ${prior.length}.`,
    };
  }

  const baselineP50 = median(prior.map((endpoint) => endpoint.p50 ?? 0));
  const baselineP95 = median(prior.map((endpoint) => endpoint.p95 ?? 0));
  const baselineLossPercent = median(prior.map((endpoint) => endpoint.lossPercent));
  const classified = classifyComparison({
    current: input.current,
    baselineP50,
    baselineP95,
    baselineLossPercent,
  });

  return {
    endpointId: input.endpoint.id,
    key,
    label: input.endpoint.label,
    status: classified.status,
    priorSessionCount: prior.length,
    baselineP50,
    baselineP95,
    baselineLossPercent,
    currentP50: currentReady(input.current) ? input.current?.p50 ?? null : null,
    currentP95: currentReady(input.current) ? input.current?.p95 ?? null : null,
    currentLossPercent: currentReady(input.current) ? input.current?.lossPercent ?? null : null,
    p50Ratio: classified.p50Ratio,
    p95Ratio: classified.p95Ratio,
    summary: classified.summary,
  };
}

function pickWorst(comparisons: readonly EndpointBaselineComparison[]): EndpointBaselineComparison | null {
  const actionable = comparisons.filter((comparison) => (
    comparison.status === 'severe' || comparison.status === 'elevated'
  ));
  if (actionable.length === 0) return null;
  return actionable.sort((a, b) => (worstRatio(b) ?? 0) - (worstRatio(a) ?? 0))[0] ?? null;
}

export function buildHistoryBaselineInsight(input: BuildHistoryBaselineInsightInput): HistoryBaselineInsight {
  const minSessions = input.minSessions ?? DEFAULT_MIN_SESSIONS;
  const monitored = input.endpoints.filter((endpoint) => endpoint.enabled);
  const comparisons = monitored.map((endpoint) => buildComparison({
    endpoint,
    current: input.stats[endpoint.id],
    history: input.history,
    currentStartedAt: input.currentStartedAt,
    minSessions,
  }));
  const readyComparisons = comparisons.filter((comparison) => comparison.status !== 'unready');

  if (monitored.length > 0 && readyComparisons.length === 0) {
    return {
      status: 'collecting',
      headline: 'Collecting enough samples for baseline comparison.',
      detail: 'Chronoscope compares against local history after the current run has enough samples.',
      privacyNote: PRIVACY_NOTE,
      comparisons,
    };
  }

  const comparable = readyComparisons.filter((comparison) => comparison.status !== 'no-history');
  if (comparable.length === 0) {
    return {
      status: 'no-history',
      headline: 'No local baseline yet for these endpoints.',
      detail: `Run the same endpoint at least ${minSessions} times from this browser to establish a useful baseline.`,
      privacyNote: PRIVACY_NOTE,
      comparisons,
    };
  }

  const worst = pickWorst(comparable);
  if (worst?.status === 'severe') {
    const multiple = fmtRatio(worstRatio(worst));
    return {
      status: 'severe',
      headline: `${worst.label} is far above its local baseline.`,
      detail: `${worst.label} is ${multiple} above its usual latency across ${worst.priorSessionCount} prior local runs. ${worst.summary}`,
      privacyNote: PRIVACY_NOTE,
      comparisons,
    };
  }

  if (worst?.status === 'elevated') {
    const multiple = fmtRatio(worstRatio(worst));
    return {
      status: 'elevated',
      headline: `${worst.label} is above its local baseline.`,
      detail: `${worst.label} is ${multiple} above its usual latency across ${worst.priorSessionCount} prior local runs. ${worst.summary}`,
      privacyNote: PRIVACY_NOTE,
      comparisons,
    };
  }

  const sessionCount = Math.max(...comparable.map((comparison) => comparison.priorSessionCount));
  return {
    status: 'normal',
    headline: 'This run matches your local baseline.',
    detail: `Compared with up to ${sessionCount} prior local runs for the same endpoints, latency is within the usual range.`,
    privacyNote: PRIVACY_NOTE,
    comparisons,
  };
}
