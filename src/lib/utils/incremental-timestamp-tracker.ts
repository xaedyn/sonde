// src/lib/utils/incremental-timestamp-tracker.ts
// Replaces O(n) sampleTimestamps scan with an O(k) incremental approach.
// Tracks the per-round minimum timestamp across all endpoints using delta
// reads from RingBuffer.sliceFromTail.

import type { RingBuffer } from './ring-buffer';
import type { MeasurementSample } from '../types';

export class IncrementalTimestampTracker {
  /** Sparse array: index = round, value = minimum timestamp seen for that round */
  private readonly _timestamps: number[] = [];

  /** Per-endpoint tail position for delta reads */
  private readonly _lastProcessedTail: Map<string, number> = new Map();

  /**
   * Process only the new samples pushed since the last call for this endpoint.
   * Updates _timestamps[round] with Math.min(existing, sample.timestamp).
   */
  processNewSamples(
    endpointId: string,
    ringBuffer: RingBuffer<MeasurementSample>,
    currentTailIndex: number
  ): void {
    const lastTail = this._lastProcessedTail.get(endpointId) ?? 0;
    const delta = ringBuffer.sliceFromTail(lastTail);

    for (const sample of delta) {
      const existing = this._timestamps[sample.round];
      if (existing === undefined || sample.timestamp < existing) {
        this._timestamps[sample.round] = sample.timestamp;
      }
    }

    this._lastProcessedTail.set(endpointId, currentTailIndex);
  }

  /** Returns the internal array reference (readonly). Index = round. */
  get timestamps(): readonly number[] {
    return this._timestamps;
  }

  /** Removes the tail-tracking state for a single endpoint. */
  removeEndpoint(endpointId: string): void {
    this._lastProcessedTail.delete(endpointId);
  }

  /** Clears all timestamp data and per-endpoint tail positions. */
  reset(): void {
    this._timestamps.length = 0;
    this._lastProcessedTail.clear();
  }
}
