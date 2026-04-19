// src/lib/utils/classify.ts
// Health classification for endpoint latency. Pure functions — single source of
// truth so the chronograph dial, rail pip color, and causal verdict cannot drift
// apart. No store imports; callers pass stats + threshold explicitly.

import type { EndpointStatistics } from '../types';

export type HealthBucket = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthStyle {
  readonly color: string;
  readonly glow:  string;
  readonly label: string;
  readonly tone:  string;
}

// CSS custom property names bridged from tokens.ts via App.svelte#bridgeTokensToCss.
// All callers render through var(--…) so dark-mode / future theming stays live.
export const HEALTH_STYLES: Record<HealthBucket, HealthStyle> = {
  healthy: {
    color: 'var(--accent-cyan)',
    glow:  'var(--accent-cyan-glow)',
    label: 'Healthy',
    tone:  'var(--accent-cyan-tone)',
  },
  degraded: {
    color: 'var(--accent-amber)',
    glow:  'var(--accent-amber-glow)',
    label: 'Degraded',
    tone:  'var(--accent-amber-tone)',
  },
  unhealthy: {
    color: 'var(--accent-pink)',
    glow:  'var(--accent-pink-glow)',
    label: 'Unhealthy',
    tone:  'var(--accent-pink-tone)',
  },
  unknown: {
    color: 'var(--t4)',
    glow:  'transparent',
    label: 'No data',
    tone:  'var(--t4)',
  },
};

/**
 * Classify an endpoint's current health from its rolling statistics.
 *
 *   healthy:   p95 ≤ threshold AND p50 ≤ threshold/2
 *   degraded:  p95 ≤ 2×threshold OR p50 ≤ threshold  (but not healthy)
 *   unhealthy: everything worse
 *   unknown:   stats missing or not yet ready
 */
export function classify(
  stats: EndpointStatistics | null | undefined,
  threshold: number,
): HealthBucket {
  if (!stats || !stats.ready) return 'unknown';

  const p50 = Number.isFinite(stats.p50) ? stats.p50 : Infinity;
  const p95 = Number.isFinite(stats.p95) ? stats.p95 : Infinity;

  if (p95 <= threshold && p50 <= threshold / 2) return 'healthy';
  if (p95 <= threshold * 2 || p50 <= threshold) return 'degraded';
  return 'unhealthy';
}

/**
 * Aggregate network health as a 0–100 score. Not-ready endpoints are excluded
 * from the denominator rather than dragging the score toward zero.
 *
 *   healthy   → 100
 *   degraded  →  60
 *   unhealthy →  20
 *   all not-ready → null
 */
export function networkQuality(
  stats: readonly (EndpointStatistics | null | undefined)[],
  threshold: number,
): number | null {
  const ready = stats.filter((s): s is EndpointStatistics => Boolean(s && s.ready));
  if (ready.length === 0) return null;

  let total = 0;
  for (const s of ready) {
    const bucket = classify(s, threshold);
    total += bucket === 'healthy' ? 100 : bucket === 'degraded' ? 60 : 20;
  }
  return Math.round(total / ready.length);
}

export type NetworkLevel = 'unknown' | 'healthy' | 'warning' | 'degraded' | 'critical';

/**
 * Map a 0–100 networkQuality score to a named pill state for the topbar.
 * Buckets are spaced so mixes of classify() outcomes land in distinct pills
 * even though the underlying aggregate emits {100, 60, 20} for uniform fleets.
 *
 *   null   → unknown
 *   ≥ 90   → healthy
 *   ≥ 60   → warning
 *   ≥ 30   → degraded
 *   <  30  → critical
 */
export function networkLevel(score: number | null): NetworkLevel {
  if (score === null) return 'unknown';
  if (score >= 90) return 'healthy';
  if (score >= 60) return 'warning';
  if (score >= 30) return 'degraded';
  return 'critical';
}

export interface LevelStyle {
  readonly color: string;
  readonly glow:  string;
  readonly label: string;
}

// CSS-var-backed palette so every level chip agrees with bridgeTokensToCss.
export const LEVEL_STYLES: Record<NetworkLevel, LevelStyle> = {
  unknown:  { color: 'var(--t4)',                glow: 'transparent',              label: 'No data'  },
  healthy:  { color: 'var(--accent-green)',      glow: 'var(--green-glow)',        label: 'Healthy'  },
  warning:  { color: 'var(--accent-amber)',      glow: 'var(--accent-amber-glow)', label: 'Warning'  },
  degraded: { color: 'var(--accent-amber-tone)', glow: 'var(--accent-amber-glow)', label: 'Degraded' },
  critical: { color: 'var(--accent-pink)',       glow: 'var(--accent-pink-glow)',  label: 'Critical' },
};
