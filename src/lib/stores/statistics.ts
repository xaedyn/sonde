// src/lib/stores/statistics.ts
// Derived store that recomputes per-endpoint statistics whenever
// the measurement store changes. Pure derived state — no side effects.

import { derived } from 'svelte/store';
import { measurementStore } from './measurements';
import { computeEndpointStatistics } from '../utils/statistics';
import type { StatisticsState, EndpointStatistics } from '../types';

// Per-endpoint memoization: only recompute when sample count changes
let cache: Record<string, { sampleCount: number; stats: EndpointStatistics }> = {};

export const statisticsStore = derived<typeof measurementStore, StatisticsState>(
  measurementStore,
  ($measurements) => {
    const result: StatisticsState = {};
    const nextCache: typeof cache = {};

    for (const [endpointId, endpointState] of Object.entries($measurements.endpoints)) {
      const sampleCount = endpointState.samples.length;
      const cached = cache[endpointId];

      if (cached && cached.sampleCount === sampleCount) {
        // Sample count unchanged — reuse cached stats
        result[endpointId] = cached.stats;
        nextCache[endpointId] = cached;
      } else {
        // Recompute
        const stats = computeEndpointStatistics(endpointId, endpointState.samples);
        result[endpointId] = stats;
        nextCache[endpointId] = { sampleCount, stats };
      }
    }

    cache = nextCache;
    return result;
  }
);

/** Reset the internal memoization cache. Used by tests. */
export function resetStatisticsCache(): void {
  cache = {};
}
