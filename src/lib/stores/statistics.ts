// src/lib/stores/statistics.ts
// Derived store that recomputes per-endpoint statistics whenever
// the measurement store changes. Pure derived state — no side effects.

import { derived } from 'svelte/store';
import { measurementStore } from './measurements';
import { computeEndpointStatistics } from '../utils/statistics';
import type { StatisticsState } from '../types';

export const statisticsStore = derived<typeof measurementStore, StatisticsState>(
  measurementStore,
  ($measurements) => {
    const result: StatisticsState = {};
    for (const [endpointId, endpointState] of Object.entries($measurements.endpoints)) {
      result[endpointId] = computeEndpointStatistics(endpointId, endpointState.samples);
    }
    return result;
  }
);
