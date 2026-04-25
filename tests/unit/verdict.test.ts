import { describe, it, expect } from 'vitest';
import {
  computeCausalVerdict,
  phaseHypothesis,
  PHASE_LABELS,
  type PhaseBreakdown,
  type VerdictRow,
} from '../../src/lib/utils/verdict';
import type { Endpoint, EndpointStatistics } from '../../src/lib/types';

// ── Fixture helpers ─────────────────────────────────────────────────────────
function makeEndpoint(over: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-' + (over.id ?? Math.random().toString(36).slice(2, 8)),
    url: over.url ?? 'https://example.test',
    enabled: over.enabled ?? true,
    label: over.label ?? 'example',
    color: over.color ?? '#67e8f9',
    ...over,
  };
}

function makeStats(over: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: over.endpointId ?? 'ep-x',
    sampleCount: 50,
    p50: 0, p95: 0, p99: 0, p25: 0, p75: 0, p90: 0,
    min: 0, max: 0, stddev: 0,
    ci95: { lower: 0, upper: 0, margin: 0 },
    connectionReuseDelta: null,
    lossPercent: 0,
    ready: true,
    ...over,
  };
}

function makeRow(
  epOver: Partial<Endpoint> = {},
  statsOver: Partial<EndpointStatistics> = {},
): VerdictRow {
  const ep = makeEndpoint(epOver);
  const stats = makeStats({ endpointId: ep.id, ...statsOver });
  return { ep, stats };
}

// Tier2 averages with one clearly dominant phase.
function tier2Dominating(phase: 'dns' | 'tcp' | 'tls' | 'ttfb' | 'transfer'): EndpointStatistics['tier2Averages'] {
  const fieldFor = {
    dns: 'dnsLookup', tcp: 'tcpConnect', tls: 'tlsHandshake', ttfb: 'ttfb', transfer: 'contentTransfer',
  } as const;
  const base = { dnsLookup: 5, tcpConnect: 5, tlsHandshake: 5, ttfb: 5, contentTransfer: 5 };
  return { ...base, [fieldFor[phase]]: 200 };
}

const THRESHOLD = 120;

// ── Branch 1: empty rows ────────────────────────────────────────────────────
describe('computeCausalVerdict — empty', () => {
  it('returns Measuring… when no rows', () => {
    const v = computeCausalVerdict([], THRESHOLD);
    expect(v.tone).toBe('good');
    expect(v.headline).toBe('Measuring…');
    expect(v.phase).toBeUndefined();
    expect(v.worstEpId).toBeUndefined();
  });
});

// ── Branch 2: all-healthy happy path ────────────────────────────────────────
describe('computeCausalVerdict — all healthy', () => {
  it('returns "Everything looks normal." when no one is over threshold and loss+jit are low', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 40, stddev: 4, lossPercent: 0.2 }),
      makeRow({ id: 'b', label: 'b' }, { p50: 60, stddev: 6, lossPercent: 0.5 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.tone).toBe('good');
    expect(v.headline).toBe('Everything looks normal.');
  });
});

// ── Branch 3: shared-phase upstream ─────────────────────────────────────────
describe('computeCausalVerdict — shared upstream phase', () => {
  it('calls out shared-network slowness when ≥2 share DNS dominance', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: tier2Dominating('dns') }),
      makeRow({ id: 'b', label: 'b' }, { p50: 180, tier2Averages: tier2Dominating('dns') }),
      makeRow({ id: 'c', label: 'c' }, { p50: 30,  tier2Averages: tier2Dominating('transfer') }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.tone).toBe('warn');
    expect(v.headline).toBe('2 sites slow at the same time — likely your network.');
    // phase still propagates so consumers (color cues, accents) stay deterministic
    expect(v.phase).toBe('dns');
  });

  it('counts endpoints above 0.7×threshold as dominance candidates even when under full threshold', () => {
    // p50=90 is under threshold (120) but over 0.7*threshold (84). Should
    // still be counted in the dominance bucket.
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: tier2Dominating('ttfb') }),
      makeRow({ id: 'b', label: 'b' }, { p50: 200, tier2Averages: tier2Dominating('ttfb') }),
      makeRow({ id: 'c', label: 'c' }, { p50: 90,  tier2Averages: tier2Dominating('ttfb') }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toBe('3 sites slow at the same time — likely your network.');
    expect(v.phase).toBe('ttfb');
  });

  it('does NOT call upstream when only 1 endpoint is dominant on a phase', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: tier2Dominating('tls') }),
      makeRow({ id: 'b', label: 'b' }, { p50: 30 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    // Should fall through to "endpoint-specific" branch (overCount === 1).
    expect(v.headline).toBe('Only a looks slow — likely that site, not you.');
    expect(v.worstEpId).toBe(rows[0].ep.id);
  });
});

