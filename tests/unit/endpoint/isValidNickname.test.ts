// tests/unit/endpoint/isValidNickname.test.ts
import { describe, it, expect } from 'vitest';
import { isValidNickname } from '../../../src/lib/endpoint/displayLabel';

describe('isValidNickname', () => {
  // AC3: valid nicknames pass
  it('accepts a plain ASCII nickname', () => {
    expect(isValidNickname('My API')).toBe(true);
  });

  it('accepts a Unicode nickname without forbidden chars', () => {
    expect(isValidNickname('Prod API 日本語')).toBe(true);
  });

  it('accepts a nickname exactly 80 chars', () => {
    expect(isValidNickname('a'.repeat(80))).toBe(true);
  });

  // AC3: type rejections
  it('rejects non-string types (number)', () => {
    expect(isValidNickname(42)).toBe(false);
  });

  it('rejects non-string types (null)', () => {
    expect(isValidNickname(null)).toBe(false);
  });

  it('rejects non-string types (object)', () => {
    expect(isValidNickname({})).toBe(false);
  });

  // AC3: length rejection
  it('rejects nickname over 80 chars after trim', () => {
    expect(isValidNickname('a'.repeat(81))).toBe(false);
  });

  // AC3: 10 MB rejection (DoS guard from spec §4)
  it('rejects 10 MB nickname (DoS guard)', () => {
    expect(isValidNickname('a'.repeat(10 * 1024 * 1024))).toBe(false);
  });

  // AC3: empty / whitespace → false (callers store undefined)
  it('rejects empty string', () => {
    expect(isValidNickname('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidNickname('   ')).toBe(false);
  });

  // AC3: C0 control characters
  it('rejects U+0000 (NUL, C0 control)', () => {
    expect(isValidNickname('ab\u0000cd')).toBe(false);
  });

  it('rejects U+001F (C0 control, last in range)', () => {
    expect(isValidNickname('ab\u001Fcd')).toBe(false);
  });

  // AC3: C1 control characters
  it('rejects U+007F (DEL, C1 start)', () => {
    expect(isValidNickname('ab\u007Fcd')).toBe(false);
  });

  it('rejects U+009F (C1 control, last in range)', () => {
    expect(isValidNickname('ab\u009Fcd')).toBe(false);
  });

  // AC3: bidi override characters
  it('rejects U+202E (bidi right-to-left override)', () => {
    expect(isValidNickname('ab\u202Ecd')).toBe(false);
  });

  it('rejects U+202A (bidi left-to-right embedding, range start)', () => {
    expect(isValidNickname('ab\u202Acd')).toBe(false);
  });

  it('rejects U+2069 (bidi pop directional isolate, range end)', () => {
    expect(isValidNickname('ab\u2069cd')).toBe(false);
  });

  // AC3: zero-width characters
  it('rejects U+200B (zero-width space)', () => {
    expect(isValidNickname('ab\u200Bcd')).toBe(false);
  });

  it('rejects U+200C (ZWNJ)', () => {
    expect(isValidNickname('ab\u200Ccd')).toBe(false);
  });

  it('rejects U+200D (ZWJ)', () => {
    expect(isValidNickname('ab\u200Dcd')).toBe(false);
  });

  it('rejects U+FEFF (BOM)', () => {
    expect(isValidNickname('\uFEFFab')).toBe(false);
  });

  it('rejects U+2060 (word joiner, invisible-operators range start)', () => {
    expect(isValidNickname('ab\u2060cd')).toBe(false);
  });

  it('rejects U+206F (deprecated formatting, invisible range end)', () => {
    expect(isValidNickname('ab\u206Fcd')).toBe(false);
  });

  // AC3: line/paragraph separators
  it('rejects U+2028 (LINE SEPARATOR)', () => {
    expect(isValidNickname('ab\u2028cd')).toBe(false);
  });

  it('rejects U+2029 (PARAGRAPH SEPARATOR)', () => {
    expect(isValidNickname('ab\u2029cd')).toBe(false);
  });
});
