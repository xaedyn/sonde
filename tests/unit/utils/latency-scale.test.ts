import { describe, it, expect } from 'vitest';
import { latencyScale } from '../../../src/lib/utils/latency-scale';

describe('latencyScale', () => {

  // ── AC1: Headroom above p99 dominates ───────────────────────────────────
  it('AC1: p99=200, threshold=120 → maxMs=240', () => {
    const r = latencyScale({ p99Across: 200, threshold: 120 });
    expect(r.maxMs).toBe(240);
  });

  // ── AC2: Threshold floor dominates ──────────────────────────────────────
  it('AC2: p99=50, threshold=120 → maxMs=150 (threshold floor)', () => {
    const r = latencyScale({ p99Across: 50, threshold: 120 });
    expect(r.maxMs).toBe(150);
  });

  it('AC2: p99=0, threshold=120 → maxMs=150 (boundary)', () => {
    const r = latencyScale({ p99Across: 0, threshold: 120 });
    expect(r.maxMs).toBe(150);
  });

  // ── AC3: No regression at existing ~250ms baseline ──────────────────────
  it('AC3: p99=250, threshold=120 → maxMs=300 (no regression)', () => {
    const r = latencyScale({ p99Across: 250, threshold: 120 });
    expect(r.maxMs).toBe(300);
  });

  // ── AC4: Tokyo / cold-start (no hard 300ms clamp) ───────────────────────
  it('AC4: p99=800, threshold=120 → maxMs=960', () => {
    const r = latencyScale({ p99Across: 800, threshold: 120 });
    expect(r.maxMs).toBe(960);
    expect(r.maxMs).toBeGreaterThan(300);
  });

  // ── AC6: Defensive input handling ───────────────────────────────────────
  it('AC6: NaN p99 coerced to 0', () => {
    expect(latencyScale({ p99Across: NaN, threshold: 120 }).maxMs).toBe(150);
  });

  it('AC6: negative p99 coerced to 0', () => {
    expect(latencyScale({ p99Across: -50, threshold: 120 }).maxMs).toBe(150);
  });

  it('AC6: Infinity p99 coerced to 0', () => {
    expect(latencyScale({ p99Across: Infinity, threshold: 120 }).maxMs).toBe(150);
  });

  it('AC6: zero threshold coerced to 120 default', () => {
    expect(latencyScale({ p99Across: 0, threshold: 0 }).maxMs).toBe(150);
  });

  it('AC6: negative threshold coerced to 120 default', () => {
    expect(latencyScale({ p99Across: 0, threshold: -1 }).maxMs).toBe(150);
  });

  it('AC6: NaN threshold coerced to 120 default', () => {
    expect(latencyScale({ p99Across: 0, threshold: NaN }).maxMs).toBe(150);
  });

  it('AC6: no NaN propagation into ticks', () => {
    const r = latencyScale({ p99Across: NaN, threshold: NaN });
    expect(r.ticks.every((t) => Number.isFinite(t))).toBe(true);
    expect(r.maxMs).toBeGreaterThanOrEqual(150);
  });

  // ── AC7: Defensive output clamp (huge p99) ──────────────────────────────
  it('AC7: 1e9 p99 clamped to maxMs=10000', () => {
    expect(latencyScale({ p99Across: 1e9, threshold: 120 }).maxMs).toBe(10000);
  });

  it('AC7: MAX_SAFE_INTEGER p99 clamped to maxMs=10000', () => {
    expect(latencyScale({ p99Across: Number.MAX_SAFE_INTEGER, threshold: 120 }).maxMs).toBe(10000);
  });

  it('AC7: maxMs always <= 10000', () => {
    expect(latencyScale({ p99Across: 1e9, threshold: 120 }).maxMs).toBeLessThanOrEqual(10000);
  });

  // ── Tick-shape invariants (covered alongside AC1–AC7) ───────────────────
  it('ticks always start with 0', () => {
    const cases = [50, 200, 800, 1e9, NaN];
    for (const p99 of cases) {
      const r = latencyScale({ p99Across: p99, threshold: 120 });
      expect(r.ticks[0]).toBe(0);
    }
  });

  it('ticks always end with maxMs', () => {
    const cases = [50, 200, 800, 1e9, NaN];
    for (const p99 of cases) {
      const r = latencyScale({ p99Across: p99, threshold: 120 });
      expect(r.ticks[r.ticks.length - 1]).toBe(r.maxMs);
    }
  });

  it('ticks are monotonic increasing', () => {
    const cases = [50, 200, 800, 1e9, NaN];
    for (const p99 of cases) {
      const r = latencyScale({ p99Across: p99, threshold: 120 });
      for (let i = 1; i < r.ticks.length; i++) {
        const cur = r.ticks[i] ?? 0;
        const prev = r.ticks[i - 1] ?? 0;
        expect(cur).toBeGreaterThan(prev);
      }
    }
  });

  // ── Tick-density sweep (BLOCK 2 from round-1 review — extended set) ─────
  // Covers every step-band boundary plus AC7 maxMs=10000 ceiling.
  it('tick count stays in [4,8] across common p99 values', () => {
    const p99Values = [10, 50, 100, 120, 200, 250, 360, 500, 600, 800, 1000, 1500, 2000, 3000, 5000, 9000, 10000];
    for (const p99 of p99Values) {
      const r = latencyScale({ p99Across: p99, threshold: 120 });
      expect(r.ticks.length, `p99=${p99} produced ${r.ticks.length} ticks (maxMs=${r.maxMs})`).toBeGreaterThanOrEqual(4);
      expect(r.ticks.length, `p99=${p99} produced ${r.ticks.length} ticks (maxMs=${r.maxMs})`).toBeLessThanOrEqual(8);
    }
  });

  // ── numericLabels invariant guard (BLOCK 3 from round-1 review) ─────────
  it('ticks always has at least 1 element (component data-role wiring depends on this)', () => {
    const cases = [
      { p99Across: 0, threshold: 0 },
      { p99Across: NaN, threshold: NaN },
      { p99Across: -Infinity, threshold: -1 },
      { p99Across: 1e9, threshold: 1e9 },
    ];
    for (const input of cases) {
      const r = latencyScale(input);
      expect(r.ticks.length, `input=${JSON.stringify(input)} produced empty ticks`).toBeGreaterThanOrEqual(1);
    }
  });

  // ── maxMs always >= 150 (absolute floor) ────────────────────────────────
  it('maxMs is always at least 150 (absolute floor)', () => {
    const edgeCases = [
      { p99Across: 0,   threshold: 120 },
      { p99Across: 0,   threshold: 0   },
      { p99Across: NaN, threshold: NaN },
      { p99Across: -1,  threshold: -1  },
    ];
    for (const input of edgeCases) {
      expect(latencyScale(input).maxMs).toBeGreaterThanOrEqual(150);
    }
  });

});
