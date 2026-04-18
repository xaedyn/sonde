// src/lib/utils/persistence.ts
// Versioned localStorage persistence with forward-only migration support.

import { DEFAULT_HEALTH_THRESHOLD, DEFAULT_SETTINGS } from '../types';
import { detectRegion, isValidRegion } from '../regional-defaults';
import type { ActiveView, LiveTimeRange, PersistedSettings, TerminalEventType } from '../types';
import type { Region } from '../regional-defaults';

const STORAGE_KEY = 'chronoscope_settings'; // skipcq: JS-0860 — localStorage key, not a credential
const LEGACY_STORAGE_KEY = 'chronoscope_v2_settings'; // skipcq: JS-0860 — localStorage key, not a credential
const CURRENT_VERSION = 5;

// ── v5 constants ─────────────────────────────────────────────────────────
const V2_ACTIVE_VIEWS = new Set<string>(['timeline', 'heatmap', 'split']);
const V5_ACTIVE_VIEWS = new Set<ActiveView>([
  'overview', 'live', 'atlas', 'strata', 'terminal', 'lanes',
  'timeline', 'heatmap', 'split',
]);
const VALID_TIME_RANGES = new Set<LiveTimeRange>(['1m', '5m', '15m', '1h', '24h']);
const VALID_TERMINAL_EVENTS = new Set<TerminalEventType>([
  'timeout', 'error', 'threshold_up', 'threshold_down',
  'freeze', 'endpoint_added', 'endpoint_removed', 'reuse_change',
]);

function clampHealthThreshold(value: unknown, timeout: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_HEALTH_THRESHOLD;
  }
  if (value >= timeout) return Math.max(1, timeout - 1);
  return value;
}

function sanitizeActiveView(raw: unknown): ActiveView {
  if (typeof raw !== 'string') return 'lanes';
  if (V2_ACTIVE_VIEWS.has(raw)) return 'lanes';
  if (V5_ACTIVE_VIEWS.has(raw as ActiveView)) return raw as ActiveView;
  return 'lanes';
}

export function loadPersistedSettings(): PersistedSettings | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw !== null) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return migrateSettings(parsed);
  } catch (err: unknown) {
    console.warn('[Chronoscope] Failed to load saved settings — using defaults:', err);
    return null;
  }
}

export function saveSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err: unknown) {
    console.warn('[Chronoscope] Failed to save settings (storage full?):', err);
  }
}

export function clearPersistedSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function migrateSettings(data: unknown): PersistedSettings | null {
  if (data === null || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const version = typeof record['version'] === 'number' ? record['version'] : 0;

  if (version === CURRENT_VERSION) {
    return normalizeV5(record);
  }

  if (version === 4) {
    const v4 = normalizeV4(record);
    if (!v4) return null;
    return upgradeToV5(v4, record);
  }

  if (version === 3) {
    const v3 = normalizeV3(record);
    if (!v3) return null;
    const v4: PersistedSettings = {
      ...v3,
      version: 4,
      settings: { ...v3.settings, region: detectRegion() },
    };
    return upgradeToV5(v4, record);
  }

  if (version === 2) {
    const v2 = normalizeV2(record);
    if (!v2) return null;
    const oldDelay = v2.settings.delay;
    const v3: PersistedSettings = {
      ...v2,
      version: 3,
      settings: {
        ...v2.settings,
        delay: DEFAULT_SETTINGS.delay,
        burstRounds: DEFAULT_SETTINGS.burstRounds,
        monitorDelay: oldDelay >= 0 ? oldDelay : DEFAULT_SETTINGS.monitorDelay,
      },
    };
    const v4: PersistedSettings = {
      ...v3,
      version: 4,
      settings: { ...v3.settings, region: detectRegion() },
    };
    return upgradeToV5(v4, record);
  }

  if (version === 1) {
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    const v4: PersistedSettings = {
      version: 4,
      endpoints,
      settings: { ...DEFAULT_SETTINGS, region: detectRegion() },
      ui: {
        expandedCards: [],
        activeView: 'split' as ActiveView,
      },
    };
    return upgradeToV5(v4, record);
  }

  // Unknown version — return null (triggers first-install path).
  // Spec §5: we deliberately do NOT coerce unknown versions through normalizeV5,
  // because that silently drops shape changes to existing fields.
  return null;
}

/**
 * Shared v4 → v5 upgrade. Pulls optional v5-only fields off the raw record (so a
 * user who opened a future build and was downgraded doesn't lose their data),
 * but relies on defaults otherwise.
 */
function upgradeToV5(v4: PersistedSettings, raw: Record<string, unknown>): PersistedSettings {
  const rawSettings =
    raw['settings'] !== null && typeof raw['settings'] === 'object'
      ? (raw['settings'] as Record<string, unknown>)
      : {};
  const rawUi =
    raw['ui'] !== null && typeof raw['ui'] === 'object'
      ? (raw['ui'] as Record<string, unknown>)
      : {};

  const healthThreshold = clampHealthThreshold(rawSettings['healthThreshold'], v4.settings.timeout);

  return {
    ...v4,
    version: 5,
    settings: { ...v4.settings, healthThreshold },
    ui: {
      expandedCards: v4.ui.expandedCards,
      activeView: sanitizeActiveView(v4.ui.activeView),
      focusedEndpointId: parseFocusedEndpointId(rawUi['focusedEndpointId']),
      liveOptions: parseLiveOptions(rawUi['liveOptions']),
      terminalFilters: parseTerminalFilters(rawUi['terminalFilters']),
    },
  };
}

function parseFocusedEndpointId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

function parseLiveOptions(raw: unknown): { split: boolean; timeRange: LiveTimeRange } {
  const defaults = { split: false, timeRange: '5m' as LiveTimeRange };
  if (raw === null || typeof raw !== 'object') return defaults;
  const r = raw as Record<string, unknown>;
  const timeRange = VALID_TIME_RANGES.has(r['timeRange'] as LiveTimeRange)
    ? (r['timeRange'] as LiveTimeRange)
    : defaults.timeRange;
  return {
    split: typeof r['split'] === 'boolean' ? r['split'] : defaults.split,
    timeRange,
  };
}

function parseTerminalFilters(raw: unknown): TerminalEventType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is TerminalEventType => VALID_TERMINAL_EVENTS.has(x as TerminalEventType));
}

