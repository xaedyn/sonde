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

describe('migrateSettings — full chain through v7', () => {
  it('v3 → v7: region from detectRegion(), healthThreshold default, overviewMode=classic', () => {
    const v3 = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    const result = migrateSettings(v3);
    expect(result?.version).toBe(7);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    // v4→v5 rewrites 'timeline' to 'lanes'; v6→v7 collapses 'lanes' to 'overview'.
    expect(result?.ui.activeView).toBe('overview');
  });

  it('v4 → v7 (three hops): preserves region, seeds healthThreshold + overviewMode', () => {
    const v4 = {
      version: 4,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'east-asia' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(7);
    expect(result?.settings.region).toBe('east-asia');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
  });

  it('v4 payload with invalid region string strips the field on the way to v7', () => {
    const v4 = {
      version: 4,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'fakeland' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(7);
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

  it('v5 → v7 (two hops): seeds overviewMode=classic, preserves modern v5 fields', () => {
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
    expect(result?.version).toBe(7);
    expect(result?.settings.overviewMode).toBe('classic');
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.settings.region).toBe('europe');
    expect(result?.ui.activeView).toBe('live');
    expect(result?.ui.focusedEndpointId).toBe('ep-x');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
    expect(result?.ui.terminalFilters).toEqual(['timeout', 'error']);
    expect(result?.ui.expandedCards).toEqual(['a']);
  });

  it('v2 → v7 (chain): old delay becomes monitorDelay, region from detectRegion()', () => {
    const v2 = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v2);
    expect(result?.version).toBe(7);
    expect(result?.settings.burstRounds).toBe(50);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
  });

  it('v1 → v7: minimal payload inflates with full defaults', () => {
    const v1 = {
      version: 1,
      endpoints: [{ url: 'https://example.com' }],
    };
    const result = migrateSettings(v1);
    expect(result?.version).toBe(7);
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

// ── Phase 7 hop coverage ─────────────────────────────────────────────────────
// Four hop tests required by the Phase 7 non-negotiable: v4→v7 (three hops),
// v5→v7, v6→v7, v7 pass-through. Also asserts the intentional data loss for
// Lanes-family activeView values — a returning Lanes user lands on Overview.
describe('migrateSettings — Phase 7 v6→v7 hop coverage', () => {
  it('v4 → v7 (three hops, activeView=split): collapses Lanes alias to overview', () => {
    const v4 = {
      version: 4,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'north-america' },
      ui: { expandedCards: ['card-a'], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(7);
    // v4's 'split' → v5's 'lanes' → v7's 'overview'.
    expect(result?.ui.activeView).toBe('overview');
    expect(result?.settings.region).toBe('north-america');
    expect(result?.settings.healthThreshold).toBe(120);
    expect(result?.settings.overviewMode).toBe('classic');
    expect(result?.ui.expandedCards).toEqual(['card-a']);
  });

  it('v5 → v7 (two hops, activeView=lanes): collapses Lanes to overview', () => {
    const v5 = {
      version: 5,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'no-cors', region: 'europe', healthThreshold: 180,
      },
      ui: {
        expandedCards: [],
        activeView: 'lanes',
        focusedEndpointId: 'ep-y',
        liveOptions: { split: false, timeRange: '1m' },
        terminalFilters: [],
      },
    };
    const result = migrateSettings(v5);
    expect(result?.version).toBe(7);
    expect(result?.ui.activeView).toBe('overview');
    expect(result?.settings.healthThreshold).toBe(180);
    expect(result?.settings.overviewMode).toBe('classic');
    // Non-view fields ride through untouched.
    expect(result?.ui.focusedEndpointId).toBe('ep-y');
    expect(result?.ui.liveOptions).toEqual({ split: false, timeRange: '1m' });
  });

  it('v5 → v7 preserves non-Lanes activeView (live stays live)', () => {
    const v5 = {
      version: 5,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'live', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v5);
    expect(result?.version).toBe(7);
    expect(result?.ui.activeView).toBe('live');
  });

  it('v6 → v7 (one hop, activeView=lanes): collapses Lanes to overview', () => {
    const v6 = {
      version: 6,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'no-cors', region: 'europe', healthThreshold: 120,
        overviewMode: 'enriched',
      },
      ui: {
        expandedCards: ['a', 'b'],
        activeView: 'lanes',
        focusedEndpointId: 'ep-z',
        liveOptions: { split: true, timeRange: '15m' },
        terminalFilters: ['timeout'],
      },
    };
    const result = migrateSettings(v6);
    expect(result?.version).toBe(7);
    expect(result?.ui.activeView).toBe('overview');
    // overviewMode and every other non-view field survive.
    expect(result?.settings.overviewMode).toBe('enriched');
    expect(result?.ui.expandedCards).toEqual(['a', 'b']);
    expect(result?.ui.focusedEndpointId).toBe('ep-z');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
    expect(result?.ui.terminalFilters).toEqual(['timeout']);
  });

  it('v6 → v7: deprecated timeline/heatmap/split also collapse (not just "lanes")', () => {
    for (const view of ['timeline', 'heatmap', 'split'] as const) {
      const v6 = {
        version: 6,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic' },
        ui: { expandedCards: [], activeView: view, focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      const result = migrateSettings(v6);
      expect(result?.ui.activeView).toBe('overview');
    }
  });

  it('v7 pass-through: already-current payload survives intact, no coercion', () => {
    const v7 = {
      version: 7,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'cors', region: 'europe', healthThreshold: 200,
        overviewMode: 'enriched',
      },
      ui: {
        expandedCards: ['a'],
        activeView: 'atlas',
        focusedEndpointId: 'ep-keep',
        liveOptions: { split: true, timeRange: '1h' },
        terminalFilters: ['error', 'timeout'],
      },
    };
    const result = migrateSettings(v7);
    expect(result?.version).toBe(7);
    expect(result?.ui.activeView).toBe('atlas');
    expect(result?.settings.overviewMode).toBe('enriched');
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.ui.focusedEndpointId).toBe('ep-keep');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '1h' });
    expect(result?.ui.terminalFilters).toEqual(['error', 'timeout']);
  });

  it('v7 pass-through: a stray Lanes view in a v7 payload coerces to overview', () => {
    // Not a real migration hop — a hand-edited or corrupted v7 payload
    // shouldn't let 'lanes' leak past readActiveView's v7 allowlist.
    const v7 = {
      version: 7,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic' },
      ui: { expandedCards: [], activeView: 'lanes', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v7);
    expect(result?.ui.activeView).toBe('overview');
  });

  it('v6 → v7: Lanes-specific settings (hypothetical timelineZoom/heatmapResolution) are not carried forward', () => {
    // Documentation assertion: this codebase never shipped Lanes-specific
    // Settings fields (timelineZoom, heatmapResolution, laneDensity, etc.),
    // so the Phase 7 non-negotiable's "drop legacy Lanes-specific settings"
    // clause is structurally satisfied — readSettingsField only emits known
    // Settings keys, so any Lanes-specific field in a payload is silently
    // dropped by the allowlist. Verifying here so a future reader doesn't
    // mistake the absence of an explicit deletion for an oversight.
    const v6WithGarbage = {
      version: 6,
      endpoints: [],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic',
        // Hypothetical Lanes-era fields — never shipped, but exercised here
        // so we catch if someone reintroduces them via passthrough.
        timelineZoom: 2,
        heatmapResolution: 'high',
        laneDensity: 'compact',
      },
      ui: { expandedCards: [], activeView: 'lanes', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v6WithGarbage);
    expect(result?.version).toBe(7);
    // None of the hypothetical fields survive.
    const settings = result?.settings as Record<string, unknown> | undefined;
    expect(settings?.['timelineZoom']).toBeUndefined();
    expect(settings?.['heatmapResolution']).toBeUndefined();
    expect(settings?.['laneDensity']).toBeUndefined();
  });

  it('v6 → v7: debug-logs when Lanes-family view is retired', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v6 = {
        version: 6,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic' },
        ui: { expandedCards: [], activeView: 'lanes', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v6);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Phase 7 migration: activeView 'lanes' retired/),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('v6 → v7: modern Overview payload does NOT log (no false breadcrumbs)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v6 = {
        version: 6,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic' },
        ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v6);
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});
