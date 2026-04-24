// src/lib/share/hash-router.ts
// Reads the URL hash on boot and hydrates stores from a share payload.
// Called once from App.svelte before any persistence restore.

import { parseShareURL } from './share-manager';
import { endpointStore, MAX_ENDPOINTS } from '../stores/endpoints';
import { settingsStore } from '../stores/settings';
import { measurementStore } from '../stores/measurements';
import { uiStore } from '../stores/ui';
import { DEFAULT_SETTINGS } from '../types';
import type { SharePayload, MeasurementSample, SampleStatus, Endpoint } from '../types';
import { tokens } from '../tokens';

// Upper bound for the round counter materialized from a share payload.
// Matches the sample cap (10 000 per endpoint × 50 endpoints) with generous
// headroom — high enough that no legitimate payload hits it, low enough that
// downstream arithmetic stays well inside safe-integer range.
const MAX_SHARE_ROUND_COUNTER = 1_000_000;

function pickColor(index: number): string {
  const palette = tokens.color.endpoint;
  return palette[index % palette.length] ?? (tokens.color.endpoint[0] as string);
}

/**
 * Apply a decoded SharePayload to all relevant stores.
 * Returns the ordered list of endpoint IDs created.
 */
function applySharePayload(payload: SharePayload): string[] {
  // Build Endpoint objects from the stripped share format, capped to MAX_ENDPOINTS
  const capped = payload.endpoints.slice(0, MAX_ENDPOINTS);
  const endpoints: Endpoint[] = capped.map((ep, i) => ({
    id: `shared-ep-${i}-${Date.now()}`,
    url: ep.url,
    enabled: ep.enabled,
    label: ep.url,
    color: pickColor(i),
  }));

  endpointStore.setEndpoints(endpoints);
  // Explicit field copy — never spread an attacker-supplied object into
  // settingsStore. validateSharePayload only validates the 6 known fields;
  // a crafted payload can smuggle extras (region, healthThreshold, etc.)
  // that spread would silently apply.
  settingsStore.set({
    ...DEFAULT_SETTINGS,
    timeout: payload.settings.timeout,
    delay: DEFAULT_SETTINGS.delay,
    burstRounds: payload.settings.burstRounds ?? DEFAULT_SETTINGS.burstRounds,
    monitorDelay:
      payload.settings.monitorDelay ?? payload.settings.delay ?? DEFAULT_SETTINGS.monitorDelay,
    cap: payload.settings.cap,
    corsMode: payload.settings.corsMode,
  });

  const ids = endpoints.map((ep) => ep.id);

  if (payload.mode === 'results' && payload.results) {
    const results = payload.results.slice(0, MAX_ENDPOINTS);
    // Build a snapshot from the payload results — uses plain arrays, not SampleBuffer.
    // measurementStore.loadSnapshot() converts these to RingBuffers internally.
    const endpointsRecord: Record<string, {
      endpointId: string;
      samples: MeasurementSample[];
      lastLatency: number | null;
      lastStatus: SampleStatus | null;
      lastErrorMessage: string | null;
      tierLevel: 1 | 2;
    }> = {};

    ids.forEach((id, i) => {
      const epResults = results[i];
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
        // Plain array — loadSnapshot() converts to RingBuffer internally
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        samples: samples as any,
        lastLatency: lastSample?.latency ?? null,
        lastStatus: lastSample?.status ?? null,
        lastErrorMessage: null,
        tierLevel: 1,
      };
    });

    const snapshot = {
      lifecycle: 'completed' as const,
      epoch: 1,
      // Share payload carries attacker-controllable sample.round values.
      // Bound the counter so a crafted payload can't push it to MAX_SAFE_INTEGER
      // and break subsequent monotonicity / arithmetic assumptions.
      roundCounter: Math.min(
        Math.max(
          ...payload.results.map((r) =>
            r.samples.reduce((max, s) => Math.max(max, s.round), 0)
          ),
          0,
        ),
        MAX_SHARE_ROUND_COUNTER,
      ),
      endpoints: endpointsRecord,
      startedAt: null,
      stoppedAt: null,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 0,
    };

    measurementStore.loadSnapshot(snapshot);

    uiStore.setSharedView(true);
  } else {
    uiStore.setSharedView(false);
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

  // Clear the hash fragment to prevent re-processing on refresh
  // and avoid overwriting persisted settings with shared config.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  return true;
}
