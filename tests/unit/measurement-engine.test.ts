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

  it('batches multiple worker messages into a single addSamples call', () => {
    // Setup 3 endpoints (note: default endpoints also exist after reset)
    const id1 = endpointStore.addEndpoint('https://a.example.com');
    const id2 = endpointStore.addEndpoint('https://b.example.com');
    const id3 = endpointStore.addEndpoint('https://c.example.com');
    const testIds = [id1, id2, id3];
    engine.start();

    const epoch = get(measurementStore).epoch;

    // Track store update count to verify batching
    let updateCount = 0;
    const unsub = measurementStore.subscribe(() => { updateCount++; });
    // Reset count after subscription (subscribe fires once immediately)
    updateCount = 0;

    // Set expectedResponses to 3 to enable batching
    (engine as unknown as { expectedResponses: number }).expectedResponses = 3;

    // Send first 2 messages — should NOT flush yet
    for (let i = 0; i < 2; i++) {
      engine._handleWorkerMessage({
        type: 'result',
        endpointId: testIds[i]!,
        epoch,
        roundId: 0,
        timing: { total: 100, dnsLookup: 0, tcpConnect: 10, tlsHandshake: 0, ttfb: 80, contentTransfer: 10 },
      });
    }
    expect(updateCount).toBe(0); // buffered, no store update yet

    // Send 3rd message — triggers flush
    engine._handleWorkerMessage({
      type: 'result',
      endpointId: testIds[2]!,
      epoch,
      roundId: 0,
      timing: { total: 100, dnsLookup: 0, tcpConnect: 10, tlsHandshake: 0, ttfb: 80, contentTransfer: 10 },
    });

    // Should be exactly 1 store update (batched)
    expect(updateCount).toBe(1);

    // All 3 test endpoints should have their sample
    const state = get(measurementStore);
    for (const id of testIds) {
      expect(state.endpoints[id]?.samples).toHaveLength(1);
      expect(state.endpoints[id]?.samples[0]?.status).toBe('ok');
    }

    unsub();
  });

  // ── Visibility-aware pause/resume ─────────────────────────────────────────

  it('pause is idempotent', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    engine._pause();
    expect(engine._paused).toBe(true);
    engine._pause(); // second call is no-op
    expect(engine._paused).toBe(true);
  });

  it('resume is idempotent', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    engine._pause();
    engine._resume();
    expect(engine._paused).toBe(false);
    engine._resume(); // second call is no-op
    expect(engine._paused).toBe(false);
  });

  it('pause+resume leaves no orphan timers', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    // Pause clears the round timer
    engine._pause();
    const timerAfterPause = (engine as unknown as { roundTimer: ReturnType<typeof setTimeout> | null }).roundTimer;
    expect(timerAfterPause).toBeNull();

    // Resume schedules a new round
    engine._resume();
    const timerAfterResume = (engine as unknown as { roundTimer: ReturnType<typeof setTimeout> | null }).roundTimer;
    expect(timerAfterResume).not.toBeNull();
  });

  it('_dispatchRound is a no-op while paused', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();

    const roundBefore = get(measurementStore).roundCounter;
    engine._pause();
    engine._dispatchRound();
    const roundAfter = get(measurementStore).roundCounter;
    // roundCounter should not have incremented because _dispatchRound bailed
    expect(roundAfter).toBe(roundBefore);
  });

  it('resume reschedules next round', () => {
    endpointStore.addEndpoint('https://example.com');
    engine.start();
    engine._pause();
    expect((engine as unknown as { roundTimer: ReturnType<typeof setTimeout> | null }).roundTimer).toBeNull();
    engine._resume();
    expect((engine as unknown as { roundTimer: ReturnType<typeof setTimeout> | null }).roundTimer).not.toBeNull();
  });

  it('flushes partial batch via timeout for stragglers', async () => {
    const testId = endpointStore.addEndpoint('https://a.example.com');
    endpointStore.addEndpoint('https://b.example.com');
    engine.start();

    const epoch = get(measurementStore).epoch;

    // Expect 2 responses but only send 1
    (engine as unknown as { expectedResponses: number }).expectedResponses = 2;

    engine._handleWorkerMessage({
      type: 'result',
      endpointId: testId,
      epoch,
      roundId: 0,
      timing: { total: 50, dnsLookup: 0, tcpConnect: 5, tlsHandshake: 0, ttfb: 40, contentTransfer: 5 },
    });

    // Not flushed yet (1 < 2 expected)
    expect(get(measurementStore).endpoints[testId]?.samples).toHaveLength(0);

    // Manually flush (simulates timeout)
    (engine as unknown as { _flushRound: (id: number) => void })._flushRound(0);

    // Now it should be flushed
    expect(get(measurementStore).endpoints[testId]?.samples).toHaveLength(1);
  });
});
