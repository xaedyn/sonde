import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { uiStore } from '../../src/lib/stores/ui';

describe('uiStore lane hover', () => {
  beforeEach(() => { uiStore.reset(); });

  it('setLaneHover stores round, x, and y', () => {
    uiStore.setLaneHover(12, 480, 250);
    const state = get(uiStore);
    expect(state.laneHoverRound).toBe(12);
    expect(state.laneHoverX).toBe(480);
    expect(state.laneHoverY).toBe(250);
  });

  it('clearLaneHover nullifies all fields', () => {
    uiStore.setLaneHover(5, 200, 150);
    uiStore.clearLaneHover();
    const state = get(uiStore);
    expect(state.laneHoverRound).toBeNull();
    expect(state.laneHoverX).toBeNull();
    expect(state.laneHoverY).toBeNull();
  });

  it('reset clears lane hover', () => {
    uiStore.setLaneHover(7, 300, 200);
    uiStore.reset();
    const state = get(uiStore);
    expect(state.laneHoverRound).toBeNull();
    expect(state.laneHoverX).toBeNull();
    expect(state.laneHoverY).toBeNull();
  });
});
