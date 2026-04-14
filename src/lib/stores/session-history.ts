// src/lib/stores/session-history.ts
// Write-only per-hour eviction accumulator.
// Plain class — NOT a Svelte store. Compacts measurement samples into hourly
// buckets to bound memory during long sessions.

import type { MeasurementSample } from '../types';
import { percentileSorted } from '../utils/statistics';

// ── Internal bucket shape ───────────────────────────────────────────────────

interface HourBucket {
  hourKey: string;
  count: number;
  errorCount: number;
  timeoutCount: number;
  min: number;
  max: number;
  sum: number;
  sumSquares: number;
  /** Sorted ascending latency array — only ok-sample latencies */
  latencies: number[];
}

// ── Public summary shape ────────────────────────────────────────────────────

export interface HourSummary {
  readonly hourKey: string;
  readonly count: number;
  readonly errorCount: number;
  readonly timeoutCount: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly variance: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hourKeyFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 13);
}

/**
 * Binary-search insertion into a sorted ascending array (in-place).
 * Duplicate values are allowed — inserted after existing equal values.
 */
function sortedInsert(arr: number[], value: number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, value);
}

function bucketToSummary(b: HourBucket): HourSummary {
  const okCount = b.latencies.length;
  const mean = okCount > 0 ? b.sum / okCount : 0;
  // Population variance: E[x²] - (E[x])²
  const variance = okCount > 0 ? b.sumSquares / okCount - mean * mean : 0;
  const p50 = percentileSorted(b.latencies, 50);
  const p95 = percentileSorted(b.latencies, 95);
  const p99 = percentileSorted(b.latencies, 99);

  return {
    hourKey: b.hourKey,
    count: b.count,
    errorCount: b.errorCount,
    timeoutCount: b.timeoutCount,
    min: b.min,
    max: b.max,
    mean,
    variance: Math.max(0, variance),
    p50,
    p95,
    p99,
  };
}

// ── SessionHistoryStore ─────────────────────────────────────────────────────

export class SessionHistoryStore {
  /** endpointId → (hourKey → HourBucket) */
  private readonly _data: Map<string, Map<string, HourBucket>> = new Map();

  /**
   * Derive the hour bucket from sample.timestamp and upsert.
   * Only ok-samples contribute to latency statistics.
   */
  accumulate(endpointId: string, sample: MeasurementSample): void {
    const hourKey = hourKeyFromTimestamp(sample.timestamp);

    let endpointBuckets = this._data.get(endpointId);
    if (!endpointBuckets) {
      endpointBuckets = new Map();
      this._data.set(endpointId, endpointBuckets);
    }

    let bucket = endpointBuckets.get(hourKey);
    if (!bucket) {
      bucket = {
        hourKey,
        count: 0,
        errorCount: 0,
        timeoutCount: 0,
        min: 0,
        max: 0,
        sum: 0,
        sumSquares: 0,
        latencies: [],
      };
      endpointBuckets.set(hourKey, bucket);
    }

    bucket.count++;

    if (sample.status === 'error') {
      bucket.errorCount++;
    } else if (sample.status === 'timeout') {
      bucket.timeoutCount++;
    } else {
      // ok sample — update latency statistics
      const lat = sample.latency;
      sortedInsert(bucket.latencies, lat);
      bucket.sum += lat;
      bucket.sumSquares += lat * lat;
      if (bucket.latencies.length === 1) {
        bucket.min = lat;
        bucket.max = lat;
      } else {
        if (lat < bucket.min) bucket.min = lat;
        if (lat > bucket.max) bucket.max = lat;
      }
    }
  }

  /**
   * Returns all hour summaries for an endpoint, sorted chronologically by
   * hourKey (ISO string sort = chronological for this format).
   */
  getSummaries(endpointId: string): readonly HourSummary[] {
    const endpointBuckets = this._data.get(endpointId);
    if (!endpointBuckets) return [];

    return Array.from(endpointBuckets.values())
      .sort((a, b) => (a.hourKey < b.hourKey ? -1 : a.hourKey > b.hourKey ? 1 : 0))
      .map(bucketToSummary);
  }

  /** Returns the summary for a single hour bucket, or undefined if not found. */
  getSummary(endpointId: string, hourKey: string): HourSummary | undefined {
    const bucket = this._data.get(endpointId)?.get(hourKey);
    return bucket ? bucketToSummary(bucket) : undefined;
  }

  /** Remove all history for a single endpoint. */
  removeEndpoint(id: string): void {
    this._data.delete(id);
  }

  /** Clear all history. */
  reset(): void {
    this._data.clear();
  }

  /** True when at least one sample has been accumulated. */
  get hasHistory(): boolean {
    return this._data.size > 0;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────
export const sessionHistoryStore = new SessionHistoryStore();
