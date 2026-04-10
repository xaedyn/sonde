import { describe, it, expect } from 'vitest';
import { deriveLayoutMode } from '../../src/lib/layout';

describe('deriveLayoutMode (AC1, AC2, AC3)', () => {
  it('returns "full" when count < 4 on desktop (AC1)', () => {
    expect(deriveLayoutMode(1, 900, false)).toBe('full');
    expect(deriveLayoutMode(2, 900, false)).toBe('full');
    expect(deriveLayoutMode(3, 900, false)).toBe('full');
  });

  it('returns "compact" when count >= 4 and lanes fit at >= 120px (AC2)', () => {
    // (900 - 3*8) / 4 = 219px >= 120px → compact
    expect(deriveLayoutMode(4, 900, false)).toBe('compact');
  });

  it('returns "compact-2col" when single-col lanes would be < 120px (AC3)', () => {
    // 10 endpoints in 900px: (900 - 9*8)/10 = 82.8px < 120px → check 2-col
    // 2-col: ceil(10/2)=5; (900 - 4*8)/5 = 173.6px >= 120 → compact-2col
    expect(deriveLayoutMode(10, 900, false)).toBe('compact-2col');
  });

  it('returns "compact" (not 2-col) on mobile regardless of height', () => {
    expect(deriveLayoutMode(10, 900, true)).toBe('compact');
  });

  it('returns "full" when count < 3 on mobile (MOBILE_COMPACT_THRESHOLD)', () => {
    expect(deriveLayoutMode(1, 900, true)).toBe('full');
    expect(deriveLayoutMode(2, 900, true)).toBe('full');
  });

  it('returns "compact" when count >= 3 on mobile', () => {
    expect(deriveLayoutMode(3, 900, true)).toBe('compact');
  });

  it('returns "compact" when single-col barely fits (7 endpoints, 900px)', () => {
    // (900 - 6*8)/7 = 121.7px >= 120 → compact (not 2-col)
    expect(deriveLayoutMode(7, 900, false)).toBe('compact');
  });

  it('returns "full" for 0 endpoints (empty state)', () => {
    expect(deriveLayoutMode(0, 900, false)).toBe('full');
  });
});
