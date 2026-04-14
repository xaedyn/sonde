import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LaneSvgChart from '../../src/lib/components/LaneSvgChart.svelte';

const baseProps = {
  color: '#67e8f9',
  colorRgba06: 'rgba(103,232,249,.06)',
  visibleStart: 1,
  visibleEnd: 30,
  currentRound: 0,
  points: [],
  ribbon: undefined,
  yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
  maxRound: 0,
  xTicks: [],
  heatmapCells: [],      // default empty
  timeoutMs: 5000,       // default 5s
};

describe('LaneSvgChart', () => {
  it('renders an SVG element', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders "Waiting for data" when no points exist', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    const text = container.querySelector('.empty-text');
    expect(text?.textContent).toContain('Waiting for data');
  });

  it('renders future zone rect when rounds < totalRounds', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        currentRound: 10,
        points: [{ round: 10, y: 0.5, latency: 50, status: 'ok', endpointId: 'ep-1', x: 10, color: '#67e8f9' }],
        maxRound: 10,
      },
    });
    const futureZone = container.querySelector('.future-zone');
    expect(futureZone).not.toBeNull();
  });

  it('renders heatmap rect elements when heatmapCells are provided (AC1)', () => {
    const cells = [
      { startRound: 1, endRound: 1, worstLatency: 30, worstStatus: 'ok' as const, startElapsed: 0, endElapsed: 1000, color: 'rgba(134,239,172,.5)' },
      { startRound: 2, endRound: 2, worstLatency: 80, worstStatus: 'ok' as const, startElapsed: 1000, endElapsed: 2000, color: 'rgba(255,255,255,.15)' },
    ];
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        heatmapCells: cells,
        timeoutMs: 5000,
      },
    });
    const heatmapRects = container.querySelectorAll('.heatmap-cell');
    expect(heatmapRects.length).toBe(2);
  });

  it('renders no heatmap rects when heatmapCells is empty (AC1)', () => {
    const { container } = render(LaneSvgChart, {
      props: { ...baseProps, heatmapCells: [], timeoutMs: 5000 },
    });
    const heatmapRects = container.querySelectorAll('.heatmap-cell');
    expect(heatmapRects.length).toBe(0);
  });

  it('renders timeout threshold line when timeoutMs is within y-range (AC5)', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        // yRange min=1, max=1000 — timeout of 500ms is inside range
        yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
        timeoutMs: 500,
        heatmapCells: [],
        currentRound: 10,
        points: [{ round: 10, y: 0.5, latency: 500, status: 'ok', endpointId: 'ep-1', x: 10, color: '#67e8f9' }],
        maxRound: 10,
      },
    });
    const thresholdLine = container.querySelector('.timeout-line');
    expect(thresholdLine).not.toBeNull();
  });

  it('does not render timeout line when timeoutMs is outside y-range (AC5)', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        yRange: { min: 1, max: 100, isLog: false, gridlines: [] },
        timeoutMs: 5000,  // outside range max=100
        heatmapCells: [],
      },
    });
    const thresholdLine = container.querySelector('.timeout-line');
    expect(thresholdLine).toBeNull();
  });

  // ── Empty state ring tests ──────────────────────────────────────────────
  it('renders .empty-ring circle when no points exist', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    const ring = container.querySelector('.empty-ring');
    expect(ring).not.toBeNull();
  });

  it('empty ring has r="40" and stroke-width="0.5"', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    const ring = container.querySelector('.empty-ring');
    expect(ring?.getAttribute('r')).toBe('40');
    expect(ring?.getAttribute('stroke-width')).toBe('0.5');
  });

  it('empty ring uses var(--ep-color) as stroke', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    const ring = container.querySelector('.empty-ring');
    expect(ring?.getAttribute('stroke')).toBe('var(--ep-color)');
  });

  it('empty text says "Waiting for data"', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    const text = container.querySelector('.empty-state .empty-text');
    expect(text?.textContent).toContain('Waiting for data');
  });

  it('does not render .empty-ring when points exist', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        points: [{ round: 1, y: 0.5, latency: 50, status: 'ok', endpointId: 'ep-1', x: 1, color: '#67e8f9' }],
      },
    });
    const ring = container.querySelector('.empty-ring');
    expect(ring).toBeNull();
  });

  // ── TTFB overlay tests ──────────────────────────────────────────────────

  it('does not render .ttfb-overlay when ttfbPoints is undefined (AC-4)', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    expect(container.querySelector('.ttfb-overlay')).toBeNull();
  });

  it('does not render .ttfb-overlay when ttfbPoints is empty', () => {
    const { container } = render(LaneSvgChart, { props: { ...baseProps, ttfbPoints: [] } });
    expect(container.querySelector('.ttfb-overlay')).toBeNull();
  });

  it('does not render .ttfb-overlay when fewer than 2 ttfbPoints', () => {
    const { container } = render(LaneSvgChart, {
      props: { ...baseProps, ttfbPoints: [{ round: 1, ttfb: 50 }] },
    });
    expect(container.querySelector('.ttfb-overlay')).toBeNull();
  });

  it('renders .ttfb-overlay when 2+ ttfbPoints provided (AC-3)', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        ttfbPoints: [{ round: 1, ttfb: 60 }, { round: 2, ttfb: 70 }],
      },
    });
    expect(container.querySelector('.ttfb-overlay')).not.toBeNull();
  });

  it('.ttfb-overlay has stroke-dasharray (AC-3)', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        ttfbPoints: [{ round: 1, ttfb: 60 }, { round: 2, ttfb: 70 }],
      },
    });
    const overlay = container.querySelector('.ttfb-overlay');
    expect(overlay?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('renders .ttfb-area when 2+ ttfbPoints provided', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        points: [
          { round: 1, y: 0.5, latency: 100, status: 'ok', endpointId: 'ep-1', x: 1, color: '#67e8f9' },
          { round: 2, y: 0.6, latency: 120, status: 'ok', endpointId: 'ep-1', x: 2, color: '#67e8f9' },
        ],
        ttfbPoints: [{ round: 1, ttfb: 60 }, { round: 2, ttfb: 70 }],
      },
    });
    expect(container.querySelector('.ttfb-area')).not.toBeNull();
  });
});
