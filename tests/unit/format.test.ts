import { describe, it, expect } from 'vitest';
import { fmt, fmtParts, fmtPct, fmtCount, compactUrlLabel, fmtAxisMs, axisEdgeLabel, binLabel } from '../../src/lib/utils/format';
import type { HistogramBin } from '../../src/lib/utils/diagnose-stats';

describe('fmt()', () => {
  it('returns "—" for null/undefined/NaN/Infinity/negative', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
    expect(fmt(NaN)).toBe('—');
    expect(fmt(Infinity)).toBe('—');
    expect(fmt(-Infinity)).toBe('—');
    expect(fmt(-1)).toBe('—');
  });

  it('uses 2 fraction digits below 1ms (inclusive of boundary)', () => {
    expect(fmt(0)).toBe('0.00');
    expect(fmt(0.43)).toBe('0.43');
    // 0.999 stays in the <1 branch; tenths-of-milli precision is kept.
    expect(fmt(0.999)).toBe('1.00');
  });

  it('uses 1 fraction digit between 1 and 10ms', () => {
    expect(fmt(1)).toBe('1.0');
    expect(fmt(9.87)).toBe('9.9');
  });

  it('rounds to integer between 10 and 10000ms and inserts thousands separator', () => {
    expect(fmt(12)).toBe('12');
    expect(fmt(127.4)).toBe('127');
    expect(fmt(1234)).toBe('1,234');
    expect(fmt(9999.9)).toBe('10,000');
  });

  it('switches to seconds with 1 fraction digit at 10000ms and above', () => {
    expect(fmt(10000)).toBe('10.0s');
    expect(fmt(12500)).toBe('12.5s');
    expect(fmt(60000)).toBe('60.0s');
  });
});

describe('fmtParts()', () => {
  it('returns em-dash + empty unit for null/Infinity', () => {
    expect(fmtParts(null)).toEqual({ num: '—', unit: '' });
    expect(fmtParts(undefined)).toEqual({ num: '—', unit: '' });
    expect(fmtParts(Infinity)).toEqual({ num: '—', unit: '' });
    expect(fmtParts(NaN)).toEqual({ num: '—', unit: '' });
  });

  it('returns ms unit for values under 10s', () => {
    expect(fmtParts(127.4)).toEqual({ num: '127', unit: 'ms' });
    expect(fmtParts(0.43)).toEqual({ num: '0.43', unit: 'ms' });
    expect(fmtParts(9999)).toEqual({ num: '9,999', unit: 'ms' });
  });

  it('switches to s unit at 10000ms', () => {
    expect(fmtParts(10000)).toEqual({ num: '10.0', unit: 's' });
    expect(fmtParts(12500)).toEqual({ num: '12.5', unit: 's' });
  });
});

describe('fmtPct()', () => {
  it('rounds to the nearest integer percent', () => {
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(0.5)).toBe('50%');
    expect(fmtPct(0.996)).toBe('100%');
    expect(fmtPct(1)).toBe('100%');
  });

  it('handles values above 1 (for overshoot indicators)', () => {
    expect(fmtPct(1.234)).toBe('123%');
  });
});

describe('fmtCount()', () => {
  it('formats integers with thousands separator', () => {
    expect(fmtCount(0)).toBe('0');
    expect(fmtCount(42)).toBe('42');
    expect(fmtCount(1234)).toBe('1,234');
    expect(fmtCount(1000000)).toBe('1,000,000');
  });
});

describe('compactUrlLabel()', () => {
  it('renders hosts without protocol noise', () => {
    expect(compactUrlLabel('https://www.google.com/generate_204')).toBe('google.com/generate_204');
    expect(compactUrlLabel('https://edge.microsoft.com/')).toBe('edge.microsoft.com');
  });

  it('returns invalid input unchanged', () => {
    expect(compactUrlLabel('not a url')).toBe('not a url');
  });
});

describe('fmtAxisMs()', () => {
  it('AC #11: axis values below 1000 render as bare integer strings', () => {
    expect(fmtAxisMs(2)).toBe('2');
    expect(fmtAxisMs(50)).toBe('50');
    expect(fmtAxisMs(500)).toBe('500');
    expect(fmtAxisMs(999)).toBe('999');
  });

  it('AC #11: axis values at or above 1000 render with "s" suffix', () => {
    expect(fmtAxisMs(1000)).toBe('1s');
    expect(fmtAxisMs(2000)).toBe('2s');
    expect(fmtAxisMs(2500)).toBe('2.5s');
  });
});

describe('axisEdgeLabel()', () => {
  it('AC #11a: values below 1000 ms append " ms" suffix', () => {
    expect(axisEdgeLabel(50)).toBe('50 ms');
    expect(axisEdgeLabel(500)).toBe('500 ms');
    expect(axisEdgeLabel(999)).toBe('999 ms');
  });

  it('AC #11a: values at or above 1000 use fmtAxisMs without ms suffix (bin-8 boundary regression guard)', () => {
    // The boundary case: axisEdgeLabel(1000) MUST NOT render "1s ms".
    expect(axisEdgeLabel(1000)).toBe('1s');
    expect(axisEdgeLabel(1000)).not.toContain(' ms');
    expect(axisEdgeLabel(2000)).toBe('2s');
    expect(axisEdgeLabel(2500)).toBe('2.5s');
  });
});

describe('binLabel()', () => {
  it('AC #12: bin 0 (open-low boundary) renders as "<N ms"', () => {
    const bin0: HistogramBin = { fromMs: 0, toMs: 2, count: 3 };
    expect(binLabel(bin0)).toBe('<2 ms');
  });

  it('AC #12: internal ms-range bins render as "from–to ms"', () => {
    expect(binLabel({ fromMs: 2, toMs: 5, count: 3 })).toBe('2–5 ms');
    expect(binLabel({ fromMs: 10, toMs: 20, count: 3 })).toBe('10–20 ms');
    expect(binLabel({ fromMs: 200, toMs: 500, count: 3 })).toBe('200–500 ms');
  });

  it('AC #13: bin 8 {500, 1000} renders as "500–1000 ms" (unit-hop regression)', () => {
    // The previous draft produced "500–1s" — this is the regression guard.
    expect(binLabel({ fromMs: 500, toMs: 1000, count: 2 })).toBe('500–1000 ms');
  });

  it('AC #12: bin 9 (s-range internal bin) renders as "from–to s"', () => {
    expect(binLabel({ fromMs: 1000, toMs: 2000, count: 3 })).toBe('1–2 s');
  });

  it('AC #12: bin 10 (open-high boundary) renders as "≥N s" when fromMs >= 1000', () => {
    expect(binLabel({ fromMs: 2000, toMs: Number.POSITIVE_INFINITY, count: 3 })).toBe('≥2 s');
  });

  it('AC #12: singular/plural — count 1 omits trailing "s" on "samples"', () => {
    const bin: HistogramBin = { fromMs: 0, toMs: 2, count: 1 };
    const title = `${binLabel(bin)} · ${bin.count} sample${bin.count === 1 ? '' : 's'}`;
    expect(title).toBe('<2 ms · 1 sample');
  });

  it('AC #12: plural — count 3 appends "samples"', () => {
    const bin: HistogramBin = { fromMs: 0, toMs: 2, count: 3 };
    const title = `${binLabel(bin)} · ${bin.count} sample${bin.count === 1 ? '' : 's'}`;
    expect(title).toBe('<2 ms · 3 samples');
  });
});
