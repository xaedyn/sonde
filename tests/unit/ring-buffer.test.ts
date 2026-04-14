import { describe, it, expect, vi } from 'vitest';
import { RingBuffer, DEFAULT_RING_CAPACITY } from '../../src/lib/utils/ring-buffer';

describe('RingBuffer — AC1: fixed-capacity prevents unbounded growth', () => {
  it('DEFAULT_RING_CAPACITY equals 28800', () => {
    expect(DEFAULT_RING_CAPACITY).toBe(28_800);
  });

  it('constructor throws if capacity < 1', () => {
    expect(() => new RingBuffer<number>({ capacity: 0 })).toThrow();
  });

  it('starts empty', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    expect(rb.length).toBe(0);
    expect(rb.isEmpty).toBe(true);
    expect(rb.isFull).toBe(false);
  });

  it('push increases length up to capacity', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); expect(rb.length).toBe(1);
    rb.push(2); expect(rb.length).toBe(2);
    rb.push(3); expect(rb.length).toBe(3);
    expect(rb.isFull).toBe(true);
  });

  it('push beyond capacity does not increase length', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    for (let i = 0; i < 10; i++) rb.push(i);
    expect(rb.length).toBe(3);
  });

  it('push evicts oldest item when full', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3);
    rb.push(4); // evicts 1
    expect(rb.toArray()).toEqual([2, 3, 4]);
  });

  it('push returns evicted item when full', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3);
    const evicted = rb.push(4);
    expect(evicted).toBe(1);
  });

  it('push returns undefined when not full', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    const evicted = rb.push(1);
    expect(evicted).toBeUndefined();
  });

  it('onEvict callback fires with evicted item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    const onEvict = vi.fn();
    rb.onEvict(onEvict);
    rb.push(1); rb.push(2); rb.push(3);
    rb.push(4);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith(1);
  });

  it('onEvict fires before item is overwritten (synchronous)', () => {
    const rb = new RingBuffer<number>({ capacity: 2 });
    const evictions: number[] = [];
    rb.onEvict(v => evictions.push(v));
    rb.push(10); rb.push(20);
    rb.push(30); // evicts 10
    rb.push(40); // evicts 20
    expect(evictions).toEqual([10, 20]);
  });

  it('at(0) returns oldest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(10); rb.push(20); rb.push(30);
    expect(rb.at(0)).toBe(10);
  });

  it('at(length-1) returns newest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(10); rb.push(20); rb.push(30);
    expect(rb.at(2)).toBe(30);
  });

  it('at() wraps correctly after eviction', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3); rb.push(4); // evicts 1
    expect(rb.at(0)).toBe(2);
    expect(rb.at(1)).toBe(3);
    expect(rb.at(2)).toBe(4);
  });

  it('Symbol.iterator yields oldest to newest', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    rb.push(1); rb.push(2); rb.push(3); rb.push(4); rb.push(5); // evicts 1
    expect([...rb]).toEqual([2, 3, 4, 5]);
  });

  it('toArray returns new plain array each call', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2);
    const a = rb.toArray();
    const b = rb.toArray();
    expect(a).toEqual([1, 2]);
    expect(a).not.toBe(b);
  });

  it('loadFrom clears and bulk-inserts', () => {
    const rb = new RingBuffer<number>({ capacity: 5 });
    rb.push(99);
    rb.loadFrom([1, 2, 3]);
    expect(rb.toArray()).toEqual([1, 2, 3]);
  });

  it('loadFrom truncates items beyond capacity (oldest discarded)', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.loadFrom([1, 2, 3, 4, 5]);
    expect(rb.toArray()).toEqual([3, 4, 5]);
  });

  it('tailIndex starts at 0', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    expect(rb.tailIndex).toBe(0);
  });

  it('tailIndex increments monotonically on every push', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); expect(rb.tailIndex).toBe(1);
    rb.push(2); expect(rb.tailIndex).toBe(2);
    rb.push(3); expect(rb.tailIndex).toBe(3);
    rb.push(4); // evicts 1
    expect(rb.tailIndex).toBe(4);
  });

  it('tailIndex does not stall at capacity — THE BET', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    for (let i = 0; i < 100; i++) rb.push(i);
    expect(rb.tailIndex).toBe(100);
    expect(rb.length).toBe(3);
  });

  it('sliceFromTail(0) returns all items', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    rb.push(10); rb.push(20); rb.push(30);
    expect(rb.sliceFromTail(0)).toEqual([10, 20, 30]);
  });

  it('sliceFromTail returns only new items since last call', () => {
    const rb = new RingBuffer<number>({ capacity: 4 });
    rb.push(10); rb.push(20);
    const tail1 = rb.tailIndex;
    rb.push(30); rb.push(40);
    expect(rb.sliceFromTail(tail1)).toEqual([30, 40]);
  });

  it('sliceFromTail returns all live items when tailStart is before oldest', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(1); rb.push(2); rb.push(3); rb.push(4); // evicts 1, oldest now at index 1
    expect(rb.sliceFromTail(0)).toEqual([2, 3, 4]); // 0 is before oldest — returns all live
  });

  it('front returns oldest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(5); rb.push(6); rb.push(7);
    expect(rb.front).toBe(5);
  });

  it('back returns newest item', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    rb.push(5); rb.push(6); rb.push(7);
    expect(rb.back).toBe(7);
  });

  it('front and back are undefined when empty', () => {
    const rb = new RingBuffer<number>({ capacity: 3 });
    expect(rb.front).toBeUndefined();
    expect(rb.back).toBeUndefined();
  });

  it('insertOrdered inserts in correct position', () => {
    const rb = new RingBuffer<number>({ capacity: 5 });
    rb.push(1); rb.push(3); rb.push(5);
    rb.insertOrdered(2, (existing) => existing > 2);
    expect(rb.toArray()).toEqual([1, 2, 3, 5]);
  });

  it('insertOrdered appends when item is newest', () => {
    const rb = new RingBuffer<number>({ capacity: 5 });
    rb.push(1); rb.push(2);
    rb.insertOrdered(3, (existing) => existing > 3);
    expect(rb.toArray()).toEqual([1, 2, 3]);
  });

  it('capacity getter returns construction value', () => {
    const rb = new RingBuffer<number>({ capacity: 42 });
    expect(rb.capacity).toBe(42);
  });
});
