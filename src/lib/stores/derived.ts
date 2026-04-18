// src/lib/stores/derived.ts
// Derived stores that compose across primary stores. Centralizing these here
// keeps downstream views (chronograph dial, verdict strip, topbar status) from
// recomputing classify()/networkQuality() inline and drifting out of sync.

import { derived, type Readable } from 'svelte/store';
import { endpointStore } from './endpoints';
import { statisticsStore } from './statistics';
import { settingsStore } from './settings';
import { networkQuality } from '../utils/classify';

/**
 * Aggregate 0–100 score across all enabled endpoints — null until at least one
 * endpoint's statistics are `ready`. Subscribed by Topbar status and the
 * chronograph dial's main hand.
 */
export const networkQualityStore: Readable<number | null> = derived(
  [endpointStore, statisticsStore, settingsStore],
  ([$endpoints, $stats, $settings]) => {
    const readyStats = $endpoints
      .filter((e) => e.enabled)
      .map((e) => $stats[e.id])
      .filter((s) => s !== undefined);
    return networkQuality(readyStats, $settings.healthThreshold);
  },
);
