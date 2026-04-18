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

  it('round-trips v3 settings into current v5 shape', () => {
    const settings = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    // Cast because the on-disk v3 payload pre-dates healthThreshold — migration
    // is expected to seed the field forward.
    saveSettings(settings as unknown as PersistedSettings);
    const loaded = loadPersistedSettings();
    expect(loaded?.version).toBe(5);
    expect(loaded?.endpoints[0]?.url).toBe('https://example.com');
    expect(loaded?.settings.burstRounds).toBe(50);
    expect(loaded?.settings.monitorDelay).toBe(1000);
    expect(loaded?.settings.healthThreshold).toBe(120);
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
    expect(loaded?.version).toBe(5);
    expect(localStorageMock.getItem('chronoscope_v2_settings')).toBeNull();
    expect(localStorageMock.getItem('chronoscope_settings')).not.toBeNull();
  });

  it('migrates v1 data all the way to v5', () => {
    const v1Data = { version: 1, endpoints: [{ url: 'https://example.com' }] };
    const migrated = migrateSettings(v1Data);
    expect(migrated?.version).toBe(5);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.monitorDelay).toBe(1000);
    expect(migrated?.settings.healthThreshold).toBe(120);
    expect(migrated?.ui.activeView).toBe('overview');
  });

  it('migrates v2 data to v5 with old delay as monitorDelay', () => {
    const v2Data = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const migrated = migrateSettings(v2Data);
    expect(migrated?.version).toBe(5);
    expect(migrated?.settings.monitorDelay).toBe(500);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.delay).toBe(0);
    expect(migrated?.settings.healthThreshold).toBe(120);
    // 'split' is a deprecated view that migrates to 'lanes'.
    expect(migrated?.ui.activeView).toBe('lanes');
  });

  describe('v4 → v5 migration', () => {
    it('seeds healthThreshold default on a real v4 payload', () => {
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
      expect(migrated?.version).toBe(5);
      expect(migrated?.settings.healthThreshold).toBe(120);
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

    it('round-trips a v5 payload unchanged (already current)', () => {
      const v5: PersistedSettings = {
        version: 5,
        endpoints: [{ url: 'https://a.example', enabled: true }],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 200,
        },
        ui: {
          expandedCards: [],
          activeView: 'overview',
          focusedEndpointId: 'ep-1',
          liveOptions: { split: true, timeRange: '15m' },
          terminalFilters: ['timeout', 'error'],
        },
      };
      saveSettings(v5);
      const loaded = loadPersistedSettings();
      expect(loaded).toEqual(v5);
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
});
