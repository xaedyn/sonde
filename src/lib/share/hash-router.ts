// src/lib/share/hash-router.ts
// Reads the URL hash on boot and hydrates stores from a share payload.
// Called once from App.svelte before any persistence restore.

import { parseShareURL } from './share-manager';
import { endpointStore } from '../stores/endpoints';
import { settingsStore } from '../stores/settings';
import { measurementStore } from '../stores/measurements';
import { uiStore } from '../stores/ui';
import type { SharePayload, MeasurementState, Endpoint } from '../types';
import { tokens } from '../tokens';

function pickColor(index: number): string {
  const palette = tokens.color.endpoint;
  return palette[index % palette.length] ?? '#4a90d9';
}

/**
 * Apply a decoded SharePayload to all relevant stores.
 * Returns the ordered list of endpoint IDs created.
 */
export function applySharePayload(payload: SharePayload): string[] {
  // Build Endpoint objects from the stripped share format
  const endpoints: Endpoint[] = payload.endpoints.map((ep, i) => ({
    id: `shared-ep-${i}-${Date.now()}`,
    url: ep.url,
    enabled: ep.enabled,
    label: ep.url,
    color: pickColor(i),
  }));

  endpointStore.setEndpoints(endpoints);
  settingsStore.set(payload.settings);

  const ids = endpoints.map((ep) => ep.id);

  if (payload.mode === 'results' && payload.results) {
    // Build a MeasurementState snapshot from the payload results
    const endpointsRecord: MeasurementState['endpoints'] = {};

    ids.forEach((id, i) => {
      const epResults = payload.results![i];
      const samples = (epResults?.samples ?? []).map((s) => ({
        round: s.round,
        latency: s.latency,
        status: s.status,
        timestamp: 0, // not stored in share payload
        ...(s.tier2 ? { tier2: s.tier2 } : {}),
      }));

      const lastSample = samples[samples.length - 1];

      endpointsRecord[id] = {
        endpointId: id,
        samples,
        lastLatency: lastSample?.latency ?? null,
        lastStatus: lastSample?.status ?? null,
        tierLevel: 1,
      };
    });

    const snapshot: MeasurementState = {
      lifecycle: 'completed',
      epoch: 1,
      roundCounter: Math.max(...payload.results.map((r) => r.samples.length), 0),
      endpoints: endpointsRecord,
      startedAt: null,
      stoppedAt: null,
      freezeEvents: [],
    };

    measurementStore.loadSnapshot(snapshot);

    uiStore.setSharedView(true, Date.now());
  } else {
    uiStore.setSharedView(false, null);
  }

  return ids;
}

/**
 * Call once at app boot, before loadPersistedSettings.
 * Returns true if a share URL was successfully processed — the caller should
 * skip its own localStorage restore in that case.
 */
export function initHashRouter(): boolean {
  if (typeof window === 'undefined') return false;

  const payload = parseShareURL(window.location.href);
  if (!payload) return false;

  applySharePayload(payload);
  return true;
}
