import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ScopeCanvas from '../../../src/lib/components/ScopeCanvas.svelte';
import type { Endpoint, MeasurementSample } from '../../../src/lib/types';

const endpoints: Endpoint[] = [
  {
    id: 'edge',
    url: 'https://chronoscope.dev/probe',
    label: 'Edge',
    enabled: true,
    color: '#67e8f9',
  },
  {
    id: 'aws',
    url: 'https://aws.amazon.com',
    label: 'AWS',
    enabled: true,
    color: '#fbbf24',
  },
];

const visibleRoundCount = 60;

const samples = (latency: number): readonly MeasurementSample[] => (
  Array.from({ length: visibleRoundCount }, (_, index) => ({
    round: index + 1,
    latency,
    status: 'ok' as const,
    timestamp: 1_765_000_000_000 + index,
  }))
);

describe('ScopeCanvas', () => {
  it('renders compact scale, direction, and trigger labels for the live scope', () => {
    const { getByRole, getByText } = render(ScopeCanvas, {
      props: {
        endpoints,
        samplesByEndpoint: {
          edge: samples(42),
          aws: samples(88),
        },
        threshold: 120,
        currentRound: 60,
        height: 540,
        focusedEndpointId: null,
        p99Across: 88,
        detailScale: true,
        onDrill: vi.fn(),
      },
    });

    // v2 Live polish dropped the "Latest on right" + "Same scale" chart-
    // metadata pills (every line chart implies these by default). The
    // scale-range chip survives — it tells the user the actual y-axis
    // bounds, which isn't implied by default.
    expect(getByText('0-150 ms')).toBeTruthy();
    expect(getByText('Trigger 120 ms')).toBeTruthy();
    expect(getByRole('group', {
      name: /Live latency scope.*last 60 rounds.*0-150 ms.*trigger 120 ms/i,
    })).toBeTruthy();
  });
});
