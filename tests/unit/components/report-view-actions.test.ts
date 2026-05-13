import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportView from '../../../src/lib/components/ReportView.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { resetStatisticsCache } from '../../../src/lib/stores/statistics';
import { uiStore } from '../../../src/lib/stores/ui';
import type {
  Endpoint,
  MeasurementSample,
  MeasurementState,
  SharePayload,
  SharedReportContext,
} from '../../../src/lib/types';
import type { CompanionState } from '../../../src/lib/stores/companion';
import type { RemoteVantageState } from '../../../src/lib/stores/remote-vantage';

const mocks = vi.hoisted(() => {
  const remoteSubscribers = new Set<(state: RemoteVantageState) => void>();
  const companionSubscribers = new Set<(state: CompanionState) => void>();
  let remoteState = {
    status: 'idle',
    health: null,
    lastProbe: null,
    hostedReport: null,
    hostedReportFallback: null,
    error: null,
  } as RemoteVantageState;
  let companionState = {
    baseUrl: 'http://127.0.0.1:47317',
    hasSecret: false,
    status: 'idle',
    version: null,
    capabilities: null,
    lastProbe: null,
    history: [],
    error: null,
  } as CompanionState;
  const remoteUnsubscribe = vi.fn();
  const companionUnsubscribe = vi.fn();

  return {
    historyUnsubscribe: vi.fn(),
    remoteUnsubscribe,
    companionUnsubscribe,
    runProbe: vi.fn(),
    runCompanionProbe: vi.fn(),
    createHostedReport: vi.fn<(payload: SharePayload) => Promise<string | null>>().mockResolvedValue(null),
    get remoteState(): RemoteVantageState {
      return remoteState;
    },
    clearRemoteSubscribers(): void {
      remoteSubscribers.clear();
    },
    setRemoteState(update: Partial<RemoteVantageState>): void {
      remoteState = { ...remoteState, ...update };
      for (const subscriber of remoteSubscribers) subscriber(remoteState);
    },
    setCompanionState(update: Partial<CompanionState>): void {
      companionState = { ...companionState, ...update };
      for (const subscriber of companionSubscribers) subscriber(companionState);
    },
    resetCompanionState(): void {
      companionState = {
        baseUrl: 'http://127.0.0.1:47317',
        hasSecret: false,
        status: 'idle',
        version: null,
        capabilities: null,
        lastProbe: null,
        history: [],
        error: null,
      } as CompanionState;
      for (const subscriber of companionSubscribers) subscriber(companionState);
    },
    subscribeRemote(run: (state: RemoteVantageState) => void): () => void {
      remoteSubscribers.add(run);
      run(remoteState);
      return () => {
        remoteSubscribers.delete(run);
        remoteUnsubscribe();
      };
    },
    subscribeCompanion(run: (state: CompanionState) => void): () => void {
      companionSubscribers.add(run);
      run(companionState);
      return () => {
        companionSubscribers.delete(run);
        companionUnsubscribe();
      };
    },
  };
});

vi.mock('$lib/stores/history', () => ({
  historyStore: {
    subscribe(run: (state: { sessions: readonly unknown[] }) => void): () => void {
      run({ sessions: [] });
      return mocks.historyUnsubscribe;
    },
  },
}));

vi.mock('$lib/stores/remote-vantage', () => ({
  remoteVantageStore: {
    subscribe: mocks.subscribeRemote,
    runProbe: mocks.runProbe,
    createHostedReport: mocks.createHostedReport,
  },
}));

vi.mock('$lib/stores/companion', () => ({
  companionStore: {
    subscribe: mocks.subscribeCompanion,
    configure: vi.fn(),
    checkHealth: vi.fn().mockResolvedValue(false),
    runProbe: mocks.runCompanionProbe,
    loadHistory: vi.fn().mockResolvedValue([]),
    clearSecret: vi.fn(),
  },
}));

function endpoint(id: string, label = id): Endpoint {
  return {
    id,
    label,
    url: `https://${id}.example.com`,
    enabled: true,
    color: '#67e8f9',
  };
}

function samples(latency: number): MeasurementSample[] {
  return Array.from({ length: 35 }, (_, index) => ({
    round: index + 1,
    latency,
    status: 'ok' as const,
    timestamp: index + 1,
  }));
}

const sharedContext: SharedReportContext = {
  reportKind: 'support',
  createdAt: 1778352000000,
  healthThreshold: 120,
  corsMode: 'no-cors',
  roundCount: 35,
  totalSampleCount: 105,
  keptSampleCount: 105,
  truncated: false,
  sourceVersion: 2,
};

