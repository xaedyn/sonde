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

  it('round-trips v3 settings correctly', () => {
    const settings: PersistedSettings = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 3000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    saveSettings(settings);
    const loaded = loadPersistedSettings();
    expect(loaded?.version).toBe(3);
    expect(loaded?.endpoints[0]?.url).toBe('https://example.com');
    expect(loaded?.settings.burstRounds).toBe(50);
    expect(loaded?.settings.monitorDelay).toBe(3000);
  });

  it('returns null for corrupt data', () => {
    localStorageMock.setItem('chronoscope_v2_settings', 'not-json{{{}}}');
    expect(() => loadPersistedSettings()).not.toThrow();
    expect(loadPersistedSettings()).toBeNull();
  });

  it('migrates v1 data to v3', () => {
    const v1Data = { version: 1, endpoints: [{ url: 'https://example.com' }] };
    const migrated = migrateSettings(v1Data);
    expect(migrated?.version).toBe(3);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.monitorDelay).toBe(3000);
  });

  it('migrates v2 data to v3 with old delay as monitorDelay', () => {
    const v2Data = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const migrated = migrateSettings(v2Data);
    expect(migrated?.version).toBe(3);
    expect(migrated?.settings.monitorDelay).toBe(500);
    expect(migrated?.settings.burstRounds).toBe(50);
    expect(migrated?.settings.delay).toBe(0);
  });
});
