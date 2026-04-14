// src/lib/stores/statistics.ts
// Derived store that recomputes per-endpoint statistics whenever
// the measurement store changes. Pure derived state — no side effects.

import { derived } from 'svelte/store';
import { measurementStore, incrementalLossCounter, getSortedBufferForEndpoint } from './measurements';
import { computeEndpointStatistics, computeEndpointStatisticsFromBuffer } from '../utils/statistics';
import type { StatisticsState, EndpointStatistics } from '../types';

// Per-endpoint memoization: compound cache key ${epoch}:${tailIndex}
// tailIndex never stalls at capacity (THE BET), epoch resets after loadSnapshot (B3 fix)
let cache: Record<string, { cacheKey: string; stats: EndpointStatistics }> = {};

export const statisticsStore = derived<typeof measurementStore, StatisticsState>(
  measurementStore,
  ($measurements) => {
    const result: StatisticsState = {};
    const nextCache: typeof cache = {};
    const epoch = $measurements.epoch;

    for (const [endpointId, endpointState] of Object.entries($measurements.endpoints)) {
      const tailIndex = endpointState.samples.tailIndex;
      const cacheKey = `${epoch}:${tailIndex}`;
      const cached = cache[endpointId];

      if (cached && cached.cacheKey === cacheKey) {
        // Cache key unchanged — reuse cached stats
        result[endpointId] = cached.stats;
        nextCache[endpointId] = cached;
      } else {
        // Recompute using buffer-based path when sorted buffer is available
        const sortedBuffer = getSortedBufferForEndpoint(endpointId);
        const lossCounts = incrementalLossCounter.getCounts(endpointId);
        let stats: EndpointStatistics;

        if (sortedBuffer.length > 0 || lossCounts.totalSamples > 0) {
          stats = computeEndpointStatisticsFromBuffer(
            endpointId,
            sortedBuffer,
            lossCounts,
            lossCounts.totalSamples,
            endpointState.samples,
          );
        } else {
          // Fallback for empty state
          stats = computeEndpointStatistics(endpointId, endpointState.samples.toArray());
        }

        result[endpointId] = stats;
        nextCache[endpointId] = { cacheKey, stats };
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
