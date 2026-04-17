import { describe, it, expect } from 'vitest';
import { tokens } from '../../src/lib/tokens';

describe('tokens', () => {
  it('exposes all required surface tokens', () => {
    expect(tokens.color.surface.base).toBe('#0c0a14');
    expect(tokens.color.surface.mid).toBe('#100e1e');
    expect(tokens.color.surface.deep).toBe('#0e0c18');
  });

  it('exposes all spacing tokens as numbers (px)', () => {
    expect(tokens.spacing.xxs).toBe(2);
    expect(tokens.spacing.xs).toBe(4);
    expect(tokens.spacing.sm).toBe(8);
    expect(tokens.spacing.md).toBe(12);
    expect(tokens.spacing.lg).toBe(16);
    expect(tokens.spacing.xl).toBe(24);
    expect(tokens.spacing.xxl).toBe(32);
    expect(tokens.spacing.xxxl).toBe(48);
  });

  it('exposes all timing tokens as numbers (ms)', () => {
    expect(tokens.timing.sonarPingFast).toBe(300);
    expect(tokens.timing.sonarPingMedium).toBe(500);
    expect(tokens.timing.sonarPingSlow).toBe(800);
    expect(tokens.timing.sonarPingTimeout).toBe(1200);
    expect(tokens.timing.fadeIn).toBe(200);
    expect(tokens.timing.progressiveDisclosure).toBe(250);
    expect(tokens.timing.domThrottle).toBe(100);
  });

  it('exposes endpoint palette with exactly 10 colors', () => {
    expect(tokens.color.endpoint).toHaveLength(10);
  });

  it('exposes typography tokens', () => {
    expect(tokens.typography.mono.fontFamily).toContain('Martian Mono');
    expect(tokens.typography.sans.fontFamily).toContain('Sora');
    expect(tokens.typography.statSize).toBe(14);
    expect(tokens.typography.labelSize).toBe(9);
  });

  it('exposes easing function tokens', () => {
    expect(typeof tokens.easingFn.decelerate).toBe('function');
    expect(tokens.easingFn.decelerate(0)).toBe(0);
    expect(tokens.easingFn.decelerate(1)).toBe(1);
  });

  it('exposes canvas config tokens', () => {
    expect(tokens.canvas.pointRadius).toBe(4);
    expect(tokens.canvas.heatmapCellSize).toBe(8);
    expect(tokens.canvas.sonarPing.fast.finalRadius).toBe(12);
    expect(tokens.canvas.sonarPing.timeout.finalRadius).toBe(48);
  });
});

describe('Glass token additions', () => {
  it('exports glass color group', () => {
    expect(tokens.color.glass).toBeDefined();
    expect(tokens.color.glass.bg).toBe('rgba(255,255,255,.03)');
    expect(tokens.color.glass.border).toBe('rgba(255,255,255,.07)');
    expect(tokens.color.glass.highlight).toBe('rgba(255,255,255,.12)');
  });

  it('exports glass typography fonts', () => {
    expect(tokens.typography.sans.fontFamily).toContain('Sora');
    expect(tokens.typography.mono.fontFamily).toContain('Martian Mono');
  });

  it('exports glass background base color', () => {
    expect(tokens.color.surface.base).toBe('#0c0a14');
  });

  it('exports glass accent colors', () => {
    expect(tokens.color.accent.cyan).toBe('#67e8f9');
    expect(tokens.color.accent.pink).toBe('#f9a8d4');
    expect(tokens.color.accent.green).toBe('#86efac');
  });

  it('exports text opacity tokens (t1–t5)', () => {
    expect(tokens.color.text.t1).toBe('rgba(255,255,255,.94)');
    expect(tokens.color.text.t2).toBe('rgba(255,255,255,.58)');
    expect(tokens.color.text.t3).toBe('rgba(255,255,255,.5)');
    expect(tokens.color.text.t4).toBe('rgba(255,255,255,.32)');
    expect(tokens.color.text.t5).toBe('rgba(255,255,255,.07)');
  });
});

