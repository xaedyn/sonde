// src/lib/utils/persistence.ts
// Versioned localStorage persistence with forward-only migration support.
//
// Migration chain: v1 → v2 → v3 → v4 → v5 (current). Each normalizeVN shapes a
// payload at version N; migrateSettings threads older payloads through the
// chain up to CURRENT_VERSION. Never re-read a newer version in an older build.

import { DEFAULT_SETTINGS } from '../types';
import { detectRegion, isValidRegion } from '../regional-defaults';
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
const CURRENT_VERSION = 5;

// v2-era labels that v5 rewrites to 'lanes' (the legacy escape hatch).
const LEGACY_VIEWS: ReadonlySet<string> = new Set(['timeline', 'heatmap', 'split']);

const V5_VIEWS: ReadonlySet<ActiveView> = new Set<ActiveView>([
  'overview', 'live', 'atlas', 'strata', 'terminal', 'lanes',
  // Deprecated but still valid on the union until Phase 7 removes them.
  'timeline', 'heatmap', 'split',
]);

const V5_TIME_RANGES: ReadonlySet<LiveTimeRange> = new Set<LiveTimeRange>([
  '1m', '5m', '15m', '1h', '24h',
]);

const V5_TERMINAL_EVENTS: ReadonlySet<TerminalEventType> = new Set<TerminalEventType>([
  'timeout', 'error', 'threshold_up', 'threshold_down',
  'freeze', 'endpoint_added', 'endpoint_removed', 'reuse_change',
]);

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

  if (version === CURRENT_VERSION) return normalizeV5(record);

  if (version === 4) {
    const v4 = normalizeV4(record);
    return v4 ? stepV4toV5(v4, record) : null;
  }

  if (version === 3) {
    const v3 = normalizeV3(record);
    if (!v3) return null;
    const v4: PersistedSettings = {
      ...v3,
      version: 4,
      settings: { ...v3.settings, region: detectRegion() },
    };
    return stepV4toV5(v4, record);
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
    return stepV4toV5(v4, record);
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
      ui: { expandedCards: [], activeView: 'split' as ActiveView },
    };
    return stepV4toV5(v4, record);
  }

  // Unknown version — return null (triggers first-install path). We deliberately
  // do NOT coerce through the current normalizer; that would silently drop
  // future shape changes we don't understand yet.
  return null;
}

// ── v4 → v5 step ─────────────────────────────────────────────────────────────
// Seeds healthThreshold + new UI fields, rewrites deprecated activeView values
// to 'lanes', and coerces unknown activeView strings to the v5 default.
function stepV4toV5(v4: PersistedSettings, rawRecord: Record<string, unknown>): PersistedSettings {
  const rawUi =
    rawRecord['ui'] !== null && typeof rawRecord['ui'] === 'object'
      ? (rawRecord['ui'] as Record<string, unknown>)
      : {};

  // activeView: read from the raw payload so normalizeV4's 'split' fallback
  // doesn't mask unknown strings — those should become the v5 default
  // ('overview'), not be silently rewritten to 'lanes'.
  const rawView = typeof rawUi['activeView'] === 'string' ? rawUi['activeView'] : '';
  const activeView: ActiveView = LEGACY_VIEWS.has(rawView)
    ? 'lanes'
    : V5_VIEWS.has(rawView as ActiveView)
      ? (rawView as ActiveView)
      : 'overview';

  // focusedEndpointId — v4 never had this. Accept a string if present; else null.
  const rawFocus = rawUi['focusedEndpointId'];
  const focusedEndpointId = typeof rawFocus === 'string' ? rawFocus : null;

  // liveOptions — seed defaults. Accept well-typed partial if present.
  const rawLiveOpts =
    rawUi['liveOptions'] !== null && typeof rawUi['liveOptions'] === 'object'
      ? (rawUi['liveOptions'] as Record<string, unknown>)
      : undefined;
  const split =
    rawLiveOpts && typeof rawLiveOpts['split'] === 'boolean' ? rawLiveOpts['split'] : false;
  const timeRangeCandidate = rawLiveOpts?.['timeRange'];
  const timeRange: LiveTimeRange =
    typeof timeRangeCandidate === 'string' && V5_TIME_RANGES.has(timeRangeCandidate as LiveTimeRange)
      ? (timeRangeCandidate as LiveTimeRange)
      : '5m';

  // terminalFilters — seed empty array; filter any unknown entries.
  const rawFilters = Array.isArray(rawUi['terminalFilters']) ? rawUi['terminalFilters'] : [];
  const terminalFilters = (rawFilters as unknown[]).filter(
    (x): x is TerminalEventType => typeof x === 'string' && V5_TERMINAL_EVENTS.has(x as TerminalEventType),
  );

  return {
    version: 5,
    endpoints: v4.endpoints,
    settings: {
      ...v4.settings,
      healthThreshold:
        typeof v4.settings.healthThreshold === 'number'
          ? v4.settings.healthThreshold
          : DEFAULT_SETTINGS.healthThreshold,
    },
    ui: {
      expandedCards: v4.ui.expandedCards,
      activeView,
      focusedEndpointId,
      liveOptions: { split, timeRange },
      terminalFilters,
    },
  };
}

