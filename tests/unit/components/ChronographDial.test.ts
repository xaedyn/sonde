import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ChronographDial from '../../../src/lib/components/ChronographDial.svelte';

const baseProps = {
  score: 85,
  liveMedian: 45,
  threshold: 120,
  endpoints: [],
  lastLatencies: {},
  paused: false,
  scoreHistory: [],
  baseline: null,
  p99Across: 0,
};

describe('ChronographDial — G2 NORMAL label', () => {
  it('should NOT render a NORMAL text element when baseline is null', () => {
    const { container } = render(ChronographDial, { props: { ...baseProps, baseline: null } });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText).toBeNull();
  });

  it('should render a NORMAL text element when baseline is present', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, baseline: { p25: 30, median: 50, p75: 80 } },
    });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText).toBeTruthy();
    expect(normalText?.textContent?.trim()).toBe('NORMAL');
  });

  it('should render NORMAL label inside an aria-hidden baseline-arc group', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, baseline: { p25: 30, median: 50, p75: 80 } },
    });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText).toBeTruthy();
    // Must sit inside the baseline-arc group specifically, not just any
    // aria-hidden group — Phase 5 (G1) also targets this data-role.
    const ancestorG = normalText?.closest('g[data-role="baseline-arc"]');
    expect(ancestorG).toBeTruthy();
    expect(ancestorG?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should render NORMAL label with the spec-exact typography attributes', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, baseline: { p25: 30, median: 50, p75: 80 } },
    });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText?.getAttribute('font-size')).toBe('8.5');
    expect(normalText?.getAttribute('letter-spacing')).toBe('0.2em');
    // Bumped from .55 → .80 alongside the inward-nudge fix so the label
    // reads clearly on the darker face radius it now sits at.
    expect(normalText?.getAttribute('fill')).toBe('rgba(103,232,249,.80)');
  });

  it('should place the NORMAL label at BASELINE_R - 22 radius (inside the arc glow)', () => {
    // Geometry: CX=CY=260, OUTER_R=240, BASELINE_R=OUTER_R-48=192,
    // new label radius = BASELINE_R - 22 = 170. Angle = latToAng(p75),
    // where latToAng(ms) = -135 + (ms/maxMs)*270.
    // With threshold=120 and p99Across=0, latencyScale yields maxMs=150.
    const p75 = 80;
    const maxMs = 150;
    const angDeg = -135 + (p75 / maxMs) * 270;
    const angRad = (angDeg * Math.PI) / 180;
    const expectedX = 260 + Math.cos(angRad) * 170;
    const expectedY = 260 + Math.sin(angRad) * 170;

    const { container } = render(ChronographDial, {
      props: { ...baseProps, baseline: { p25: 30, median: 50, p75 } },
    });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText).toBeTruthy();
    const gotX = Number(normalText?.getAttribute('x'));
    const gotY = Number(normalText?.getAttribute('y'));
    expect(gotX).toBeCloseTo(expectedX, 2);
    expect(gotY).toBeCloseTo(expectedY, 2);
  });

  it('should handle inverted p25/p75 (swap + clamp) without placing label off-dial', () => {
    // If p25 > p75 the derived should swap them. Using p25=120, p75=30 should
    // place the label at the angle of 120 (the larger, post-swap p75).
    const { container } = render(ChronographDial, {
      props: { ...baseProps, baseline: { p25: 120, median: 75, p75: 30 } },
    });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText).toBeTruthy();
  });

  it('should NOT render label when baseline has non-finite p75', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, baseline: { p25: 30, median: 50, p75: NaN } },
    });
    const normalText = container.querySelector('text[data-role="normal-label"]');
    expect(normalText).toBeNull();
  });
});

