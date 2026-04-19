// src/lib/utils/persistence.ts
// Versioned localStorage persistence with forward-only migration support.
//
// Migration chain: v1 → v2 → v3 → v4 → v5 → v6 → v7 → v8 (current). Each
// normalizeVN shapes a payload at version N; migrateSettings threads older
// payloads through the chain up to CURRENT_VERSION. Never re-read a newer
// version in an older build.
//
// Phase 7 (v6 → v7): retired the Lanes family of views. Any persisted
// `activeView` in {'lanes', 'timeline', 'heatmap', 'split'} collapses to
// 'overview'.
//
// v7 → v8 (this release): drops `settings.overviewMode`. The Classic dial
// has been retired; there is only one Overview mode now (the former
// "enriched"), so the toggle is no longer meaningful. stepV7toV8 is the only
// thing keeping a returning "classic" user from having an unused field
// linger in their persisted blob; it also debug-logs the drop so support
// can correlate a returning user's session.

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
export const CURRENT_VERSION = 8;

// v6/v7-era overview mode vocabulary. Retained as a literal set because the
// OverviewMode type has been removed from public Settings at v8 — these
// strings only live on in intermediate migration payloads, and the v7→v8
// step is the single point that drops the field entirely.
const V6_OVERVIEW_MODES: ReadonlySet<string> = new Set(['classic', 'enriched']);
type LegacyOverviewMode = 'classic' | 'enriched';

// v2-era labels that v5 rewrites to 'lanes' (the legacy escape hatch).
// Retained here because the v4→v5 step still performs that rewrite — v7
// then collapses 'lanes' itself in stepV6toV7 below.
const LEGACY_VIEWS: ReadonlySet<string> = new Set(['timeline', 'heatmap', 'split']);

// Views valid at the v5/v6 boundary (pre-Phase-7). Includes 'lanes' plus the
// three deprecated aliases since those survived in storage until the v7 step.
const V5_VIEWS: ReadonlySet<string> = new Set([
  'overview', 'live', 'atlas', 'strata', 'terminal', 'lanes',
  'timeline', 'heatmap', 'split',
]);

// Views valid at v7 (post-Phase-7). Lanes and its aliases are retired.
// Typed as string-set so the legacy intermediate activeView can be tested
// for membership without casts; all five values are still in ActiveView.
const V7_VIEWS: ReadonlySet<string> = new Set<ActiveView>([
  'overview', 'live', 'atlas', 'strata', 'terminal',
]);

// Views v7 treats as "legacy Lanes family" — rewritten to 'overview' on
// migration. A returning Lanes user lands on Overview rather than a stub.
const V7_LEGACY_LANES_VIEWS: ReadonlySet<string> = new Set([
  'lanes', 'timeline', 'heatmap', 'split',
]);

// Intermediate activeView type used inside the pre-v7 chain. The public
// ActiveView union no longer contains the Lanes family, but stages v4→v5,
// v5→v6, and the v6 shape may still carry those strings until stepV6toV7
// collapses them. Keeping this as a file-local widening avoids leaking the
// legacy strings into PersistedSettings consumers.
type LegacyActiveView = ActiveView | 'lanes' | 'timeline' | 'heatmap' | 'split';

