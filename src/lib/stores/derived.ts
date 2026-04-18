// src/lib/stores/derived.ts
// Cross-store derived values. Kept out of individual store modules so each
// store stays a simple `writable`; composite reads live here.

import { derived } from 'svelte/store';
import { endpointStore } from './endpoints';
import { settingsStore } from './settings';
import { statisticsStore } from './statistics';
import { networkQuality } from '../utils/classify';

/**
 * Aggregate 0–100 network-health score, driven by every enabled endpoint's
 * rolling stats. OverviewView's chronograph hand and the Topbar status chip
 * MUST subscribe to this rather than recomputing `networkQuality()` inline —
 * that is the alignment rule called out in `06-implementation-plan.md`.
 *
 * Returns `null` while no endpoint is ready yet (dial shows "No data").
 */
export const networkQualityStore = derived(
  [endpointStore, statisticsStore, settingsStore],
  ([$endpoints, $statistics, $settings]) => {
    const enabled = $endpoints.filter((e) => e.enabled);
    const statsList = enabled.map((e) => $statistics[e.id]);
    return networkQuality(statsList, $settings.healthThreshold);
  },
);
