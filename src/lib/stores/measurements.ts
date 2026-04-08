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
} from '../types';

const INITIAL_STATE: MeasurementState = {
  lifecycle: 'idle',
  epoch: 0,
  roundCounter: 0,
  endpoints: {},
  startedAt: null,
  stoppedAt: null,
};

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
        const { [endpointId]: _removed, ...rest } = s.endpoints;
        return { ...s, endpoints: rest };
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

        return {
          ...s,
          endpoints: {
            ...s.endpoints,
            [endpointId]: {
              ...existing,
              samples: [...existing.samples, sample],
              lastLatency: latency,
              lastStatus: status,
              tierLevel,
            },
          },
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

    loadSnapshot(snapshot: MeasurementState): void {
      set({ ...snapshot });
    },

    reset(): void {
      set({ ...INITIAL_STATE });
    },
  };
}

export const measurementStore = createMeasurementStore();
