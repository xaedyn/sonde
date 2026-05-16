import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { resetStatisticsCache } from '../../../src/lib/stores/statistics';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import LiveView from '../../../src/lib/components/LiveView.svelte';
import { DEFAULT_SETTINGS, type Endpoint } from '../../../src/lib/types';

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

const seedLiveSamples = (): void => {
  for (const endpoint of endpoints) {
    measurementStore.initEndpoint(endpoint.id);
  }
  measurementStore.addSamples(
    endpoints.flatMap((endpoint, endpointIndex) => (
      Array.from({ length: visibleRoundCount }, (_, index) => ({
        endpointId: endpoint.id,
        round: index + 1,
        latency: endpointIndex === 0 ? 42 : 86,
        status: 'ok' as const,
        timestamp: 1_765_000_000_000 + index,
      }))
    )),
  );
  for (let round = 0; round < visibleRoundCount; round += 1) {
    measurementStore.incrementRound();
  }
  measurementStore.setLifecycle('running');
};

beforeEach(() => {
  endpointStore.setEndpoints(endpoints);
  measurementStore.reset();
  resetStatisticsCache();
  settingsStore.set({ ...DEFAULT_SETTINGS, healthThreshold: 120 });
  uiStore.reset();
  seedLiveSamples();
});

describe('LiveView', () => {
  it('renders a calm live hierarchy with mode, window, round, and scale cues', () => {
    const { getByRole, getByText } = render(LiveView);

    expect(getByRole('heading', { name: 'Live latency trace' })).toBeTruthy();
    expect(getByText('Unified overlay')).toBeTruthy();
    expect(getByText('2 endpoints')).toBeTruthy();
    expect(getByText('Round 60')).toBeTruthy();
    expect(getByText('Last 60 rounds')).toBeTruthy();
    expect(getByText('Same scale')).toBeTruthy();
    expect(getByRole('group', { name: /Live view controls/i })).toBeTruthy();
    expect(getByRole('group', { name: /Slow trigger, 120 milliseconds/i })).toBeTruthy();
  });

  it('labels endpoint chips with plain-language live and p95 values', () => {
    const { getByRole } = render(LiveView);

    expect(getByRole('button', {
      name: /Edge: last 42 ms, p95 42 ms, click to focus this endpoint/i,
    })).toBeTruthy();
    expect(getByRole('button', {
      name: /AWS: last 86 ms, p95 86 ms, click to focus this endpoint/i,
    })).toBeTruthy();
  });
});
