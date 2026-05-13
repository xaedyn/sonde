import type { EndpointStatistics } from '../types';
import type { VerdictRow } from './verdict';
import {
  classify,
  overviewVerdict,
  VERDICT_STYLES,
  type HealthBucket,
  type OverviewVerdict,
} from './classify';

type ScoredBucket = Exclude<HealthBucket, 'unknown'>;

export interface ScoreContribution {
  readonly endpointId: string;
  readonly label: string;
  readonly bucket: ScoredBucket;
  readonly points: number;
  readonly reason: string;
}

export interface ScoreExplanation {
  readonly score: number;
  readonly rawScore: number | null;
  readonly verdict: OverviewVerdict;
  readonly headline: string;
  readonly summary: string;
  readonly detail: string;
  readonly contributions: readonly ScoreContribution[];
}

interface ScoreExplanationInput {
  readonly rows: readonly VerdictRow[];
  readonly threshold: number;
  readonly score: number | null;
  readonly rawScore?: number | null;
}

const BUCKET_POINTS: Record<ScoredBucket, number> = {
  healthy: 100,
  degraded: 60,
  unhealthy: 20,
};

function valueOrInfinity(value: number): number {
  return Number.isFinite(value) ? value : Infinity;
}

function contributionReason(stats: EndpointStatistics, threshold: number, bucket: ScoredBucket): string {
  const p50 = valueOrInfinity(stats.p50);
  const p95 = valueOrInfinity(stats.p95);

  if (bucket === 'healthy') return 'clean';
  if (bucket === 'unhealthy') return 'far above threshold';
  if (p50 > threshold) return 'median above threshold';
  if (p95 > threshold) return 'some slower checks';
  if (p50 > threshold / 2) return 'median above clean band';
  return 'outside clean band';
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function hasVerb(count: number): string {
  return count === 1 ? 'has' : 'have';
}

function isVerb(count: number): string {
  return count === 1 ? 'is' : 'are';
}

function summarize(contributions: readonly ScoreContribution[], capped: boolean): string {
  const clean = contributions.filter((item) => item.reason === 'clean').length;
  const tail = contributions.filter((item) => item.reason === 'some slower checks').length;
  const consistentlySlow = contributions.filter((item) => item.reason === 'median above threshold').length;
  const highMedian = contributions.filter((item) => item.reason === 'median above clean band').length;
  const farAbove = contributions.filter((item) => item.reason === 'far above threshold').length;
  const other = contributions.length - clean - tail - consistentlySlow - highMedian - farAbove;

  const parts: string[] = [];
  if (clean > 0) parts.push(`${plural(clean, 'site')} clean`);
  if (tail > 0) parts.push(`${tail} ${hasVerb(tail)} some slower checks`);
  if (consistentlySlow > 0) parts.push(`${consistentlySlow} ${isVerb(consistentlySlow)} consistently above threshold`);
  if (highMedian > 0) parts.push(`${highMedian} ${hasVerb(highMedian)} a higher median than the clean band`);
  if (farAbove > 0) parts.push(`${farAbove} ${isVerb(farAbove)} far above threshold`);
  if (other > 0) parts.push(`${other} ${isVerb(other)} outside the clean band`);

  const summary = `${parts.join('; ')}.`;
  return capped ? `${summary} Score capped to match the diagnostic answer.` : summary;
}

export function buildScoreExplanation(input: ScoreExplanationInput): ScoreExplanation | null {
  const { rows, threshold, score } = input;
  if (score === null) return null;

  const contributions = rows.flatMap((row): ScoreContribution[] => {
    const bucket = classify(row.stats, threshold);
    if (bucket === 'unknown') return [];
    return [{
      endpointId: row.ep.id,
      label: row.ep.label,
      bucket,
      points: BUCKET_POINTS[bucket],
      reason: contributionReason(row.stats, threshold, bucket),
    }];
  });
  if (contributions.length === 0) return null;

  const rawScore = input.rawScore ?? score;
  const capped = rawScore !== null && score < rawScore;
  const verdict = overviewVerdict(score);
  const headline = `Score ${score} · ${VERDICT_STYLES[verdict].label}`;
  const detail = [
    `Endpoint scores: ${contributions.map((item) => `${item.label} ${item.points}: ${item.reason}`).join('; ')}.`,
    'Ready endpoints are weighted equally; endpoints without enough data are excluded.',
  ].join(' ');

  return {
    score,
    rawScore,
    verdict,
    headline,
    summary: summarize(contributions, capped),
    detail,
    contributions,
  };
}
