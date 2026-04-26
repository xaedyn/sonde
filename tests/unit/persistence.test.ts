import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPersistedSettings,
  saveSettings,
  migrateSettings,
  clearPersistedSettings,
} from '../../src/lib/utils/persistence';
import type { PersistedSettings } from '../../src/lib/types';
import { MAX_CAP } from '../../src/lib/limits';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    _store: () => store,
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

const PRIMARY_KEY = 'chronoscope_settings';
const LEGACY_KEY = 'chronoscope_v2_settings';

describe('persistence', () => {
  beforeEach(() => { localStorageMock.clear(); });

  // ── First-visit / empty storage ───────────────────────────────────────────

  it('returns null when nothing is stored', () => {
    // AC #1 (empty path — no keys present, no clear needed)
    expect(loadPersistedSettings()).toBeNull();
    // No removeItem should have been called — keys were already absent
    expect(localStorageMock.getItem(PRIMARY_KEY)).toBeNull();
    expect(localStorageMock.getItem(LEGACY_KEY)).toBeNull();
  });

  // ── v10 round-trip ────────────────────────────────────────────────────────

  it('round-trips a v10 payload unchanged', () => {
    // AC #4: v10 round-trip
    const v10: PersistedSettings = {
      version: 10,
      endpoints: [{ url: 'https://a.example', enabled: true }],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 200,
      },
      ui: {
        expandedCards: ['ep-1'],
        activeView: 'diagnose',
        focusedEndpointId: 'ep-1',
        liveOptions: { split: true, timeRange: '15m' },
        terminalFilters: ['timeout', 'error'],
      },
    };
    saveSettings(v10);
    const loaded = loadPersistedSettings();
    // v10 payloads are migrated to v11 at load; endpoints gain nickname: undefined
    expect(loaded).toEqual({
      ...v10,
      version: 11,
      endpoints: v10.endpoints.map((ep) => ({ ...ep, nickname: undefined })),
    });
  });

  it('v10 payload with stray retired activeView coerces to overview', () => {
    // Edge case from spec: hand-edited v10 with e.g. 'atlas' uses allowlist fallback
    const bad = {
      version: 10,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'atlas', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(bad));
    const loaded = loadPersistedSettings();
    expect(loaded).not.toBeNull();
    expect(loaded?.ui.activeView).toBe('overview');
  });

  // ── Reset behavior: pre-v10 payloads → null + both keys cleared ──────────

  it('pre-v10 payload (version 9) → returns null AND both storage keys are cleared', () => {
    // AC #1, AC #3
    const v9 = {
      version: 9,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v9));
    const result = loadPersistedSettings();
    expect(result).toBeNull();
    // AC #3: both keys cleared on reject
    expect(localStorageMock.getItem(PRIMARY_KEY)).toBeNull();
    expect(localStorageMock.getItem(LEGACY_KEY)).toBeNull();
  });

  it('pre-v10 payload (version 1) → returns null AND both storage keys are cleared', () => {
    // AC #1: any version !== 10 resets
    const v1 = { version: 1, endpoints: [] };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v1));
    const result = loadPersistedSettings();
    expect(result).toBeNull();
    expect(localStorageMock.getItem(PRIMARY_KEY)).toBeNull();
    expect(localStorageMock.getItem(LEGACY_KEY)).toBeNull();
  });

  it('legacy key with pre-v10 payload → returns null AND both storage keys are cleared', () => {
    // AC #1, AC #3: legacy key present, primary absent, payload is v9
    const v9 = {
      version: 9,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(LEGACY_KEY, JSON.stringify(v9));
    const result = loadPersistedSettings();
    expect(result).toBeNull();
    // The legacy-migration path copies to primary then rejects; clearPersistedSettings removes both
    expect(localStorageMock.getItem(PRIMARY_KEY)).toBeNull();
    expect(localStorageMock.getItem(LEGACY_KEY)).toBeNull();
  });

  it('legacy key with v10 payload migrates to primary key and returns settings', () => {
    // Legacy key present with valid v10 data → primary key gets the value, legacy removed
    const v10: PersistedSettings = {
      version: 10,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(LEGACY_KEY, JSON.stringify(v10));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.version).toBe(11);
    expect(localStorageMock.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorageMock.getItem(PRIMARY_KEY)).not.toBeNull();
  });

  it('legacy key with v10 payload still loads when setItem throws (Safari private mode)', () => {
    // readRawPayload's migrate-to-primary writes are best-effort. A valid
    // legacy payload must still load for the session even if storage writes
    // throw — without this, a Safari private-mode user with legacy data
    // would be wiped instead of loaded.
    const v10: PersistedSettings = {
      version: 10,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(LEGACY_KEY, JSON.stringify(v10));
    const originalSet = localStorageMock.setItem;
    localStorageMock.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      const result = loadPersistedSettings();
      expect(result).not.toBeNull();
      expect(result?.version).toBe(11);
      expect(result?.endpoints[0]?.url).toBe('https://example.com');
    } finally {
      localStorageMock.setItem = originalSet;
    }
  });

  // ── Corrupt JSON → null + key cleared ────────────────────────────────────

  it('corrupt JSON under primary key → returns null AND key is cleared', () => {
    // AC #1, AC #3
    localStorageMock.setItem(PRIMARY_KEY, 'not-json{{{}}}');
    expect(() => loadPersistedSettings()).not.toThrow();
    const result = loadPersistedSettings();
    expect(result).toBeNull();
    expect(localStorageMock.getItem(PRIMARY_KEY)).toBeNull();
  });

  // ── migrateSettings contracts ─────────────────────────────────────────────

  it('migrateSettings: version 10 → returns normalised PersistedSettings', () => {
    // AC #2: migrateSettings accepts v10
    const v10 = {
      version: 10,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v10);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(11);
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
  });

  it('migrateSettings: unknown future version (99) → returns null', () => {
    // AC #4: unknown-version → null
    const future = {
      version: 99,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview' },
    };
    expect(migrateSettings(future)).toBeNull();
  });

  it('migrateSettings: missing version → returns null', () => {
    // AC #4: missing-version → null
    expect(migrateSettings({ endpoints: [] })).toBeNull();
  });

  it('migrateSettings: non-numeric version → returns null', () => {
    // AC #4: non-numeric-version → null
    expect(migrateSettings({ version: 'ten', endpoints: [] })).toBeNull();
  });

  it('migrateSettings: pre-v10 version (9) → returns null', () => {
    // AC #1: any version < 10 is rejected by migrateSettings
    const v9 = {
      version: 9,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    expect(migrateSettings(v9)).toBeNull();
  });

  it('migrateSettings: null input → returns null', () => {
    expect(migrateSettings(null)).toBeNull();
  });

  it('migrateSettings: non-object input → returns null', () => {
    expect(migrateSettings(42)).toBeNull();
    expect(migrateSettings('string')).toBeNull();
  });

  // ── v10 → v11 migration ───────────────────────────────────────────────────

  it('v10 → v11 migration: all v10 fields preserved, nickname undefined', () => {
    const v10 = {
      version: 10,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: ['ep-1'], activeView: 'diagnose', focusedEndpointId: 'ep-1', liveOptions: { split: true, timeRange: '15m' }, terminalFilters: ['timeout'] },
    };
    const result = migrateSettings(v10);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(11);
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.enabled).toBe(true);
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
    expect(result?.ui.activeView).toBe('diagnose');
    expect(result?.ui.expandedCards).toEqual(['ep-1']);
  });

  // ── v11 round-trip and nickname validation ────────────────────────────────

  it('v11 with valid nickname: round-trips intact', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: 'My Server' }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.version).toBe(11);
    expect(result?.endpoints[0]?.nickname).toBe('My Server');
  });

  it('v11 with nickname >80 chars: nickname stripped, endpoint kept', () => {
    const longNick = 'a'.repeat(81);
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: longNick }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v11 with bidi character (U+202E) in nickname: nickname stripped, endpoint kept', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: 'bad\u202Enick' }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v11 with control character (U+0000) in nickname: nickname stripped, endpoint kept', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: 'bad\u0000nick' }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v11 with zero-width char (U+200B) in nickname: nickname stripped, endpoint kept', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: 'zero\u200Bwidth' }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v11 with line-separator (U+2028) in nickname: nickname stripped, endpoint kept', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: 'line\u2028sep' }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v11 with non-string nickname: nickname stripped, endpoint kept', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: 42 }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v11 with whitespace-only nickname: nickname stripped, endpoint kept', () => {
    const v11 = {
      version: 11,
      endpoints: [{ url: 'https://example.com', enabled: true, nickname: '   ' }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v11));
    const result = loadPersistedSettings();
    expect(result).not.toBeNull();
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    expect(result?.endpoints[0]?.nickname).toBeUndefined();
  });

  it('v9 payload still returns null after v11 bump', () => {
    const v9 = {
      version: 9,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: MAX_CAP, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(v9));
    const result = loadPersistedSettings();
    expect(result).toBeNull();
  });

  // ── clearPersistedSettings ────────────────────────────────────────────────

  it('clearPersistedSettings removes both keys', () => {
    localStorageMock.setItem(PRIMARY_KEY, '{}');
    localStorageMock.setItem(LEGACY_KEY, '{}');
    clearPersistedSettings();
    expect(localStorageMock.getItem(PRIMARY_KEY)).toBeNull();
    expect(localStorageMock.getItem(LEGACY_KEY)).toBeNull();
  });

  it('loadPersistedSettings does not throw when localStorage.removeItem throws (Safari private mode)', () => {
    // AC #3: removeItem failure inside clearPersistedSettings must not propagate
    // Seed a pre-v10 payload so the clear-on-reject path is exercised.
    localStorageMock.setItem(PRIMARY_KEY, JSON.stringify({ version: 9, endpoints: [], settings: {}, ui: {} }));
    // Poison removeItem to simulate Safari private-mode SecurityError.
    const originalRemove = localStorageMock.removeItem;
    localStorageMock.removeItem = () => { throw new Error('SecurityError: storage is disabled'); };
    try {
      expect(() => loadPersistedSettings()).not.toThrow();
      expect(loadPersistedSettings()).toBeNull();
    } finally {
      localStorageMock.removeItem = originalRemove;
    }
  });
});