describe('heatmap tokens', () => {
  it('exports color.heatmap group with all 4 keys (AC10)', () => {
    expect(tokens.color.heatmap).toBeDefined();
    expect(tokens.color.heatmap.fast).toBeDefined();
    expect(tokens.color.heatmap.elevated).toBeDefined();
    expect(tokens.color.heatmap.slow).toBeDefined();
    expect(tokens.color.heatmap.timeout).toBeDefined();
  });
  it('heatmap.elevated is not a raw hex — comes from primitive (AC10)', () => {
    expect(typeof tokens.color.heatmap.elevated).toBe('string');
    expect(tokens.color.heatmap.elevated.length).toBeGreaterThan(0);
  });
});

describe('adaptive lanes tokens', () => {
  it('exposes tokens.lane.minHeight as 120 (AC3: minimum readable lane height)', () => {
    expect(tokens.lane.minHeight).toBe(120);
  });

  it('exposes tokens.lane.compactHeaderHeight as 28', () => {
    expect(tokens.lane.compactHeaderHeight).toBe(28);
  });

  it('exposes tokens.lane.compactThreshold as 4 (AC2: compact triggers at 4 endpoints)', () => {
    expect(tokens.lane.compactThreshold).toBe(4);
  });

  it('exposes tokens.lane.maxEndpoints as 10 (AC4: hard cap)', () => {
    expect(tokens.lane.maxEndpoints).toBe(10);
  });
});

describe('new pipeline tokens', () => {
  it('exposes canvas.ribbon tokens', () => {
    expect(tokens.canvas.ribbon.fillOpacity).toBe(0.15);
    expect(tokens.canvas.ribbon.medianOpacity).toBe(0.6);
    expect(tokens.canvas.ribbon.medianLineWidth).toBe(1.5);
    expect(Array.isArray(tokens.canvas.ribbon.medianLineDash)).toBe(true);
  });

  it('exposes canvas.emptyState tokens', () => {
    expect(tokens.canvas.emptyState.sweepPeriod).toBe(4000);
    expect(tokens.canvas.emptyState.sweepLineOpacity).toBe(0.25);
    expect(tokens.canvas.emptyState.ringOpacity).toBe(0.08);
    expect(tokens.canvas.emptyState.textOpacity).toBe(0.5);
  });

  it('exposes canvas.xAxis tokens', () => {
    expect(tokens.canvas.xAxis.minLabelSpacing).toBe(60);
    expect(tokens.canvas.xAxis.labelOffsetY).toBe(4);
    expect(tokens.canvas.xAxis.paddingBottom).toBe(32);
  });

  it('exposes canvas.yAxis tokens', () => {
    expect(tokens.canvas.yAxis.rollingWindowSize).toBe(20);
    expect(tokens.canvas.yAxis.percentileClampLow).toBe(2);
    expect(tokens.canvas.yAxis.percentileClampHigh).toBe(98);
    expect(tokens.canvas.yAxis.logScaleThreshold).toBe(50);
  });
});

describe('ux-polish tokens', () => {
  it('exports cyan15 and cyan25 primitive-backed accent tokens (AC-1)', () => {
    expect(tokens.color.accent.cyanBgSubtle).toBe('rgba(103,232,249,.15)');
    expect(tokens.color.accent.cyanBorderSubtle).toBe('rgba(103,232,249,.25)');
  });

  it('exports pink15 and pink25 primitive-backed accent tokens (AC-1)', () => {
    expect(tokens.color.accent.pinkBgSubtle).toBe('rgba(249,168,212,.15)');
    expect(tokens.color.accent.pinkBorderSubtle).toBe('rgba(249,168,212,.25)');
  });

  it('exports glow tokens for box-shadow', () => {
    expect(tokens.color.glow.cyan).toBe('rgba(103,232,249,.2)');
    expect(tokens.color.glow.pink).toBe('rgba(249,168,212,.2)');
  });

  it('exports breakpoints.small as 480 (AC-5)', () => {
    expect(tokens.breakpoints.small).toBe(480);
  });

  it('exports statTransition, dotEntrance, dotExit timing tokens (AC-4)', () => {
    expect(tokens.timing.statTransition).toBe(200);
    expect(tokens.timing.dotEntrance).toBe(200);
    expect(tokens.timing.dotExit).toBe(150);
  });

  it('exports glass.statsBorder token', () => {
    expect(tokens.color.glass.statsBorder).toBe('rgba(255,255,255,.04)');
  });
});

