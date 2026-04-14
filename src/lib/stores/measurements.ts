// src/lib/stores/measurements.ts
// Writable store for all measurement state. All mutations go through explicit
// methods to keep the update surface auditable.

import { writable } from 'svelte/store';
import type {
  MeasurementState,
  MeasurementSample,
  TestLifecycleState,
  SampleStatus,
  TimingPayload,
  FreezeEvent,
} from '../types';
import { RingBuffer, DEFAULT_RING_CAPACITY, proxyRingBuffer } from '../utils/ring-buffer';
import { IncrementalLossCounter } from '../utils/incremental-loss-counter';
import { SortedInsertionBuffer } from '../utils/sorted-insertion-buffer';
import { IncrementalTimestampTracker } from '../utils/incremental-timestamp-tracker';
import { sessionHistoryStore } from './session-history';

// ── Module-level singletons ────────────────────────────────────────────────
export const incrementalLossCounter = new IncrementalLossCounter();
export const incrementalTimestampTracker = new IncrementalTimestampTracker();
const sortedBuffers = new Map<string, SortedInsertionBuffer>();

function getSortedBuffer(endpointId: string): SortedInsertionBuffer {
  let buf = sortedBuffers.get(endpointId);
  if (!buf) {
    buf = new SortedInsertionBuffer();
    sortedBuffers.set(endpointId, buf);
  }
  return buf;
}

/** Public accessor for the sorted buffer of an endpoint. */
export function getSortedBufferForEndpoint(endpointId: string): SortedInsertionBuffer {
  return getSortedBuffer(endpointId);
}

const INITIAL_STATE: MeasurementState = {
  lifecycle: 'idle',
  epoch: 0,
  roundCounter: 0,
  endpoints: {},
  startedAt: null,
  stoppedAt: null,
  freezeEvents: [],
  errorCount: 0,
  timeoutCount: 0,
};

function countDelta(status: SampleStatus): { errors: number; timeouts: number } {
  return {
    errors: status === 'error' ? 1 : 0,
    timeouts: status === 'timeout' ? 1 : 0,
  };
}

function recomputeCounts(endpoints: MeasurementState['endpoints']): { errorCount: number; timeoutCount: number } {
  let errorCount = 0;
  let timeoutCount = 0;
  for (const ep of Object.values(endpoints)) {
    for (const sample of ep.samples) {
      if (sample.status === 'error') errorCount++;
      if (sample.status === 'timeout') timeoutCount++;
    }
  }
  return { errorCount, timeoutCount };
}

