// src/lib/utils/persistence.ts
// Versioned localStorage persistence with forward-only migration support.

import { DEFAULT_SETTINGS } from '../types';
import type { PersistedSettings, ActiveView } from '../types';

const STORAGE_KEY = 'sonde_v2_settings';
const CURRENT_VERSION = 3;

export function loadPersistedSettings(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return migrateSettings(parsed);
  } catch {
    return null;
  }
}

export function saveSettings(settings: PersistedSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearPersistedSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function migrateSettings(data: unknown): PersistedSettings | null {
  if (data === null || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const version = typeof record['version'] === 'number' ? record['version'] : 0;

  if (version === CURRENT_VERSION) {
    return normalizeV3(record);
  }

  if (version === 2) {
    // v2 → v3: add burstRounds + monitorDelay, migrate delay
    const v2 = normalizeV2(record);
    if (!v2) return null;
    const oldDelay = v2.settings.delay;
    return {
      ...v2,
      version: 3,
      settings: {
        ...v2.settings,
        delay: DEFAULT_SETTINGS.delay,
        burstRounds: DEFAULT_SETTINGS.burstRounds,
        monitorDelay: oldDelay > 0 ? oldDelay : DEFAULT_SETTINGS.monitorDelay,
      },
    };
  }

  if (version === 1) {
    // v1 → v2 → v3: add ui object, normalize settings, then migrate to v3
    const rawEndpoints = Array.isArray(record['endpoints']) ? record['endpoints'] : [];
    const endpoints = rawEndpoints
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        url: typeof e['url'] === 'string' ? e['url'] : '',
        enabled: typeof e['enabled'] === 'boolean' ? e['enabled'] : true,
      }));

    return {
      version: 3,
      endpoints,
      settings: { ...DEFAULT_SETTINGS },
      ui: {
        expandedCards: [],
        activeView: 'split' as ActiveView,
      },
    };
  }

  return null;
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
      timeout:
        typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay:
        typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds: DEFAULT_SETTINGS.burstRounds,
      monitorDelay: DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const activeView: ActiveView =
      rawUi['activeView'] === 'timeline' ||
      rawUi['activeView'] === 'heatmap' ||
      rawUi['activeView'] === 'split'
        ? rawUi['activeView']
        : 'split';

    return {
      version: 2,
      endpoints,
      settings,
      ui: { expandedCards, activeView },
    };
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
      timeout:
        typeof rawSettings['timeout'] === 'number' ? rawSettings['timeout'] : DEFAULT_SETTINGS.timeout,
      delay:
        typeof rawSettings['delay'] === 'number' ? rawSettings['delay'] : DEFAULT_SETTINGS.delay,
      burstRounds:
        typeof rawSettings['burstRounds'] === 'number' ? rawSettings['burstRounds'] : DEFAULT_SETTINGS.burstRounds,
      monitorDelay:
        typeof rawSettings['monitorDelay'] === 'number' ? rawSettings['monitorDelay'] : DEFAULT_SETTINGS.monitorDelay,
      cap: typeof rawSettings['cap'] === 'number' ? rawSettings['cap'] : DEFAULT_SETTINGS.cap,
      corsMode:
        rawSettings['corsMode'] === 'cors' || rawSettings['corsMode'] === 'no-cors'
          ? rawSettings['corsMode']
          : DEFAULT_SETTINGS.corsMode,
    };

    const rawUi =
      record['ui'] !== null && typeof record['ui'] === 'object'
        ? (record['ui'] as Record<string, unknown>)
        : {};

    const expandedCards = Array.isArray(rawUi['expandedCards'])
      ? (rawUi['expandedCards'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const activeView: ActiveView =
      rawUi['activeView'] === 'timeline' ||
      rawUi['activeView'] === 'heatmap' ||
      rawUi['activeView'] === 'split'
        ? rawUi['activeView']
        : 'split';

    return {
      version: 3,
      endpoints,
      settings,
      ui: { expandedCards, activeView },
    };
  } catch {
    return null;
  }
}
