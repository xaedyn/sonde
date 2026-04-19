import { describe, it, expect } from 'vitest';
import { formatElapsed } from '../../src/lib/utils/format';

describe('formatElapsed (AC7)', () => {
  it('formats 0ms as "0:00"', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });
  it('formats sub-10s as S.Xs with one decimal', () => {
    expect(formatElapsed(1200)).toBe('1.2s');
    expect(formatElapsed(3800)).toBe('3.8s');
    expect(formatElapsed(9999)).toBe('9.9s');
  });
  it('formats 10s exactly as "0:10"', () => {
    expect(formatElapsed(10000)).toBe('0:10');
  });
  it('formats M:SS for 10s–59:59', () => {
    expect(formatElapsed(42000)).toBe('0:42');
    expect(formatElapsed(72500)).toBe('1:12');
    expect(formatElapsed(725000)).toBe('12:05');
  });
  it('formats H:MM:SS for >= 1 hour', () => {
    expect(formatElapsed(3600000)).toBe('1:00:00');
    expect(formatElapsed(5025000)).toBe('1:23:45');
  });
  it('handles negative values by returning "0:00"', () => {
    expect(formatElapsed(-500)).toBe('0:00');
  });
});
