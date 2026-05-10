// src/lib/share/hash-router.ts
// Reads the URL hash on boot and hydrates stores from a share payload.
// Called once from App.svelte before any persistence restore.
//
// Security invariants (see issue #79 + tests/unit/share/hash-router.test.ts):
//   1. Cadence settings (timeout/delay/burstRounds/monitorDelay/cap/corsMode)
//      from a payload NEVER reach settingsStore. Receiver always probes at
//      their own defaults, even after accepting a shared config.
//   2. Config-mode payloads STAGE — they populate uiStore.pendingShare
//      instead of endpointStore. The receiver must call acceptPendingShare()
//      (wired to the staging banner's Accept button) before any URL lands in
//      the rail. Pre-fix, attacker URLs auto-loaded and one Start click
//      weaponized the browser.
//   3. Results-mode applies endpoints + samples for snapshot display
//      (read-only); the existing SharedResultsBanner gates the transition
//      back to running.

import { parseShareURL } from './share-manager';
import { endpointStore, MAX_ENDPOINTS } from '../stores/endpoints';
import { measurementStore } from '../stores/measurements';
import { remoteVantageStore } from '../stores/remote-vantage';
import { uiStore } from '../stores/ui';
import type {
  SharePayload,
  MeasurementSample,
  SampleStatus,
  Endpoint,
  SharedReportContext,
} from '../types';
import { tokens } from '../tokens';
import { get } from 'svelte/store';
import { displayLabel } from '../endpoint/displayLabel';
import { validateSharePayload } from './share-validator';

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
 * Dedupe by URL and cap at MAX_ENDPOINTS. Validation accepts duplicate URLs
 * (it only checks each entry individually), so a crafted payload could cause
 * Svelte's keyed `#each` block in the staging banner — or the rail — to
 * throw at runtime when it sees two children with the same key. Deduping
 * here makes "endpoints are unique" an invariant of every downstream
 * consumer.
 *
 * Dedupe key is lowercased: URL hosts are case-insensitive per RFC 3986,
 * so `https://Example.com/p` and `https://example.com/p` are the same
 * resource. Without normalization, mixed-case duplicates would pass
 * through and the user would see apparent duplicates in the rail. The
 * stored URL preserves the original case (we only normalize the key).
 */
function uniqueEndpoints(
  payloadEndpoints: readonly { url: string; enabled: boolean }[],
): { url: string; enabled: boolean }[] {
  const seen = new Set<string>();
  const out: { url: string; enabled: boolean }[] = [];
  for (const ep of payloadEndpoints) {
    const key = ep.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: ep.url, enabled: ep.enabled });
    if (out.length >= MAX_ENDPOINTS) break;
  }
  return out;
}

function buildEndpoints(
  payloadEndpoints: readonly { url: string; enabled: boolean }[],
): Endpoint[] {
  return uniqueEndpoints(payloadEndpoints).map((ep, i) => ({
    id: `shared-ep-${i}-${Date.now()}`,
    url: ep.url,
    enabled: ep.enabled,
    label: displayLabel({ url: ep.url }),
    color: pickColor(i),
  }));
}

function countResultSamples(results: NonNullable<SharePayload['results']>): number {
  let count = 0;
  for (const result of results) count += result.samples.length;
  return count;
}

function inferRoundCounter(results: NonNullable<SharePayload['results']>): number {
  let maxRound = 0;
  for (const result of results) {
    for (const sample of result.samples) {
      if (sample.round > maxRound) maxRound = sample.round;
    }
  }
  return maxRound;
}

function buildSharedReportContext(payload: SharePayload): SharedReportContext | null {
  if (payload.mode !== 'results' || !payload.results) return null;

  const keptSampleCount = countResultSamples(payload.results);
  if (payload.v === 2 && payload.report) {
    return {
      createdAt: payload.report.createdAt,
      healthThreshold: payload.report.healthThreshold,
      corsMode: payload.report.corsMode,
      roundCount: payload.report.roundCount,
      totalSampleCount: payload.report.totalSampleCount,
      keptSampleCount: payload.report.keptSampleCount,
      truncated: payload.report.truncated,
      sourceVersion: 2,
    };
  }

  return {
    createdAt: null,
    healthThreshold: null,
    corsMode: payload.settings.corsMode,
    roundCount: inferRoundCounter(payload.results),
    totalSampleCount: keptSampleCount,
    keptSampleCount,
    truncated: false,
    sourceVersion: 1,
  };
}

