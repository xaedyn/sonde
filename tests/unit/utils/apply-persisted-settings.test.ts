import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { applyPersistedSettings } from '../../../src/lib/utils/apply-persisted-settings';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { settingsStore } from '../../../src/lib/stores/settings';
import type { PersistedSettings } from '../../../src/lib/types';

beforeEach(() => {
  // Start each test from a placeholder state to confirm applyPersistedSettings overrides it.
  endpointStore.setEndpoints([
    { id: 'placeholder-1', url: 'https://example.com', enabled: true, label: 'placeholder', color: '#000' },
  ]);
});

describe('applyPersistedSettings — G6 label hydration via brandFor', () => {
  it('should derive label "Google" for https://www.google.com from regional-defaults', () => {
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [{ url: 'https://www.google.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview' },
    };

    applyPersistedSettings(persisted);

    const eps = get(endpointStore);
    expect(eps).toHaveLength(1);
    expect(eps[0]?.label).toBe('Google');
    expect(eps[0]?.url).toBe('https://www.google.com');
  });

  it('should derive label "Google" for mixed-case URL via normalizeUrlForBrandLookup', () => {
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [{ url: 'https://WWW.Google.COM/', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview' },
    };

    applyPersistedSettings(persisted);

    const eps = get(endpointStore);
    expect(eps).toHaveLength(1);
    expect(eps[0]?.label).toBe('Google');
  });

  it('should fall back label to URL for unknown domain not in BRAND_LABELS', () => {
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [{ url: 'https://unknown-domain.example.com', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview' },
    };

    applyPersistedSettings(persisted);

    const eps = get(endpointStore);
    expect(eps).toHaveLength(1);
    // displayLabel now returns the hostname for unknown domains (not the raw URL)
    expect(eps[0]?.label).toBe('unknown-domain.example.com');
  });

  it('should trim surrounding whitespace from url AND still derive brand label', () => {
    // Locks the loader's `ep.url.trim()` behavior: a persisted URL with
    // leading/trailing whitespace must both (a) be stored as the trimmed form
    // and (b) still match brandFor so the label resolves correctly.
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [{ url: '  https://www.google.com  ', enabled: true }],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', healthThreshold: 120 },
      ui: { expandedCards: [], activeView: 'overview' },
    };

    applyPersistedSettings(persisted);

    const eps = get(endpointStore);
    expect(eps).toHaveLength(1);
    expect(eps[0]?.url).toBe('https://www.google.com');
    expect(eps[0]?.label).toBe('Google');
  });
});

describe('applyPersistedSettings — AC2 empty-endpoints contract (§6.2)', () => {
  it('persisted v10 with endpoints:[] results in empty endpoint store', () => {
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };

    applyPersistedSettings(persisted);

    const eps = get(endpointStore);
    expect(eps).toHaveLength(0);
  });

  it('persisted v10 with endpoints:[{url,enabled}, ...] replaces placeholder', () => {
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [
        { url: 'https://user-added.example', enabled: true },
        { url: 'https://another.example', enabled: false },
      ],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors' },
      ui: { expandedCards: [], activeView: 'split' },
    };

    applyPersistedSettings(persisted);

    const eps = get(endpointStore);
    expect(eps).toHaveLength(2);
    expect(eps[0]?.url).toBe('https://user-added.example');
    expect(eps[0]?.enabled).toBe(true);
    expect(eps[1]?.url).toBe('https://another.example');
    expect(eps[1]?.enabled).toBe(false);
  });

  it('applies persisted settings (including region) to settingsStore', () => {
    const persisted: PersistedSettings = {
      version: 10,
      endpoints: [],
      settings: { timeout: 5000, delay: 0, burstRounds: 50, monitorDelay: 1000, cap: 0, corsMode: 'no-cors', region: 'europe' },
      ui: { expandedCards: [], activeView: 'split' },
    };

    applyPersistedSettings(persisted);

    expect(get(settingsStore).region).toBe('europe');
  });
});