// ── v5 normalizer ────────────────────────────────────────────────────────────
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

    const settings: Settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay: typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold:
        typeof rawSettings['healthThreshold'] === 'number'
          ? rawSettings['healthThreshold']
          : DEFAULT_SETTINGS.healthThreshold,
      ...(region !== undefined ? { region } : {}),
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const rawView = rawUi['activeView'];
    const activeView: ActiveView =
      typeof rawView === 'string' && V5_VIEWS.has(rawView as ActiveView)
        ? (rawView as ActiveView)
        : 'overview';

    const rawFocus = rawUi['focusedEndpointId'];
    const focusedEndpointId = typeof rawFocus === 'string' ? rawFocus : null;

    const rawLiveOpts =
      rawUi['liveOptions'] !== null && typeof rawUi['liveOptions'] === 'object'
        ? (rawUi['liveOptions'] as Record<string, unknown>)
        : undefined;
    const split =
      rawLiveOpts && typeof rawLiveOpts['split'] === 'boolean' ? rawLiveOpts['split'] : false;
    const timeRangeCandidate = rawLiveOpts?.['timeRange'];
    const timeRange: LiveTimeRange =
      typeof timeRangeCandidate === 'string' && V5_TIME_RANGES.has(timeRangeCandidate as LiveTimeRange)
        ? (timeRangeCandidate as LiveTimeRange)
        : '5m';

    const rawFilters = Array.isArray(rawUi['terminalFilters']) ? rawUi['terminalFilters'] : [];
    const terminalFilters = (rawFilters as unknown[]).filter(
      (x): x is TerminalEventType => typeof x === 'string' && V5_TERMINAL_EVENTS.has(x as TerminalEventType),
    );

    return {
      version: 5,
      endpoints,
      settings,
      ui: {
        expandedCards,
        activeView,
        focusedEndpointId,
        liveOptions: { split, timeRange },
        terminalFilters,
      },
    };
  } catch {
    return null;
  }
}

// ── Legacy normalizers (v2/v3/v4) ────────────────────────────────────────────
// Each produces a payload tagged with its own version; migrateSettings threads
// them forward. healthThreshold defaults are seeded here so downstream steps
// can treat Settings as fully-formed.

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

    const settings: Settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: DEFAULT_SETTINGS.burstRounds,
      monitorDelay: DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold: DEFAULT_SETTINGS.healthThreshold,
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

    const settings: Settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay: typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      healthThreshold: DEFAULT_SETTINGS.healthThreshold,
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

    const settings: Settings = {
      timeout: typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay: typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay: typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
      // v4 storage never wrote healthThreshold; default is seeded forward.
      healthThreshold:
        typeof rawSettings['healthThreshold'] === 'number'
          ? rawSettings['healthThreshold']
          : DEFAULT_SETTINGS.healthThreshold,
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