describe('ChronographDial — G1 dual-stroke baseline arc', () => {
  const withBaseline = {
    ...baseProps,
    baseline: { p25: 30, median: 50, p75: 80 },
  };

  it('should render exactly 3 path elements under the baseline arc group', () => {
    const { container } = render(ChronographDial, { props: withBaseline });
    const baselineGroup = container.querySelector('g[data-role="baseline-arc"]');
    expect(baselineGroup).not.toBeNull();
    const paths = baselineGroup?.querySelectorAll('path') ?? [];
    expect(paths.length).toBe(3);
  });

  it('should render outer glow path with stroke-width="22"', () => {
    const { container } = render(ChronographDial, { props: withBaseline });
    const baselineGroup = container.querySelector('g[data-role="baseline-arc"]');
    const paths = Array.from(baselineGroup?.querySelectorAll('path') ?? []);
    expect(paths[0]?.getAttribute('stroke-width')).toBe('22');
  });

  it('should render body path with stroke rgba(103,232,249,.55) and width 16', () => {
    const { container } = render(ChronographDial, { props: withBaseline });
    const baselineGroup = container.querySelector('g[data-role="baseline-arc"]');
    const paths = Array.from(baselineGroup?.querySelectorAll('path') ?? []);
    expect(paths[1]?.getAttribute('stroke')).toBe('rgba(103,232,249,.55)');
    expect(paths[1]?.getAttribute('stroke-width')).toBe('16');
  });

  it('should render accent path with stroke-width="1.2" and stroke rgba cyan 95%', () => {
    const { container } = render(ChronographDial, { props: withBaseline });
    const baselineGroup = container.querySelector('g[data-role="baseline-arc"]');
    const paths = Array.from(baselineGroup?.querySelectorAll('path') ?? []);
    expect(paths[2]?.getAttribute('stroke-width')).toBe('1.2');
    expect(paths[2]?.getAttribute('stroke')).toBe('rgba(103,232,249,.95)');
  });

  it('should NOT render the old rgba(255,255,255,.07) stroke', () => {
    const { container } = render(ChronographDial, { props: withBaseline });
    const allPaths = container.querySelectorAll('path');
    const oldStroke = Array.from(allPaths).find(
      p => p.getAttribute('stroke') === 'rgba(255,255,255,.07)'
    );
    expect(oldStroke).toBeUndefined();
  });

  it('should render no baseline-arc paths when baseline is null', () => {
    const { container } = render(ChronographDial, { props: { ...baseProps, baseline: null } });
    const baselineGroup = container.querySelector('g[data-role="baseline-arc"]');
    expect(baselineGroup).toBeNull();
  });

  // Guard against silent visual regression: all three layers must trace the
  // same arc. If a future refactor drifts one layer's `d`, the band will
  // render with visible misalignment between the glow halo and the body.
  it('all three stacked paths must share the same d attribute', () => {
    const { container } = render(ChronographDial, { props: withBaseline });
    const baselineGroup = container.querySelector('g[data-role="baseline-arc"]');
    const paths = Array.from(baselineGroup?.querySelectorAll('path') ?? []);
    expect(paths).toHaveLength(3);
    const d0 = paths[0]?.getAttribute('d');
    expect(d0).toBeTruthy();
    expect(paths[1]?.getAttribute('d')).toBe(d0);
    expect(paths[2]?.getAttribute('d')).toBe(d0);
  });
});

// ── Dial overlap polish (2026-04-22) ─────────────────────────────────────
// Four fixes targeting the face-text collisions documented in the audit:
// QUALITY / verdict-needle / NORMAL / PAUSED.

describe('ChronographDial — overlap polish · QUALITY kicker removed', () => {
  it('no text element should contain the literal string "QUALITY"', () => {
    const { container } = render(ChronographDial, { props: baseProps });
    const allText = Array.from(container.querySelectorAll('text'));
    const qualityText = allText.find(t => t.textContent?.trim() === 'QUALITY');
    expect(qualityText).toBeUndefined();
  });
});

