import { describe, it, expect } from 'vitest';
import { IncrementalTimestampTracker } from '../../src/lib/utils/incremental-timestamp-tracker';
import { RingBuffer } from '../../src/lib/utils/ring-buffer';
import type { MeasurementSample } from '../../src/lib/types';

function makeSample(round: number, timestamp: number): MeasurementSample {
  return { round, timestamp, latency: 10, status: 'ok' };
}

describe('IncrementalTimestampTracker', () => {
  it('starts empty — timestamps is an empty array', () => {
    const tracker = new IncrementalTimestampTracker();
    expect(tracker.timestamps).toEqual([]);
  });

  it('populates timestamps for rounds from a single endpoint', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 1000));
    rb.push(makeSample(1, 2000));
    rb.push(makeSample(2, 3000));

    tracker.processNewSamples('ep1', rb, 0);

    expect(tracker.timestamps[0]).toBe(1000);
    expect(tracker.timestamps[1]).toBe(2000);
    expect(tracker.timestamps[2]).toBe(3000);
  });

  it('uses min timestamp across endpoints for the same round', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb1 = new RingBuffer<MeasurementSample>({ capacity: 10 });
    const rb2 = new RingBuffer<MeasurementSample>({ capacity: 10 });

    rb1.push(makeSample(0, 5000));
    rb2.push(makeSample(0, 3000));

    tracker.processNewSamples('ep1', rb1, 0);
    tracker.processNewSamples('ep2', rb2, 0);

    expect(tracker.timestamps[0]).toBe(3000);
  });

  it('min wins when second endpoint has lower timestamp', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb1 = new RingBuffer<MeasurementSample>({ capacity: 10 });
    const rb2 = new RingBuffer<MeasurementSample>({ capacity: 10 });

    rb1.push(makeSample(0, 2000));
    rb2.push(makeSample(0, 9999));

    tracker.processNewSamples('ep1', rb1, 0);
    tracker.processNewSamples('ep2', rb2, 0);

    expect(tracker.timestamps[0]).toBe(2000);
  });

  it('only processes delta — does not re-process already-seen items', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });

    rb.push(makeSample(0, 1000));
    rb.push(makeSample(1, 2000));
    tracker.processNewSamples('ep1', rb, 0);

    const tailAfterFirst = rb.tailIndex;

    // Change round 0 timestamp via a second endpoint to a lower value
    // then process ep1 again — it should NOT re-process old items
    rb.push(makeSample(2, 3000));
    tracker.processNewSamples('ep1', rb, tailAfterFirst);

    expect(tracker.timestamps[2]).toBe(3000);
    // round 0 and 1 should still have their original values
    expect(tracker.timestamps[0]).toBe(1000);
    expect(tracker.timestamps[1]).toBe(2000);
  });

  it('reset clears all state', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 1000));
    tracker.processNewSamples('ep1', rb, 0);

    tracker.reset();

    expect(tracker.timestamps).toEqual([]);
  });

  it('after reset processes all samples as new', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    rb.push(makeSample(0, 500));
    tracker.processNewSamples('ep1', rb, 0);
    tracker.reset();

    // After reset the tail tracking is cleared — processing from tailIndex 0 again
    tracker.processNewSamples('ep1', rb, 0);
    expect(tracker.timestamps[0]).toBe(500);
  });

  it('timestamps getter returns the same array reference on repeated calls', () => {
    const tracker = new IncrementalTimestampTracker();
    const ref1 = tracker.timestamps;
    const ref2 = tracker.timestamps;
    expect(ref1).toBe(ref2);
  });

  it('handles empty ring buffer gracefully', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb = new RingBuffer<MeasurementSample>({ capacity: 10 });
    expect(() => tracker.processNewSamples('ep1', rb, 0)).not.toThrow();
    expect(tracker.timestamps).toEqual([]);
  });

  it('removeEndpoint clears tail tracking for that endpoint only', () => {
    const tracker = new IncrementalTimestampTracker();
    const rb1 = new RingBuffer<MeasurementSample>({ capacity: 10 });
    const rb2 = new RingBuffer<MeasurementSample>({ capacity: 10 });

    rb1.push(makeSample(0, 1000));
    rb2.push(makeSample(0, 2000));
    tracker.processNewSamples('ep1', rb1, 0);
    tracker.processNewSamples('ep2', rb2, 0);

    tracker.removeEndpoint('ep1');

    // ep1 re-processes from scratch (tail reset), ep2 still has its tail
    rb1.push(makeSample(1, 3000));
    rb2.push(makeSample(1, 4000));
    const tail2 = rb2.tailIndex;
    tracker.processNewSamples('ep1', rb1, 0);
    tracker.processNewSamples('ep2', rb2, tail2);

    expect(tracker.timestamps[1]).toBe(3000);
  });

  it('removeEndpoint on unknown id does not throw', () => {
    const tracker = new IncrementalTimestampTracker();
    expect(() => tracker.removeEndpoint('nonexistent')).not.toThrow();
  });
});
