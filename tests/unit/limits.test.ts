// tests/unit/limits.test.ts
import { describe, it, expect } from 'vitest';
import { clampCap, MAX_CAP } from '../../src/lib/limits';

describe('clampCap', () => {
  // ── Pass-through: valid inputs ─────────────────────────────────────────────

  it('returns 1 unchanged (minimum valid)', () => {
    expect(clampCap(1)).toBe(1);
  });

  it('returns MAX_CAP unchanged (maximum valid)', () => {
    expect(clampCap(MAX_CAP)).toBe(MAX_CAP);
  });

  it('returns a mid-range integer unchanged', () => {
    expect(clampCap(100)).toBe(100);
  });

  // ── Upper clamp ─────────────────────────────────────────────────────────────

  it('clamps value above MAX_CAP to MAX_CAP', () => {
    expect(clampCap(MAX_CAP + 1)).toBe(MAX_CAP);
  });

  it('clamps 999_999 to MAX_CAP', () => {
    expect(clampCap(999_999)).toBe(MAX_CAP);
  });

  it('clamps 10001 to MAX_CAP', () => {
    // Old guard used 10000; new MAX_CAP is 3600
    expect(clampCap(10001)).toBe(MAX_CAP);
  });

  // ── Lower clamp ─────────────────────────────────────────────────────────────

  it('clamps -1 (negative) to 1', () => {
    expect(clampCap(-1)).toBe(1);
  });

  it('clamps -9999 to 1', () => {
    expect(clampCap(-9999)).toBe(1);
  });

  // ── Legacy zero sentinel ────────────────────────────────────────────────────

  it('maps 0 (legacy unlimited sentinel) to MAX_CAP', () => {
    // AC2: existing users with cap: 0 in localStorage get MAX_CAP on next load
    expect(clampCap(0)).toBe(MAX_CAP);
  });

  // ── Non-integer rounding ─────────────────────────────────────────────────────

  it('rounds 100.5 to 101 (within range)', () => {
    expect(clampCap(100.5)).toBe(101);
  });

  it('rounds 0.4 to 0, then clamps to 1 (minimum)', () => {
    // Math.round(0.4) = 0 → rounded < 1 → return 1
    // The zero sentinel applies only to exact integer 0, not rounded-to-zero floats.
    expect(clampCap(0.4)).toBe(1);
  });

  it('rounds 0.6 to 1 (minimum boundary)', () => {
    // Math.round(0.6) = 1 → 1
    expect(clampCap(0.6)).toBe(1);
  });

  it('rounds MAX_CAP + 0.4 to MAX_CAP (rounds down, still at boundary)', () => {
    expect(clampCap(MAX_CAP + 0.4)).toBe(MAX_CAP);
  });

  // ── NaN / Infinity — NEVER return NaN ──────────────────────────────────────

  it('maps NaN to MAX_CAP (NEVER return NaN — would disable engine check)', () => {
    // AC1: roundCounter >= NaN is always false, silently disabling the cap.
    expect(clampCap(NaN)).toBe(MAX_CAP);
    expect(typeof clampCap(NaN)).toBe('number');
    expect(Number.isFinite(clampCap(NaN))).toBe(true);
  });

  it('maps Infinity to MAX_CAP', () => {
    expect(clampCap(Infinity)).toBe(MAX_CAP);
  });

  it('maps -Infinity to MAX_CAP', () => {
    expect(clampCap(-Infinity)).toBe(MAX_CAP);
  });

  // ── Non-numeric inputs ──────────────────────────────────────────────────────

  it('maps string "abc" to MAX_CAP', () => {
    expect(clampCap('abc')).toBe(MAX_CAP);
  });

  it('maps string "100" to MAX_CAP (no implicit coercion)', () => {
    // Strings that look like numbers are still non-numeric — no implicit cast
    expect(clampCap('100')).toBe(MAX_CAP);
  });

  it('maps null to MAX_CAP', () => {
    expect(clampCap(null)).toBe(MAX_CAP);
  });

  it('maps undefined to MAX_CAP', () => {
    expect(clampCap(undefined)).toBe(MAX_CAP);
  });

  it('maps plain object to MAX_CAP', () => {
    expect(clampCap({})).toBe(MAX_CAP);
  });

  it('maps array to MAX_CAP', () => {
    expect(clampCap([])).toBe(MAX_CAP);
  });

  // ── Output is always a finite integer ──────────────────────────────────────

  it.each([
    0, -1, 1, 100, MAX_CAP, MAX_CAP + 1, NaN, Infinity, -Infinity,
    'abc', null, undefined, {}, [],
  ] as unknown[])('output is always a finite integer (input: %s)', (input) => {
    const result = clampCap(input);
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(MAX_CAP);
  });
});