function seedIsolatedReport(reportKind: SharedReportContext['reportKind'] = 'support'): Endpoint[] {
  const endpoints = [
    endpoint('api', 'API'),
    endpoint('google', 'Google'),
    endpoint('cloudflare', 'Cloudflare'),
  ];
  endpointStore.setEndpoints(endpoints);
  measurementStore.loadSnapshot({
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: 35,
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
    endpoints: {
      api: {
        endpointId: 'api',
        tierLevel: 1,
        lastLatency: 240,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: samples(240),
      },
      google: {
        endpointId: 'google',
        tierLevel: 1,
        lastLatency: 45,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: samples(45),
      },
      cloudflare: {
        endpointId: 'cloudflare',
        tierLevel: 1,
        lastLatency: 38,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: samples(38),
      },
    },
  } satisfies MeasurementState);
  uiStore.setSharedView(true);
  uiStore.setSharedReportMode(true);
  uiStore.setSharedReportContext({ ...sharedContext, reportKind });
  return endpoints;
}

function seedSharedNetworkReport(): Endpoint[] {
  const endpoints = [
    endpoint('api', 'API'),
    endpoint('google', 'Google'),
    endpoint('cloudflare', 'Cloudflare'),
  ];
  endpointStore.setEndpoints(endpoints);
  measurementStore.loadSnapshot({
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: 35,
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
    endpoints: {
      api: {
        endpointId: 'api',
        tierLevel: 1,
        lastLatency: 260,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: samples(260),
      },
      google: {
        endpointId: 'google',
        tierLevel: 1,
        lastLatency: 180,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: samples(180),
      },
      cloudflare: {
        endpointId: 'cloudflare',
        tierLevel: 1,
        lastLatency: 170,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: samples(170),
      },
    },
  } satisfies MeasurementState);
  uiStore.setSharedView(true);
  uiStore.setSharedReportMode(true);
  uiStore.setSharedReportContext(sharedContext);
  return endpoints;
}