/**
 * Apply a decoded SharePayload.
 *
 * Config mode → stages in uiStore.pendingShare. Endpoints do NOT reach the
 * rail until acceptPendingShare() runs.
 *
 * Results mode → applies endpoints + measurement snapshot for read-only
 * display. Cadence settings are dropped on the floor.
 *
 * Returns the ordered list of endpoint IDs *materialized* (results mode
 * only). Config mode returns an empty list because nothing has been
 * applied yet.
 */
export function applySharePayload(payload: SharePayload): string[] {
  // Note the absence of any settingsStore write. Cadence from a payload is
  // attacker-controllable within the validated bounds (e.g. burstRounds=500,
  // timeout=100); applying it would amplify a future Start click. The
  // receiver always probes at their own defaults, full stop.
  if (payload.mode === 'config') {
    remoteVantageStore.setProbe(null);
    uiStore.setPendingShare({
      mode: 'config',
      endpoints: uniqueEndpoints(payload.endpoints),
    });
    uiStore.setSharedReportMode(false);
    uiStore.setSharedReportContext(null);
    return [];
  }

  // Results mode — read-only snapshot. Apply endpoints + samples directly so
  // the visualization renders; the SharedResultsBanner gates the transition
  // back to running.
  const endpoints = buildEndpoints(payload.endpoints);
  endpointStore.setEndpoints(endpoints);

  const ids = endpoints.map((ep) => ep.id);

  if (payload.results) {
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

    uiStore.setSharedReportContext(buildSharedReportContext(payload));
    uiStore.setSharedView(true);
    uiStore.setSharedReportMode(true);
    remoteVantageStore.setProbe(payload.remoteVantage ? { ...payload.remoteVantage, ok: true } : null);
  } else {
    uiStore.setSharedView(false);
    uiStore.setSharedReportMode(false);
    uiStore.setSharedReportContext(null);
    remoteVantageStore.setProbe(null);
  }

  return ids;
}

/**
 * Accept the staged config-mode share payload — moves the staged endpoints
 * into endpointStore (the rail) and clears the staging slot. No-op if no
 * payload is staged.
 *
 * Does NOT set isSharedView. That flag drives the read-only results banner;
 * once the user has accepted a config, they're back in normal interactive
 * mode (just with new endpoints), so showing a "Shared results — read
 * only" banner would be misleading.
 *
 * Cadence settings are NOT touched: the receiver runs at their own defaults.
 */
export function acceptPendingShare(): void {
  const pending = get(uiStore).pendingShare;
  if (!pending) return;
  endpointStore.setEndpoints(buildEndpoints(pending.endpoints));
  uiStore.clearPendingShare();
}

/**
 * Dismiss the staged share without applying. Rail / settings stay at the
 * receiver's own state.
 */
export function dismissPendingShare(): void {
  uiStore.clearPendingShare();
}

/**
 * Call once at app boot, before loadPersistedSettings.
 *
 * Returns the mode of the share that was processed, or null if no share URL
 * was present. The caller uses this to decide whether to load persisted
 * settings:
 *
 *   - `'results'` — stores have been mutated with the snapshot. Skip the
 *     persistence load to avoid clobbering it.
 *   - `'config'`  — stores are untouched (payload is staged in
 *     uiStore.pendingShare). Persistence MUST still load so the user sees
 *     their own endpoints / settings behind the staging banner.
 *   - `null`      — no share. Normal boot.
 */
export function initHashRouter(): 'config' | 'results' | null {
  if (typeof window === 'undefined') return null;

  const payload = parseShareURL(window.location.href);
  if (!payload) return null;

  applySharePayload(payload);

  // Clear the hash fragment to prevent re-processing on refresh
  // and avoid overwriting persisted settings with shared config.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  return payload.mode;
}

export async function initHostedReportRouter(fetcher: typeof fetch = fetch): Promise<'config' | 'results' | null> {
  if (typeof window === 'undefined') return null;

  const match = /^\/r\/([^/?#]+)\/?$/.exec(window.location.pathname);
  if (!match) return null;

  const id = match[1];
  if (!id) return null;

  try {
    const response = await fetcher(`/api/reports/${encodeURIComponent(id)}`, { method: 'GET' });
    if (!response.ok) return null;
    const body = await response.json() as unknown;
    if (body === null || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) return null;
    const payload = validateSharePayload((body as { payload?: unknown }).payload);
    if (!payload) return null;

    applySharePayload(payload);
    history.replaceState(null, '', `/${window.location.search}`);
    return payload.mode;
  } catch (error) {
    console.warn('[Chronoscope] Hosted report load failed:', error);
    return null;
  }
}