describe('persistence — cap clamping at parse boundary (AC2)', () => {
  // Values that survive JSON round-trip: use localStorage path
  it.each([
    { label: 'cap: 0 (legacy unlimited)', stored: 0, expected: MAX_CAP },
    { label: 'cap: -1 (negative)', stored: -1, expected: 1 },
    { label: 'cap: 99_999 (way above MAX_CAP)', stored: 99_999, expected: MAX_CAP },
    { label: 'cap: "abc" (string)', stored: 'abc', expected: MAX_CAP },
  ] as { label: string; stored: unknown; expected: number }[])(
    '$label → clamps to expected',
    ({ stored, expected }) => {
      const payload = {
        version: 11,
        endpoints: [],
        settings: {
          timeout: 5000,
          delay: 0,
          burstRounds: 50,
          monitorDelay: 1000,
          cap: stored,
          corsMode: 'no-cors',
          healthThreshold: 120,
        },
        ui: {
          expandedCards: [],
          activeView: 'overview',
          focusedEndpointId: null,
          liveOptions: { split: false, timeRange: '5m' },
          terminalFilters: [],
        },
      };
      localStorageMock.setItem(PRIMARY_KEY, JSON.stringify(payload));
      const result = loadPersistedSettings();
      expect(result).not.toBeNull();
      expect(result?.settings.cap).toBe(expected);
      expect(result?.settings.cap).toBeGreaterThanOrEqual(1);
      expect(result?.settings.cap).toBeLessThanOrEqual(MAX_CAP);
    }
  );

  // Values that do NOT survive JSON serialization (NaN/Infinity → null via JSON.stringify):
  // Bypass localStorage and call migrateSettings directly with in-memory record.
  // The AC's intent is to verify clamping; the JSON medium is irrelevant.
  it.each([
    { label: 'NaN (would disable engine check if returned)', cap: NaN },
    { label: 'Infinity', cap: Infinity },
    { label: '-Infinity', cap: -Infinity },
  ] as { label: string; cap: number }[])(
    'migrateSettings clamps $label to MAX_CAP (bypasses JSON to test non-serializable values)',
    ({ cap }) => {
      // migrateSettings is exported and accepts unknown; inject non-serializable cap directly
      const record = {
        version: 11,
        endpoints: [],
        settings: {
          timeout: 5000,
          delay: 0,
          burstRounds: 50,
          monitorDelay: 1000,
          cap,  // NaN / Infinity / -Infinity — not JSON-serializable
          corsMode: 'no-cors',
          healthThreshold: 120,
        },
        ui: {
          expandedCards: [],
          activeView: 'overview',
          focusedEndpointId: null,
          liveOptions: { split: false, timeRange: '5m' },
          terminalFilters: [],
        },
      };
      const result = migrateSettings(record);
      expect(result).not.toBeNull();
      expect(result?.settings.cap).toBe(MAX_CAP);
      expect(Number.isFinite(result?.settings.cap)).toBe(true);
    }
  );
});
