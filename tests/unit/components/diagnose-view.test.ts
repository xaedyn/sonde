import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DiagnoseView from '../../../src/lib/components/DiagnoseView.svelte';
import { bufferbloatStore } from '../../../src/lib/stores/bufferbloat';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { networkContextStore } from '../../../src/lib/stores/network-context';
import { remoteVantageStore } from '../../../src/lib/stores/remote-vantage';
import { settingsStore } from '../../../src/lib/stores/settings';
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

function opaqueFallbackSamples(latency: number): MeasurementSample[] {
  return Array.from({ length: 12 }, (_, index) => ({
    round: index + 1,
    latency,
    status: 'ok' as const,
    timestamp: index + 1,
    timingFallback: true,
    tier2: {
      total: latency,
      dnsLookup: 0,
      tcpConnect: 0,
      tlsHandshake: 0,
      ttfb: 0,
      contentTransfer: 0,
    },
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

function seedSamplesByEndpoint(samplesByEndpoint: Record<string, MeasurementSample[]>): void {
  const endpoints: Parameters<typeof measurementStore.loadSnapshot>[0]['endpoints'] = {};
  for (const [endpointId, endpointSamples] of Object.entries(samplesByEndpoint)) {
    const last = endpointSamples.at(-1);
    endpoints[endpointId] = {
      endpointId,
      tierLevel: 1,
      lastLatency: last?.latency ?? null,
      lastStatus: last?.status ?? null,
      lastErrorMessage: last?.errorMessage ?? null,
      samples: endpointSamples,
    };
  }

  measurementStore.loadSnapshot({
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: 12,
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
    bufferbloatStore.reset();
    networkContextStore.reset();
    remoteVantageStore.reset();
    settingsStore.reset();
    uiStore.reset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it('labels opaque no-cors fallback samples as total-only instead of errors', async () => {
    endpointStore.setEndpoints([endpoint('api', 'API')]);
    seedSamplesByEndpoint({ api: opaqueFallbackSamples(80) });
    settingsStore.update(current => ({ ...current, corsMode: 'no-cors' }));
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');

    const { getAllByText, getByText, queryByText } = render(DiagnoseView);

    await waitFor(() => {
      expect(get(uiStore).focusedEndpointId).toBe('api');
    });

    expect(queryByText('ERROR')).toBeNull();
    expect(getByText(/phase timing unavailable/i)).toBeTruthy();
    expect(getAllByText(/total only/i).length).toBeGreaterThan(0);
    expect(getAllByText('80 ms').length).toBeGreaterThan(0);
  });

  it('runs an outside check for the focused endpoint from Investigate', async () => {
    const api = endpoint('api', 'API');
    const cdn = endpoint('cdn', 'CDN');
    endpointStore.setEndpoints([api, cdn]);
    seedReadySamples({ api: 260, cdn: 45 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');
    const runProbe = vi.spyOn(remoteVantageStore, 'runProbe').mockResolvedValue(null);
    const { getByRole } = render(DiagnoseView);

    await fireEvent.click(getByRole('button', { name: /check from cloudflare/i }));

    await waitFor(() => {
      expect(runProbe).toHaveBeenCalledWith([api]);
    });
  });

  it('separates measured browser facts from proof actions with uncertainty-safe copy', () => {
    endpointStore.setEndpoints([endpoint('api', 'API'), endpoint('cdn', 'CDN'), endpoint('app', 'App')]);
    seedReadySamples({ api: 260, cdn: 45, app: 55 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');

    const { getByRole, getByText } = render(DiagnoseView);

    const browserFacts = getByRole('region', { name: /measured browser facts/i });
    expect(within(browserFacts).getByText(/facts chronoscope can directly measure in this browser session/i)).toBeTruthy();
    expect(within(browserFacts).getByRole('region', { name: /latency distribution/i })).toBeTruthy();
    expect(within(browserFacts).getByRole('region', { name: /browser visibility/i })).toBeTruthy();
    expect(within(browserFacts).getByRole('region', { name: /cross-endpoint comparison/i })).toBeTruthy();

    const proofActions = getByRole('region', { name: /next proof actions/i });
    expect(within(proofActions).getByText(/checks that reduce uncertainty without changing the browser facts/i)).toBeTruthy();
    expect(within(proofActions).getByRole('region', { name: /remote vantage/i })).toBeTruthy();
    expect(within(proofActions).getByRole('region', { name: /loaded latency/i })).toBeTruthy();
    expect(within(proofActions).getByRole('region', { name: /network context/i })).toBeTruthy();
    expect(within(proofActions).getByRole('region', { name: /local companion proof/i })).toBeTruthy();
    expect(within(proofActions).getAllByText(/compare another vantage|reduce uncertainty/i).length).toBeGreaterThan(0);
    expect(getByText(/measured fact:/i)).toBeTruthy();
    expect(getByText(/interpretation:/i)).toBeTruthy();
  });

  it('opens local companion proof with local-only and privacy boundaries', async () => {
    const api = endpoint('api', 'API');
    endpointStore.setEndpoints([api]);
    seedReadySamples({ api: 80 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');

    const { getByRole, getByText } = render(DiagnoseView);

    await fireEvent.click(getByRole('button', { name: /open local companion/i }));

    expect(getByRole('region', { name: /focused local proof/i })).toBeTruthy();
    expect(getByText(/local-only: chronoscope talks to 127\.0\.0\.1/i)).toBeTruthy();
    expect(getByText(/signed probes use the token/i)).toBeTruthy();
    expect(getByText(/private wifi is off by default/i)).toBeTruthy();
    expect(getByText(/ssid and bssid stay redacted/i)).toBeTruthy();
  });

  it('runs a loaded latency check from Investigate with proof-scoped copy', async () => {
    const api = endpoint('api', 'API');
    endpointStore.setEndpoints([api]);
    seedReadySamples({ api: 35 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');
    const runLoadedLatency = vi.spyOn(bufferbloatStore, 'run').mockResolvedValue(null);

    const { getByRole, getByText } = render(DiagnoseView);

    expect(getByText(/loaded-latency evidence, not packet-level proof/i)).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: /run loaded check/i }));

    await waitFor(() => {
      expect(runLoadedLatency).toHaveBeenCalledWith({
        endpoint: api,
        idleSamples: expect.arrayContaining([expect.objectContaining({ latency: 35 })]),
        settings: expect.objectContaining({
          corsMode: 'no-cors',
          timeout: 5000,
        }),
      });
    });
  });

  it('runs optional network context from Investigate with proof-scoped copy', async () => {
    const api = endpoint('api', 'API');
    endpointStore.setEndpoints([api]);
    seedReadySamples({ api: 35 });
    uiStore.setActiveView('diagnose');
    uiStore.setFocusedEndpoint('api');
    const runNetworkContext = vi.spyOn(networkContextStore, 'run').mockResolvedValue({
      status: 'complete',
      hostname: 'api.example.com',
      dnsInsight: null,
      topologyInsight: null,
      dnsError: null,
      topologyError: null,
      error: null,
    });

    const { getByRole, getByText } = render(DiagnoseView);

    expect(getByText(/outside resolver and public topology context/i)).toBeTruthy();
    expect(getByText(/not your local DNS path or active route proof/i)).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: /run context check/i }));

    await waitFor(() => {
      expect(runNetworkContext).toHaveBeenCalledWith(api);
    });
  });
});
