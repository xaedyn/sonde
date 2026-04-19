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
  // Percent of samples that did NOT return `ok` (0–100). Consumed by
  // verdict.ts's `Packet loss elevated to N.N%` branch. Zero when
  // sampleCount is zero — consumers should gate on `ready` instead.
  readonly lossPercent: number;
  readonly ready: boolean;
}

export type StatisticsState = Record<string, EndpointStatistics>;

// ── Settings store ─────────────────────────────────────────────────────────
export type OverviewMode = 'classic' | 'enriched';

export interface Settings {
  timeout: number;
  delay: number;
  burstRounds: number;
  monitorDelay: number;
  cap: number;
  corsMode: 'no-cors' | 'cors';
  region?: Region;
  // Chooses between the Phase 2 Classic dial (score + ticks + hand) and the
  // Phase 2.5 Enriched dial (+ baseline arc + quality trace + racing strip +
  // event feed + causal verdict). Landed in v6; default 'classic' until the
  // enriched surface is flipped to default in a later release.
  overviewMode: OverviewMode;
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
  overviewMode: 'classic',
};

// ── UI store ───────────────────────────────────────────────────────────────
// v2 view union — post-Phase-7 shape. The Lanes family ('lanes' | 'timeline'
// | 'heatmap' | 'split') has been retired. Persisted payloads carrying any of
// those values collapse to 'overview' via stepV6toV7 in persistence.ts.
export type ActiveView =
  | 'overview'
  | 'live'
  | 'atlas'
  | 'strata'
  | 'terminal';

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
// `terminalFilters` (ui). v6 adds `settings.overviewMode` (classic | enriched).
// Older versions migrate forward via persistence.ts. Sets serialize as arrays
// on disk; `ui.terminalFilters` round-trips accordingly.
export interface PersistedSettings {
  version: 2 | 3 | 4 | 5 | 6 | 7;
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

