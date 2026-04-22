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

describe('migrateSettings — full chain through v9', () => {
  it('v3 → v9: region from detectRegion(), healthThreshold default, overviewMode dropped', () => {
    const v3 = {
      version: 3,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'timeline' },
    };
    const result = migrateSettings(v3);
    expect(result?.version).toBe(9);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.healthThreshold).toBe(120);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    expect(result?.endpoints[0]?.url).toBe('https://example.com');
    // v4→v5 rewrites 'timeline' to 'lanes'; v6→v7 collapses 'lanes' to 'overview'.
    expect(result?.ui.activeView).toBe('overview');
  });

  it('v4 → v9 (five hops): preserves region, seeds healthThreshold, drops overviewMode', () => {
    const v4 = {
      version: 4,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'east-asia' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(9);
    expect(result?.settings.region).toBe('east-asia');
    expect(result?.settings.healthThreshold).toBe(120);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
  });

  it('v4 payload with invalid region string strips the field on the way to v9', () => {
    const v4 = {
      version: 4,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'fakeland' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(9);
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

  it('v5 → v9 (four hops): preserves modern v5 fields, drops overviewMode', () => {
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
    expect(result?.version).toBe(9);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.settings.region).toBe('europe');
    expect(result?.ui.activeView).toBe('live');
    expect(result?.ui.focusedEndpointId).toBe('ep-x');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
    expect(result?.ui.terminalFilters).toEqual(['timeout', 'error']);
    expect(result?.ui.expandedCards).toEqual(['a']);
  });

  it('v2 → v9 (chain): old delay becomes monitorDelay, region from detectRegion()', () => {
    const v2 = {
      version: 2,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 500, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v2);
    expect(result?.version).toBe(9);
    expect(result?.settings.burstRounds).toBe(50);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.healthThreshold).toBe(120);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
  });

  it('v1 → v9: minimal payload inflates with full defaults', () => {
    const v1 = {
      version: 1,
      endpoints: [{ url: 'https://example.com' }],
    };
    const result = migrateSettings(v1);
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('overview');
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
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
// The Lanes family was retired at stepV6toV7. These assertions verify that a
// returning Lanes user lands on Overview regardless of how deep the chain is.
describe('migrateSettings — Phase 7 v6→v7 hop coverage', () => {
  it('v4 → v9 (five hops, activeView=split): collapses Lanes alias to overview', () => {
    const v4 = {
      version: 4,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'north-america' },
      ui: { expandedCards: ['card-a'], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(9);
    // v4's 'split' → v5's 'lanes' → v7's 'overview' → v9 still 'overview'.
    expect(result?.ui.activeView).toBe('overview');
    expect(result?.settings.region).toBe('north-america');
    expect(result?.settings.healthThreshold).toBe(120);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    expect(result?.ui.expandedCards).toEqual(['card-a']);
  });

  it('v5 → v9 (four hops, activeView=lanes): collapses Lanes to overview', () => {
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
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('overview');
    expect(result?.settings.healthThreshold).toBe(180);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    // Non-view fields ride through untouched.
    expect(result?.ui.focusedEndpointId).toBe('ep-y');
    expect(result?.ui.liveOptions).toEqual({ split: false, timeRange: '1m' });
  });

  it('v5 → v9 preserves non-Lanes activeView (live stays live)', () => {
    const v5 = {
      version: 5,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'live', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v5);
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('live');
  });

  it('v6 → v9 (three hops, activeView=lanes): collapses Lanes to overview', () => {
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
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('overview');
    // overviewMode is dropped at v8 regardless of value.
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    expect(result?.ui.expandedCards).toEqual(['a', 'b']);
    expect(result?.ui.focusedEndpointId).toBe('ep-z');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '15m' });
    expect(result?.ui.terminalFilters).toEqual(['timeout']);
  });

  it('v6 → v9: deprecated timeline/heatmap/split also collapse (not just "lanes")', () => {
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

  it('v6 → v9: modern Overview payload does NOT log the Lanes retirement breadcrumb', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v6 = {
        version: 6,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic' },
        ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v6);
      // stepV7toV8's overviewMode breadcrumb WILL fire for this payload (the
      // user had overviewMode='classic' set); only the Phase 7 Lanes log
      // should be absent, because activeView was already 'overview'.
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/Phase 7 migration: activeView/),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });
});

// ── v7 → v8 hop coverage ─────────────────────────────────────────────────────
// Tests the overviewMode drop + debug log at the v7→v8 boundary, plus the v8
// pass-through shape. Classic dial retired; there's only one Overview layout
// now, so the toggle was removed from Settings.
describe('migrateSettings — v7→v8 hop coverage', () => {
  it('v7 → v9 (two hops): drops overviewMode, preserves everything else', () => {
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
    expect(result?.version).toBe(9);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    // v7's 'atlas' → v9's 'diagnose' (the v8→v9 step renames it).
    expect(result?.ui.activeView).toBe('diagnose');
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.settings.region).toBe('europe');
    expect(result?.settings.corsMode).toBe('cors');
    expect(result?.ui.focusedEndpointId).toBe('ep-keep');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '1h' });
    expect(result?.ui.terminalFilters).toEqual(['error', 'timeout']);
    expect(result?.ui.expandedCards).toEqual(['a']);
  });

  it('v7 → v8: debug-logs when overviewMode is present in a payload', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v7 = {
        version: 7,
        endpoints: [],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
          overviewMode: 'classic',
        },
        ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v7);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/v8 migration: settings\.overviewMode 'classic' retired/),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('v7 → v8: no overviewMode in the payload → no debug log (no false breadcrumbs)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v7 = {
        version: 7,
        endpoints: [],
        settings: {
          timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
          cap: 0, corsMode: 'no-cors', healthThreshold: 120,
        },
        ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v7);
      // v8 drop log is specifically what we don't want — the payload never
      // had overviewMode, so there's nothing to report.
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/v8 migration: settings\.overviewMode/),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('v8 pass-through: already-current payload survives intact, no coercion', () => {
    const v8 = {
      version: 8,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'cors', region: 'europe', healthThreshold: 200,
      },
      ui: {
        expandedCards: ['a'],
        activeView: 'atlas',
        focusedEndpointId: 'ep-keep',
        liveOptions: { split: true, timeRange: '1h' },
        terminalFilters: ['error', 'timeout'],
      },
    };
    const result = migrateSettings(v8);
    expect(result?.version).toBe(9);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    // v8's 'atlas' → v9's 'diagnose' via stepV8toV9.
    expect(result?.ui.activeView).toBe('diagnose');
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.ui.focusedEndpointId).toBe('ep-keep');
    expect(result?.ui.liveOptions).toEqual({ split: true, timeRange: '1h' });
    expect(result?.ui.terminalFilters).toEqual(['error', 'timeout']);
  });

  it('v8 pass-through: a stray Lanes view in a v8 payload coerces to overview', () => {
    // Hand-edited or corrupted v8 payload; shouldn't let 'lanes' leak past
    // readActiveView's narrow allowlist.
    const v8 = {
      version: 8,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'lanes', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v8);
    expect(result?.ui.activeView).toBe('overview');
  });

  it('v8 pass-through: a stray overviewMode in a v8 payload is silently dropped', () => {
    const v8 = {
      version: 8,
      endpoints: [],
      settings: {
        timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000,
        cap: 0, corsMode: 'no-cors', healthThreshold: 120,
        overviewMode: 'enriched',
      },
      ui: { expandedCards: [], activeView: 'overview', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v8);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
  });
});

