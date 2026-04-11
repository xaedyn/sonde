import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { endpointStore } from '../../../src/lib/stores/endpoints';

describe('endpointStore.reorderEndpoint', () => {
  beforeEach(() => {
    endpointStore.reset();
  });

  it('moves an endpoint forward (0 → 1)', () => {
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;

    endpointStore.reorderEndpoint(idA, idB);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idA);
  });

  it('moves an endpoint backward (1 → 0)', () => {
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;

    endpointStore.reorderEndpoint(idB, idA);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idA);
  });

  it('no-ops when fromId === toId', () => {
    const before = get(endpointStore);
    const idsBefore = before.map(ep => ep.id);

    endpointStore.reorderEndpoint(before[0]!.id, before[0]!.id);

    const after = get(endpointStore);
    expect(after.map(ep => ep.id)).toEqual(idsBefore);
  });

  it('no-ops when fromId is not found', () => {
    const before = get(endpointStore);
    const idsBefore = before.map(ep => ep.id);

    endpointStore.reorderEndpoint('nonexistent', before[0]!.id);

    const after = get(endpointStore);
    expect(after.map(ep => ep.id)).toEqual(idsBefore);
  });

  it('no-ops when toId is not found', () => {
    const before = get(endpointStore);
    const idsBefore = before.map(ep => ep.id);

    endpointStore.reorderEndpoint(before[0]!.id, 'nonexistent');

    const after = get(endpointStore);
    expect(after.map(ep => ep.id)).toEqual(idsBefore);
  });

  it('preserves all endpoint data after reorder', () => {
    const before = get(endpointStore);
    const epA = before[0]!;

    endpointStore.reorderEndpoint(epA.id, before[1]!.id);

    const after = get(endpointStore);
    expect(after[1]).toEqual(epA);
  });

  it('works with 3+ endpoints: moves middle to front', () => {
    endpointStore.addEndpoint('https://extra.example.com', 'Extra');
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;
    const idC = before[2]!.id;

    endpointStore.reorderEndpoint(idB, idA);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idA);
    expect(after[2]!.id).toBe(idC);
  });

  it('works with 3+ endpoints: moves first to last', () => {
    endpointStore.addEndpoint('https://extra.example.com', 'Extra');
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;
    const idC = before[2]!.id;

    endpointStore.reorderEndpoint(idA, idC);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idC);
    expect(after[2]!.id).toBe(idA);
  });
});
