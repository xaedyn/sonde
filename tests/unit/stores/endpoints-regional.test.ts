import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { endpointStore, buildDefaultEndpoints } from '../../../src/lib/stores/endpoints';
import { REGIONAL_DEFAULTS, REGIONS } from '../../../src/lib/regional-defaults';
import type { Region } from '../../../src/lib/regional-defaults';

describe('buildDefaultEndpoints', () => {
  it('given each of the 7 regions, returns 4 endpoints matching the table', () => {
    for (const region of REGIONS) {
      const endpoints = buildDefaultEndpoints(region as Region);
      expect(endpoints).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(endpoints[i]?.url).toBe(REGIONAL_DEFAULTS[region as Region][i]?.url);
      }
    }
  });

  it('given undefined, returns north-america endpoints (no detectRegion call)', () => {
    const endpoints = buildDefaultEndpoints(undefined);
    expect(endpoints).toHaveLength(4);
    expect(endpoints[0]?.url).toBe('https://www.google.com');
    expect(endpoints[1]?.url).toBe('https://chronoscope.dev/probe');
    expect(endpoints[2]?.url).toBe('https://aws.amazon.com');
    expect(endpoints[3]?.url).toBe('https://www.fastly.com/robots.txt');
  });

  it('endpoints have unique IDs', () => {
    const endpoints = buildDefaultEndpoints('europe');
    const ids = endpoints.map(ep => ep.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('all endpoints are enabled', () => {
    const endpoints = buildDefaultEndpoints('east-asia');
    for (const ep of endpoints) {
      expect(ep.enabled).toBe(true);
    }
  });

  it('lane 4 for east-asia is Wikipedia', () => {
    const endpoints = buildDefaultEndpoints('east-asia');
    expect(endpoints[3]?.url).toBe('https://en.wikipedia.org');
  });

  it('lane 4 for north-america is Fastly', () => {
    const endpoints = buildDefaultEndpoints('north-america');
    expect(endpoints[3]?.url).toBe('https://www.fastly.com/robots.txt');
  });
});

describe('endpointStore.reset', () => {
  beforeEach(() => {
    endpointStore.reset();
  });

  it('reset() with no arg uses north-america (legacy fallback)', () => {
    endpointStore.addEndpoint('https://example.com');
    endpointStore.reset();
    const eps = get(endpointStore);
    expect(eps).toHaveLength(4);
    expect(eps[0]?.url).toBe('https://www.google.com');
    expect(eps[3]?.url).toBe('https://www.fastly.com/robots.txt');
  });

  it("reset('europe') replaces store with Europe's 4 endpoints", () => {
    endpointStore.addEndpoint('https://example.com');
    endpointStore.reset('europe');
    const eps = get(endpointStore);
    expect(eps).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(eps[i]?.url).toBe(REGIONAL_DEFAULTS['europe'][i]?.url);
    }
  });

  it("reset('east-asia') places Wikipedia at lane 4", () => {
    endpointStore.reset('east-asia');
    const eps = get(endpointStore);
    expect(eps[3]?.url).toBe('https://en.wikipedia.org');
  });
});