describe('ReportView triage actions', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    endpointStore.setEndpoints([]);
    measurementStore.reset();
    resetStatisticsCache();
    uiStore.reset();
    mocks.clearRemoteSubscribers();
    mocks.setRemoteState({
      status: 'idle',
      health: null,
      lastProbe: null,
      hostedReport: null,
      hostedReportFallback: null,
      error: null,
    });
    mocks.resetCompanionState();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders support report mode copy from shared metadata', () => {
    seedIsolatedReport('support');
    const { getByRole, getByText, queryByText } = render(ReportView);

    expect(getByText('Support report')).toBeTruthy();
    expect(queryByText('Shared diagnostic report')).toBeNull();
    expect(getByRole('button', { name: /copy support summary/i })).toBeTruthy();
  });

  it('renders snapshot report mode copy from shared metadata', () => {
    seedIsolatedReport('snapshot');
    const { getByRole, getByText, queryByText } = render(ReportView);

    expect(getByText('Performance snapshot')).toBeTruthy();
    expect(queryByText('Shared diagnostic report')).toBeNull();
    expect(getByRole('button', { name: /copy snapshot summary/i })).toBeTruthy();
  });

  it('opens Investigate on the implicated endpoint from the triage card', async () => {
    seedIsolatedReport();
    const { getByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /inspect slow moments/i }));

    expect(get(uiStore).sharedReportMode).toBe(false);
    expect(get(uiStore).activeView).toBe('diagnose');
    expect(get(uiStore).focusedEndpointId).toBe('api');
  });

  it('runs the Cloudflare outside check from the triage card', async () => {
    const endpoints = seedIsolatedReport();
    mocks.runProbe.mockResolvedValue(null);
    const { getByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /run outside check/i }));

    await waitFor(() => {
      expect(mocks.runProbe).toHaveBeenCalledWith(endpoints);
    });
  });

  it('shows captured outside proof after a remote check resolves', async () => {
    const endpoints = seedIsolatedReport();
    mocks.runProbe.mockImplementation(() => {
      mocks.setRemoteState({
        status: 'connected',
        lastProbe: {
          ok: true,
          generatedAt: 1778352005000,
          edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
          results: endpoints.map((ep) => ({
            endpointId: ep.id,
            label: ep.label,
            url: ep.url,
            ok: true,
            status: 200,
            statusText: 'OK',
            durationMs: ep.id === 'api' ? 310 : 45,
            checkedAt: 1778352005000,
            verdict: ep.id === 'api' ? 'slow' : 'reachable',
            headers: {},
          })),
        },
      });
      return Promise.resolve(mocks.remoteState.lastProbe);
    });
    const { getByRole, findAllByText } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /run outside check/i }));

    await waitFor(() => {
      expect(mocks.runProbe).toHaveBeenCalledWith(endpoints);
    });
    expect((await findAllByText('Captured')).length).toBeGreaterThan(0);
    expect(await findAllByText(/1 of 3 endpoints was slow or failed/i)).toHaveLength(1);
  });

  it('includes newly captured outside proof in copied report payloads', async () => {
    const endpoints = seedIsolatedReport();
    mocks.runProbe.mockImplementation(() => {
      mocks.setRemoteState({
        status: 'connected',
        lastProbe: {
          ok: true,
          generatedAt: 1778352005000,
          edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
          results: endpoints.map((ep) => ({
            endpointId: ep.id,
            label: ep.label,
            url: ep.url,
            ok: true,
            status: 200,
            statusText: 'OK',
            durationMs: ep.id === 'api' ? 310 : 45,
            checkedAt: 1778352005000,
            verdict: ep.id === 'api' ? 'slow' : 'reachable',
            headers: {},
          })),
        },
      });
      return Promise.resolve(mocks.remoteState.lastProbe);
    });
    const { getByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /run outside check/i }));
    await waitFor(() => {
      expect(mocks.runProbe).toHaveBeenCalledWith(endpoints);
    });
    await fireEvent.click(getByRole('button', { name: /copy report link/i }));

    await waitFor(() => {
      expect(mocks.createHostedReport).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createHostedReport.mock.calls[0]?.[0].remoteVantage).toEqual(expect.objectContaining({
      generatedAt: 1778352005000,
      edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
      results: expect.arrayContaining([
        expect.objectContaining({ endpointId: 'api', verdict: 'slow' }),
      ]),
    }));
  });

  it('keeps local proof out of copied report links until the sender opts in', async () => {
    seedIsolatedReport();
    mocks.setCompanionState({
      status: 'connected',
      lastProbe: {
        ok: true,
        id: 'probe-1',
        targetHost: 'api.example.com',
        createdAt: 1778352005000,
        summary: 'WiFi completed.',
        results: {
          wifi: {
            ok: true,
            durationMs: 5,
            value: {
              ssid: 'HomeNetwork',
              bssid: 'aa:bb:cc:dd:ee:ff',
              rssi: -51,
              noise: -90,
            },
          },
        },
      },
    });
    const { getByLabelText, getByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /copy report link/i }));
    await waitFor(() => {
      expect(mocks.createHostedReport).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createHostedReport.mock.calls[0]?.[0].localCompanion).toBeUndefined();

    mocks.createHostedReport.mockClear();
    await fireEvent.click(getByLabelText(/include redacted local proof/i));
    await fireEvent.click(getByRole('button', { name: /copy report link|link copied/i }));

    await waitFor(() => {
      expect(mocks.createHostedReport).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.createHostedReport.mock.calls[0]?.[0];
    expect(payload?.localCompanion).toMatchObject({
      targetHost: 'api.example.com',
      wifi: { ssid: 'redacted', bssid: 'redacted' },
    });
    expect(JSON.stringify(payload)).not.toContain('HomeNetwork');
  });

  it('marks an older outside proof action as stale against the current report', () => {
    seedIsolatedReport();
    mocks.setRemoteState({
      status: 'connected',
      lastProbe: {
        ok: true,
        generatedAt: 1,
        edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
        results: [{
          endpointId: 'api',
          label: 'API',
          url: 'https://api.example.com',
          ok: true,
          status: 200,
          statusText: 'OK',
          durationMs: 45,
          checkedAt: 1,
          verdict: 'reachable',
          headers: {},
        }],
      },
    });
    const { getAllByText } = render(ReportView);

    expect(getAllByText('Stale').length).toBeGreaterThanOrEqual(2);
  });

  it('opens focused local proof in the report instead of primary settings', async () => {
    seedSharedNetworkReport();
    const { getByLabelText, getByRole, findByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /deepen local proof/i }));

    expect(get(uiStore).showSettings).toBe(false);
    expect(get(uiStore).focusedEndpointId).toBe('api');
    expect(await findByRole('region', { name: /focused local proof/i })).toBeTruthy();
    expect((getByLabelText('Probe URL') as HTMLInputElement).value).toBe('https://api.example.com');

    await fireEvent.click(getByRole('button', { name: /open full settings/i }));

    expect(get(uiStore).showSettings).toBe(true);
  });

  it('scrolls to browser visibility from the triage card', async () => {
    seedIsolatedReport();
    const { getByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /check visibility/i }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
});
