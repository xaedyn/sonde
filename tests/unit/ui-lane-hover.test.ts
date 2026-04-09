import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { uiStore } from '../../src/lib/stores/ui';

describe('uiStore lane hover', () => {
  beforeEach(() => { uiStore.reset(); });

  it('setLaneHover stores round and x', () => {
    uiStore.setLaneHover(12, 480);
    const state = get(uiStore);
    expect(state.laneHoverRound).toBe(12);
    expect(state.laneHoverX).toBe(480);
  });

  it('clearLaneHover nullifies both fields', () => {
    uiStore.setLaneHover(5, 200);
    uiStore.clearLaneHover();
    const state = get(uiStore);
    expect(state.laneHoverRound).toBeNull();
    expect(state.laneHoverX).toBeNull();
  });

  it('reset clears lane hover', () => {
    uiStore.setLaneHover(7, 300);
    uiStore.reset();
    const state = get(uiStore);
    expect(state.laneHoverRound).toBeNull();
    expect(state.laneHoverX).toBeNull();
  });
});
