import { describe, it, expect, expectTypeOf } from 'vitest';
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
import type { FrameData, RibbonData, XTick, YRange, Gridline, HeatmapCellData } from '../../src/lib/types';

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
    expect(DEFAULT_SETTINGS.delay).toBe(0);
    expect(DEFAULT_SETTINGS.burstRounds).toBe(50);
    expect(DEFAULT_SETTINGS.monitorDelay).toBe(1000);
    expect(DEFAULT_SETTINGS.cap).toBe(0);
    expect(DEFAULT_SETTINGS.corsMode).toBe('no-cors');
  });

  it('DEFAULT_ENDPOINTS has 2 entries', () => {
    expect(DEFAULT_ENDPOINTS).toHaveLength(2);
    expect(DEFAULT_ENDPOINTS[0]?.url).toBe('https://www.google.com');
    expect(DEFAULT_ENDPOINTS[1]?.url).toBe('https://1.1.1.1');
  });

  it('UIState has showKeyboardHelp field', () => {
    const state: UIState = {
      activeView: 'timeline',
      expandedCards: new Set(),
      hoverTarget: null,
      selectedTarget: null,
      showCrosshairs: false,
      showSettings: false,
      showShare: false,
      showKeyboardHelp: false,
      isSharedView: false,
    };
    expect(state.showKeyboardHelp).toBe(false);
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
      showKeyboardHelp: false,
      isSharedView: false,
    };
    expect(state.isSharedView).toBe(false);
  });
});

describe('types — timingFallback additions', () => {
  it('WorkerToMainMessage result variant accepts timingFallback: boolean', () => {
    const msg: WorkerToMainMessage = {
      type: 'result',
      endpointId: 'ep-1',
      epoch: 1,
      roundId: 0,
      timing: {
        total: 150,
        dnsLookup: 0,
        tcpConnect: 0,
        tlsHandshake: 0,
        ttfb: 0,
        contentTransfer: 0,
      },
      timingFallback: true,
    };
    expectTypeOf(msg).toMatchTypeOf<WorkerToMainMessage>();
  });

  it('WorkerToMainMessage result variant accepts timingFallback absent (optional)', () => {
    const msg: WorkerToMainMessage = {
      type: 'result',
      endpointId: 'ep-1',
      epoch: 1,
      roundId: 0,
      timing: {
        total: 150,
        dnsLookup: 10,
        tcpConnect: 20,
        tlsHandshake: 5,
        ttfb: 80,
        contentTransfer: 35,
      },
    };
    expectTypeOf(msg).toMatchTypeOf<WorkerToMainMessage>();
  });

  it('MeasurementSample accepts timingFallback: boolean', () => {
    const sample: MeasurementSample = {
      round: 1,
      latency: 150,
      status: 'ok',
      timestamp: Date.now(),
      timingFallback: true,
    };
    expectTypeOf(sample).toMatchTypeOf<MeasurementSample>();
  });

  it('MeasurementSample accepts timingFallback absent (optional)', () => {
    const sample: MeasurementSample = {
      round: 1,
      latency: 150,
      status: 'ok',
      timestamp: Date.now(),
    };
    expectTypeOf(sample).toMatchTypeOf<MeasurementSample>();
  });
});

describe('HeatmapCellData type', () => {
  it('HeatmapCellData interface has all required fields', () => {
    const cell: HeatmapCellData = {
      startRound: 1, endRound: 5, worstLatency: 142, worstStatus: 'ok',
      startElapsed: 1000, endElapsed: 5000, color: '#67e8f9',
    };
    expect(cell.startRound).toBe(1);
    expect(cell.endRound).toBe(5);
  });
});

describe('pipeline types', () => {
  it('Gridline interface has ms, normalizedY, and label', () => {
    const g: Gridline = { ms: 100, normalizedY: 0.5, label: '100ms' };
    expect(g.ms).toBe(100);
    expect(g.normalizedY).toBe(0.5);
    expect(g.label).toBe('100ms');
  });

  it('YRange interface has min, max, isLog, and gridlines', () => {
    const yr: YRange = { min: 1, max: 1000, isLog: false, gridlines: [] };
    expect(yr.isLog).toBe(false);
  });

  it('XTick interface has round, normalizedX, and label', () => {
    const t: XTick = { round: 10, normalizedX: 0.5, label: '10' };
    expect(t.round).toBe(10);
  });

  it('RibbonData interface has p25Path, p50Path, p75Path', () => {
    const r: RibbonData = { p25Path: [[1, 0.2]], p50Path: [[1, 0.5]], p75Path: [[1, 0.8]] };
    expect(r.p50Path).toHaveLength(1);
  });

  it('FrameData interface has all required fields', () => {
    const fd: FrameData = {
      pointsByEndpoint: new Map(),
      ribbonsByEndpoint: new Map(),
      yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
      xTicks: [],
      maxRound: 0,
      freezeEvents: [],
      hasData: false,
    };
    expect(fd.hasData).toBe(false);
  });
});
