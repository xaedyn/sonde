// src/lib/utils/classify.ts
// Centralised health classifier — the single alignment point for dial colour,
// rail pip colour, verdict text, and the aggregate network quality score.
// Components MUST NOT recompute these inline; always read through the derived
// store (`networkQualityStore`) or call these helpers directly.

import type { EndpointStatistics } from '../types';

export type HealthBucket = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthStyle {
  /** CSS colour token reference — resolves to the accent for this bucket. */
  readonly color: string;
  /** Softer glow variant — typically a .33-alpha of `color`. */
  readonly glow: string;
  /** Human-readable label for chips and verdicts. */
  readonly label: string;
  /** Darker tone variant for arcs, borders, and text-on-accent surfaces. */
  readonly tone: string;
}

/**
 * Style map keyed by bucket. Values reference CSS vars emitted by
 * App.svelte's bridgeTokensToCss so components can use them directly in style
 * attributes without importing the tokens object.
 */
export const HEALTH_STYLES: Record<HealthBucket, HealthStyle> = {
  healthy:   { color: 'var(--accent-cyan)',  glow: 'var(--accent-cyan-glow)',  label: 'Healthy',   tone: 'var(--accent-cyan-tone)' },
  degraded:  { color: 'var(--accent-amber)', glow: 'var(--accent-amber-glow)', label: 'Degraded',  tone: 'var(--accent-amber-tone)' },
  unhealthy: { color: 'var(--accent-pink)',  glow: 'var(--accent-pink-glow)',  label: 'Unhealthy', tone: 'var(--accent-pink-tone)' },
  unknown:   { color: 'var(--t4)',           glow: 'transparent',              label: 'No data',   tone: 'var(--t4)' },
};

/**
 * Classify an endpoint's current health from its rolling stats and the
 * configured health threshold.
 *
 * - healthy:   p95 <= threshold AND p50 <= threshold * 0.5
 * - degraded:  p95 <= threshold * 2 OR  p50 <= threshold
 * - unhealthy: otherwise
 * - unknown:   stats is null / not ready
 *
 * Missing `p50`/`p95` (pathological but possible during init) are treated as
 * Infinity so the result is conservatively "unhealthy" rather than throwing.
 */
export function classify(
  stats: EndpointStatistics | null | undefined,
  threshold: number,
): HealthBucket {
  if (!stats || !stats.ready) return 'unknown';

  const p50 = stats.p50 ?? Number.POSITIVE_INFINITY;
  const p95 = stats.p95 ?? Number.POSITIVE_INFINITY;

  if (p95 <= threshold && p50 <= threshold * 0.5) return 'healthy';
  if (p95 <= threshold * 2 || p50 <= threshold)   return 'degraded';
  return 'unhealthy';
}

const SCORE_BY_BUCKET: Record<Exclude<HealthBucket, 'unknown'>, number> = {
  healthy:   100,
  degraded:   60,
  unhealthy:  20,
};

/**
 * Aggregate 0–100 network-health score from every ready endpoint's stats.
 *
 * - 100 = every ready endpoint classifies as healthy
 * -  20 = every ready endpoint classifies as unhealthy
 * - null = no endpoint is ready yet (dial shows "No data")
 *
 * Not-ready endpoints are excluded from the denominator so ramp-up doesn't
 * depress the aggregate.
 */
export function networkQuality(
  stats: readonly (EndpointStatistics | null | undefined)[],
  threshold: number,
): number | null {
  const ready = stats.filter((s): s is EndpointStatistics => !!s && s.ready);
  if (ready.length === 0) return null;

  let total = 0;
  for (const s of ready) {
    const bucket = classify(s, threshold);
    if (bucket === 'unknown') continue; // defensive — filter() above excludes, but keep exhaustive
    total += SCORE_BY_BUCKET[bucket];
  }
  return Math.round(total / ready.length);
}
