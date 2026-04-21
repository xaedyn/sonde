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
    expect(normalText?.getAttribute('fill')).toBe('rgba(103,232,249,.55)');
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
