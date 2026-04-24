// src/lib/utils/persistence.ts
// Versioned localStorage persistence. v10 is the sole supported version.
// Payloads with any other version (including all prior v1–v9 builds) are
// rejected: both storage keys are cleared and the caller receives null,
// which triggers the first-install / region-aware defaults path in App.svelte.

import { DEFAULT_SETTINGS } from '../types';
import { isValidRegion } from '../regional-defaults';
import type {
  ActiveView,
  LiveTimeRange,
  PersistedSettings,
  Settings,
  TerminalEventType,
} from '../types';
import type { Region } from '../regional-defaults';

const STORAGE_KEY = 'chronoscope_settings'; // skipcq: JS-0860 — localStorage key, not a credential
const LEGACY_STORAGE_KEY = 'chronoscope_v2_settings'; // skipcq: JS-0860 — localStorage key, not a credential
export const CURRENT_VERSION = 10;

// Views valid at v10. Used by readActiveView to validate the persisted value.
const V10_VIEWS: ReadonlySet<string> = new Set<ActiveView>([
  'overview', 'live', 'diagnose', 'strata', 'terminal',
]);

const V10_TIME_RANGES: ReadonlySet<LiveTimeRange> = new Set<LiveTimeRange>([
  '1m', '5m', '15m', '1h', '24h',
]);

const V10_TERMINAL_EVENTS: ReadonlySet<TerminalEventType> = new Set<TerminalEventType>([
  'timeout', 'error', 'threshold_up', 'threshold_down',
  'freeze', 'endpoint_added', 'endpoint_removed', 'reuse_change',
]);

export function loadPersistedSettings(): PersistedSettings | null {
  try {
    const { raw, hadPayload } = readRawPayload();
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = migrateSettings(parsed);
    if (result === null && hadPayload) clearPersistedSettings();
    return result;
  } catch (err: unknown) {
    console.warn('[Chronoscope] Failed to load saved settings — using defaults:', err);
    clearPersistedSettings();
    return null;
  }
}

// Reads the persisted payload from primary key, falling back to the legacy
// key (and migrating it to primary on the fly). `hadPayload` tells the caller
// whether storage should be swept on a later reject — first-time visitors
// with empty storage leave it at false so no redundant removeItem runs.
function readRawPayload(): { raw: string | null; hadPayload: boolean } {
  const primary = localStorage.getItem(STORAGE_KEY);
  if (primary !== null) return { raw: primary, hadPayload: true };
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === null) return { raw: null, hadPayload: false };
  // Migrate to primary key best-effort. If either call throws (Safari private
  // mode, quota), still return the legacy payload so this session can load.
  try { localStorage.setItem(STORAGE_KEY, legacy); } catch { /* best-effort */ }
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* best-effort */ }
  return { raw: legacy, hadPayload: true };
}

export function saveSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err: unknown) {
    console.warn('[Chronoscope] Failed to save settings (storage full?):', err);
  }
}

export function clearPersistedSettings(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable — ignore */ }
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable — ignore */ }
}

export function migrateSettings(data: unknown): PersistedSettings | null {
  if (data === null || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const version = typeof record['version'] === 'number' ? record['version'] : 0;

  if (version === CURRENT_VERSION) return normalizeV10(record);

  // Unknown or pre-v10 version — return null (triggers first-install path).
  return null;
}

// ── v10 normalizer ────────────────────────────────────────────────────────────
// Reads and validates a v10 payload. Any field that fails validation falls back
// to a safe default. Returns null only if an unexpected exception is thrown.
function normalizeV10(record: Record<string, unknown>): PersistedSettings | null {
  try {
    const rawUi = asRecord(record['ui']) ?? {};
    const activeView = readActiveView(rawUi, V10_VIEWS);
    return {
      version: 10,
      endpoints: readEndpointsField(record),
      settings: readSettingsField(record),
      ui: {
        expandedCards:     readExpandedCards(rawUi),
        activeView,
        focusedEndpointId: readFocusedEndpointId(rawUi),
        liveOptions:       readLiveOptions(rawUi),
        terminalFilters:   readTerminalFilters(rawUi),
      },
    };
  } catch {
    return null;
  }
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readEndpointsField(record: Record<string, unknown>): { url: string; enabled: boolean }[] {
  const raw = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
  return raw
    .filter((e): e is Record<string, unknown> => asRecord(e) !== null)
    .map((e) => ({
      url: typeof e['url'] === 'string' ? e['url'] : '',
      enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
    }));
}

function readSettingsField(record: Record<string, unknown>): Settings {
  const raw = asRecord(record['settings']) ?? {};
  const region: Region | undefined = isValidRegion(raw['region']) ? raw['region'] : undefined;
  const corsMode =
    raw['corsMode'] === 'cors' || raw['corsMode'] === 'no-cors'
      ? raw['corsMode']
      : DEFAULT_SETTINGS.corsMode;
  return {
    timeout:         typeof raw['timeout']         === 'number' ? raw['timeout']         : DEFAULT_SETTINGS.timeout,
    delay:           typeof raw['delay']           === 'number' ? raw['delay']           : DEFAULT_SETTINGS.delay,
    burstRounds:     typeof raw['burstRounds']     === 'number' ? raw['burstRounds']     : DEFAULT_SETTINGS.burstRounds,
    monitorDelay:    typeof raw['monitorDelay']    === 'number' ? raw['monitorDelay']    : DEFAULT_SETTINGS.monitorDelay,
    cap:             typeof raw['cap']             === 'number' ? raw['cap']             : DEFAULT_SETTINGS.cap,
    healthThreshold: typeof raw['healthThreshold'] === 'number' ? raw['healthThreshold'] : DEFAULT_SETTINGS.healthThreshold,
    corsMode,
    ...(region !== undefined ? { region } : {}),
  };
}

function readExpandedCards(rawUi: Record<string, unknown>): string[] {
  return Array.isArray(rawUi['expandedCards'])
    ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
}

function readActiveView(
  rawUi: Record<string, unknown>,
  validViews: ReadonlySet<string>,
): ActiveView {
  const raw = rawUi['activeView'];
  if (typeof raw === 'string' && validViews.has(raw)) return raw as ActiveView;
  return 'overview';
}

function readFocusedEndpointId(rawUi: Record<string, unknown>): string | null {
  return typeof rawUi['focusedEndpointId'] === 'string' ? rawUi['focusedEndpointId'] : null;
}

function readLiveOptions(rawUi: Record<string, unknown>): { split: boolean; timeRange: LiveTimeRange } {
  const raw = asRecord(rawUi['liveOptions']);
  const split = raw !== null && typeof raw['split'] === 'boolean' ? raw['split'] : false;
  const candidate = raw?.['timeRange'];
  const timeRange: LiveTimeRange =
    typeof candidate === 'string' && V10_TIME_RANGES.has(candidate as LiveTimeRange)
      ? (candidate as LiveTimeRange)
      : '5m';
  return { split, timeRange };
}

function readTerminalFilters(rawUi: Record<string, unknown>): TerminalEventType[] {
  const raw = Array.isArray(rawUi['terminalFilters']) ? rawUi['terminalFilters'] : [];
  return (raw as unknown[]).filter(
    (x): x is TerminalEventType => typeof x === 'string' && V10_TERMINAL_EVENTS.has(x as TerminalEventType),
  );
}
