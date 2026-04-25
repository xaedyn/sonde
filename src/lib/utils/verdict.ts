// src/lib/utils/verdict.ts
// Causal diagnosis — reads rolling stats + tier2 phase dominance to produce the
// Overview's single-sentence "why is this degraded" verdict. Owns the decision
// tree; consumes classify.ts for bucket membership but does not duplicate its
// logic. If a finding is "here's which phase is dominant", it belongs here;
// if it's "here's which severity bucket this endpoint is in", that stays in
// classify.ts.
//
// verdict.ts owns: computeCausalVerdict(), phase-dominance derivation, and the
// Tier2Phase / Verdict type vocabulary. Pure, synchronous, no store imports.

import type { Endpoint, EndpointStatistics } from '../types';

// ── Phase vocabulary ─────────────────────────────────────────────────────────
// tier2 field keys on EndpointStatistics.tier2Averages/tier2P95 are the long
// internal names (`dnsLookup`, `tcpConnect`, ...). User-facing phase ids and
// labels are shorter to match the prototype and natural speech.
export type Tier2Phase = 'dns' | 'tcp' | 'tls' | 'ttfb' | 'transfer';

export const PHASE_LABELS: Readonly<Record<Tier2Phase, string>> = {
  dns:      'DNS',
  tcp:      'TCP handshake',
  tls:      'TLS handshake',
  ttfb:     'TTFB',
  transfer: 'Transfer',
};

type Tier2FieldKey = 'dnsLookup' | 'tcpConnect' | 'tlsHandshake' | 'ttfb' | 'contentTransfer';

const PHASE_TO_FIELD: Readonly<Record<Tier2Phase, Tier2FieldKey>> = {
  dns:      'dnsLookup',
  tcp:      'tcpConnect',
  tls:      'tlsHandshake',
  ttfb:     'ttfb',
  transfer: 'contentTransfer',
};

// Deterministic order used for the tied-dominant-phase tiebreak. Alphabetical
// on Tier2Phase ids (not on the pretty labels), so the outcome is stable
// regardless of rendering changes.
const PHASE_ORDER: readonly Tier2Phase[] = (['dns', 'tcp', 'tls', 'ttfb', 'transfer'] as const)
  .slice()
  .sort();

// ── Verdict type ─────────────────────────────────────────────────────────────
export interface Verdict {
  readonly tone: 'good' | 'warn';
  readonly headline: string;
  readonly phase?: Tier2Phase;      // set when headline cites a dominant phase
  readonly worstEpId?: string;      // set when only one endpoint is degraded
}

export interface VerdictRow {
  readonly ep: Endpoint;
  readonly stats: EndpointStatistics;
}

// ── Thresholds baked into the decision tree ─────────────────────────────────
// Surfaced as constants so the spec's design choices are grep-findable, not
// hidden inside the function body.
const LOSS_WARN_PERCENT = 1;       // > 1% avg loss → packet-loss branch
const JITTER_WARN_MS = 25;         // > 25ms avg stddev → jitter branch
const DOMINANCE_THRESHOLD_FACTOR = 0.7;  // phase dominance counted below full threshold

