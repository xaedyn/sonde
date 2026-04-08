import { describe, it, expect } from 'vitest';
import type {
  Endpoint,
  MainToWorkerMessage,
  WorkerToMainMessage,
  TimingPayload,
  MeasurementSample,
  MeasurementState,
  EndpointStatistics,
  StatisticsState,
  Settings,
  UIState,
  SharePayload,
  PersistedSettings,
  TestLifecycleState,
} from '../../src/lib/types';
import { DEFAULT_SETTINGS, DEFAULT_ENDPOINTS } from '../../src/lib/types';

describe('types', () => {
  it('TestLifecycleState is a valid discriminated union', () => {
    const states: TestLifecycleState[] = ['idle', 'starting', 'running', 'stopping', 'stopped', 'completed'];
    expect(states).toHaveLength(6);
  });

  it('TimingPayload has all required fields', () => {
    const payload: TimingPayload = {
      total: 123,
      dnsLookup: 0,
      tcpConnect: 10,
      tlsHandshake: 20,
      ttfb: 80,
      contentTransfer: 13,
    };
    expect(payload.total).toBe(123);
  });

  it('WorkerToMainMessage covers all result types', () => {
    const result: WorkerToMainMessage = {
      type: 'result',
      endpointId: 'ep-1',
      epoch: 1,
      roundId: 0,
      timing: { total: 50, dnsLookup: 0, tcpConnect: 5, tlsHandshake: 10, ttfb: 30, contentTransfer: 5 },
    };
    expect(result.type).toBe('result');

    const timeout: WorkerToMainMessage = {
      type: 'timeout',
      endpointId: 'ep-1',
      epoch: 1,
      roundId: 0,
      timeoutValue: 5000,
    };
    expect(timeout.type).toBe('timeout');

    const error: WorkerToMainMessage = {
      type: 'error',
      endpointId: 'ep-1',
      epoch: 1,
      roundId: 0,
      errorType: 'NetworkError',
      message: 'Failed to fetch',
    };
    expect(error.type).toBe('error');
  });

  it('SharePayload v1 schema is structurally valid', () => {
    const payload: SharePayload = {
      v: 1,
      mode: 'results',
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 1000, cap: 0, corsMode: 'no-cors' },
      results: [{
        samples: [{ round: 0, latency: 42, status: 'ok' }],
      }],
    };
    expect(payload.v).toBe(1);
  });

  it('DEFAULT_SETTINGS has correct values', () => {
    expect(DEFAULT_SETTINGS.timeout).toBe(5000);
    expect(DEFAULT_SETTINGS.delay).toBe(1000);
    expect(DEFAULT_SETTINGS.cap).toBe(0);
    expect(DEFAULT_SETTINGS.corsMode).toBe('no-cors');
  });

  it('DEFAULT_ENDPOINTS has 2 entries', () => {
    expect(DEFAULT_ENDPOINTS).toHaveLength(2);
    expect(DEFAULT_ENDPOINTS[0]?.url).toBe('https://www.google.com');
    expect(DEFAULT_ENDPOINTS[1]?.url).toBe('https://1.1.1.1');
  });

  it('UIState includes shared view fields', () => {
    const state: UIState = {
      activeView: 'timeline',
      expandedCards: new Set(),
      hoverTarget: null,
      selectedTarget: null,
      showCrosshairs: false,
      showSettings: false,
      showShare: false,
      isSharedView: false,
      sharedResultsTimestamp: null,
    };
    expect(state.isSharedView).toBe(false);
  });
});
