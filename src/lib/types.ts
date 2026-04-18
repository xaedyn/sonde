// src/lib/types.ts
// Cross-boundary TypeScript contracts. All worker messages, store shapes, and
// share payloads are defined here. No logic — only types and interfaces.

import type { Region } from './regional-defaults';

// ── Lifecycle ──────────────────────────────────────────────────────────────
export type TestLifecycleState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'completed';

// ── Endpoint ───────────────────────────────────────────────────────────────
export interface Endpoint {
  readonly id: string;
  url: string;
  enabled: boolean;
  label: string;
  color: string;
}

// ── Worker message contracts ───────────────────────────────────────────────
export type MainToWorkerMessage =
  | {
      type: 'measure';
      url: string;
      timeout: number;
      corsMode: 'no-cors' | 'cors';
      epoch: number;
      roundId: number;
    }
  | { type: 'stop' };

export interface TimingPayload {
  total: number;
  dnsLookup: number;
  tcpConnect: number;
  tlsHandshake: number;
  ttfb: number;
  contentTransfer: number;
  connectionReused?: boolean;
  protocol?: string;
}

export type WorkerToMainMessage =
  | {
      type: 'result';
      endpointId: string;
      epoch: number;
      roundId: number;
      timing: TimingPayload;
      timingFallback?: boolean;
    }
  | {
      type: 'timeout';
      endpointId: string;
      epoch: number;
      roundId: number;
      timeoutValue: number;
    }
  | {
      type: 'error';
      endpointId: string;
      epoch: number;
      roundId: number;
      errorType: string;
      message: string;
    }
  | {
      type: 'busy';
      endpointId: string;
      epoch: number;
      roundId: number;
    };

// ── Measurement store ──────────────────────────────────────────────────────
export type SampleStatus = 'ok' | 'timeout' | 'error';

export interface MeasurementSample {
  readonly round: number;
  readonly latency: number;
  readonly status: SampleStatus;
  readonly timestamp: number;
  readonly tier2?: TimingPayload;
  readonly errorMessage?: string;
  readonly timingFallback?: boolean;
}

/** Array-like interface backed by RingBuffer. Consumers read through this. */
export interface SampleBuffer {
  readonly length: number;
  readonly tailIndex: number;
  at(index: number): MeasurementSample | undefined;
  [index: number]: MeasurementSample | undefined;
  [Symbol.iterator](): Iterator<MeasurementSample>;
  filter(predicate: (value: MeasurementSample, index: number) => boolean): MeasurementSample[];
  map<U>(callbackfn: (value: MeasurementSample, index: number) => U): U[];
  find(predicate: (value: MeasurementSample, index: number) => boolean): MeasurementSample | undefined;
  reduce<U>(callbackfn: (accumulator: U, value: MeasurementSample, index: number) => U, initialValue: U): U;
  slice(start?: number, end?: number): MeasurementSample[];
  forEach(callbackfn: (value: MeasurementSample, index: number) => void): void;
  toArray(): MeasurementSample[];
}

export interface EndpointMeasurementState {
  readonly endpointId: string;
  samples: SampleBuffer;
  lastLatency: number | null;
  lastStatus: SampleStatus | null;
  lastErrorMessage: string | null;
  tierLevel: 1 | 2;
}

export interface FreezeEvent {
  readonly round: number;
  readonly at: number;
  readonly gapMs: number;
}

export interface MeasurementState {
  lifecycle: TestLifecycleState;
  epoch: number;
  roundCounter: number;
  endpoints: Record<string, EndpointMeasurementState>;
  startedAt: number | null;
  stoppedAt: number | null;
  freezeEvents: FreezeEvent[];
  errorCount: number;
  timeoutCount: number;
}

// ── Statistics store ───────────────────────────────────────────────────────
export interface ConfidenceInterval {
  readonly lower: number;
  readonly upper: number;
  readonly margin: number;
}

export interface EndpointStatistics {
  readonly endpointId: string;
  readonly sampleCount: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  readonly min: number;
  readonly max: number;
  readonly stddev: number;
  readonly ci95: ConfidenceInterval;
  readonly connectionReuseDelta: number | null;
  readonly tier2Averages?: {
    dnsLookup: number;
    tcpConnect: number;
    tlsHandshake: number;
    ttfb: number;
    contentTransfer: number;
  };
  // Per-phase p95 — fed by the same cadence as tier2Averages. Needed for
  // Atlas view's P50/P95 toggle. Optional to mirror tier2Averages semantics
  // (absent when no tier-2 samples have been captured yet).
  readonly tier2P95?: {
    dnsLookup: number;
    tcpConnect: number;
    tlsHandshake: number;
    ttfb: number;
    contentTransfer: number;
  };
  readonly ready: boolean;
}

export type StatisticsState = Record<string, EndpointStatistics>;

// ── Settings store ─────────────────────────────────────────────────────────
export interface Settings {
  timeout: number;
  delay: number;
  burstRounds: number;
  monitorDelay: number;
  cap: number;
  corsMode: 'no-cors' | 'cors';
  region?: Region;
  // Latency alarm threshold in ms — distinct from `timeout` (which is the hard
  // request abort). Drives classify()/networkQuality() and the chronograph dial.
  // Must be strictly less than `timeout`; callers enforce.
  healthThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  timeout: 5000,
  delay: 0,
  burstRounds: 50,
  monitorDelay: 1000,
  cap: 0,
  corsMode: 'no-cors',
  healthThreshold: 120,
};

// ── UI store ───────────────────────────────────────────────────────────────
// v2 view union. Old labels ('timeline' | 'heatmap' | 'split') are kept so
// persisted settings can round-trip through migration; they're rewritten to
// 'lanes' by the v4→v5 migration in persistence.ts.
export type ActiveView =
  | 'overview'
  | 'live'
  | 'atlas'
  | 'strata'
  | 'terminal'
  | 'lanes'
  | 'timeline'
  | 'heatmap'
  | 'split';

