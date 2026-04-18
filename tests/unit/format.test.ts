import { describe, it, expect } from 'vitest';
import { fmt, fmtParts, fmtPct, fmtCount } from '../../src/lib/utils/format';

describe('fmt — single source of truth for ms formatting', () => {
  it('returns em-dash for nullish/non-finite input', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
    expect(fmt(Number.NaN)).toBe('—');
    expect(fmt(Number.POSITIVE_INFINITY)).toBe('—');
    expect(fmt(Number.NEGATIVE_INFINITY)).toBe('—');
  });

  it('sub-1 ms renders with two decimal places', () => {
    expect(fmt(0.43)).toBe('0.43');
    expect(fmt(0.1)).toBe('0.10');
    expect(fmt(0)).toBe('0.00');
  });

  it('sub-10 ms renders with one decimal place', () => {
    expect(fmt(1)).toBe('1.0');
    expect(fmt(9.94)).toBe('9.9');
  });

  it('sub-10k ms renders as rounded integer with thousands separator', () => {
    expect(fmt(12)).toBe('12');
    expect(fmt(127.4)).toBe('127');
    expect(fmt(1234)).toBe('1,234');
    expect(fmt(9999)).toBe('9,999');
  });

  it('>=10k ms renders as seconds with one decimal', () => {
    expect(fmt(10_000)).toBe('10.0s');
    expect(fmt(12_345)).toBe('12.3s');
    expect(fmt(60_000)).toBe('60.0s');
  });

  it('negative (impossible-but-don\'t-throw) renders as em-dash path or signed integer', () => {
    // Spec treats negative as "invalid" — return em-dash.
    expect(fmt(-1)).toBe('—');
  });
});

describe('fmtParts — split number and unit', () => {
  it('returns em-dash + empty unit for nullish/non-finite', () => {
    expect(fmtParts(null)).toEqual({ num: '—', unit: '' });
    expect(fmtParts(undefined)).toEqual({ num: '—', unit: '' });
    expect(fmtParts(Number.NaN)).toEqual({ num: '—', unit: '' });
    expect(fmtParts(Number.POSITIVE_INFINITY)).toEqual({ num: '—', unit: '' });
  });

  it('uses ms unit under 10k', () => {
    expect(fmtParts(127.4)).toEqual({ num: '127', unit: 'ms' });
    expect(fmtParts(0.43)).toEqual({ num: '0.43', unit: 'ms' });
    expect(fmtParts(9999)).toEqual({ num: '9,999', unit: 'ms' });
  });

  it('uses s unit at and above 10k', () => {
    expect(fmtParts(10_000)).toEqual({ num: '10.0', unit: 's' });
    expect(fmtParts(12_345)).toEqual({ num: '12.3', unit: 's' });
  });
});

describe('fmtPct — ratio (0..1) to integer percent', () => {
  it('rounds and suffixes %', () => {
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(0.5)).toBe('50%');
    expect(fmtPct(0.999)).toBe('100%');
    expect(fmtPct(1)).toBe('100%');
    expect(fmtPct(0.054)).toBe('5%');
  });
});

describe('fmtCount — integer with locale thousands separator', () => {
  it('renders small integers unchanged', () => {
    expect(fmtCount(0)).toBe('0');
    expect(fmtCount(42)).toBe('42');
  });

  it('inserts thousands separators (en-US locale default)', () => {
    expect(fmtCount(1234)).toBe('1,234');
    expect(fmtCount(1_000_000)).toBe('1,000,000');
  });
});
