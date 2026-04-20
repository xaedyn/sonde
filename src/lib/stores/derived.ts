// src/lib/stores/derived.ts
// Derived stores that compose across primary stores. Centralizing these here
// keeps downstream views (chronograph dial, verdict strip, topbar status) from
// recomputing classify()/networkQuality() inline and drifting out of sync.

import { derived, type Readable } from 'svelte/store';
import { endpointStore } from './endpoints';
import { statisticsStore } from './statistics';
import { settingsStore } from './settings';
import { networkQuality } from '../utils/classify';
import type { Endpoint } from '../types';

/**
 * Endpoints currently being measured — i.e. `enabled === true`. Cross-phase
 * invariant: any user-facing aggregate (score, dial median, dial orbit ring,
 * triptych counts, racing-strip rows, event derivation, baseline window…) MUST
 * derive from this set, not from the raw `endpointStore`. The raw store is
 * still appropriate for chrome that explicitly lists every endpoint regardless
 * of status (e.g. the EndpointRail). See PATTERNS.md §3.
 */
export const monitoredEndpointsStore: Readable<readonly Endpoint[]> = derived(
  endpointStore,
  ($endpoints) => $endpoints.filter((ep) => ep.enabled),
);

/**
 * Aggregate 0–100 score across monitored endpoints — null until at least one
 * endpoint's statistics are `ready`. Drives the chronograph dial's main hand.
 */
export const networkQualityStore: Readable<number | null> = derived(
  [monitoredEndpointsStore, statisticsStore, settingsStore],
  ([$monitored, $stats, $settings]) => {
    const readyStats = $monitored
      .map((e) => $stats[e.id])
      .filter((s) => s !== undefined);
    return networkQuality(readyStats, $settings.healthThreshold);
  },
);
