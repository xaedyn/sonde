import { describe, it, expect } from 'vitest';
import { colorMap, latencyToColor, COLOR_MAP_SIZE, STATUS_COLORS } from '../../src/lib/renderers/color-map';

describe('colorMap', () => {
  it('has exactly COLOR_MAP_SIZE entries', () => {
    expect(COLOR_MAP_SIZE).toBe(1501);
    expect(colorMap).toHaveLength(1501);
  });

  it('every entry is a valid lowercase hex color', () => {
    const hexPattern = /^#[0-9a-f]{6}$/;
    for (let i = 0; i < colorMap.length; i++) {
      expect(colorMap[i], `entry ${i}`).toMatch(hexPattern);
    }
  });

  it('0ms is the excellent cyan color (brand accent)', () => {
    expect(colorMap[0]).toBe('#67e8f9');
  });

  it('1500ms is the failing crimson color', () => {
    expect(colorMap[1500]).toBe('#b91c1c');
  });

  it('10ms maps to the great teal anchor color', () => {
    expect(colorMap[10]).toBe('#2dd4bf');
  });

  it('25ms maps to the good green anchor color', () => {
    expect(colorMap[25]).toBe('#22c55e');
  });

  it('50ms maps to the moderate yellow anchor color', () => {
    expect(colorMap[50]).toBe('#eab308');
  });

  it('100ms maps to the elevated orange anchor color', () => {
    expect(colorMap[100]).toBe('#f97316');
  });

  it('200ms maps to the degraded red anchor color', () => {
    expect(colorMap[200]).toBe('#ef4444');
  });

  it('500ms maps to the critical deep red anchor color', () => {
    expect(colorMap[500]).toBe('#dc2626');
  });
});

describe('latencyToColor', () => {
  it('returns correct color for exact anchors', () => {
    expect(latencyToColor(0)).toBe('#67e8f9');
    expect(latencyToColor(50)).toBe('#eab308');
    expect(latencyToColor(1500)).toBe('#b91c1c');
  });

  it('clamps below 0 to 0ms color', () => {
    expect(latencyToColor(-50)).toBe('#67e8f9');
    expect(latencyToColor(-1)).toBe('#67e8f9');
  });

  it('clamps above 1500 to 1500ms color', () => {
    expect(latencyToColor(2000)).toBe('#b91c1c');
    expect(latencyToColor(9999)).toBe('#b91c1c');
  });

  it('interpolated value at 5ms is between cyan and teal', () => {
    const color = latencyToColor(5);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(color).not.toBe('#67e8f9');
    expect(color).not.toBe('#2dd4bf');
  });

  it('low latency values are in the cyan/teal/green family (high green channel)', () => {
    const parseHex = (h: string) => ({
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    });
    for (let ms = 0; ms <= 25; ms += 5) {
      const { r, g } = parseHex(latencyToColor(ms));
      // Green channel dominant in the cool range
      expect(g, `at ${ms}ms`).toBeGreaterThanOrEqual(r);
    }
  });

  it('high latency values are in the red family', () => {
    const parseHex = (h: string) => ({
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    });
    for (let ms = 200; ms <= 1500; ms += 100) {
      const { r, g } = parseHex(latencyToColor(ms));
      // Red-dominant in the warm range
      expect(r, `at ${ms}ms`).toBeGreaterThan(g);
    }
  });

  it('rounds fractional milliseconds to integer index', () => {
    expect(latencyToColor(42.7)).toBe(latencyToColor(43));
  });
});

describe('STATUS_COLORS', () => {
  it('has a timeout color', () => {
    expect(STATUS_COLORS.timeout).toBe('#9b5de5');
  });

  it('has an error color', () => {
    expect(STATUS_COLORS.error).toBe('#c77dff');
  });
});
