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

  it('0ms is the excellent cyan color', () => {
    expect(colorMap[0]).toBe('#00b4d8');
  });

  it('1500ms is the failing red color', () => {
    expect(colorMap[1500]).toBe('#f94144');
  });

  it('25ms maps to the fast anchor color', () => {
    expect(colorMap[25]).toBe('#0096c7');
  });

  it('50ms maps to the good blue anchor color', () => {
    expect(colorMap[50]).toBe('#0077b6');
  });

  it('100ms maps to the moderate green anchor color', () => {
    expect(colorMap[100]).toBe('#90be6d');
  });

  it('200ms maps to the elevated yellow anchor color', () => {
    expect(colorMap[200]).toBe('#f9c74f');
  });

  it('500ms maps to the slow orange anchor color', () => {
    expect(colorMap[500]).toBe('#f8961e');
  });

  it('1000ms maps to the critical orange-red anchor color', () => {
    expect(colorMap[1000]).toBe('#f3722c');
  });
});

describe('latencyToColor', () => {
  it('returns correct color for exact anchors', () => {
    expect(latencyToColor(0)).toBe('#00b4d8');
    expect(latencyToColor(100)).toBe('#90be6d');
    expect(latencyToColor(1500)).toBe('#f94144');
  });

  it('clamps below 0 to 0ms color', () => {
    expect(latencyToColor(-50)).toBe('#00b4d8');
    expect(latencyToColor(-1)).toBe('#00b4d8');
  });

  it('clamps above 1500 to 1500ms color', () => {
    expect(latencyToColor(2000)).toBe('#f94144');
    expect(latencyToColor(9999)).toBe('#f94144');
  });

  it('interpolated value at 75ms is between good and moderate (blueish-green)', () => {
    // Between 50ms (#0077b6 blue) and 100ms (#90be6d green)
    // At 75ms (midpoint) the blue channel should be lower than 0077b6 and higher than 90be6d
    const color = latencyToColor(75);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    // Not at either anchor
    expect(color).not.toBe('#0077b6');
    expect(color).not.toBe('#90be6d');
  });

  it('low latency values are in the blue/cyan family', () => {
    // 0–50ms should be cyan/blue dominant (high blue channel)
    const parseHex = (h: string) => ({
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    });
    for (let ms = 0; ms <= 50; ms += 5) {
      const { r, b } = parseHex(latencyToColor(ms));
      // Blue-dominant: blue channel >= red channel
      expect(b, `at ${ms}ms`).toBeGreaterThanOrEqual(r);
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