// ── Tied dominant phase → deterministic alphabetical tiebreak ──────────────
describe('computeCausalVerdict — tied dominant phase', () => {
  it('picks the alphabetically-earlier phase when counts tie', () => {
    // Two endpoints on DNS, two on TCP — both tied at 2. Alphabetically, 'dns'
    // comes before 'tcp' so the verdict should cite DNS.
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: tier2Dominating('dns') }),
      makeRow({ id: 'b', label: 'b' }, { p50: 200, tier2Averages: tier2Dominating('dns') }),
      makeRow({ id: 'c', label: 'c' }, { p50: 200, tier2Averages: tier2Dominating('tcp') }),
      makeRow({ id: 'd', label: 'd' }, { p50: 200, tier2Averages: tier2Dominating('tcp') }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.phase).toBe('dns');
  });

  it('tiebreak is stable regardless of input order', () => {
    // Same counts as above, rows reversed. Same verdict expected.
    const rows = [
      makeRow({ id: 'd', label: 'd' }, { p50: 200, tier2Averages: tier2Dominating('tcp') }),
      makeRow({ id: 'c', label: 'c' }, { p50: 200, tier2Averages: tier2Dominating('tcp') }),
      makeRow({ id: 'b', label: 'b' }, { p50: 200, tier2Averages: tier2Dominating('dns') }),
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: tier2Dominating('dns') }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.phase).toBe('dns');
  });

  it('within a single row, ties between tier2 phase values resolve alphabetically on the phase id', () => {
    // All five phases tied at equal value — the dominant phase should be 'dns'.
    const flat = { dnsLookup: 10, tcpConnect: 10, tlsHandshake: 10, ttfb: 10, contentTransfer: 10 };
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: flat }),
      makeRow({ id: 'b', label: 'b' }, { p50: 200, tier2Averages: flat }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.phase).toBe('dns');
  });
});

// ── Branch 4: endpoint-specific (exactly 1 over) ────────────────────────────
describe('computeCausalVerdict — endpoint-specific', () => {
  it('names the offending endpoint when exactly one is over', () => {
    const rows = [
      makeRow({ id: 'a', label: 'auth-service' }, { p50: 200 }),
      makeRow({ id: 'b', label: 'cdn' },         { p50: 30 }),
      makeRow({ id: 'c', label: 'api' },         { p50: 40 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toBe('Only auth-service looks slow — likely that site, not you.');
    expect(v.worstEpId).toBe(rows[0].ep.id);
  });
});

// ── Branch 5: packet loss ───────────────────────────────────────────────────
describe('computeCausalVerdict — packet loss', () => {
  it('cites packet loss when avg lossPercent > 1% and nobody is over threshold', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 40, lossPercent: 3.0 }),
      makeRow({ id: 'b', label: 'b' }, { p50: 50, lossPercent: 1.2 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toBe('Some requests are failing — 2.1% so far.');
  });

  it('does not cite packet loss when exactly 1 endpoint is over — that branch wins first', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, lossPercent: 10 }),
      makeRow({ id: 'b', label: 'b' }, { p50: 30,  lossPercent: 0 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toContain('looks slow');
  });
});

// ── Branch 6: jitter ────────────────────────────────────────────────────────
describe('computeCausalVerdict — jitter', () => {
  it('cites jitter in plain language when avg stddev > 25ms and no other branch matched', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 40, stddev: 30 }),
      makeRow({ id: 'b', label: 'b' }, { p50: 50, stddev: 40 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toBe("Latency is bouncing around — connection isn't steady.");
  });

  it('packet loss takes precedence over jitter when both elevated', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 40, stddev: 40, lossPercent: 5 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toContain('failing');
  });
});

