import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineRenderer } from '../../src/lib/renderers/timeline-renderer';
import type { MeasurementSample } from '../../src/lib/types';

// jsdom provides a mock canvas context — draw calls won't render pixels but
// must not throw. These are structural/contract tests, not pixel tests.

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  return canvas;
}

const SAMPLE_SAMPLES: MeasurementSample[] = [
  { round: 1, latency: 50,   status: 'ok',      timestamp: 1000 },
  { round: 2, latency: 200,  status: 'ok',      timestamp: 2000 },
  { round: 3, latency: 5000, status: 'timeout', timestamp: 3000 },
  { round: 4, latency: 0,    status: 'error',   timestamp: 4000 },
];

describe('TimelineRenderer', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = makeCanvas();
  });

  it('constructs without throwing', () => {
    expect(() => new TimelineRenderer(canvas)).not.toThrow();
  });

  it('draws with empty endpoint map without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    expect(() => renderer.draw(new Map())).not.toThrow();
  });

  it('draws with valid point data without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    const points = TimelineRenderer.computePoints(
      SAMPLE_SAMPLES,
      'ep1',
      '#4a90d9',
    );
    expect(() => renderer.draw(new Map([['ep1', points]]))).not.toThrow();
  });

  it('resize works without throwing', () => {
    const renderer = new TimelineRenderer(canvas);
    canvas.width = 1200;
    canvas.height = 600;
    expect(() => renderer.resize()).not.toThrow();
  });

  describe('computePoints', () => {
    it('returns a ScatterPoint for each sample', () => {
      const pts = TimelineRenderer.computePoints(SAMPLE_SAMPLES, 'ep1', '#4a90d9');
      expect(pts).toHaveLength(SAMPLE_SAMPLES.length);
    });

    it('preserves endpointId and color on every point', () => {
      const pts = TimelineRenderer.computePoints(SAMPLE_SAMPLES, 'ep2', '#e06c75');
      for (const pt of pts) {
        expect(pt.endpointId).toBe('ep2');
        expect(pt.color).toBe('#e06c75');
      }
    });

    it('preserves round number on every point', () => {
      const pts = TimelineRenderer.computePoints(SAMPLE_SAMPLES, 'ep1', '#4a90d9');
      expect(pts[0].round).toBe(1);
      expect(pts[1].round).toBe(2);
      expect(pts[2].round).toBe(3);
    });

    it('preserves status on every point', () => {
      const pts = TimelineRenderer.computePoints(SAMPLE_SAMPLES, 'ep1', '#4a90d9');
      expect(pts[0].status).toBe('ok');
      expect(pts[2].status).toBe('timeout');
      expect(pts[3].status).toBe('error');
    });

    it('x coordinate equals the round number', () => {
      const pts = TimelineRenderer.computePoints(SAMPLE_SAMPLES, 'ep1', '#4a90d9');
      for (let i = 0; i < pts.length; i++) {
        expect(pts[i].x).toBe(SAMPLE_SAMPLES[i].round);
      }
    });

    it('y coordinate is a finite number', () => {
      const pts = TimelineRenderer.computePoints(SAMPLE_SAMPLES, 'ep1', '#4a90d9');
      for (const pt of pts) {
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    });

    it('returns empty array for empty samples', () => {
      expect(TimelineRenderer.computePoints([], 'ep1', '#4a90d9')).toHaveLength(0);
    });
  });
});