export type LiveTimeRange = '1m' | '5m' | '15m' | '1h' | '24h';

export type TerminalEventType =
  | 'timeout'
  | 'error'
  | 'threshold_up'
  | 'threshold_down'
  | 'freeze'
  | 'endpoint_added'
  | 'endpoint_removed'
  | 'reuse_change';

export interface HoverTarget {
  readonly endpointId: string;
  readonly roundId: number;
  readonly x: number;
  readonly y: number;
  readonly latency: number;
  readonly status: SampleStatus;
  readonly timestamp: number;
}

export interface UIState {
  activeView: ActiveView;
  expandedCards: Set<string>;
  hoverTarget: HoverTarget | null;
  selectedTarget: HoverTarget | null;
  showCrosshairs: boolean;
  showSettings: boolean;
  showShare: boolean;
  showKeyboardHelp: boolean;
  isSharedView: boolean;
  laneHoverRound: number | null;
  laneHoverX: number | null;
  laneHoverY: number | null;
  heatmapTooltip: { text: string; x: number; y: number } | null;
  showEndpoints: boolean;

  // Globally focused endpoint — drives rail selection and per-view focus.
  // null = unfocused (rail shows aggregate). Persisted across sessions; on
  // rehydration the id is cleared silently if the endpoint no longer exists.
  focusedEndpointId: string | null;

  // Live view layout options (split scopes vs unified overlay + window).
  liveOptions: {
    split: boolean;
    timeRange: LiveTimeRange;
  };

  // Terminal view filter set. Empty = show all event types.
  terminalFilters: Set<TerminalEventType>;
}

// ── Lane hover ─────────────────────────────────────────────────────────────
export interface LaneHoverState {
  readonly round: number;
  readonly x: number;  // clientX position of hover line
}

// ── Heatmap strip ──────────────────────────────────────────────────────────
export interface HeatmapCellData {
  readonly startRound: number;
  readonly endRound: number;
  readonly worstLatency: number;
  readonly worstStatus: SampleStatus;
  readonly startElapsed: number;
  readonly endElapsed: number;
  readonly color: string;
}

// ── Share payload ──────────────────────────────────────────────────────────
export interface SharePayload {
  readonly v: 1;
  readonly mode: 'config' | 'results';
  readonly endpoints: readonly { url: string; enabled: boolean }[];
  readonly settings: {
    readonly timeout: number;
    readonly delay: number;
    readonly burstRounds?: number;
    readonly monitorDelay?: number;
    readonly cap: number;
    readonly corsMode: 'no-cors' | 'cors';
  };
  readonly results?: readonly {
    readonly samples: readonly {
      readonly round: number;
      readonly latency: number;
      readonly status: SampleStatus;
      readonly tier2?: TimingPayload;
    }[];
  }[];
}

// ── Persistence schema ─────────────────────────────────────────────────────
// v5 adds `healthThreshold` (settings) and `focusedEndpointId`, `liveOptions`,
// `terminalFilters` (ui). Older versions migrate forward via persistence.ts.
// Sets serialize as arrays on disk; `ui.terminalFilters` round-trips accordingly.
export interface PersistedSettings {
  version: 2 | 3 | 4 | 5;
  endpoints: { url: string; enabled: boolean }[];
  settings: Settings;
  ui: {
    expandedCards: string[];
    activeView: ActiveView;
    focusedEndpointId?: string | null;
    liveOptions?: {
      split: boolean;
      timeRange: LiveTimeRange;
    };
    terminalFilters?: TerminalEventType[];
  };
}

// ── Render data ────────────────────────────────────────────────────────────
export interface ScatterPoint {
  readonly x: number;
  readonly y: number;
  readonly latency: number;
  readonly status: SampleStatus;
  readonly endpointId: string;
  readonly round: number;
  readonly color: string;
  readonly errorMessage?: string;
}

export interface HeatmapCell {
  readonly col: number;
  readonly row: number;
  readonly color: string;
  readonly latency: number;
  readonly status: SampleStatus;
  readonly endpointId: string;
  readonly round: number;
}

export interface SonarPing {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly tier: 'fast' | 'medium' | 'slow' | 'timeout';
  startTime: number;
}

// ── Pipeline output types ─────────────────────────────────────────────────

export interface Gridline {
  readonly ms: number;
  readonly normalizedY: number;
  readonly label: string;
}

export interface YRange {
  readonly min: number;
  readonly max: number;
  readonly isLog: boolean;
  readonly gridlines: readonly Gridline[];
}

export interface XTick {
  readonly round: number;
  readonly normalizedX: number;
  readonly label: string;
}

export interface RibbonData {
  /** P25 path: [round, normalizedY][] — bottom edge of ribbon band */
  readonly p25Path: readonly (readonly [number, number])[];
  /** P50 path: [round, normalizedY][] — median line */
  readonly p50Path: readonly (readonly [number, number])[];
  /** P75 path: [round, normalizedY][] — top edge of ribbon band */
  readonly p75Path: readonly (readonly [number, number])[];
}

export interface FrameData {
  readonly pointsByEndpoint: ReadonlyMap<string, readonly ScatterPoint[]>;
  readonly ribbonsByEndpoint: ReadonlyMap<string, RibbonData>;
  readonly yRange: YRange;
  readonly yRangesByEndpoint: ReadonlyMap<string, YRange>;
  readonly xTicks: readonly XTick[];
  readonly maxRound: number;
  readonly freezeEvents: readonly FreezeEvent[];
  readonly hasData: boolean;
}
