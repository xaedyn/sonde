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
      update(s => ({
        ...s,
        endpoints: {
          ...s.endpoints,
          [endpointId]: {
            endpointId,
            samples: [],
            lastLatency: null,
            lastStatus: null,
            tierLevel: 1,
          },
        },
      }));
    },

    removeEndpoint(endpointId: string): void {
      update(s => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [endpointId]: _removed, ...rest } = s.endpoints;
        const { errorCount, timeoutCount } = recomputeCounts(rest);
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
      update(s => {
        const existing = s.endpoints[endpointId];
        if (!existing) return s;

        const sample: MeasurementSample = {
          round,
          latency,
          status,
          timestamp,
          ...(tier2 !== undefined ? { tier2 } : {}),
        };

        const tierLevel: 1 | 2 =
          tier2 !== undefined && (tier2.dnsLookup !== 0 || tier2.tcpConnect !== 0 || tier2.ttfb !== 0)
            ? 2
            : existing.tierLevel;

        // Mutable push — O(1) amortized instead of O(n) spread
        existing.samples.push(sample);

        const { errors, timeouts } = countDelta(status);

        return {
          ...s,
          errorCount: s.errorCount + errors,
          timeoutCount: s.timeoutCount + timeouts,
          endpoints: {
            ...s.endpoints,
            [endpointId]: {
              ...existing,
              lastLatency: latency,
              lastStatus: status,
              tierLevel,
            },
          },
        };
      });
    },

    addSamples(entries: Array<{
      endpointId: string;
      round: number;
      latency: number;
      status: SampleStatus;
      timestamp: number;
      tier2?: TimingPayload;
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
          };

          const tierLevel: 1 | 2 =
            entry.tier2 !== undefined && (entry.tier2.dnsLookup !== 0 || entry.tier2.tcpConnect !== 0 || entry.tier2.ttfb !== 0)
              ? 2
              : existing.tierLevel;

          // Insert in round order — almost always appends (O(1) typical),
          // but handles stragglers arriving after the next round flushed.
          const samples = existing.samples;
          const lastSample = samples[samples.length - 1];
          if (samples.length === 0 || sample.round >= (lastSample?.round ?? 0)) {
            samples.push(sample);
          } else {
            // Walk backward to find insertion point (usually 1-2 steps)
            let i = samples.length - 1;
            while (i > 0 && (samples[i - 1]?.round ?? 0) > sample.round) i--;
            samples.splice(i, 0, sample);
          }

          const { errors, timeouts } = countDelta(entry.status);
          errorDelta += errors;
          timeoutDelta += timeouts;

          // New endpoint object reference to trigger per-endpoint reactivity
          nextEndpoints[entry.endpointId] = {
            ...existing,
            lastLatency: entry.latency,
            lastStatus: entry.status,
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
      const { errorCount, timeoutCount } = recomputeCounts(snapshot.endpoints);
      set({ ...snapshot, errorCount, timeoutCount });
    },

    reset(): void {
      set({ ...INITIAL_STATE });
    },
  };
}

export const measurementStore = createMeasurementStore();
