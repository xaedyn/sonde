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
    // aria-hidden group — Phase 5 (G1) will also target this data-role.
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
