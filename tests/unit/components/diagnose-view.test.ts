import { cleanup, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DiagnoseView from '../../../src/lib/components/DiagnoseView.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { remoteVantageStore } from '../../../src/lib/stores/remote-vantage';
import { resetStatisticsCache } from '../../../src/lib/stores/statistics';
import { uiStore } from '../../../src/lib/stores/ui';
import type { Endpoint, MeasurementSample, MeasurementState } from '../../../src/lib/types';

function endpoint(id: string, label = id): Endpoint {
  return {
    id,
    url: `https://${id}.example.com`,
    enabled: true,
    label,
    color: '#67e8f9',
  };
}

function samples(latency: number): MeasurementSample[] {
  return Array.from({ length: 30 }, (_, index) => ({
    round: index + 1,
    latency,
    status: 'ok' as const,
    timestamp: index + 1,
  }));
}

function seedReadySamples(latencies: Record<string, number>): void {
  const endpoints: Parameters<typeof measurementStore.loadSnapshot>[0]['endpoints'] = {};
  for (const [endpointId, latency] of Object.entries(latencies)) {
    const endpointSamples = samples(latency);
    endpoints[endpointId] = {
      endpointId,
      tierLevel: 1,
      lastLatency: latency,
      lastStatus: 'ok',
      lastErrorMessage: null,
      samples: endpointSamples,
    };
  }

  measurementStore.loadSnapshot({
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: 30,
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
    endpoints,
  } satisfies MeasurementState);
}

describe('DiagnoseView investigation focus', () => {
  beforeEach(() => {
    cleanup();
    endpointStore.setEndpoints([]);
    measurementStore.reset();
    resetStatisticsCache();
    remoteVantageStore.reset();
    uiStore.reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-selects the helper-selected endpoint on direct investigate entry', async () => {
    endpointStore.setEndpoints([endpoint('api', 'API'), endpoint('cdn', 'CDN')]);
    seedReadySamples({ api: 120, cdn: 480 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint(null);

    const { queryByText } = render(DiagnoseView);

    await waitFor(() => {
      expect(get(uiStore).focusedEndpointId).toBe('cdn');
    });
    expect(queryByText(/pick an endpoint from the left rail/i)).toBeNull();
  });

  it('preserves a valid focused endpoint', async () => {
    endpointStore.setEndpoints([endpoint('api', 'API'), endpoint('cdn', 'CDN')]);
    seedReadySamples({ api: 120, cdn: 480 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');

    render(DiagnoseView);

    await waitFor(() => {
      expect(get(uiStore).focusedEndpointId).toBe('api');
    });
  });

  it('shows an endpoint-enable empty state only when no endpoints are monitored', () => {
    uiStore.setActiveView('diagnose');

    const { getByText, queryByText } = render(DiagnoseView);

    expect(getByText(/enable an endpoint to investigate it closely/i)).toBeTruthy();
    expect(queryByText(/pick an endpoint from the left rail/i)).toBeNull();
  });

  it('shows a choosing state instead of picker copy while monitored endpoints have no focus', () => {
    endpointStore.setEndpoints([endpoint('api', 'API')]);
    uiStore.setActiveView('overview');
    uiStore.setFocusedEndpoint(null);

    const { getByText, queryByText } = render(DiagnoseView);

    expect(getByText(/choosing the best endpoint to investigate/i)).toBeTruthy();
    expect(queryByText(/pick an endpoint from the left rail/i)).toBeNull();
  });
});
