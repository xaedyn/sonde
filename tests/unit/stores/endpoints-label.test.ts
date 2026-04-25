// tests/unit/stores/endpoints-label.test.ts
// TDD: verify addEndpoint and updateEndpoint produce displayLabel-derived labels.

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { endpointStore, buildDefaultEndpoints } from '../../../src/lib/stores/endpoints';

beforeEach(() => {
  endpointStore.setEndpoints([]);
});

describe('addEndpoint label derivation', () => {
  it('label for user-added URL is hostname, not raw URL', () => {
    const id = endpointStore.addEndpoint('https://api.example.com/v1');
    const ep = get(endpointStore).find(e => e.id === id);
    expect(ep!.label).toBe('api.example.com');
    expect(ep!.label).not.toContain('https://');
  });

  it('label for Google URL is the brand label', () => {
    const id = endpointStore.addEndpoint('https://www.google.com');
    const ep = get(endpointStore).find(e => e.id === id);
    expect(ep!.label).toBe('Google');
  });

  it('explicit label param still overrides (for hydrateEndpoint backward compat)', () => {
    const id = endpointStore.addEndpoint('https://api.example.com', 'My label');
    const ep = get(endpointStore).find(e => e.id === id);
    expect(ep!.label).toBe('My label');
  });

  it('buildDefaultEndpoints: all labels are non-URL strings', () => {
    const eps = buildDefaultEndpoints();
    for (const ep of eps) {
      expect(ep.label).not.toContain('https://');
      expect(ep.label).not.toContain('http://');
    }
  });
});

describe('updateEndpoint label recompute', () => {
  it('changing url recomputes label via displayLabel', () => {
    const id = endpointStore.addEndpoint('https://api.example.com');
    endpointStore.updateEndpoint(id, { url: 'https://www.google.com' });
    const ep = get(endpointStore).find(e => e.id === id);
    expect(ep!.label).toBe('Google');
  });

  it('setting nickname recomputes label to nickname value', () => {
    const id = endpointStore.addEndpoint('https://api.example.com');
    endpointStore.updateEndpoint(id, { nickname: 'My API' });
    const ep = get(endpointStore).find(e => e.id === id);
    expect(ep!.label).toBe('My API');
  });

  it('clearing nickname falls back to brandFor or hostname', () => {
    // Add with explicit label matching Google brand; then set nickname, then clear it
    const id = endpointStore.addEndpoint('https://www.google.com');
    endpointStore.updateEndpoint(id, { nickname: 'My nickname' });
    endpointStore.updateEndpoint(id, { nickname: undefined });
    const ep = get(endpointStore).find(e => e.id === id);
    expect(ep!.label).toBe('Google');
  });
});
