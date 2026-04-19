import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('round-trips v3 settings into current v8 shape', () => {
    const settings = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    saveSettings(settings as unknown as PersistedSettings);
    const loaded = loadPersistedSettings();
    expect(loaded?.version).toBe(8);
    expect(loaded?.endpoints[0]?.url).toBe('https://example.com');
    expect(loaded?.settings.burstRounds).toBe(50);
    expect(loaded?.settings.monitorDelay).toBe(1000);
    expect(loaded?.settings.healthThreshold).toBe(120);
    // overviewMode was retired at v8; migration strips the field entirely.
    expect('overviewMode' in (loaded?.settings ?? {})).toBe(false);
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
    expect(loaded?.version).toBe(8);
    expect(localStorageMock.getItem('chronoscope_v2_settings')).toBeNull();
    expect(localStorageMock.getItem('chronoscope_settings')).not.toBeNull();
  });

  it('migrates v1 data all the way to v8', () => {
    const v1Data = { version: 1, endpoints: [{ url: 'https://example.com' }] };
    const migrated = migrateSettings(v1Data);
    expect(migrated?.version).toBe(8);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.monitorDelay).toBe(1000);
    expect(migrated?.settings.healthThreshold).toBe(120);
    expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
    expect(migrated?.ui.activeView).toBe('overview');
  });

  it('migrates v2 data to v8 with old delay as monitorDelay', () => {
    const v2Data = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const migrated = migrateSettings(v2Data);
    expect(migrated?.version).toBe(8);
    expect(migrated?.settings.monitorDelay).toBe(500);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.delay).toBe(0);
    expect(migrated?.settings.healthThreshold).toBe(120);
    // v2 'split' → v5 'lanes' → v7 'overview' → v8 still 'overview'.
    expect(migrated?.ui.activeView).toBe('overview');
  });

  describe('v4 → v5 → v6 → v7 → v8 migration (chain)', () => {
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
      expect(migrated?.version).toBe(8);
      expect(migrated?.settings.healthThreshold).toBe(120);
      expect(migrated?.settings.region).toBe('north-america');
      expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
    });

    it('rewrites deprecated activeView values through Lanes to "overview" (v7 collapse)', () => {
      // v4→v5 rewrites the trio to 'lanes'; v6→v7 collapses 'lanes' to 'overview'.
      for (const view of ['timeline', 'heatmap', 'split'] as const) {
        const v4 = {
          version: 4,
          endpoints: [],
          settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
          ui: { expandedCards: [], activeView: view },
        };
        const migrated = migrateSettings(v4);
        expect(migrated?.ui.activeView).toBe('overview');
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

  describe('v5 → v8 migration', () => {
    it('preserves modern v5 fields and strips overviewMode at v8', () => {
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
      expect(migrated?.version).toBe(8);
      expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
      // Existing v5 fields survive intact.
      expect(migrated?.settings.healthThreshold).toBe(180);
      expect(migrated?.settings.region).toBe('europe');
      expect(migrated?.ui.activeView).toBe('overview');
      expect(migrated?.ui.focusedEndpointId).toBe('ep-9');
      expect(migrated?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
      expect(migrated?.ui.terminalFilters).toEqual(['timeout']);
      expect(migrated?.ui.expandedCards).toEqual(['ep-1']);
    });

    it('drops a forward-written overviewMode on v5 at the v8 boundary', () => {
      // A future/debug tool may have injected overviewMode into a v5 payload;
      // the chain carries it forward to v6/v7, then stepV7toV8 strips it.
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
      expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
    });

    it('ignores a garbage overviewMode on v5 (coerced in the chain, dropped at v8)', () => {
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
      expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
    });
  });

  describe('v7 → v8 hop', () => {
    it('drops overviewMode from a real v7 payload and debug-logs the transition', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      try {
        const v7 = {
          version: 7,
          endpoints: [],
          settings: {
            timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
            cap: 0, corsMode: 'no-cors', healthThreshold: 120,
            overviewMode: 'enriched',
          },
          ui: { expandedCards: [], activeView: 'overview' },
        };
        const migrated = migrateSettings(v7);
        expect(migrated?.version).toBe(8);
        expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringMatching(/v8 migration: settings\.overviewMode 'enriched' retired/),
        );
      } finally {
        debugSpy.mockRestore();
      }
    });

    it('v7 payload without overviewMode passes through quietly', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      try {
        const v7 = {
          version: 7,
          endpoints: [],
          settings: {
            timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
            cap: 0, corsMode: 'no-cors', healthThreshold: 120,
          },
          ui: { expandedCards: [], activeView: 'live' },
        };
        const migrated = migrateSettings(v7);
        expect(migrated?.version).toBe(8);
        expect(migrated?.ui.activeView).toBe('live');
        expect(debugSpy).not.toHaveBeenCalled();
      } finally {
        debugSpy.mockRestore();
      }
    });
  });

  describe('v8 pass-through', () => {
    it('round-trips a v8 payload unchanged', () => {
      const v8: PersistedSettings = {
        version: 8,
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
      saveSettings(v8);
      const loaded = loadPersistedSettings();
      expect(loaded).toEqual(v8);
    });

    it('a stray overviewMode in a v8 payload is silently ignored by the reader', () => {
      // Not a real migration path — a hand-edited or corrupted v8 payload
      // shouldn't let the retired field leak back into the app.
      const bad = {
        version: 8,
        endpoints: [],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
          overviewMode: 'classic',
        },
        ui: { expandedCards: [], activeView: 'overview' },
      };
      const migrated = migrateSettings(bad);
      expect('overviewMode' in (migrated?.settings ?? {})).toBe(false);
    });
  });

  describe('unknown-version fallback', () => {
    it('version 99 returns null (no forward-compat coercion)', () => {
      const future = {
        version: 99,
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
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