function normalizeV2(record: Record<string, unknown>): PersistedSettings | null {
  try {
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    const rawSettings =
      record['settings'] !== null && typeof record['settings'] === 'object'
        ? (record['settings'] as Record<string, unknown>)
        : {};

    const settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: DEFAULT_SETTINGS.burstRounds,
      monitorDelay: DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold: DEFAULT_HEALTH_THRESHOLD,
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const activeView: ActiveView =
      rawUi['activeView'] === 'timeline' || rawUi['activeView'] === 'heatmap' || rawUi['activeView'] === 'split'
        ? rawUi['activeView']
        : 'split';

    return { version: 2, endpoints, settings, ui: { expandedCards, activeView } };
  } catch {
    return null;
  }
}

function normalizeV3(record: Record<string, unknown>): PersistedSettings | null {
  try {
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    const rawSettings =
      record['settings'] !== null && typeof record['settings'] === 'object'
        ? (record['settings'] as Record<string, unknown>)
        : {};

    const settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay: typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold: DEFAULT_HEALTH_THRESHOLD,
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const activeView: ActiveView =
      rawUi['activeView'] === 'timeline' || rawUi['activeView'] === 'heatmap' || rawUi['activeView'] === 'split'
        ? rawUi['activeView']
        : 'split';

    return { version: 3, endpoints, settings, ui: { expandedCards, activeView } };
  } catch {
    return null;
  }
}

function normalizeV4(record: Record<string, unknown>): PersistedSettings | null {
  try {
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    const rawSettings =
      record['settings'] !== null && typeof record['settings'] === 'object'
        ? (record['settings'] as Record<string, unknown>)
        : {};

    const rawRegion: unknown = rawSettings['region'];
    const region: Region | undefined = isValidRegion(rawRegion) ? rawRegion : undefined;

    const settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay: typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold: DEFAULT_HEALTH_THRESHOLD,
      ...(region !== undefined ? { region } : {}),
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const activeView: ActiveView =
      rawUi['activeView'] === 'timeline' || rawUi['activeView'] === 'heatmap' || rawUi['activeView'] === 'split'
        ? rawUi['activeView']
        : 'split';

    return { version: 4, endpoints, settings, ui: { expandedCards, activeView } };
  } catch {
    return null;
  }
}

function normalizeV5(record: Record<string, unknown>): PersistedSettings | null {
  try {
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    const rawSettings =
      record['settings'] !== null && typeof record['settings'] === 'object'
        ? (record['settings'] as Record<string, unknown>)
        : {};

    const rawRegion: unknown = rawSettings['region'];
    const region: Region | undefined = isValidRegion(rawRegion) ? rawRegion : undefined;

    const timeout = typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout;

    const settings = {
      timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay: typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold: clampHealthThreshold(rawSettings['healthThreshold'], timeout),
      ...(region !== undefined ? { region } : {}),
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    return {
      version: 5,
      endpoints,
      settings,
      ui: {
        expandedCards,
        activeView: sanitizeActiveView(rawUi['activeView']),
        focusedEndpointId: parseFocusedEndpointId(rawUi['focusedEndpointId']),
        liveOptions: parseLiveOptions(rawUi['liveOptions']),
        terminalFilters: parseTerminalFilters(rawUi['terminalFilters']),
      },
    };
  } catch {
    return null;
  }
}