// ── Fallback branch (should be narrow) ─────────────────────────────────────
describe('computeCausalVerdict — fallback', () => {
  it('uses the count fallback when ≥2 over but no phase dominates and low loss/jit', () => {
    // 2 rows over threshold but no tier2 data so no phase dominance.
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: undefined }),
      makeRow({ id: 'b', label: 'b' }, { p50: 200, tier2Averages: undefined }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toBe('2 sites are slow.');
  });

  it('returns the all-healthy verdict on equality-edge avgLoss === LOSS_WARN_PERCENT', () => {
    // Strict comparisons in the all-healthy guard and the loss branch both use
    // strict <, > — so avgLoss === 1.0 (the threshold) used to fall through to
    // the "0 sites are slow." fallback nonsense. Regression guard.
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 40, lossPercent: 1.0 }),
      makeRow({ id: 'b', label: 'b' }, { p50: 50, lossPercent: 1.0 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.tone).toBe('good');
    expect(v.headline).toBe('Everything looks normal.');
  });

  it('returns the all-healthy verdict on equality-edge avgJit === JITTER_WARN_MS', () => {
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 40, stddev: 25 }),
      makeRow({ id: 'b', label: 'b' }, { p50: 50, stddev: 25 }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.tone).toBe('good');
    expect(v.headline).toBe('Everything looks normal.');
  });

  it('endpoint-specific branch pre-empts the count fallback when overCount=1', () => {
    // With a single row over threshold the endpoint-specific branch wins even
    // though tier2 is missing and would otherwise hit the count fallback.
    // (CR review on PR #47: previous title claimed this exercised the
    // fallback's singular form — it never did; the endpoint-specific branch
    // fires first. Renamed to describe actual behavior.)
    const rows = [
      makeRow({ id: 'a', label: 'a' }, { p50: 200, tier2Averages: undefined }),
    ];
    const v = computeCausalVerdict(rows, THRESHOLD);
    expect(v.headline).toBe('Only a looks slow — likely that site, not you.');
    expect(v.worstEpId).toBe(rows[0].ep.id);
  });
});

// ── PHASE_LABELS sanity ─────────────────────────────────────────────────────
describe('PHASE_LABELS', () => {
  it('defines a label for every Tier2Phase', () => {
    expect(PHASE_LABELS.dns).toBe('DNS');
    expect(PHASE_LABELS.tcp).toBe('TCP handshake');
    expect(PHASE_LABELS.tls).toBe('TLS handshake');
    expect(PHASE_LABELS.ttfb).toBe('TTFB');
    expect(PHASE_LABELS.transfer).toBe('Transfer');
  });
});

// ── phaseHypothesis (Atlas single-endpoint diagnosis) ──────────────────────
function mkPhases(over: Partial<PhaseBreakdown>): PhaseBreakdown {
  return { dns: 0, tcp: 0, tls: 0, ttfb: 0, transfer: 0, ...over };
}

describe('phaseHypothesis()', () => {
  it('returns "Awaiting tier-2 samples." when total is zero', () => {
    const v = phaseHypothesis(mkPhases({}));
    expect(v.verdictPhase).toBe('mixed');
    expect(v.text).toBe('Awaiting tier-2 samples.');
    expect(v.dominantPct).toBe(0);
    expect(v.dominantPhases).toEqual([]);
  });

  it('flags a single-phase bottleneck when top > 60% of total', () => {
    // TTFB is 180 of 254 total ≈ 71%.
    const v = phaseHypothesis(mkPhases({ dns: 8, tcp: 22, tls: 34, ttfb: 180, transfer: 10 }));
    expect(v.verdictPhase).toBe('ttfb');
    expect(v.text).toBe('Slow TTFB — 71% of total time.');
    expect(v.dominantPct).toBeCloseTo(0.708, 2);
    expect(v.dominantPhases).toEqual(['ttfb']);
  });

  it('flags top-pair dominance when top+2 > 80% of total', () => {
    // dns=120, ttfb=80, rest=5+5+10 → top+2 = 200/220 ≈ 91%.
    const v = phaseHypothesis(mkPhases({ dns: 120, tcp: 5, tls: 5, ttfb: 80, transfer: 10 }));
    expect(v.verdictPhase).toBe('mixed');
    expect(v.text).toBe('DNS and TTFB dominate — 91% together.');
    expect(v.dominantPct).toBeGreaterThan(0.8);
    // Both cited phases must be in the emphasis set so the UI can highlight
    // them via membership; verdictPhase === 'mixed' is not enough on its own.
    expect(v.dominantPhases).toEqual(['dns', 'ttfb']);
  });

  it('falls through to "No single phase dominates" when spread is flat', () => {
    const v = phaseHypothesis(mkPhases({ dns: 20, tcp: 20, tls: 20, ttfb: 20, transfer: 20 }));
    expect(v.verdictPhase).toBe('mixed');
    expect(v.text).toBe('No single phase dominates — investigate overall network conditions.');
    expect(v.dominantPct).toBe(0);
    expect(v.dominantPhases).toEqual([]);
  });

  it('ties break deterministically by declared phase order (dns wins dns=tcp)', () => {
    const v = phaseHypothesis(mkPhases({ dns: 70, tcp: 70, tls: 5, ttfb: 5, transfer: 5 }));
    // Top pair = dns + tcp = 140/155 ≈ 90% → pair branch cites DNS first.
    expect(v.text).toContain('DNS and TCP handshake dominate');
  });

  it('single-phase totals report that phase at 100%', () => {
    const v = phaseHypothesis(mkPhases({ ttfb: 250 }));
    expect(v.verdictPhase).toBe('ttfb');
    expect(v.text).toBe('Slow TTFB — 100% of total time.');
    expect(v.dominantPct).toBe(1);
  });
});
