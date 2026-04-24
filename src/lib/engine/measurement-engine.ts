// src/lib/engine/measurement-engine.ts
// Orchestrates one Worker per enabled endpoint, response-gated round dispatch,
// two-phase cadence (burst → monitor), and epoch-based stale-message invalidation.

import { get } from 'svelte/store';
import { measurementStore } from '../stores/measurements';
import { endpointStore } from '../stores/endpoints';
import { settingsStore } from '../stores/settings';
import { FreezeDetector } from '../utils/freeze-detector';
import { defaultWorkerFactory } from './worker-factory';
import type { WorkerFactory } from './worker-factory';
import type { Endpoint } from '../types';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../types';
import { isSafeProbeUrl } from '../utils/url-safety';

interface ManagedWorker {
  worker: Worker;
  endpointId: string;
}

export class MeasurementEngine {
  private workers: ManagedWorker[] = [];
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly freezeDetector: FreezeDetector;
  private readonly workerFactory: WorkerFactory;
  private roundBuffer: Map<number, WorkerToMainMessage[]> = new Map();
  private expectedResponses: number = 0;
  private flushTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private lastFlushedRound = -1;
  _paused = false;
  private _visibilityHandler: (() => void) | null = null;

  constructor(workerFactory?: WorkerFactory) {
    this.workerFactory = workerFactory ?? defaultWorkerFactory;
    this.freezeDetector = new FreezeDetector(() => get(measurementStore).roundCounter);
    this.freezeDetector.onFreeze((event) => {
      measurementStore.addFreezeEvent(event);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  start(): void {
    const currentState = get(measurementStore);
    if (currentState.lifecycle !== 'idle' && currentState.lifecycle !== 'stopped') {
      return;
    }

    // Step 1: increment epoch and transition lifecycle — always happens.
    measurementStore.incrementEpoch();
    measurementStore.setLifecycle('starting');

    // Preserve startedAt across stop/start cycles so elapsed time is cumulative.
    // Only set on first start (idle → running).
    if (currentState.lifecycle === 'idle') {
      measurementStore.setStartedAt(Date.now());
    }

    const endpoints = get(endpointStore).filter(ep => ep.enabled && isSafeProbeUrl(ep.url));

    // Only initialize endpoints that don't already have data — preserves
    // samples across stop/start cycles.
    for (const ep of endpoints) {
      if (!currentState.endpoints[ep.id]) {
        measurementStore.initEndpoint(ep.id);
      }
    }

    // Step 2: attempt Worker creation — may fail in restricted environments.
    try {
      this._spawnWorkers(endpoints);
      measurementStore.setLifecycle('running');
      this.freezeDetector.start();

      // Register visibility change handler to pause/resume when tab is hidden
      if (typeof document !== 'undefined') {
        this._visibilityHandler = () => this._handleVisibilityChange();
        document.addEventListener('visibilitychange', this._visibilityHandler);
      }

      // Dispatch the first round immediately (no delay for the very first round).
      this._dispatchRound();
    } catch (err: unknown) {
      console.error('[Chronoscope] Failed to start measurement workers:', err);
      measurementStore.setLifecycle('stopped');
    }
  }

  stop(): void {
    const lifecycle = get(measurementStore).lifecycle;
    if (lifecycle === 'idle') return;

    measurementStore.setLifecycle('stopping');

    // Remove visibility change listener
    if (this._visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this._paused = false;

    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    for (const { worker } of this.workers) {
      const stopMsg: MainToWorkerMessage = { type: 'stop' };
      try {
        worker.postMessage(stopMsg);
        worker.terminate();
      } catch {
        // Worker already dead — ignore.
      }
    }

    this.workers = [];

    // Clean up flush timers, round buffer, and flushed rounds tracking
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();
    this.roundBuffer.clear();
    this.lastFlushedRound = -1;
    this.expectedResponses = 0;

    this.freezeDetector.stop();
    measurementStore.setStoppedAt(Date.now());
    measurementStore.setLifecycle('stopped');
  }

  removeEndpoint(id: string): void {
    const idx = this.workers.findIndex(m => m.endpointId === id);
    if (idx !== -1) {
      const managed = this.workers[idx];
      if (!managed) return;
      const { worker } = managed;
      try {
        worker.postMessage({ type: 'stop' } satisfies MainToWorkerMessage);
        worker.terminate();
      } catch {
        // ignore
      }
      this.workers.splice(idx, 1);
    }
    measurementStore.removeEndpoint(id);
  }

  /**
   * Public for testing — processes a WorkerToMainMessage as if it arrived from
   * a real Worker. Bypasses Worker creation so jsdom tests can exercise the
   * message-handling logic directly.
   */
  _handleWorkerMessage(msg: WorkerToMainMessage): void {
    const currentEpoch = get(measurementStore).epoch;
    if (msg.epoch !== currentEpoch) return; // stale — discard

    const roundId = msg.roundId;

    // Discard orphaned responses for already-flushed rounds
    if (roundId <= this.lastFlushedRound) return;

    if (!this.roundBuffer.has(roundId)) {
      this.roundBuffer.set(roundId, []);
    }
    const buffer = this.roundBuffer.get(roundId);
    if (buffer) buffer.push(msg);

    // Flush when all expected responses arrive, or immediately if no dispatch
    // is tracking (e.g., direct _handleWorkerMessage calls in tests)
    const roundMessages = this.roundBuffer.get(roundId);
    if (this.expectedResponses === 0 || (roundMessages && roundMessages.length >= this.expectedResponses)) {
      this._flushRound(roundId);
    }
  }

  private _flushRound(roundId: number): void {
    const messages = this.roundBuffer.get(roundId) ?? [];
    this.roundBuffer.delete(roundId);

    // Mark this round as flushed to discard late-arriving orphaned responses
    this.lastFlushedRound = Math.max(this.lastFlushedRound, roundId);

    // Clear any pending flush timeout for this round
    if (this.flushTimers.has(roundId)) {
      const timer = this.flushTimers.get(roundId);
      if (timer !== undefined) clearTimeout(timer);
      this.flushTimers.delete(roundId);
    }

    // Filter out busy replies — worker was still processing the previous round.
    const actionable = messages.filter(msg => msg.type !== 'busy');

    // Still advance cadence even if no actionable responses arrived
    if (actionable.length === 0) {
      if (get(measurementStore).lifecycle === 'running') {
        this._scheduleNextRound();
      }
      return;
    }

    const timestamp = Date.now();
    const entries = actionable.map(msg => {
      switch (msg.type) {
        case 'result':
          return {
            endpointId: msg.endpointId,
            round: msg.roundId,
            latency: msg.timing.total,
            status: 'ok' as const,
            timestamp,
            tier2: msg.timing,
            ...(msg.timingFallback ? { timingFallback: true } : {}),
          };
        case 'timeout':
          return {
            endpointId: msg.endpointId,
            round: msg.roundId,
            latency: msg.timeoutValue,
            status: 'timeout' as const,
            timestamp,
          };
        case 'error':
          return {
            endpointId: msg.endpointId,
            round: msg.roundId,
            latency: 0,
            status: 'error' as const,
            timestamp,
            errorMessage: msg.message || msg.errorType,
          };
        // No default needed — 'busy' is filtered before this map.
        // TypeScript narrows msg to 'never' here, confirming exhaustiveness.
      }
    });

    measurementStore.addSamples(entries);

    // Response-gated: schedule next round only AFTER this round is fully flushed.
    // This prevents round overlap and self-inflicted network contention.
    if (get(measurementStore).lifecycle === 'running') {
      this._scheduleNextRound();
    }
  }

  // ── Visibility-aware pause/resume ─────────────────────────────────────────

  _pause(): void {
    if (this._paused) return;
    this._paused = true;
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  _resume(): void {
    if (!this._paused) return;
    this._paused = false;
    // Clear any orphaned roundTimer that _flushRound may have set during pause
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    this._scheduleNextRound();
  }

  _handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      this._pause();
    } else {
      this._resume();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _spawnWorkers(endpoints: Endpoint[]): void {
    this.workers = endpoints.map(ep => {
      // Uses the injected factory — allows test environments to substitute mock workers.
      const worker = this.workerFactory.create();
      worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
        // Inject the correct endpointId — the worker doesn't know its own ID,
        // it only sets endpointId to the URL as a placeholder.
        const msg = { ...event.data, endpointId: ep.id };
        this._handleWorkerMessage(msg);
      });
      return { worker, endpointId: ep.id };
    });
  }

  /** Number of rounds over which to ease from burst (0ms) to monitor delay. */
  private static readonly TRANSITION_ROUNDS = 10;

  /**
   * Three-phase cadence: burst (0ms) → ease-in transition → monitor (full delay).
   * The transition uses a quadratic ease-in so the rhythm feels smooth rather
   * than snapping from rapid-fire to one-second gaps.
   */
  private _scheduleNextRound(): void {
    const { burstRounds, monitorDelay } = get(settingsStore);
    const { roundCounter } = get(measurementStore);

    let delay: number;
    if (roundCounter < burstRounds) {
      // Burst phase: no delay
      delay = 0;
    } else {
      const roundsIntoCruise = roundCounter - burstRounds;
      if (roundsIntoCruise < MeasurementEngine.TRANSITION_ROUNDS) {
        // Transition: quadratic ease-in from 0 → monitorDelay
        const t = (roundsIntoCruise + 1) / MeasurementEngine.TRANSITION_ROUNDS;
        delay = Math.round(monitorDelay * t * t);
      } else {
        // Steady-state monitor
        delay = monitorDelay;
      }
    }

    this.roundTimer = setTimeout(() => this._dispatchRound(), delay);
  }

  _dispatchRound(): void {
    if (this._paused) return;

    const lifecycle = get(measurementStore).lifecycle;
    if (lifecycle !== 'running') return;

    const { timeout, corsMode, cap } = get(settingsStore);
    const { epoch, roundCounter } = get(measurementStore);

    if (cap > 0 && roundCounter >= cap) {
      measurementStore.setLifecycle('completed');
      return;
    }

    const endpoints = get(endpointStore).filter(ep => ep.enabled && isSafeProbeUrl(ep.url));

    // Count active workers for this round to know when the batch is complete
    const activeWorkers = this.workers.filter(m => endpoints.some(e => e.id === m.endpointId));
    this.expectedResponses = activeWorkers.length;

    // No workers to dispatch — skip this round entirely.
    if (activeWorkers.length === 0) {
      measurementStore.incrementRound();
      this._scheduleNextRound();
      return;
    }

    for (const managed of activeWorkers) {
      const ep = endpoints.find(e => e.id === managed.endpointId);
      if (!ep) continue;

      const msg: MainToWorkerMessage = {
        type: 'measure',
        url: ep.url,
        timeout,
        corsMode,
        epoch,
        roundId: roundCounter,
      };

      try {
        managed.worker.postMessage(msg);
      } catch (err: unknown) {
        console.error(`[Chronoscope] Worker for ${ep.url} failed:`, err);
        this.expectedResponses--;
      }
    }

    // Flush timeout for stragglers — derived from configured timeout plus margin.
    // Ensures the round doesn't hang forever if a worker dies, while not
    // dropping valid responses from slow endpoints.
    const flushDeadline = timeout + 500;
    this.flushTimers.set(roundCounter, setTimeout(() => {
      this._flushRound(roundCounter);
    }, flushDeadline));

    measurementStore.incrementRound();
    // NOTE: _scheduleNextRound() is NOT called here — it's called from
    // _flushRound() after all responses arrive (response-gated dispatch).
  }
}
