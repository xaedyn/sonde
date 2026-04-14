// src/lib/utils/sorted-insertion-buffer.ts
// Persistent sorted array with O(log n) binary-search insertion.
// Maintains ascending order at all times. No capacity limit.

export class SortedInsertionBuffer {
  private readonly _data: number[] = [];

  /**
   * Insert a value using binary search to locate the correct position, then
   * splice. O(log n) search + O(n) shift — optimal for read-heavy workloads
   * where sorted access is frequent.
   */
  insert(value: number): void {
    if (!Number.isFinite(value)) return; // silently skip NaN/Infinity — don't corrupt sort order
    let lo = 0;
    let hi = this._data.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._data[mid] <= value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    this._data.splice(lo, 0, value);
  }

  /** Returns the internal sorted array reference (readonly). */
  get sorted(): readonly number[] {
    return this._data;
  }

  /** Current number of elements. */
  get length(): number {
    return this._data.length;
  }

  /** Clear all values. */
  reset(): void {
    this._data.length = 0;
  }

  /**
   * Replace contents with the provided values, sorted once.
   * More efficient than inserting one-by-one when bulk loading.
   */
  loadFrom(values: number[]): void {
    this._data.length = 0;
    this._data.push(...values);
    this._data.sort((a, b) => a - b);
  }
}
