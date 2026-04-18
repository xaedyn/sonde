import { describe, it, expect } from 'vitest';
import { fmt, fmtParts, fmtPct, fmtCount } from '../../src/lib/utils/format';

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
