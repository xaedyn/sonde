import { describe, it, expect, vi, afterEach } from 'vitest';
import { migrateSettings } from '../../../src/lib/utils/persistence';

vi.mock('../../../src/lib/regional-defaults', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/lib/regional-defaults')>();
  return {
    ...original,
    detectRegion: vi.fn(() => 'europe' as const),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('migrateSettings — full chain through v6', () => {
  it('v3 → v6: region from detectRegion(), healthThreshold default, overviewMode=classic', () => {
    const v3 = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    const result = migrateSettings(v3);
    expect(result?.version).toBe(6);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    // 'timeline' is a v2-era view that rewrites to 'lanes'.
    expect(result?.ui.activeView).toBe('lanes');
  });

  it('v4 → v6 (two hops): preserves region, seeds healthThreshold + overviewMode', () => {
    const v4 = {
      version: 4,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'east-asia' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(6);
    expect(result?.settings.region).toBe('east-asia');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
  });

  it('v4 payload with invalid region string strips the field on the way to v6', () => {
    const v4 = {
      version: 4,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'fakeland' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(6);
    expect(result?.settings.region).toBeUndefined();
  });

  it('v4 payload with null region strips the field', () => {
    const v4 = {
      version: 4,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: null },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.settings.region).toBeUndefined();
  });

  it('v5 → v6 (one hop): seeds overviewMode=classic, preserves all v5 fields', () => {
    const v5 = {
      version: 5,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'no-cors', region: 'europe', healthThreshold: 200,
      },
      ui: {
        expandedCards: ['a'],
        activeView: 'live',
        focusedEndpointId: 'ep-x',
        liveOptions: { split: true, timeRange: '15m' },
        terminalFilters: ['timeout', 'error'],
      },
    };
    const result = migrateSettings(v5);
    expect(result?.version).toBe(6);
    expect(result?.settings.overviewMode).toBe('classic');
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.settings.region).toBe('europe');
    expect(result?.ui.activeView).toBe('live');
    expect(result?.ui.focusedEndpointId).toBe('ep-x');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
    expect(result?.ui.terminalFilters).toEqual(['timeout', 'error']);
    expect(result?.ui.expandedCards).toEqual(['a']);
  });

  it('v2 → v6 (chain): old delay becomes monitorDelay, region from detectRegion()', () => {
    const v2 = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v2);
    expect(result?.version).toBe(6);
    expect(result?.settings.burstRounds).toBe(50);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
  });

  it('v1 → v6: minimal payload inflates with full defaults', () => {
    const v1 = {
      version: 1,
      endpoints: [{ url: 'https://example.com' }],
    };
    const result = migrateSettings(v1);
    expect(result?.version).toBe(6);
    expect(result?.ui.activeView).toBe('overview');
    expect(result?.settings.overviewMode).toBe('classic');
  });

  it('version 99 (future unknown): returns null — no forward-compat coercion', () => {
    const future = {
      version: 99,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'europe' },
      ui: { expandedCards: [], activeView: 'split' },
      unknownFutureField: 'ignored',
    };
    const result = migrateSettings(future);
    expect(result).toBeNull();
  });
});