// ── Dominance computation ────────────────────────────────────────────────────
function dominantPhase(stats: EndpointStatistics): Tier2Phase | null {
  const t2 = stats.tier2Averages;
  if (!t2) return null;
  const total = t2.dnsLookup + t2.tcpConnect + t2.tlsHandshake + t2.ttfb + t2.contentTransfer;
  if (total <= 0) return null;

  let bestPhase: Tier2Phase | null = null;
  let bestValue = -1;
  // Iterate in alphabetical phase order so ties break deterministically on the
  // earlier phase name (e.g. dns beats tcp at equal values).
  for (const phase of PHASE_ORDER) {
    const value = t2[PHASE_TO_FIELD[phase]];
    if (value > bestValue) {
      bestValue = value;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

function countByPhase(
  rows: readonly VerdictRow[],
  threshold: number,
): Readonly<Partial<Record<Tier2Phase, number>>> {
  const counts: Partial<Record<Tier2Phase, number>> = {};
  const dominanceThreshold = threshold * DOMINANCE_THRESHOLD_FACTOR;
  for (const row of rows) {
    if (row.stats.p50 <= dominanceThreshold) continue;
    const phase = dominantPhase(row.stats);
    if (phase === null) continue;
    counts[phase] = (counts[phase] ?? 0) + 1;
  }
  return counts;
}

function topPhaseWithCount(
  counts: Readonly<Partial<Record<Tier2Phase, number>>>,
): { phase: Tier2Phase; count: number } | null {
  let best: { phase: Tier2Phase; count: number } | null = null;
  // Iterate in alphabetical phase order so equal counts break deterministically
  // on the earlier phase name.
  for (const phase of PHASE_ORDER) {
    const count = counts[phase] ?? 0;
    if (count === 0) continue;
    if (best === null || count > best.count) {
      best = { phase, count };
    }
  }
  return best;
}

// ── Main entrypoint ──────────────────────────────────────────────────────────
/**
 * Compute the one-sentence Overview verdict from rolling stats + threshold.
 *
 * Decision order (first matching branch wins):
 *   1. No rows at all → "Calibrating…" (good tone)
 *   2. Everyone fine AND no loss AND no jitter → "All links within tolerance."
 *   3. ≥2 endpoints share a dominant phase → "{phase} slow on N endpoints — likely upstream."
 *   4. Exactly 1 endpoint over threshold → "{label} degraded alone — endpoint-specific."
 *   5. Avg loss > 1% → "Packet loss elevated to N.N%."
 *   6. Avg jitter > 25ms → "Jitter elevated — σ N.Nms."
 *   7. Fallback → "N endpoints above threshold."
 */
export function computeCausalVerdict(
  rows: readonly VerdictRow[],
  threshold: number,
): Verdict {
  if (rows.length === 0) {
    return { tone: 'good', headline: 'Measuring…' };
  }

  const overRows = rows.filter((r) => r.stats.p50 > threshold);
  const overCount = overRows.length;
  const avgLoss = mean(rows.map((r) => r.stats.lossPercent));
  const avgJit = mean(rows.map((r) => r.stats.stddev));

  if (overCount === 0 && avgLoss < LOSS_WARN_PERCENT && avgJit < JITTER_WARN_MS) {
    return { tone: 'good', headline: 'Everything looks normal.' };
  }

  const phaseCounts = countByPhase(rows, threshold);
  const topPhase = topPhaseWithCount(phaseCounts);

  // ≥2 endpoints sharing a slow phase → likely shared cause (network/local infra),
  // not a per-site issue. Phrase this from the user's perspective rather than
  // citing the technical phase ("DNS", "TCP") which doesn't help non-engineers act.
  if (overCount >= 2 && topPhase !== null && topPhase.count >= 2) {
    return {
      tone: 'warn',
      headline: `${topPhase.count} sites slow at the same time — likely your network.`,
      phase: topPhase.phase,
    };
  }

  if (overCount === 1) {
    const bad = overRows[0];
    return {
      tone: 'warn',
      headline: `Only ${bad.ep.label} looks slow — likely that site, not you.`,
      worstEpId: bad.ep.id,
    };
  }

  if (avgLoss > LOSS_WARN_PERCENT) {
    return {
      tone: 'warn',
      headline: `Some requests are failing — ${avgLoss.toFixed(1)}% so far.`,
    };
  }

  if (avgJit > JITTER_WARN_MS) {
    return {
      tone: 'warn',
      headline: "Latency is bouncing around — connection isn't steady.",
    };
  }

  // Equality-edge guard: if everyone's under threshold AND the strict-greater-than
  // loss/jitter checks didn't match (because avgLoss === LOSS_WARN_PERCENT or
  // avgJit === JITTER_WARN_MS exactly), we'd otherwise render a nonsensical
  // "0 sites are slow." Surface the all-healthy verdict instead.
  if (overCount === 0) {
    return { tone: 'good', headline: 'Everything looks normal.' };
  }

  return {
    tone: 'warn',
    // Singular form is unreachable — overCount === 1 is handled above by the
    // endpoint-specific branch; this fallback only fires for ≥2.
    headline: `${overCount} sites are slow.`,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// ── Diagnose phase-dominance hypothesis ───────────────────────────────────
// Single-endpoint diagnosis for DiagnoseView: given a 5-phase breakdown, name
// the dominant phase (if any) in one sentence. Distinct from the network-wide
// `computeCausalVerdict` above because this runs on one endpoint's tier2
// averages, not across the fleet. Reuses PHASE_LABELS and Tier2Phase.
//
//   top > 60% of total  →  "Slow {phase} — N% of total time."
//   top+2nd > 80%       →  "{A} and {B} dominate — N% together."
//   neither              →  "No single phase dominates — investigate
//                            overall network conditions."
export interface PhaseBreakdown {
  readonly dns: number;
  readonly tcp: number;
  readonly tls: number;
  readonly ttfb: number;
  readonly transfer: number;
}

interface PhaseHypothesis {
  readonly verdictPhase: Tier2Phase | 'mixed';
  readonly text: string;
  readonly dominantPct: number;
  // Phases that callers should visually emphasize. Empty on "no dominance",
  // single-element on the top-phase branch, two-element on the pair branch.
  // Consumers use membership (`includes`) rather than verdictPhase equality
  // because the pair branch reports `verdictPhase: 'mixed'` but still has
  // two concrete phases to highlight.
  readonly dominantPhases: readonly Tier2Phase[];
}

export function phaseHypothesis(phases: PhaseBreakdown): PhaseHypothesis {
  const total = phases.dns + phases.tcp + phases.tls + phases.ttfb + phases.transfer;
  if (total <= 0) {
    return { verdictPhase: 'mixed', text: 'Awaiting tier-2 samples.', dominantPct: 0, dominantPhases: [] };
  }
  const entries: [Tier2Phase, number][] = [
    ['dns',      phases.dns],
    ['tcp',      phases.tcp],
    ['tls',      phases.tls],
    ['ttfb',     phases.ttfb],
    ['transfer', phases.transfer],
  ];
  // Sort descending by ms. Ties break by the declared order above (dns first),
  // which is stable under Array.prototype.sort in modern V8/JSC.
  entries.sort((a, b) => b[1] - a[1]);
  const [topName, topMs] = entries[0];
  const topPct = topMs / total;
  if (topPct > 0.6) {
    return {
      verdictPhase: topName,
      text: `Slow ${PHASE_LABELS[topName]} — ${Math.round(topPct * 100)}% of total time.`,
      dominantPct: topPct,
      dominantPhases: [topName],
    };
  }
  const [secondName, secondMs] = entries[1];
  const pairPct = (topMs + secondMs) / total;
  if (pairPct > 0.8) {
    return {
      verdictPhase: 'mixed',
      text: `${PHASE_LABELS[topName]} and ${PHASE_LABELS[secondName]} dominate — ${Math.round(pairPct * 100)}% together.`,
      dominantPct: pairPct,
      dominantPhases: [topName, secondName],
    };
  }
  return {
    verdictPhase: 'mixed',
    text: 'No single phase dominates — investigate overall network conditions.',
    dominantPct: 0,
    dominantPhases: [],
  };
}
