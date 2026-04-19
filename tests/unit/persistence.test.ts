import { describe, it, expect, beforeEach } from 'vitest';
import { loadPersistedSettings, saveSettings, migrateSettings } from '../../src/lib/utils/persistence';
import type { PersistedSettings } from '../../src/lib/types';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('persistence', () => {
  beforeEach(() => { localStorageMock.clear(); });

  it('returns null when nothing is stored', () => {
    expect(loadPersistedSettings()).toBeNull();
  });

  it('round-trips v3 settings into current v6 shape', () => {
    const settings = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    saveSettings(settings as unknown as PersistedSettings);
    const loaded = loadPersistedSettings();
    expect(loaded?.version).toBe(6);
    expect(loaded?.endpoints[0]?.url).toBe('https://example.com');
    expect(loaded?.settings.burstRounds).toBe(50);
    expect(loaded?.settings.monitorDelay).toBe(1000);
    expect(loaded?.settings.healthThreshold).toBe(120);
    // v5→v6 seeds overviewMode; default is 'classic' until Enriched is promoted.
    expect(loaded?.settings.overviewMode).toBe('classic');
  });

  it('returns null for corrupt data', () => {
    localStorageMock.setItem('chronoscope_settings', 'not-json{{{}}}');
    expect(() => loadPersistedSettings()).not.toThrow();
    expect(loadPersistedSettings()).toBeNull();
  });

  it('migrates legacy storage key to new key', () => {
    const settings = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    localStorageMock.setItem('chronoscope_v2_settings', JSON.stringify(settings));
    const loaded = loadPersistedSettings();
    expect(loaded?.version).toBe(6);
    expect(localStorageMock.getItem('chronoscope_v2_settings')).toBeNull();
    expect(localStorageMock.getItem('chronoscope_settings')).not.toBeNull();
  });

  it('migrates v1 data all the way to v6', () => {
    const v1Data = { version: 1, endpoints: [{ url: 'https://example.com' }] };
    const migrated = migrateSettings(v1Data);
    expect(migrated?.version).toBe(6);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.monitorDelay).toBe(1000);
    expect(migrated?.settings.healthThreshold).toBe(120);
    expect(migrated?.settings.overviewMode).toBe('classic');
    expect(migrated?.ui.activeView).toBe('overview');
  });

  it('migrates v2 data to v6 with old delay as monitorDelay', () => {
    const v2Data = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const migrated = migrateSettings(v2Data);
    expect(migrated?.version).toBe(6);
    expect(migrated?.settings.monitorDelay).toBe(500);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.delay).toBe(0);
    expect(migrated?.settings.healthThreshold).toBe(120);
    expect(migrated?.settings.overviewMode).toBe('classic');
    expect(migrated?.ui.activeView).toBe('lanes');
  });

  describe('v4 → v5 → v6 migration (chain)', () => {
    it('seeds healthThreshold default + overviewMode on a real v4 payload', () => {
      const v4: unknown = {
        version: 4,
        endpoints: [{ url: 'https://cloudflare-dns.com', enabled: true }],
        settings: {
          timeout: 5000,
          delay: 0,
          burstRounds: 50,
          monitorDelay: 1000,
          cap: 0,
          corsMode: 'no-cors',
          region: 'north-america',
        },
        ui: { expandedCards: ['ep-1'], activeView: 'split' },
      };
      const migrated = migrateSettings(v4);
      expect(migrated?.version).toBe(6);
      expect(migrated?.settings.healthThreshold).toBe(120);
      expect(migrated?.settings.overviewMode).toBe('classic');
      expect(migrated?.settings.region).toBe('north-america');
    });

    it('rewrites deprecated activeView values to "lanes"', () => {
      for (const view of ['timeline', 'heatmap', 'split'] as const) {
        const v4 = {
          version: 4,
          endpoints: [],
          settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
          ui: { expandedCards: [], activeView: view },
        };
        const migrated = migrateSettings(v4);
        expect(migrated?.ui.activeView).toBe('lanes');
      }
    });

    it('seeds focusedEndpointId as null, liveOptions defaults, empty terminalFilters', () => {
      const v4 = {
        version: 4,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
        ui: { expandedCards: [], activeView: 'split' },
      };
      const migrated = migrateSettings(v4);
      expect(migrated?.ui.focusedEndpointId).toBeNull();
      expect(migrated?.ui.liveOptions).toEqual({ split: false, timeRange: '5m' });
      expect(migrated?.ui.terminalFilters).toEqual([]);
    });

    it('preserves expandedCards through migration', () => {
      const v4 = {
        version: 4,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
        ui: { expandedCards: ['a', 'b'], activeView: 'split' },
      };
      const migrated = migrateSettings(v4);
      expect(migrated?.ui.expandedCards).toEqual(['a', 'b']);
    });

    it('coerces an unknown activeView value to the default "overview"', () => {
      const v4 = {
        version: 4,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
        ui: { expandedCards: [], activeView: 'garbage-string' },
      };
      const migrated = migrateSettings(v4);
      expect(migrated?.ui.activeView).toBe('overview');
    });
  });

  describe('v5 → v6 migration', () => {
    it('seeds overviewMode=classic on a real v5 payload, preserves everything else', () => {
      const v5: unknown = {
        version: 5,
        endpoints: [{ url: 'https://a.example', enabled: true }],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 180,
          region: 'europe',
        },
        ui: {
          expandedCards: ['ep-1'],
          activeView: 'overview',
          focusedEndpointId: 'ep-9',
          liveOptions: { split: true, timeRange: '15m' },
          terminalFilters: ['timeout'],
        },
      };
      const migrated = migrateSettings(v5);
      expect(migrated?.version).toBe(6);
      expect(migrated?.settings.overviewMode).toBe('classic');
      // Existing v5 fields survive intact.
      expect(migrated?.settings.healthThreshold).toBe(180);
      expect(migrated?.settings.region).toBe('europe');
      expect(migrated?.ui.activeView).toBe('overview');
      expect(migrated?.ui.focusedEndpointId).toBe('ep-9');
      expect(migrated?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
      expect(migrated?.ui.terminalFilters).toEqual(['timeout']);
      expect(migrated?.ui.expandedCards).toEqual(['ep-1']);
    });

    it('preserves an existing overviewMode value when present on v5 (forward-compat guard)', () => {
      // Defensive: if a future/debug tool injected overviewMode into a v5
      // payload, the migration should carry the value forward rather than
      // overwrite with the default.
      const v5 = {
        version: 5,
        endpoints: [],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
          overviewMode: 'enriched',
        },
        ui: { expandedCards: [], activeView: 'overview' },
      };
      const migrated = migrateSettings(v5);
      expect(migrated?.settings.overviewMode).toBe('enriched');
    });

    it('coerces a garbage overviewMode value to the default "classic"', () => {
      const v5 = {
        version: 5,
        endpoints: [],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
          overviewMode: 'not-a-real-mode',
        },
        ui: { expandedCards: [], activeView: 'overview' },
      };
      const migrated = migrateSettings(v5);
      expect(migrated?.settings.overviewMode).toBe('classic');
    });
  });

  describe('v6 pass-through', () => {
    it('round-trips a v6 payload unchanged (already current)', () => {
      const v6: PersistedSettings = {
        version: 6,
        endpoints: [{ url: 'https://a.example', enabled: true }],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 200,
          overviewMode: 'enriched',
        },
        ui: {
          expandedCards: [],
          activeView: 'overview',
          focusedEndpointId: 'ep-1',
          liveOptions: { split: true, timeRange: '15m' },
          terminalFilters: ['timeout', 'error'],
        },
      };
      saveSettings(v6);
      const loaded = loadPersistedSettings();
      expect(loaded).toEqual(v6);
    });

    it('accepts both valid overviewMode values', () => {
      for (const mode of ['classic', 'enriched'] as const) {
        const v6: PersistedSettings = {
          version: 6,
          endpoints: [],
          settings: {
            timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
            cap: 0, corsMode: 'no-cors', healthThreshold: 120,
            overviewMode: mode,
          },
          ui: { expandedCards: [], activeView: 'overview' },
        };
        const migrated = migrateSettings(v6);
        expect(migrated?.settings.overviewMode).toBe(mode);
      }
    });

    it('rejects a corrupted v6 overviewMode by falling back to "classic"', () => {
      const bad = {
        version: 6,
        endpoints: [],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
          overviewMode: 42,   // wrong type — shouldn't happen, but we guard
        },
        ui: { expandedCards: [], activeView: 'overview' },
      };
      const migrated = migrateSettings(bad);
      expect(migrated?.settings.overviewMode).toBe('classic');
    });
  });

  describe('unknown-version fallback', () => {
    it('version 99 returns null (no forward-compat coercion)', () => {
      const future = {
        version: 99,
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic',
        },
        ui: { expandedCards: [], activeView: 'overview' },
        unknownFutureField: 'ignored',
      };
      expect(migrateSettings(future)).toBeNull();
    });

    it('missing version number returns null', () => {
      expect(migrateSettings({ endpoints: [] })).toBeNull();
    });

    it('non-numeric version returns null', () => {
      expect(migrateSettings({ version: 'six', endpoints: [] })).toBeNull();
    });
  });
});
