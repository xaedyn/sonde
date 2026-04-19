import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { networkQualityStore, monitoredEndpointsStore } from '../../src/lib/stores/derived';
import { endpointStore } from '../../src/lib/stores/endpoints';
import { measurementStore } from '../../src/lib/stores/measurements';
import { settingsStore } from '../../src/lib/stores/settings';
import { DEFAULT_SETTINGS } from '../../src/lib/types';

function pushOkSamples(endpointId: string, latencies: number[]): void {
  measurementStore.initEndpoint(endpointId);
  for (let i = 0; i < latencies.length; i++) {
    measurementStore.addSample(endpointId, i + 1, latencies[i], 'ok', Date.now() + i);
  }
}

describe('networkQualityStore', () => {
  beforeEach(() => {
    endpointStore.setEndpoints([]);
    measurementStore.reset();
    settingsStore.set({ ...DEFAULT_SETTINGS });
  });

  it('yields null when no endpoint has ready stats', () => {
    expect(get(networkQualityStore)).toBeNull();
  });

  it('yields 100 when the only endpoint is healthy', () => {
    const id = endpointStore.addEndpoint('https://a.example', 'a');
    endpointStore.updateEndpoint(id, { enabled: true });
    // 30+ samples trips `ready`; keep all latencies safely below healthThreshold/2.
    pushOkSamples(id, Array(40).fill(20));
    expect(get(networkQualityStore)).toBe(100);
  });

  it('excludes disabled endpoints from the aggregate', () => {
    const healthy = endpointStore.addEndpoint('https://ok.example', 'ok');
    const broken  = endpointStore.addEndpoint('https://bad.example', 'bad');
    endpointStore.updateEndpoint(healthy, { enabled: true });
    endpointStore.updateEndpoint(broken,  { enabled: false });
    pushOkSamples(healthy, Array(40).fill(20));
    pushOkSamples(broken,  Array(40).fill(999));
    // broken is disabled → excluded; healthy alone → 100
    expect(get(networkQualityStore)).toBe(100);
  });

  it('recomputes when healthThreshold changes', () => {
    const id = endpointStore.addEndpoint('https://a.example', 'a');
    endpointStore.updateEndpoint(id, { enabled: true });
    pushOkSamples(id, Array(40).fill(100)); // p50=p95=100
    // With default threshold=120: p95(100) ≤ 120, p50(100) > 60 → degraded (60)
    expect(get(networkQualityStore)).toBe(60);
    // Raise threshold so p50 falls into the healthy half.
    settingsStore.update((s) => ({ ...s, healthThreshold: 250 }));
    expect(get(networkQualityStore)).toBe(100);
  });
});

describe('monitoredEndpointsStore', () => {
  beforeEach(() => {
    endpointStore.setEndpoints([]);
    measurementStore.reset();
    settingsStore.set({ ...DEFAULT_SETTINGS });
  });

  it('is empty when the endpoint store is empty', () => {
    expect(get(monitoredEndpointsStore)).toEqual([]);
  });

  it('passes through enabled endpoints in declaration order', () => {
    const a = endpointStore.addEndpoint('https://a.example', 'a');
    const b = endpointStore.addEndpoint('https://b.example', 'b');
    endpointStore.updateEndpoint(a, { enabled: true });
    endpointStore.updateEndpoint(b, { enabled: true });
    const result = get(monitoredEndpointsStore);
    expect(result.map((e) => e.id)).toEqual([a, b]);
  });

  it('excludes disabled endpoints — the cross-phase invariant', () => {
    const on  = endpointStore.addEndpoint('https://on.example',  'on');
    const off = endpointStore.addEndpoint('https://off.example', 'off');
    endpointStore.updateEndpoint(on,  { enabled: true });
    endpointStore.updateEndpoint(off, { enabled: false });
    const result = get(monitoredEndpointsStore);
    expect(result.map((e) => e.id)).toEqual([on]);
  });

  it('reacts when an endpoint flips enabled→disabled', () => {
    const id = endpointStore.addEndpoint('https://x.example', 'x');
    endpointStore.updateEndpoint(id, { enabled: true });
    expect(get(monitoredEndpointsStore)).toHaveLength(1);
    endpointStore.updateEndpoint(id, { enabled: false });
    expect(get(monitoredEndpointsStore)).toHaveLength(0);
  });
});
