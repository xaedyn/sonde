// src/lib/utils/ring-buffer.ts
// Generic fixed-capacity circular buffer.
// tailIndex is monotonically increasing and never stalls at capacity —
// used by derived stores as a delta-tracking coordinate. (THE BET)

export const DEFAULT_RING_CAPACITY = 28_800; // 8 hours at 1 Hz

interface RingBufferOptions {
  readonly capacity: number;
}

type EvictionCallback<T> = (evicted: T) => void;

export class RingBuffer<T> {
  private readonly _items: (T | undefined)[];
  private readonly _capacity: number;
  private _head: number = 0;   // index of oldest item in _items
  private _length: number = 0; // current live item count
  private _tailIndex: number = 0; // total items ever pushed (monotonic)
  private _onEvict: EvictionCallback<T> | null = null;

  constructor(options: RingBufferOptions) {
    if (options.capacity < 1) {
      throw new Error(`RingBuffer: capacity must be >= 1, got ${options.capacity}`);
    }
    this._capacity = options.capacity;
    this._items = new Array<T | undefined>(options.capacity).fill(undefined);
  }

  get capacity(): number { return this._capacity; }
  get length(): number { return this._length; }
  get isEmpty(): boolean { return this._length === 0; }
  get isFull(): boolean { return this._length === this._capacity; }
  get tailIndex(): number { return this._tailIndex; }

  get front(): T | undefined {
    if (this._length === 0) return undefined;
    return this._items[this._head];
  }

  get back(): T | undefined {
    if (this._length === 0) return undefined;
    const tailPos = (this._head + this._length - 1) % this._capacity;
    return this._items[tailPos];
  }

  onEvict(cb: EvictionCallback<T>): void {
    this._onEvict = cb;
  }

  push(item: T): T | undefined {
    let evicted: T | undefined;

    if (this._length === this._capacity) {
      // Buffer full — evict oldest
      evicted = this._items[this._head] as T;
      this._onEvict?.(evicted);
      this._items[this._head] = item;
      this._head = (this._head + 1) % this._capacity;
    } else {
      // Space available — write at tail position
      const writePos = (this._head + this._length) % this._capacity;
      this._items[writePos] = item;
      this._length++;
    }

    this._tailIndex++;
    return evicted;
  }

  /**
   * Insert item at a position determined by a comparator (for straggler insertion).
   * Walks backward from newest to find the correct position using the provided predicate.
   * `shouldInsertBefore(existingItem)` returns true when the new item should be placed before existingItem.
   * O(k) where k = distance from tail to insertion point (typically 1-2 for stragglers).
   */
  insertOrdered(item: T, shouldInsertBefore: (existing: T) => boolean): T | undefined {
    if (this._length === 0) {
      return this.push(item);
    }

    // Find insertion point by walking backward from tail
    let insertLogical = this._length; // default: append
    for (let i = this._length - 1; i >= 0; i--) {
      const existing = this._items[(this._head + i) % this._capacity] as T;
      if (shouldInsertBefore(existing)) {
        insertLogical = i;
      } else {
        break;
      }
    }

    if (insertLogical === this._length) {
      // Appending — normal push
      return this.push(item);
    }

    // Need to shift items right from insertLogical to tail to make room
    let evicted: T | undefined;

    if (this._length === this._capacity) {
      // Will evict the oldest item (head)
      evicted = this._items[this._head] as T;
      this._onEvict?.(evicted);
      // Adjust insertion point since head moves
      insertLogical = Math.max(0, insertLogical - 1);
      this._head = (this._head + 1) % this._capacity;
      this._length--;
    }

    // Shift items from insertLogical to end right by one
    for (let i = this._length; i > insertLogical; i--) {
      const srcPos = (this._head + i - 1) % this._capacity;
      const dstPos = (this._head + i) % this._capacity;
      this._items[dstPos] = this._items[srcPos];
    }

    const writePos = (this._head + insertLogical) % this._capacity;
    this._items[writePos] = item;
    this._length++;
    this._tailIndex++;

    return evicted;
  }

  at(index: number): T | undefined {
    if (index < 0 || index >= this._length) return undefined;
    return this._items[(this._head + index) % this._capacity];
  }

  [Symbol.iterator](): Iterator<T> {
    let i = 0;
    return {
      next: (): IteratorResult<T> => {
        if (i < this._length) {
          const value = this._items[(this._head + i) % this._capacity] as T;
          i++;
          return { value, done: false };
        }
        return { value: undefined as unknown as T, done: true };
      },
    };
  }

  /**
   * Return all items pushed since tailStart (inclusive).
   * tailStart is an absolute tailIndex value.
   * If tailStart is before the buffer's oldest live item, returns all live items.
   */
  sliceFromTail(tailStart: number): T[] {
    if (this._length === 0) return [];

    // The tailIndex of the oldest live item = _tailIndex - _length
    const oldestTailIndex = this._tailIndex - this._length;

    // Clamp tailStart so we don't go before the oldest item
    const effectiveStart = Math.max(tailStart, oldestTailIndex);
    const skipCount = effectiveStart - oldestTailIndex;

    const result: T[] = [];
    for (let i = skipCount; i < this._length; i++) {
      result.push(this._items[(this._head + i) % this._capacity] as T);
    }
    return result;
  }

  toArray(): T[] {
    const result: T[] = new Array<T>(this._length);
    for (let i = 0; i < this._length; i++) {
      result[i] = this._items[(this._head + i) % this._capacity] as T;
    }
    return result;
  }

  /**
   * Bulk load from plain array. Clears existing contents.
   * Items beyond capacity are truncated from the front (oldest discarded).
   */
  loadFrom(items: T[]): void {
    this._head = 0;
    this._length = 0;
    this._tailIndex = 0;
    this._items.fill(undefined);

    // Truncate to last `capacity` items if over capacity
    const start = Math.max(0, items.length - this._capacity);
    for (let i = start; i < items.length; i++) {
      const writePos = (this._head + this._length) % this._capacity;
      this._items[writePos] = items[i];
      this._length++;
      this._tailIndex++;
    }
  }
}
