// tests/unit/components/lane-header-waterfall.test.ts
// Tests for LaneHeaderWaterfall component — 6px stacked timing-phase bar.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LaneHeaderWaterfall from '../../../src/lib/components/LaneHeaderWaterfall.svelte';

const tier2Averages = {
  dnsLookup: 10,
  tcpConnect: 20,
  tlsHandshake: 15,
  ttfb: 80,
  contentTransfer: 25,
};

const allZero = {
  dnsLookup: 0,
  tcpConnect: 0,
  tlsHandshake: 0,
  ttfb: 0,
  contentTransfer: 0,
};

describe('LaneHeaderWaterfall', () => {
  it('renders .waterfall-bar container', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    expect(container.querySelector('.waterfall-bar')).not.toBeNull();
  });

  it('renders exactly 5 .wf-segment elements', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    const segments = container.querySelectorAll('.wf-segment');
    expect(segments.length).toBe(5);
  });

  it('renders .wf-labels row', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    expect(container.querySelector('.wf-labels')).not.toBeNull();
  });

  it('has role="img" with aria-label containing DNS, TCP, TLS, TTFB, Transfer', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    const bar = container.querySelector('[role="img"]');
    expect(bar).not.toBeNull();
    const label = bar?.getAttribute('aria-label') ?? '';
    expect(label).toContain('DNS');
    expect(label).toContain('TCP');
    expect(label).toContain('TLS');
    expect(label).toContain('TTFB');
    expect(label).toContain('Transfer');
  });

  it('gracefully renders when all phases are 0 (no crash, no division by zero)', () => {
    expect(() =>
      render(LaneHeaderWaterfall, { props: { tier2Averages: allZero } })
    ).not.toThrow();
  });

  it('TTFB segment has highest flex-basis when ttfb dominates (80ms out of 150ms total)', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    const segments = container.querySelectorAll('.wf-segment');
    // total = 10+20+15+80+25 = 150; ttfb index = 3 → 80/150 ≈ 53.33%
    const ttfbSegment = segments[3] as HTMLElement;
    const style = ttfbSegment.getAttribute('style') ?? '';
    // flex-basis should be ~53.33%
    expect(style).toContain('flex-basis');
    // Extract the value and confirm it's the largest
    const bases = Array.from(segments).map((seg) => {
      const s = (seg as HTMLElement).getAttribute('style') ?? '';
      const match = s.match(/flex-basis:\s*([\d.]+)%/);
      return match ? parseFloat(match[1]) : 0;
    });
    const maxIdx = bases.indexOf(Math.max(...bases));
    expect(maxIdx).toBe(3); // ttfb is index 3
  });

  it('each segment has min-width of 2px via inline style', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    const segments = container.querySelectorAll('.wf-segment');
    segments.forEach((seg) => {
      const style = (seg as HTMLElement).getAttribute('style') ?? '';
      expect(style).toContain('min-width: 2px');
    });
  });
});

describe('LaneHeaderWaterfall — fallback warning badge', () => {
  it('renders .wf-fallback when all phases are zero', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: allZero } });
    expect(container.querySelector('.wf-fallback')).not.toBeNull();
  });

  it('does not render .waterfall-bar when all phases are zero', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: allZero } });
    expect(container.querySelector('.waterfall-bar')).toBeNull();
  });

  it('.wf-fallback has role="status"', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: allZero } });
    const fallback = container.querySelector('.wf-fallback');
    expect(fallback?.getAttribute('role')).toBe('status');
  });

  it('.wf-fallback has aria-label', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: allZero } });
    const fallback = container.querySelector('.wf-fallback');
    const label = fallback?.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);
  });

  it('renders "Timing data limited" text', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: allZero } });
    const text = container.querySelector('.wf-fallback-text');
    expect(text).not.toBeNull();
    expect(text?.textContent).toContain('Timing data limited');
  });

  it('renders .waterfall-bar (not .wf-fallback) when any phase is non-zero', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages } });
    expect(container.querySelector('.waterfall-bar')).not.toBeNull();
    expect(container.querySelector('.wf-fallback')).toBeNull();
  });
});

describe('LaneHeaderWaterfall — compact variant', () => {
  it('renders .wf-compact instead of .wf-root when compact=true', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages, compact: true } });
    expect(container.querySelector('.wf-compact')).not.toBeNull();
    expect(container.querySelector('.wf-root')).toBeNull();
  });

  it('compact variant omits .wf-labels', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages, compact: true } });
    expect(container.querySelector('.wf-labels')).toBeNull();
  });

  it('compact variant renders only non-zero segments', () => {
    // Warm-connection shape: only ttfb and contentTransfer non-zero
    const warmAverages = {
      dnsLookup: 0, tcpConnect: 0, tlsHandshake: 0, ttfb: 30, contentTransfer: 0.5,
    };
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: warmAverages, compact: true } });
    const segments = container.querySelectorAll('.wf-segment--compact');
    expect(segments.length).toBe(2);
  });

  it('compact variant renders nothing when all phases are zero (no bar, no fallback text)', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: allZero, compact: true } });
    expect(container.querySelector('.wf-compact')).toBeNull();
    expect(container.querySelector('.wf-fallback')).toBeNull();
    expect(container.querySelector('.waterfall-bar')).toBeNull();
  });

  it('compact variant preserves aria-label with phase breakdown', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages, compact: true } });
    const bar = container.querySelector('[role="img"]');
    expect(bar).not.toBeNull();
    const label = bar?.getAttribute('aria-label') ?? '';
    expect(label).toContain('TTFB');
  });

  it('compact variant renders .wf-compact-labels with text for non-zero phases', () => {
    const warmAverages = {
      dnsLookup: 0, tcpConnect: 0, tlsHandshake: 0, ttfb: 30, contentTransfer: 1,
    };
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages: warmAverages, compact: true } });
    const labels = container.querySelectorAll('.wf-compact-label');
    expect(labels.length).toBe(2);
    const combined = Array.from(labels).map(l => l.textContent?.trim()).join(' ');
    expect(combined).toContain('TTFB');
    expect(combined).toContain('30ms');
    expect(combined).toContain('Transfer');
    expect(combined).toContain('1ms');
  });

  it('compact variant colors each phase label with its segment color', () => {
    const { container } = render(LaneHeaderWaterfall, { props: { tier2Averages, compact: true } });
    const labels = container.querySelectorAll('.wf-compact-label');
    labels.forEach(l => {
      const style = (l as HTMLElement).getAttribute('style') ?? '';
      expect(style).toContain('color:');
    });
  });
});
