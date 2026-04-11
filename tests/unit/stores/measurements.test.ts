import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { measurementStore } from '../../../src/lib/stores/measurements';

describe('measurementStore — error/timeout counters', () => {
  beforeEach(() => {
    measurementStore.reset();
  });

  it('initial state has errorCount: 0 and timeoutCount: 0', () => {
    const state = get(measurementStore);
    expect(state.errorCount).toBe(0);
    expect(state.timeoutCount).toBe(0);
  });

  it('addSample increments errorCount for error status', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    expect(get(measurementStore).errorCount).toBe(1);
    expect(get(measurementStore).timeoutCount).toBe(0);
  });

  it('addSample increments timeoutCount for timeout status', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 5000, 'timeout', Date.now());
    expect(get(measurementStore).timeoutCount).toBe(1);
    expect(get(measurementStore).errorCount).toBe(0);
  });

  it('addSample does not increment counters for ok status', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 50, 'ok', Date.now());
    expect(get(measurementStore).errorCount).toBe(0);
    expect(get(measurementStore).timeoutCount).toBe(0);
  });

  it('addSample accumulates across multiple calls', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 2, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 3, 5000, 'timeout', Date.now());
    const state = get(measurementStore);
    expect(state.errorCount).toBe(2);
    expect(state.timeoutCount).toBe(1);
  });

  it('addSamples increments counters for out-of-order insertions', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSamples([
      { endpointId: 'ep1', round: 5, latency: 50, status: 'ok', timestamp: Date.now() },
      { endpointId: 'ep1', round: 3, latency: 0, status: 'error', timestamp: Date.now() },
    ]);
    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(0);
  });

  it('addSamples increments timeoutCount for batch with timeouts', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSamples([
      { endpointId: 'ep1', round: 1, latency: 5000, status: 'timeout', timestamp: Date.now() },
      { endpointId: 'ep1', round: 2, latency: 5000, status: 'timeout', timestamp: Date.now() },
      { endpointId: 'ep1', round: 3, latency: 50, status: 'ok', timestamp: Date.now() },
    ]);
    expect(get(measurementStore).timeoutCount).toBe(2);
    expect(get(measurementStore).errorCount).toBe(0);
  });

  it('addSamples skips unknown endpointId without affecting counters', () => {
    measurementStore.addSamples([
      { endpointId: 'unknown', round: 1, latency: 0, status: 'error', timestamp: Date.now() },
    ]);
    expect(get(measurementStore).errorCount).toBe(0);
  });

  it('reset zeroes errorCount and timeoutCount', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 2, 5000, 'timeout', Date.now());
    measurementStore.reset();
    const state = get(measurementStore);
    expect(state.errorCount).toBe(0);
    expect(state.timeoutCount).toBe(0);
  });

  it('loadSnapshot recomputes counters from snapshot data', () => {
    const snapshot = {
      lifecycle: 'stopped' as const,
      epoch: 1,
      roundCounter: 3,
      startedAt: 0,
      stoppedAt: 1000,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 0,
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          tierLevel: 1 as const,
          lastLatency: 50,
          lastStatus: 'ok' as const,
          samples: [
            { round: 1, latency: 0, status: 'error' as const, timestamp: 1000 },
            { round: 2, latency: 5000, status: 'timeout' as const, timestamp: 2000 },
            { round: 3, latency: 50, status: 'ok' as const, timestamp: 3000 },
          ],
        },
      },
    };
    measurementStore.loadSnapshot(snapshot);
    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(1);
  });

  it('removeEndpoint adjusts counters', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.initEndpoint('ep2');
    measurementStore.addSample('ep1', 1, 0, 'error', Date.now());
    measurementStore.addSample('ep1', 2, 5000, 'timeout', Date.now());
    measurementStore.addSample('ep2', 1, 0, 'error', Date.now());

    measurementStore.removeEndpoint('ep1');

    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(0);
  });

  it('removeEndpoint with no failures zeroes nothing extra', () => {
    measurementStore.initEndpoint('ep1');
    measurementStore.initEndpoint('ep2');
    measurementStore.addSample('ep1', 1, 50, 'ok', Date.now());
    measurementStore.addSample('ep2', 1, 0, 'error', Date.now());

    measurementStore.removeEndpoint('ep1');

    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(0);
  });

  it('loadSnapshot handles multiple endpoints', () => {
    const snapshot = {
      lifecycle: 'stopped' as const,
      epoch: 1,
      roundCounter: 2,
      startedAt: 0,
      stoppedAt: 1000,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 0,
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          tierLevel: 1 as const,
          lastLatency: null,
          lastStatus: null,
          samples: [
            { round: 1, latency: 0, status: 'error' as const, timestamp: 1000 },
          ],
        },
        ep2: {
          endpointId: 'ep2',
          tierLevel: 1 as const,
          lastLatency: null,
          lastStatus: null,
          samples: [
            { round: 1, latency: 5000, status: 'timeout' as const, timestamp: 1000 },
            { round: 2, latency: 5000, status: 'timeout' as const, timestamp: 2000 },
          ],
        },
      },
    };
    measurementStore.loadSnapshot(snapshot);
    const state = get(measurementStore);
    expect(state.errorCount).toBe(1);
    expect(state.timeoutCount).toBe(2);
  });
});
