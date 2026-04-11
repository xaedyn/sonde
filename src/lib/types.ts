// src/lib/types.ts
// Cross-boundary TypeScript contracts. All worker messages, store shapes, and
// share payloads are defined here. No logic — only types and interfaces.

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
    };

// ── Measurement store ──────────────────────────────────────────────────────
export type SampleStatus = 'ok' | 'timeout' | 'error';

export interface MeasurementSample {
  readonly round: number;
  readonly latency: number;
  readonly status: SampleStatus;
  readonly timestamp: number;
  readonly tier2?: TimingPayload;
}

export interface EndpointMeasurementState {
  readonly endpointId: string;
  samples: MeasurementSample[];
  lastLatency: number | null;
  lastStatus: SampleStatus | null;
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
}

export const DEFAULT_SETTINGS: Settings = {
  timeout: 5000,
  delay: 0,
  burstRounds: 50,
  monitorDelay: 3000,
  cap: 0,
  corsMode: 'no-cors',
};

export const DEFAULT_ENDPOINTS: Omit<Endpoint, 'id' | 'color'>[] = [
  { url: 'https://www.google.com', enabled: true, label: 'Google' },
  { url: 'https://1.1.1.1', enabled: true, label: 'Cloudflare DNS' },
];

// ── UI store ───────────────────────────────────────────────────────────────
export type ActiveView = 'timeline' | 'heatmap' | 'split';

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
  sharedResultsTimestamp: number | null;
  laneHoverRound: number | null;
  laneHoverX: number | null;
  showEndpoints: boolean;
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
export interface PersistedSettings {
  version: 2 | 3;
  endpoints: { url: string; enabled: boolean }[];
  settings: Settings;
  ui: {
    expandedCards: string[];
    activeView: ActiveView;
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
