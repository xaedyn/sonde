import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MeasurementEngine } from '../../src/lib/engine/measurement-engine';
import { measurementStore } from '../../src/lib/stores/measurements';
import { endpointStore } from '../../src/lib/stores/endpoints';
import { settingsStore } from '../../src/lib/stores/settings';
import { get } from 'svelte/store';
import type { WorkerToMainMessage } from '../../src/lib/types';

describe('MeasurementEngine', () => {
  let engine: MeasurementEngine;

  beforeEach(() => {
    engine = new MeasurementEngine();
    measurementStore.reset();
    endpointStore.reset();
    settingsStore.reset();
  });

  afterEach(() => {
    engine.stop();
  });

  it('starts in idle state', () => {
    expect(get(measurementStore).lifecycle).toBe('idle');
  });

  it('increments epoch on each start()', () => {
    endpointStore.addEndpoint('https://example.com');
    const epoch0 = get(measurementStore).epoch;
    engine.start();
    const epoch1 = get(measurementStore).epoch;
    expect(epoch1).toBeGreaterThan(epoch0);
  });

  it('is a no-op if stop() called while idle', () => {
    engine.stop();
    expect(get(measurementStore).lifecycle).toBe('idle');
  });

  it('discards messages with stale epoch', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    const staleEpoch = get(measurementStore).epoch - 1;
    const staleMessage: WorkerToMainMessage = {
      type: 'result',
      endpointId: 'ep-stale',
      epoch: staleEpoch,
      roundId: 0,
      timing: { total: 100, dnsLookup: 0, tcpConnect: 10, tlsHandshake: 0, ttfb: 80, contentTransfer: 10 },
    };
    engine._handleWorkerMessage(staleMessage);
    expect(Object.keys(get(measurementStore).endpoints)).not.toContain('ep-stale');
  });

  it('plots timeout at the configured timeout value', () => {
    endpointStore.addEndpoint('https://example.com');
    settingsStore.update(s => ({ ...s, timeout: 5000 }));
    engine.start();
    const endpoints = get(endpointStore);
    const id = endpoints[0]?.id;
    if (!id) throw new Error('No endpoint created');
    const epoch = get(measurementStore).epoch;
    engine._handleWorkerMessage({
      type: 'timeout',
      endpointId: id,
      epoch,
      roundId: 0,
      timeoutValue: 5000,
    });
    const sample = get(measurementStore).endpoints[id]?.samples[0];
    expect(sample?.status).toBe('timeout');
    expect(sample?.latency).toBe(5000);
  });
});
