import { describe, it, expect, beforeEach } from 'vitest';
import { HeatmapRenderer } from '../../src/lib/renderers/heatmap-renderer';
import type { HeatmapCell } from '../../src/lib/types';

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 300;
  return canvas;
}

const SAMPLE_CELLS: HeatmapCell[] = [
  { col: 0, row: 0, color: '#00b4d8', latency: 20,   status: 'ok',      endpointId: 'ep1', round: 1 },
  { col: 1, row: 0, color: '#f9c74f', latency: 200,  status: 'ok',      endpointId: 'ep1', round: 2 },
  { col: 2, row: 0, color: '#9b5de5', latency: 5000, status: 'timeout', endpointId: 'ep1', round: 3 },
  { col: 3, row: 0, color: '#c77dff', latency: 0,    status: 'error',   endpointId: 'ep1', round: 4 },
  { col: 0, row: 1, color: '#00b4d8', latency: 15,   status: 'ok',      endpointId: 'ep2', round: 1 },
];

describe('HeatmapRenderer', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = makeCanvas();
  });

  it('constructs without throwing', () => {
    expect(() => new HeatmapRenderer(canvas)).not.toThrow();
  });

  it('draws with empty data without throwing', () => {
    const renderer = new HeatmapRenderer(canvas);
    expect(() => renderer.draw([], [])).not.toThrow();
  });

  it('draws with valid cell data without throwing', () => {
    const renderer = new HeatmapRenderer(canvas);
    const endpointLabels = ['Google', 'Cloudflare'];
    expect(() => renderer.draw(SAMPLE_CELLS, endpointLabels)).not.toThrow();
  });

  it('draws timeout and error cells without throwing', () => {
    const renderer = new HeatmapRenderer(canvas);
    const timeoutCells: HeatmapCell[] = [
      { col: 0, row: 0, color: '#9b5de5', latency: 5000, status: 'timeout', endpointId: 'ep1', round: 1 },
      { col: 1, row: 0, color: '#c77dff', latency: 0,    status: 'error',   endpointId: 'ep1', round: 2 },
    ];
    expect(() => renderer.draw(timeoutCells, ['Endpoint'])).not.toThrow();
  });

  it('resize works without throwing', () => {
    const renderer = new HeatmapRenderer(canvas);
    canvas.width = 1200;
    canvas.height = 400;
    expect(() => renderer.resize()).not.toThrow();
  });
});
