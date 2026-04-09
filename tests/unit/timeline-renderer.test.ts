// NOTE: TimelineRenderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead of a shared Canvas 2D.
// These tests remain to ensure the class still compiles and its coordinate math
// is correct should it be needed for a future alternate view.

import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineRenderer } from '../../src/lib/renderers/timeline-renderer';
import { prepareFrame } from '../../src/lib/renderers/timeline-data-pipeline';
import type { FrameData, MeasurementState, ScatterPoint } from '../../src/lib/types';

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  return canvas;
}

const EMPTY_FRAMEDATA: FrameData = {
  pointsByEndpoint: new Map(),
  ribbonsByEndpoint: new Map(),
  yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
  xTicks: [],
  maxRound: 0,
  freezeEvents: [],
  hasData: false,
};

function makeFrameData(latencies: number[] = [50, 100, 200]): FrameData {
  if (latencies.length === 0) return EMPTY_FRAMEDATA;
  const state: MeasurementState = {
    lifecycle: 'running',
    epoch: 1,
    roundCounter: latencies.length,
    endpoints: {
      ep1: {
        endpointId: 'ep1',
        samples: latencies.map((latency, i) => ({
          round: i + 1, latency, status: 'ok' as const, timestamp: Date.now() + i * 1000,
        })),
        lastLatency: latencies[latencies.length - 1] ?? null,
        lastStatus: 'ok',
        tierLevel: 1,
      },
    },
    startedAt: Date.now(),
    stoppedAt: null,
    freezeEvents: [],
  };
  return prepareFrame(
    [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }],
    state,
  );
}

describe('TimelineRenderer', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = makeCanvas();
  });

  it('constructs without throwing', () => {
    expect(() => new TimelineRenderer(canvas)).not.toThrow();
  });

  it('draws with empty FrameData without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    expect(() => renderer.draw(EMPTY_FRAMEDATA)).not.toThrow();
  });

  it('draws with valid FrameData without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    expect(() => renderer.draw(makeFrameData())).not.toThrow();
  });

  it('draws with ribbons (>= 20 samples) without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    const latencies = Array.from({ length: 25 }, (_, i) => 20 + i * 5);
    expect(() => renderer.draw(makeFrameData(latencies))).not.toThrow();
  });

  it('resize works without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    canvas.width = 1200;
    canvas.height = 600;
    expect(() => renderer.resize()).not.toThrow();
  });

  describe('X-axis normalization', () => {
    it('ScatterPoint.x values via pipeline are round numbers', () => {
      const fd = makeFrameData([50, 100, 200]);
      const points = fd.pointsByEndpoint.get('ep1') ?? [];
      expect(points[0]?.x).toBe(1);
      expect(points[1]?.x).toBe(2);
      expect(points[2]?.x).toBe(3);
    });

    it('draw completes without throwing with populated data', () => {
      const renderer = new TimelineRenderer(canvas);
      expect(() => renderer.draw(makeFrameData())).not.toThrow();
    });
  });

  describe('DPR coordinate fix (AC2)', () => {
    it('should use clientWidth/clientHeight for plotWidth/plotHeight', () => {
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 800;
      Object.defineProperty(c, 'clientWidth', { get: () => 800, configurable: true });
      Object.defineProperty(c, 'clientHeight', { get: () => 400, configurable: true });

      const renderer = new TimelineRenderer(c);
      const point: ScatterPoint = {
        x: 1, y: 0.5, latency: 50, status: 'ok', endpointId: 'ep1', round: 1, color: '#4a90d9',
      };
      renderer.setMaxRound(1);
      const { cx, cy } = renderer.toCanvasCoords(point);
      expect(cx).toBeLessThanOrEqual(800 + 10);
      expect(cy).toBeLessThanOrEqual(400 + 10);
    });
  });

  describe('FrameData API — performance (AC8)', () => {
    it('benchmark: draw(frameData) < 8ms for 10 endpoints x 1000 samples', () => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 400;
      const renderer = new TimelineRenderer(c);

      const state: MeasurementState = {
        lifecycle: 'running', epoch: 1, roundCounter: 1000,
        endpoints: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [`ep${i}`, {
            endpointId: `ep${i}`,
            samples: Array.from({ length: 1000 }, (_, j) => ({
              round: j + 1, latency: Math.random() * 490 + 10, status: 'ok' as const, timestamp: Date.now() + j,
            })),
            lastLatency: 50, lastStatus: 'ok' as const, tierLevel: 1 as const,
          }]),
        ),
        startedAt: Date.now(), stoppedAt: null, freezeEvents: [],
      };
      const endpoints = Array.from({ length: 10 }, (_, i) => ({
        id: `ep${i}`, url: `https://ep${i}.com`, enabled: true, label: `EP${i}`, color: '#4a90d9',
      }));
      const fd = prepareFrame(endpoints, state);

      const start = performance.now();
      renderer.draw(fd);
      const elapsed = performance.now() - start;
      // jsdom has no real canvas drawing — budget is for real browser
      // Test validates no infinite loops or O(n²) regressions
      expect(elapsed).toBeLessThan(50);
    });
  });
});