// ── v8 → v9 hop coverage ─────────────────────────────────────────────────────
// The Atlas view was renamed to Diagnose to match the v2 prototype vocabulary.
// stepV8toV9 rewrites `activeView: 'atlas'` to `'diagnose'` with a debug-log
// breadcrumb. Hop coverage: v4→v9 (five hops), v5→v9, v6→v9, v7→v9, v8→v9 (one),
// v9 pass-through, plus log presence/absence + stray-'atlas' guard on v9.
describe('migrateSettings — v8→v9 hop coverage', () => {
  it('v4 → v9 (five hops, activeView=split): collapses Lanes alias to overview, no atlas to rename', () => {
    const v4 = {
      version: 4,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };
    const result = migrateSettings(v4);
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('overview');
  });

  it('v5 → v9 (four hops, activeView=atlas): renames atlas → diagnose at the v9 boundary', () => {
    const v5 = {
      version: 5,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'atlas', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v5);
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('diagnose');
  });

  it('v6 → v9 (three hops, activeView=atlas + overviewMode=classic): drops mode AND renames atlas', () => {
    const v6 = {
      version: 6,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120, overviewMode: 'classic' },
      ui: { expandedCards: [], activeView: 'atlas', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v6);
    expect(result?.version).toBe(9);
    expect('overviewMode' in (result?.settings ?? {})).toBe(false);
    expect(result?.ui.activeView).toBe('diagnose');
  });

  it('v8 → v9 (one hop, activeView=atlas): renames to diagnose', () => {
    const v8 = {
      version: 8,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 200 },
      ui: { expandedCards: [], activeView: 'atlas', focusedEndpointId: 'ep-keep', liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v8);
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('diagnose');
    // Non-view fields ride through.
    expect(result?.settings.healthThreshold).toBe(200);
    expect(result?.ui.focusedEndpointId).toBe('ep-keep');
  });

  it('v8 → v9: non-atlas activeView passes through unchanged', () => {
    for (const view of ['overview', 'live', 'strata', 'terminal'] as const) {
      const v8 = {
        version: 8,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
        ui: { expandedCards: [], activeView: view, focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      const result = migrateSettings(v8);
      expect(result?.version).toBe(9);
      expect(result?.ui.activeView).toBe(view);
    }
  });

  it('v8 → v9: debug-logs the rename when atlas is present', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v8 = {
        version: 8,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
        ui: { expandedCards: [], activeView: 'atlas', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v8);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/v9 migration: activeView 'atlas' renamed to 'diagnose'/),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('v8 → v9: non-atlas payloads do NOT log the rename breadcrumb', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const v8 = {
        version: 8,
        endpoints: [],
        settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
        ui: { expandedCards: [], activeView: 'live', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
      };
      migrateSettings(v8);
      expect(debugSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/v9 migration: activeView 'atlas'/),
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('v9 pass-through: already-current payload survives intact', () => {
    const v9 = {
      version: 9,
      endpoints: [{ url: 'https://example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'diagnose', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v9);
    expect(result?.version).toBe(9);
    expect(result?.ui.activeView).toBe('diagnose');
  });

  it('v9 pass-through: a stray "atlas" in a v9 payload coerces to overview (not silently re-renamed)', () => {
    // Hand-edited v9 payload with retired 'atlas'. normalizeV9 doesn't run
    // stepV8toV9, so the rename log doesn't fire — instead the stray value
    // falls through V9_VIEWS membership and lands on 'overview'.
    const v9 = {
      version: 9,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'atlas', focusedEndpointId: null, liveOptions: { split: false, timeRange: '5m' }, terminalFilters: [] },
    };
    const result = migrateSettings(v9);
    expect(result?.ui.activeView).toBe('overview');
  });
});
