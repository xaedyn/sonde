import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import Lane from '../../../src/lib/components/Lane.svelte';
import LaneSvgChart from '../../../src/lib/components/LaneSvgChart.svelte';

describe('Lane', () => {
  const props = {
    endpointId: 'ep-test-1',
    color: '#67e8f9',
    url: 'www.google.com',
    p50: 38,
    p95: 52,
    p99: 98,
    jitter: 4.2,
    lossPercent: 0,
    ready: true,
  };

  it('renders endpoint URL', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('www.google.com')).toBeTruthy();
  });

  it('renders hero P50 value', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('38')).toBeTruthy();
  });

  it('renders "Median" label without "P50 Median Latency"', () => {
    const { container } = render(Lane, { props });
    const label = container.querySelector('.lane-label');
    expect(label?.textContent).toBe('Median');
    expect(label?.textContent).not.toContain('P50 Median Latency');
  });

  it('renders .lane-url element with endpoint content', () => {
    const { container } = render(Lane, { props });
    const urlEl = container.querySelector('.lane-url');
    expect(urlEl).not.toBeNull();
    expect(urlEl?.textContent).toBe('www.google.com');
  });

  it('renders latency label when lastLatency is set', () => {
    const { getByText } = render(Lane, {
      props: { ...props, lastLatency: 42.7 },
    });
    expect(getByText('43ms')).toBeTruthy();
  });

  it('does not render latency label when lastLatency is null', () => {
    const { container } = render(Lane, {
      props: { ...props, lastLatency: null },
    });
    expect(container.querySelector('.now-label')).toBeNull();
  });

  // ── Compact mode (AC1, AC2) ──────────────────────────────────────────────────

  it('renders .lane-panel visible when compact is false (AC1)', () => {
    const { container } = render(Lane, { props });
    const panel = container.querySelector('.lane-panel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('sr-only')).toBe(false);
  });

  it('hides .lane-panel via sr-only when compact is true (AC2)', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const panel = container.querySelector('.lane-panel');
    expect(panel).not.toBeNull(); // still in DOM for screen readers
    expect(panel?.classList.contains('sr-only')).toBe(true);
  });

  it('renders .lane-compact-header when compact is true (AC2)', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    expect(container.querySelector('.lane-compact-header')).not.toBeNull();
  });

  it('does not render .lane-compact-header when compact is false (AC1)', () => {
    const { container } = render(Lane, { props });
    expect(container.querySelector('.lane-compact-header')).toBeNull();
  });

  it('compact header contains the URL text (AC2)', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const header = container.querySelector('.lane-compact-header');
    expect(header?.textContent).toContain('www.google.com');
  });

  it('compact header shows P50 hero value (AC2)', () => {
    const { getAllByText } = render(Lane, { props: { ...props, compact: true } });
    const matches = getAllByText(/38/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('lane has compact class applied when compact=true', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    expect(container.querySelector('.lane.compact')).not.toBeNull();
  });

  // ── Grip handle (drag-to-reorder) ───────────────────────────────────────────

  it('renders a grip handle button in full mode', () => {
    const { container } = render(Lane, { props });
    const grip = container.querySelector('.lane-grip');
    expect(grip).not.toBeNull();
    expect(grip?.tagName.toLowerCase()).toBe('button');
  });

  it('grip handle has aria-label="Reorder lane"', () => {
    const { container } = render(Lane, { props });
    const grip = container.querySelector('.lane-grip');
    expect(grip?.getAttribute('aria-label')).toBe('Reorder lane');
  });

  it('renders grip handle in compact mode', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const grip = container.querySelector('.lane-grip');
    expect(grip).not.toBeNull();
  });

  it('grip handle has data-endpoint-id matching endpointId', () => {
    const { container } = render(Lane, { props });
    const grip = container.querySelector('.lane-grip');
    expect(grip?.getAttribute('data-endpoint-id')).toBe('ep-test-1');
  });

  it('hides grip when showGrip is false', () => {
    const { container } = render(Lane, { props: { ...props, showGrip: false } });
    const grip = container.querySelector('.lane-grip');
    expect(grip).toBeNull();
  });

  // ── LaneHeaderWaterfall integration ─────────────────────────────────────────

  it('does not render .waterfall-bar when tier2Averages is undefined (AC-4)', () => {
    const { container } = render(Lane, { props });
    expect(container.querySelector('.waterfall-bar')).toBeNull();
  });

  it('renders .waterfall-bar when tier2Averages provided and ready=true (AC-2)', () => {
    const tier2Averages = { dnsLookup: 10, tcpConnect: 15, tlsHandshake: 10, ttfb: 80, contentTransfer: 15 };
    const { container } = render(Lane, {
      props: { ...props, tier2Averages, ready: true },
    });
    expect(container.querySelector('.waterfall-bar')).not.toBeNull();
  });

  it('does not render .waterfall-bar in compact mode even with tier2Averages (AC-3)', () => {
    const tier2Averages = { dnsLookup: 10, tcpConnect: 15, tlsHandshake: 10, ttfb: 80, contentTransfer: 15 };
    const { container } = render(Lane, {
      props: { ...props, tier2Averages, ready: true, compact: true },
    });
    expect(container.querySelector('.waterfall-bar')).toBeNull();
  });
});

// ── LaneSvgChart: reduced-motion guard for now-dot pulse ring ──────────────────

describe('LaneSvgChart now-dot pulse ring', () => {
  const baseChartProps = {
    color: '#67e8f9',
    colorRgba06: 'rgba(103,232,249,0.6)',
    visibleStart: 1,
    visibleEnd: 10,
    points: [{ round: 5, y: 0.5, latency: 100 }],
    ribbon: undefined,
    yRange: { min: 0, max: 500 },
  };

  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('renders <animate> elements inside now-dot ring when reducedMotion is false', () => {
    // Default stub returns matches: false — standard motion allowed
    const { container } = render(LaneSvgChart, { props: baseChartProps });
    expect(container.querySelectorAll('animate').length).toBeGreaterThan(0);
  });

  it('suppresses <animate> elements inside now-dot ring when prefers-reduced-motion: reduce', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string): MediaQueryList => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    const { container } = render(LaneSvgChart, { props: baseChartProps });
    // The solid now-dot circle must still be present
    expect(container.querySelector('.now-dot')).not.toBeNull();
    // No <animate> elements should exist (pulse ring suppressed)
    expect(container.querySelectorAll('animate').length).toBe(0);
  });
});