function createMeasurementStore() {
  const { subscribe, set, update } = writable<MeasurementState>({ ...INITIAL_STATE });

  return {
    subscribe,

    setLifecycle(lifecycle: TestLifecycleState): void {
      update(s => ({ ...s, lifecycle }));
    },

    incrementEpoch(): void {
      update(s => ({ ...s, epoch: s.epoch + 1 }));
    },

    initEndpoint(endpointId: string): void {
      update(s => {
        const rawRb = new RingBuffer<MeasurementSample>({ capacity: DEFAULT_RING_CAPACITY });
        rawRb.onEvict((evicted) => {
          sessionHistoryStore.accumulate(endpointId, evicted);
        });
        const rb = proxyRingBuffer(rawRb);

        return {
          ...s,
          endpoints: {
            ...s.endpoints,
            [endpointId]: {
              endpointId,
              samples: rb as unknown as import('../types').SampleBuffer,
              lastLatency: null,
              lastStatus: null,
              lastErrorMessage: null,
              tierLevel: 1,
            },
          },
        };
      });
    },

    removeEndpoint(endpointId: string): void {
      update(s => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [endpointId]: _removed, ...rest } = s.endpoints;
        const { errorCount, timeoutCount } = recomputeCounts(rest);
        sortedBuffers.delete(endpointId);
        incrementalLossCounter.removeEndpoint(endpointId);
        return { ...s, endpoints: rest, errorCount, timeoutCount };
      });
    },

    addSample(
      endpointId: string,
      round: number,
      latency: number,
      status: SampleStatus,
      timestamp: number,
      tier2?: TimingPayload
    ): void {
      this.addSamples([{
        endpointId,
        round,
        latency,
        status,
        timestamp,
        tier2,
      }]);
    },

    addSamples(entries: Array<{
      endpointId: string;
      round: number;
      latency: number;
      status: SampleStatus;
      timestamp: number;
      tier2?: TimingPayload;
      errorMessage?: string;
    }>): void {
      update(s => {
        // Clone the top-level endpoints map once to trigger reactivity
        const nextEndpoints = { ...s.endpoints };
        let errorDelta = 0;
        let timeoutDelta = 0;

        for (const entry of entries) {
          const existing = nextEndpoints[entry.endpointId];
          if (!existing) continue;

          const sample: MeasurementSample = {
            round: entry.round,
            latency: entry.latency,
            status: entry.status,
            timestamp: entry.timestamp,
            ...(entry.tier2 !== undefined ? { tier2: entry.tier2 } : {}),
            ...(entry.errorMessage !== undefined ? { errorMessage: entry.errorMessage } : {}),
          };

          const tierLevel: 1 | 2 =
            entry.tier2 !== undefined && (entry.tier2.dnsLookup !== 0 || entry.tier2.tcpConnect !== 0 || entry.tier2.ttfb !== 0)
              ? 2
              : existing.tierLevel;

          // Cast to RingBuffer for push/insertOrdered
          const rb = existing.samples as unknown as RingBuffer<MeasurementSample>;

          // Detect straggler: if sample round < newest round in buffer
          const lastRound = rb.back?.round;
          if (lastRound !== undefined && sample.round < lastRound) {
            rb.insertOrdered(sample, (existing) => sample.round < existing.round);
          } else {
            rb.push(sample);
          }

          // Update incremental loss counter
          incrementalLossCounter.addSamples([{ endpointId: entry.endpointId, status: entry.status }]);

          // Update sorted insertion buffer for ok samples
          if (entry.status === 'ok') {
            getSortedBuffer(entry.endpointId).insert(entry.latency);
          }

          // Update timestamp tracker
          incrementalTimestampTracker.processNewSamples(entry.endpointId, rb, rb.tailIndex);

          const { errors, timeouts } = countDelta(entry.status);
          errorDelta += errors;
          timeoutDelta += timeouts;

          // New endpoint object reference to trigger per-endpoint reactivity
          nextEndpoints[entry.endpointId] = {
            ...existing,
            lastLatency: entry.latency,
            lastStatus: entry.status,
            lastErrorMessage: entry.status === 'error' ? (entry.errorMessage ?? null) : null,
            tierLevel,
          };
        }

        return {
          ...s,
          errorCount: s.errorCount + errorDelta,
          timeoutCount: s.timeoutCount + timeoutDelta,
          endpoints: nextEndpoints,
        };
      });
    },

    incrementRound(): void {
      update(s => ({ ...s, roundCounter: s.roundCounter + 1 }));
    },

    setStartedAt(ts: number): void {
      update(s => ({ ...s, startedAt: ts }));
    },

    setStoppedAt(ts: number): void {
      update(s => ({ ...s, stoppedAt: ts }));
    },

    addFreezeEvent(event: FreezeEvent): void {
      update(s => ({ ...s, freezeEvents: [...s.freezeEvents, event] }));
    },

    loadSnapshot(snapshot: MeasurementState): void {
      // Reset ALL incremental state first
      incrementalLossCounter.reset();
      incrementalTimestampTracker.reset();
      sortedBuffers.clear();
      sessionHistoryStore.reset();

      // Rebuild endpoints with RingBuffers and incremental structures
      const nextEndpoints: MeasurementState['endpoints'] = {};

      for (const [endpointId, epState] of Object.entries(snapshot.endpoints)) {
        const rawRb = new RingBuffer<MeasurementSample>({ capacity: DEFAULT_RING_CAPACITY });
        rawRb.onEvict((evicted) => {
          sessionHistoryStore.accumulate(endpointId, evicted);
        });

        // Convert samples to array if needed (snapshot may have plain arrays)
        const samplesArray = Array.isArray(epState.samples)
          ? epState.samples
          : (epState.samples as unknown as RingBuffer<MeasurementSample>).toArray();

        // Load samples into ring buffer
        rawRb.loadFrom(samplesArray);
        const rb = proxyRingBuffer(rawRb);

        // Rebuild loss counter incrementally per endpoint (NOT loadFrom which clears on each call)
        incrementalLossCounter.addSamples(
          samplesArray.map(s => ({ endpointId, status: s.status }))
        );

        // Rebuild sorted buffer
        const sortedBuf = getSortedBuffer(endpointId);
        sortedBuf.loadFrom(
          samplesArray.filter(s => s.status === 'ok').map(s => s.latency)
        );

        // Rebuild timestamp tracker
        incrementalTimestampTracker.processNewSamples(endpointId, rawRb, rawRb.tailIndex);

        nextEndpoints[endpointId] = {
          ...epState,
          samples: rb as unknown as import('../types').SampleBuffer,
        };
      }

      const { errorCount, timeoutCount } = recomputeCounts(nextEndpoints);
      set({ ...snapshot, endpoints: nextEndpoints, errorCount, timeoutCount });
    },

    reset(): void {
      incrementalLossCounter.reset();
      incrementalTimestampTracker.reset();
      sortedBuffers.clear();
      sessionHistoryStore.reset();
      set({ ...INITIAL_STATE });
    },
  };
}

export const measurementStore = createMeasurementStore();