describe('tier2 visualization tokens', () => {
  it('exports tokens.color.tier2 group with all 5 phase colors (AC-6)', () => {
    expect(tokens.color.tier2).toBeDefined();
    expect(tokens.color.tier2.dns).toBe('rgba(134,239,172,.7)');
    expect(tokens.color.tier2.tcp).toBe('rgba(103,232,249,.7)');
    expect(tokens.color.tier2.tls).toBe('rgba(196,181,253,.7)');
    expect(tokens.color.tier2.ttfb).toBe('rgba(251,191,36,.7)');
    expect(tokens.color.tier2.transfer).toBe('rgba(249,168,212,.7)');
  });

  it('exports tokens.timing.tooltipDelay as 50 (faster than hoverTip at 100)', () => {
    expect(tokens.timing.tooltipDelay).toBe(50);
  });

  it('exports tokens.color.tier2.labelText at opacity .40 for WCAG AA (AC-6)', () => {
    expect(tokens.color.tier2.labelText).toBe('rgba(255,255,255,.40)');
  });
});

describe('apple-polish-v3 tokens (AC1 + AC2)', () => {
  const parseAlpha = (s: string): number => {
    const match = s.match(/,\s*([\d.]+)\s*\)/);
    return match ? parseFloat(match[1]) : 0;
  };

  it('color.bg.accent has alpha ≤ .04 (AC1)', () => {
    const val: string = tokens.color.bg.accent;
    expect(parseAlpha(val)).toBeLessThanOrEqual(0.04);
  });

  it('color.orb.cyan has alpha ≤ .045 (AC1 orb baseline)', () => {
    expect(parseAlpha(tokens.color.orb.cyan)).toBeLessThanOrEqual(0.045);
  });

  it('color.orb.pink has alpha ≤ .045 (AC1 orb baseline)', () => {
    expect(parseAlpha(tokens.color.orb.pink)).toBeLessThanOrEqual(0.045);
  });

  it('color.orb.violet has alpha ≤ .045 (AC1 orb baseline)', () => {
    expect(parseAlpha(tokens.color.orb.violet)).toBeLessThanOrEqual(0.045);
  });

  it('color.surface.border.dim is rgba(255,255,255,.04) (AC2)', () => {
    expect(tokens.color.surface.border.dim).toBe('rgba(255,255,255,.04)');
  });

  it('color.surface.border.mid is rgba(255,255,255,.08) (AC2)', () => {
    expect(tokens.color.surface.border.mid).toBe('rgba(255,255,255,.08)');
  });

  it('color.surface.border.bright is rgba(255,255,255,.14) (AC2)', () => {
    expect(tokens.color.surface.border.bright).toBe('rgba(255,255,255,.14)');
  });

  it('border tiers have ≥ .04 alpha delta between adjacent tiers (AC2)', () => {
    const dim    = parseAlpha(tokens.color.surface.border.dim);
    const mid    = parseAlpha(tokens.color.surface.border.mid);
    const bright = parseAlpha(tokens.color.surface.border.bright);
    expect(mid - dim).toBeGreaterThanOrEqual(0.04);
    expect(bright - mid).toBeGreaterThanOrEqual(0.04);
  });
});
