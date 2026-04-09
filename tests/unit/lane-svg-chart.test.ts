import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LaneSvgChart from '../../src/lib/components/LaneSvgChart.svelte';

const baseProps = {
  color: '#67e8f9',
  colorRgba06: 'rgba(103,232,249,.06)',
  totalRounds: 30,
  currentRound: 0,
  points: [],
  ribbon: undefined,
  yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
  maxRound: 0,
  xTicks: [],
};

describe('LaneSvgChart', () => {
  it('renders an SVG element', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    expect(container.querySelector('svg')).not.toBeNull();
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
});