describe('ChronographDial — overlap polish · verdict+LIVE merged strip', () => {
  const withBand = {
    ...baseProps,
    score: 85,
    liveMedian: 45,
    baseline: { p25: 30, median: 50, p75: 80 },
  };

  it('should NOT render the standalone verdict text at cy+22', () => {
    // The old kicker was `<text y=CY+22>HEALTHY</text>` (or DEGRADED/etc.).
    // After the merge, verdict text only appears as a tspan inside the merged
    // strip at cy+108. No top-level <text> should be at y≈282 (CY+22).
    const { container } = render(ChronographDial, { props: withBand });
    const topLevelTexts = Array.from(
      container.querySelectorAll('svg > text'),
    ) as SVGTextElement[];
    const atCy22 = topLevelTexts.find(t => Number(t.getAttribute('y')) === 282);
    expect(atCy22).toBeUndefined();
  });

  it('merged strip at cy+108 renders three tspans: verdict · live · band', () => {
    const { container } = render(ChronographDial, { props: withBand });
    const merged = container.querySelector(
      'text[data-role="merged-verdict-live"]',
    );
    expect(merged).toBeTruthy();
    expect(Number(merged?.getAttribute('y'))).toBe(368); // CY + 108
    const tspans = Array.from(merged?.querySelectorAll('tspan') ?? []);
    expect(tspans).toHaveLength(3);
    // Segment 1: verdict kicker. Segment 2: live median prefix.
    // Segment 3: band label.
    expect(tspans[0].textContent).toBe('HEALTHY');
    expect(tspans[1].textContent?.trim().startsWith('· LIVE')).toBe(true);
    expect(tspans[2].textContent?.trim()).toBe('· WITHIN BAND');
  });

  it('merged strip uses per-segment fills: verdict / t3 / band', () => {
    const { container } = render(ChronographDial, { props: withBand });
    const merged = container.querySelector(
      'text[data-role="merged-verdict-live"]',
    );
    const tspans = Array.from(merged?.querySelectorAll('tspan') ?? []);
    // Verdict tspan inherits verdictStyle.color for its state (healthy = cyan).
    expect(tspans[0].getAttribute('fill')).toMatch(/cyan|accent|#67/);
    // Live-median tspan uses t3 grey.
    expect(tspans[1].getAttribute('fill')).toBe('var(--t3)');
    // Band tspan uses accent-green for WITHIN BAND.
    expect(tspans[2].getAttribute('fill')).toBe('var(--accent-green)');
  });

  it('merged strip has paint-order stroke fill with dial-face stroke (halo)', () => {
    const { container } = render(ChronographDial, { props: withBand });
    const merged = container.querySelector(
      'text[data-role="merged-verdict-live"]',
    );
    expect(merged?.getAttribute('paint-order')).toBe('stroke fill');
    expect(merged?.getAttribute('stroke')).toBe('var(--bg-base)');
    expect(merged?.getAttribute('stroke-width')).toBe('3');
  });

  it('merged strip is aria-hidden (decorative — info lives on the SVG aria-label)', () => {
    const { container } = render(ChronographDial, { props: withBand });
    const merged = container.querySelector(
      'text[data-role="merged-verdict-live"]',
    );
    // Matches the pattern for every other decorative SVG group:
    // baseline-arc, quality-trace, CALIBRATING, orbit.
    expect(merged?.getAttribute('aria-hidden')).toBe('true');
  });

  it('omits the band tspan when bandLabel is null (no baseline yet)', () => {
    const withoutBaseline = { ...baseProps, score: 85, liveMedian: 45, baseline: null };
    const { container } = render(ChronographDial, { props: withoutBaseline });
    const merged = container.querySelector(
      'text[data-role="merged-verdict-live"]',
    );
    expect(merged).toBeTruthy();
    const tspans = Array.from(merged?.querySelectorAll('tspan') ?? []);
    expect(tspans).toHaveLength(2); // verdict + live-median only
  });

  it('merged strip is painted AFTER the hand group (so it sits on top)', () => {
    // DOM order inside the SVG matters for painting: later = on top.
    const { container } = render(ChronographDial, { props: withBand });
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const children = Array.from(svg?.children ?? []);
    const handIndex = children.findIndex(c =>
      c.tagName === 'g' &&
      c.querySelector('line[stroke="var(--svg-hand-stroke)"]') !== null,
    );
    const mergedIndex = children.findIndex(
      c => (c as Element).getAttribute?.('data-role') === 'merged-verdict-live',
    );
    expect(handIndex).toBeGreaterThanOrEqual(0);
    expect(mergedIndex).toBeGreaterThan(handIndex);
  });
});

describe('ChronographDial — overlap polish · paused state', () => {
  it('wrap has .paused class when paused=true', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, paused: true },
    });
    const wrap = container.querySelector('.dial-wrap');
    expect(wrap?.classList.contains('paused')).toBe(true);
  });

  it('renders a .paused-overlay element with text "PAUSED" when paused', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, paused: true },
    });
    const overlay = container.querySelector('.paused-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent?.trim()).toBe('PAUSED');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
  });

  it('the old .paused-badge bottom pill is gone', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, paused: true },
    });
    const oldBadge = container.querySelector('.paused-badge');
    expect(oldBadge).toBeNull();
  });

  it('does not render the overlay when paused=false', () => {
    const { container } = render(ChronographDial, {
      props: { ...baseProps, paused: false },
    });
    const overlay = container.querySelector('.paused-overlay');
    expect(overlay).toBeNull();
  });
});
