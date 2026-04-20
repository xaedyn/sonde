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

  // canvas.* and sonarPing were retired in Phase 7 alongside the Lanes family.
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

// adaptive-lanes tokens (minHeight / compactHeaderHeight / compactThreshold /
// maxEndpoints) and the canvas.* ribbon / emptyState / xAxis / yAxis groups
// were all retired in Phase 7 alongside the Lanes / Timeline / Heatmap views.

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

  // statTransition / dotEntrance / dotExit retired in Phase 7 — none of the
  // surviving views (Overview, Live, Diagnose) consumed them.

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

describe('visual-polish-v3 tokens (AC1 + AC2)', () => {
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

describe('v2 foundation tokens (Phase 0)', () => {
  it('exposes amber accent tri (color + glow + tone)', () => {
    expect(tokens.color.accent.amber).toBe('#fbbf24');
    expect(tokens.color.accent.amberGlow).toBe('rgba(251,191,36,.33)');
    expect(tokens.color.accent.amberTone).toBe('#b38410');
  });

  it('exposes cyan and pink glow + tone companions', () => {
    expect(tokens.color.accent.cyanGlow).toBe('rgba(103,232,249,.33)');
    expect(tokens.color.accent.cyanTone).toBe('#3aa7b8');
    expect(tokens.color.accent.pinkGlow).toBe('rgba(249,168,212,.33)');
    expect(tokens.color.accent.pinkTone).toBe('#b0628a');
  });

  it('exposes dial-face surface + deep overlay', () => {
    expect(tokens.color.surface.dialFace).toBe('#141021');
    expect(tokens.color.surface.overlayDeep).toBe('rgba(11,8,20,.85)');
  });

  it('exposes rail-scoped glass surfaces distinct from existing bgHover/bgStrong', () => {
    expect(tokens.color.glass.bgRailHover).toBe('rgba(255,255,255,.06)');
    expect(tokens.color.glass.bgRailSelected).toBe('rgba(255,255,255,.10)');
    // preserve existing consumer values
    expect(tokens.color.glass.bgHover).toBe('rgba(255,255,255,.07)');
    expect(tokens.color.glass.bgStrong).toBe('rgba(255,255,255,.045)');
  });

  it('exposes SVG primitives for dial, orbit ring, scope grid', () => {
    expect(tokens.color.svg.gridLineCyan).toBe('rgba(103,232,249,.05)');
    expect(tokens.color.svg.gridLineMajor).toBe('rgba(255,255,255,.06)');
    expect(tokens.color.svg.tickMinor).toBe('rgba(255,255,255,.18)');
    expect(tokens.color.svg.tickMajor).toBe('rgba(255,255,255,.50)');
    expect(tokens.color.svg.handStroke).toBe('#ffffff');
    expect(tokens.color.svg.dialRim).toBe('rgba(255,255,255,.14)');
    expect(tokens.color.svg.orbitTrack).toBe('rgba(255,255,255,.06)');
    expect(tokens.color.svg.orbitEdge).toBe('rgba(255,255,249,.10)');
  });

  it('exposes tooltip deep variant + border/text tokens', () => {
    expect(tokens.color.tooltip.bgDeep).toBe('rgba(10,9,18,.92)');
    expect(tokens.color.tooltip.border).toBe('rgba(255,255,255,.10)');
    expect(tokens.color.tooltip.text).toBe('rgba(255,255,255,.95)');
    expect(tokens.color.tooltip.textDim).toBe('rgba(255,255,255,.55)');
  });

  it('exposes typography scale matching the v2 prototype', () => {
    // Source of truth: v2/Chronoscope v2.html CSS variable block.
    expect(tokens.typography.scale.xs).toBe('10px');
    expect(tokens.typography.scale.sm).toBe('11px');
    expect(tokens.typography.scale.md).toBe('12px');
    expect(tokens.typography.scale.base).toBe('13px');
    expect(tokens.typography.scale.lg).toBe('14px');
    expect(tokens.typography.scale.xl).toBe('17px');
    expect(tokens.typography.scale.xl2).toBe('20px');
    expect(tokens.typography.scale.xl3).toBe('24px');
    expect(tokens.typography.scale.xxl).toBe('32px');
  });

  it('exposes tracking tokens matching the v2 prototype', () => {
    expect(tokens.typography.tracking.kicker).toBe('0.22em');
    expect(tokens.typography.tracking.label).toBe('0.14em');
    expect(tokens.typography.tracking.tight).toBe('-0.01em');
    expect(tokens.typography.tracking.display).toBe('-0.03em');
    expect(tokens.typography.tracking.body).toBe('0');
  });

  it('exposes lane.topbarHeight=58 and lane.railWidth=264 per v2 chrome', () => {
    expect(tokens.lane.topbarHeight).toBe(58);
    expect(tokens.lane.railWidth).toBe(264);
  });

  it('exposes v2 motion primitives', () => {
    expect(tokens.timing.handLerp).toBe(0.15);
    expect(tokens.timing.pulseRim).toBe(400);
    expect(tokens.timing.pulseDialGlow).toBe(900);
    expect(tokens.timing.orbitPulse).toBe(1400);
    expect(tokens.timing.traceRepaint).toBe(16);
  });

  it('pulseDialGlow > pulseRim so the glow completes after the rim-color swap', () => {
    // Invariant: the outer drop-shadow glow must visibly outlast the inner
    // rim stroke transition. If they ever invert, the rim would snap back
    // while the glow is still expanding — visually jarring.
    expect(tokens.timing.pulseDialGlow).toBeGreaterThan(tokens.timing.pulseRim);
  });
});
