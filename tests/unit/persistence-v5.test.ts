import { describe, it, expect } from 'vitest';
import { migrateSettings } from '../../src/lib/utils/persistence';
import { DEFAULT_HEALTH_THRESHOLD, DEFAULT_SETTINGS } from '../../src/lib/types';
import type { PersistedSettings } from '../../src/lib/types';

function baseV4Payload(): Record<string, unknown> {
  return {
    version: 4,
    endpoints: [{ url: 'https://example.com', enabled: true }],
    settings: {
      timeout: 5000,
      delay: 0,
      burstRounds: 50,
      monitorDelay: 1000,
      cap: 0,
      corsMode: 'no-cors',
    },
    ui: {
      expandedCards: ['ep-1'],
      activeView: 'split',
    },
  };
}

describe('persistence v4 → v5 migration', () => {
  it('bumps version to 5', () => {
    const migrated = migrateSettings(baseV4Payload()) as PersistedSettings;
    expect(migrated.version).toBe(5);
  });

  it('seeds healthThreshold default when missing', () => {
    const migrated = migrateSettings(baseV4Payload()) as PersistedSettings;
    expect(migrated.settings.healthThreshold).toBe(DEFAULT_HEALTH_THRESHOLD);
  });

  it('preserves an explicit healthThreshold that was already saved', () => {
    const payload = baseV4Payload();
    (payload['settings'] as Record<string, unknown>)['healthThreshold'] = 200;
    const migrated = migrateSettings(payload) as PersistedSettings;
    expect(migrated.settings.healthThreshold).toBe(200);
  });

  it('remaps deprecated activeView "split" → "lanes"', () => {
    const migrated = migrateSettings(baseV4Payload()) as PersistedSettings;
    expect(migrated.ui.activeView).toBe('lanes');
  });

  it('remaps deprecated activeView "timeline" → "lanes"', () => {
    const payload = baseV4Payload();
    (payload['ui'] as Record<string, unknown>)['activeView'] = 'timeline';
    const migrated = migrateSettings(payload) as PersistedSettings;
    expect(migrated.ui.activeView).toBe('lanes');
  });

  it('remaps deprecated activeView "heatmap" → "lanes"', () => {
    const payload = baseV4Payload();
    (payload['ui'] as Record<string, unknown>)['activeView'] = 'heatmap';
    const migrated = migrateSettings(payload) as PersistedSettings;
    expect(migrated.ui.activeView).toBe('lanes');
  });

  it('preserves v5 activeView values (no double-migration)', () => {
    const v5: Record<string, unknown> = {
      ...baseV4Payload(),
      version: 5,
      settings: { ...(baseV4Payload().settings as Record<string, unknown>), healthThreshold: 150 },
      ui: { expandedCards: [], activeView: 'overview' },
    };
    const migrated = migrateSettings(v5) as PersistedSettings;
    expect(migrated.version).toBe(5);
    expect(migrated.ui.activeView).toBe('overview');
  });

  it('seeds default UI fields (focusedEndpointId, liveOptions, terminalFilters)', () => {
    const migrated = migrateSettings(baseV4Payload()) as PersistedSettings;
    expect(migrated.ui.focusedEndpointId).toBeNull();
    expect(migrated.ui.liveOptions).toEqual({ split: false, timeRange: '5m' });
    expect(migrated.ui.terminalFilters).toEqual([]);
  });

  it('preserves endpoints through migration', () => {
    const migrated = migrateSettings(baseV4Payload()) as PersistedSettings;
    expect(migrated.endpoints).toEqual([{ url: 'https://example.com', enabled: true }]);
  });

  it('migrates a v2 payload all the way through to v5', () => {
    const v2 = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000,
        delay: 1000,
        cap: 100,
        corsMode: 'no-cors',
      },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const migrated = migrateSettings(v2) as PersistedSettings;
    expect(migrated.version).toBe(5);
    expect(migrated.settings.healthThreshold).toBe(DEFAULT_HEALTH_THRESHOLD);
    expect(migrated.settings.monitorDelay).toBe(1000);
    expect(migrated.ui.activeView).toBe('lanes');
  });

  it('returns null for an unknown version (first-install path)', () => {
    expect(migrateSettings({ version: 99 })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(migrateSettings(null)).toBeNull();
    expect(migrateSettings('hello')).toBeNull();
    expect(migrateSettings(42)).toBeNull();
  });

  it('clamps persisted healthThreshold >= timeout to a safe value', () => {
    const payload = baseV4Payload();
    (payload['settings'] as Record<string, unknown>)['healthThreshold'] = 10_000;
    (payload['settings'] as Record<string, unknown>)['timeout'] = 5000;
    const migrated = migrateSettings(payload) as PersistedSettings;
    expect(migrated.settings.healthThreshold).toBeLessThan(migrated.settings.timeout);
    expect(migrated.settings.healthThreshold).toBeGreaterThan(0);
  });

  it('maintains DEFAULT_SETTINGS shape invariant', () => {
    // Guards against accidental drop of healthThreshold from defaults.
    expect(DEFAULT_SETTINGS.healthThreshold).toBe(DEFAULT_HEALTH_THRESHOLD);
  });
});