// Intermediate Settings used inside the pre-v8 chain. v6/v7 payloads carry
// `overviewMode`; the public v8 Settings no longer has the field. stepV7toV8
// is the only boundary that drops it — before that point, intermediate
// shapes must be able to carry it so the debug-log has something to report.
type LegacySettings = Settings & { overviewMode?: LegacyOverviewMode };
interface LegacyPersistedSettings extends Omit<PersistedSettings, 'ui' | 'settings'> {
  readonly settings: LegacySettings;
  readonly ui: Omit<PersistedSettings['ui'], 'activeView'> & { activeView: LegacyActiveView };
}

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

  if (version === CURRENT_VERSION) return normalizeV8(record);

  if (version === 7) {
    const v7 = normalizeV7(record);
    return v7 ? stepV7toV8(v7) : null;
  }

  if (version === 6) {
    const v6 = normalizeV6(record);
    if (!v6) return null;
    const v7 = stepV6toV7(v6);
    return stepV7toV8(v7);
  }

  if (version === 5) {
    const v5 = normalizeV5(record);
    if (!v5) return null;
    const v6 = stepV5toV6(v5, record);
    const v7 = stepV6toV7(v6);
    return stepV7toV8(v7);
  }

  if (version === 4) {
    const v4 = normalizeV4(record);
    if (!v4) return null;
    const v5 = stepV4toV5(v4, record);
    const v6 = stepV5toV6(v5, record);
    const v7 = stepV6toV7(v6);
    return stepV7toV8(v7);
  }

  if (version === 3) {
    const v3 = normalizeV3(record);
    if (!v3) return null;
    const v4: LegacyPersistedSettings = {
      ...v3,
      version: 4,
      settings: { ...v3.settings, region: detectRegion() },
    };
    const v5 = stepV4toV5(v4, record);
    const v6 = stepV5toV6(v5, record);
    const v7 = stepV6toV7(v6);
    return stepV7toV8(v7);
  }

  if (version === 2) {
    const v2 = normalizeV2(record);
    if (!v2) return null;
    const oldDelay = v2.settings.delay;
    const v3: LegacyPersistedSettings = {
      ...v2,
      version: 3,
      settings: {
        ...v2.settings,
        delay: DEFAULT_SETTINGS.delay,
        burstRounds: DEFAULT_SETTINGS.burstRounds,
        monitorDelay: oldDelay >= 0 ? oldDelay : DEFAULT_SETTINGS.monitorDelay,
      },
    };
    const v4: LegacyPersistedSettings = {
      ...v3,
      version: 4,
      settings: { ...v3.settings, region: detectRegion() },
    };
    const v5 = stepV4toV5(v4, record);
    const v6 = stepV5toV6(v5, record);
    const v7 = stepV6toV7(v6);
    return stepV7toV8(v7);
  }

  if (version === 1) {
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    const v4: LegacyPersistedSettings = {
      version: 4,
      endpoints,
      settings: { ...DEFAULT_SETTINGS, region: detectRegion() },
      ui: { expandedCards: [], activeView: 'overview' },
    };
    const v5 = stepV4toV5(v4, record);
    const v6 = stepV5toV6(v5, record);
    const v7 = stepV6toV7(v6);
    return stepV7toV8(v7);
  }

  // Unknown version — return null (triggers first-install path). We deliberately
  // do NOT coerce through the current normalizer; that would silently drop
  // future shape changes we don't understand yet.
  return null;
}

// ── v7 → v8 step ─────────────────────────────────────────────────────────────
// Retires the Classic Overview dial. `settings.overviewMode` is dropped from
// the persisted payload because there is only one Overview layout now — the
// former "enriched" mode, renamed back to Overview. If the incoming payload
// had a mode set (which is every v6/v7 payload, since stepV5toV6 seeds it),
// debug-log the drop so support can correlate a returning Classic user's
// session. Payloads that never had the field (edge case) stay silent.
function stepV7toV8(v7: LegacyPersistedSettings): PersistedSettings {
  const droppedMode = v7.settings.overviewMode;
  if (droppedMode !== undefined) {
    console.debug(
      `[Chronoscope] v8 migration: settings.overviewMode '${droppedMode}' retired; Overview is now a single layout.`,
    );
  }
  // Strip the field. Explicit destructure + ignore preserves every other
  // Settings property and keeps the drop auditable at a glance.
  const { overviewMode: _dropped, ...cleanSettings } = v7.settings;
  void _dropped;
  // Narrow activeView: stepV6toV7 already collapsed the Lanes family to
  // 'overview', so any incoming value must be in V7_VIEWS. Re-check defensively
  // and fall through to 'overview' for a corrupt/hand-edited payload.
  const incomingView = v7.ui.activeView;
  const activeView: ActiveView = V7_VIEWS.has(incomingView) ? (incomingView as ActiveView) : 'overview';
  return {
    version: 8,
    endpoints: v7.endpoints,
    settings: cleanSettings,
    ui: { ...v7.ui, activeView },
  };
}

// ── v6 → v7 step ─────────────────────────────────────────────────────────────
// Retires the Lanes family. Any activeView in {'lanes','timeline','heatmap',
// 'split'} becomes 'overview'. Anything already in V7_VIEWS passes through.
// Anything unknown also becomes 'overview' (same coercion policy as earlier
// steps). Debug-logs the conversion so a returning Lanes user's session
// leaves a breadcrumb without being noisy for modern payloads. Returns
// LegacyPersistedSettings so `settings.overviewMode` survives into stepV7toV8.
function stepV6toV7(v6: LegacyPersistedSettings): LegacyPersistedSettings {
  const incoming = v6.ui.activeView;
  let activeView: LegacyActiveView = 'overview';
  if (V7_VIEWS.has(incoming)) {
    activeView = incoming;
  } else if (V7_LEGACY_LANES_VIEWS.has(incoming)) {
    // Intentional data loss: a user on a Lanes-family view lands on Overview
    // in v7 because the Lanes view has been removed from the app. No
    // Lanes-specific Settings fields exist in this codebase, so there is
    // nothing else to drop. Log at debug so support can correlate if needed.
    console.debug(
      `[Chronoscope] Phase 7 migration: activeView '${incoming}' retired; reset to 'overview'.`,
    );
  }
  return {
    ...v6,
    version: 7,
    ui: { ...v6.ui, activeView },
  };
}

// ── v5 → v6 step ─────────────────────────────────────────────────────────────
// Seeds Settings.overviewMode. Accepts a forward-written overviewMode if
// present (e.g. a future patch or a debug tool wrote one into a v5 payload);
// otherwise defaults to 'classic'. Any garbage type coerces to 'classic' so
// the app never reads an invalid mode.
function stepV5toV6(v5: LegacyPersistedSettings, rawRecord: Record<string, unknown>): LegacyPersistedSettings {
  const rawSettings =
    rawRecord['settings'] !== null && typeof rawRecord['settings'] === 'object'
      ? (rawRecord['settings'] as Record<string, unknown>)
      : {};
  const raw = rawSettings['overviewMode'];
  const overviewMode: LegacyOverviewMode =
    typeof raw === 'string' && V6_OVERVIEW_MODES.has(raw)
      ? (raw as LegacyOverviewMode)
      : 'classic';
  return {
    ...v5,
    version: 6,
    settings: { ...v5.settings, overviewMode },
  };
}

// ── v4 → v5 step ─────────────────────────────────────────────────────────────
// Seeds healthThreshold + new UI fields, rewrites deprecated activeView values
// to 'lanes', and coerces unknown activeView strings to the v5 default.
function stepV4toV5(v4: LegacyPersistedSettings, rawRecord: Record<string, unknown>): LegacyPersistedSettings {
  const rawUi =
    rawRecord['ui'] !== null && typeof rawRecord['ui'] === 'object'
      ? (rawRecord['ui'] as Record<string, unknown>)
      : {};

  // activeView: read from the raw payload so normalizeV4's placeholder doesn't
  // mask unknown strings — those should become the v5 default ('overview'),
  // not be silently rewritten to 'lanes'. 'lanes' here is an intermediate
  // LegacyActiveView; stepV6toV7 collapses it to 'overview' at the v7 boundary.
  const rawView = typeof rawUi['activeView'] === 'string' ? rawUi['activeView'] : '';
  const activeView: LegacyActiveView = LEGACY_VIEWS.has(rawView)
    ? 'lanes'
    : V5_VIEWS.has(rawView)
      ? (rawView as LegacyActiveView)
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
// normalizeV5 is a linear assembly of per-field helpers so the function itself
// stays under the CC threshold DeepSource flags. Each helper is file-local and
// exercised end-to-end through the normalizeV5 tests; they're the narrow,
// type-aware extractors that insulate the main function from validation noise.

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

// v8+ reader — returns the clean Settings shape (no overviewMode).
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

// Legacy reader — preserves `overviewMode` on its return so pre-v8 stages
// (normalizeV5/V6/V7) can carry the field forward. stepV7toV8 reads it off
// the payload to produce the debug-log breadcrumb, then drops it.
function readLegacySettingsField(record: Record<string, unknown>): LegacySettings {
  const base = readSettingsField(record);
  const raw = asRecord(record['settings']) ?? {};
  const overviewModeRaw = raw['overviewMode'];
  const overviewMode: LegacyOverviewMode | undefined =
    typeof overviewModeRaw === 'string' && V6_OVERVIEW_MODES.has(overviewModeRaw)
      ? (overviewModeRaw as LegacyOverviewMode)
      : undefined;
  return overviewMode === undefined ? base : { ...base, overviewMode };
}

function readExpandedCards(rawUi: Record<string, unknown>): string[] {
  return Array.isArray(rawUi['expandedCards'])
    ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
}

function readActiveView(
  rawUi: Record<string, unknown>,
  validViews: ReadonlySet<string>,
): LegacyActiveView {
  const raw = rawUi['activeView'];
  if (typeof raw === 'string' && validViews.has(raw)) return raw as LegacyActiveView;
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
    typeof candidate === 'string' && V5_TIME_RANGES.has(candidate as LiveTimeRange)
      ? (candidate as LiveTimeRange)
      : '5m';
  return { split, timeRange };
}

function readTerminalFilters(rawUi: Record<string, unknown>): TerminalEventType[] {
  const raw = Array.isArray(rawUi['terminalFilters']) ? rawUi['terminalFilters'] : [];
  return (raw as unknown[]).filter(
    (x): x is TerminalEventType => typeof x === 'string' && V5_TERMINAL_EVENTS.has(x as TerminalEventType),
  );
}

function normalizeV5(record: Record<string, unknown>): LegacyPersistedSettings | null {
  try {
    const rawUi = asRecord(record['ui']) ?? {};
    return {
      version: 5,
      endpoints: readEndpointsField(record),
      // v5 didn't actually ship overviewMode; the legacy reader just skips it
      // if absent. stepV5toV6 sets the default 'classic' forward.
      settings: readLegacySettingsField(record),
      ui: {
        expandedCards:     readExpandedCards(rawUi),
        // v5 accepts the Lanes family; the v7 step collapses them later.
        activeView:        readActiveView(rawUi, V5_VIEWS),
        focusedEndpointId: readFocusedEndpointId(rawUi),
        liveOptions:       readLiveOptions(rawUi),
        terminalFilters:   readTerminalFilters(rawUi),
      },
    };
  } catch {
    return null;
  }
}

// v6 shape mirrors v5 exactly on the ui side; the only delta is Settings gains
// `overviewMode`. Legacy reader carries it through; stepV7toV8 drops it.
function normalizeV6(record: Record<string, unknown>): LegacyPersistedSettings | null {
  try {
    const rawUi = asRecord(record['ui']) ?? {};
    return {
      version: 6,
      endpoints: readEndpointsField(record),
      settings: readLegacySettingsField(record),
      ui: {
        expandedCards:     readExpandedCards(rawUi),
        activeView:        readActiveView(rawUi, V5_VIEWS),
        focusedEndpointId: readFocusedEndpointId(rawUi),
        liveOptions:       readLiveOptions(rawUi),
        terminalFilters:   readTerminalFilters(rawUi),
      },
    };
  } catch {
    return null;
  }
}

// v7 mirrors v6 on the Settings side; the only delta is the narrower view set
// (V7_VIEWS, which excludes the Lanes family). Returns LegacyPersistedSettings
// because v7 payloads still carry `settings.overviewMode` — stepV7toV8 is the
// boundary that drops it.
function normalizeV7(record: Record<string, unknown>): LegacyPersistedSettings | null {
  try {
    const rawUi = asRecord(record['ui']) ?? {};
    return {
      version: 7,
      endpoints: readEndpointsField(record),
      settings: readLegacySettingsField(record),
      ui: {
        expandedCards:     readExpandedCards(rawUi),
        activeView:        readActiveView(rawUi, V7_VIEWS),
        focusedEndpointId: readFocusedEndpointId(rawUi),
        liveOptions:       readLiveOptions(rawUi),
        terminalFilters:   readTerminalFilters(rawUi),
      },
    };
  } catch {
    return null;
  }
}

// v8 is the public shape — `settings` has no overviewMode, activeView is
// narrow. The single new Settings delta is the absence of the Classic dial
// toggle. A stray 'classic'/'enriched' value in a hand-edited v8 payload is
// simply ignored (readSettingsField doesn't read it).
function normalizeV8(record: Record<string, unknown>): PersistedSettings | null {
  try {
    const rawUi = asRecord(record['ui']) ?? {};
    const view = readActiveView(rawUi, V7_VIEWS);
    const activeView: ActiveView = V7_VIEWS.has(view) ? (view as ActiveView) : 'overview';
    return {
      version: 8,
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

// ── Legacy normalizers (v2/v3/v4) ────────────────────────────────────────────
// Each produces a payload tagged with its own version; migrateSettings threads
// them forward. healthThreshold defaults are seeded here so downstream steps
// can treat Settings as fully-formed.

function normalizeV2(record: Record<string, unknown>): LegacyPersistedSettings | null {
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

    // Placeholder — stepV4toV5 re-reads the raw payload to derive the real
    // v5 activeView, so this value is never read downstream. 'overview' is
    // in-union post-Phase-7.
    const activeView: ActiveView = 'overview';

    return { version: 2, endpoints, settings, ui: { expandedCards, activeView } };
  } catch {
    return null;
  }
}

function normalizeV3(record: Record<string, unknown>): LegacyPersistedSettings | null {
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

    // Placeholder — stepV4toV5 re-reads the raw payload to derive the real
    // v5 activeView, so this value is never read downstream.
    const activeView: ActiveView = 'overview';

    return { version: 3, endpoints, settings, ui: { expandedCards, activeView } };
  } catch {
    return null;
  }
}

function normalizeV4(record: Record<string, unknown>): LegacyPersistedSettings | null {
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

    // Placeholder — stepV4toV5 re-reads the raw payload to derive the real
    // v5 activeView, so this value is never read downstream.
    const activeView: ActiveView = 'overview';

    return { version: 4, endpoints, settings, ui: { expandedCards, activeView } };
  } catch {
    return null;
  }
}
