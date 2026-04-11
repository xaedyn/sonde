// src/lib/stores/ui.ts
// UI state store — manages view mode, card expansion, hover/selection targets,
// and panel visibility. No side effects; all state is local to this module.

import { writable } from 'svelte/store';
import type { UIState } from '../types';

const initialState = (): UIState => ({
  activeView: 'split',
  expandedCards: new Set<string>(),
  hoverTarget: null,
  selectedTarget: null,
  showCrosshairs: false,
  showSettings: false,
  showShare: false,
  showKeyboardHelp: false,
  isSharedView: false,
  sharedResultsTimestamp: null,
  laneHoverRound: null,
  laneHoverX: null,
  laneHoverY: null,
  heatmapTooltip: null,
  showEndpoints: false,
});

function createUiStore() {
  const { subscribe, set, update } = writable<UIState>(initialState());
  return {
    subscribe,
    setActiveView(view: UIState['activeView']): void {
      update((s) => ({ ...s, activeView: view }));
    },
    toggleCard(endpointId: string): void {
      update((s) => {
        const next = new Set(s.expandedCards);
        next.has(endpointId) ? next.delete(endpointId) : next.add(endpointId);
        return { ...s, expandedCards: next };
      });
    },
    setHover(target: UIState['hoverTarget']): void {
      update((s) => ({ ...s, hoverTarget: target }));
    },
    setSelected(target: UIState['selectedTarget']): void {
      update((s) => ({ ...s, selectedTarget: target }));
    },
    toggleSettings(): void {
      update((s) => ({ ...s, showSettings: !s.showSettings }));
    },
    toggleShare(): void {
      update((s) => ({ ...s, showShare: !s.showShare }));
    },
    toggleKeyboardHelp(): void {
      update((s) => ({ ...s, showKeyboardHelp: !s.showKeyboardHelp }));
    },
    setSharedView(isShared: boolean, timestamp: number | null = null): void {
      update((s) => ({
        ...s,
        isSharedView: isShared,
        sharedResultsTimestamp: timestamp,
      }));
    },
    clearSharedView(): void {
      update((s) => ({
        ...s,
        isSharedView: false,
        sharedResultsTimestamp: null,
      }));
    },
    setLaneHover(round: number, x: number, y: number): void {
      update((s) => ({ ...s, laneHoverRound: round, laneHoverX: x, laneHoverY: y }));
    },
    clearLaneHover(): void {
      update((s) => ({ ...s, laneHoverRound: null, laneHoverX: null, laneHoverY: null }));
    },
    setHeatmapTooltip(text: string, x: number, y: number): void {
      update((s) => ({ ...s, heatmapTooltip: { text, x, y } }));
    },
    clearHeatmapTooltip(): void {
      update((s) => ({ ...s, heatmapTooltip: null }));
    },
    toggleEndpoints(): void {
      update((s) => ({ ...s, showEndpoints: !s.showEndpoints }));
    },
    reset(): void {
      set(initialState());
    },
  };
}

export const uiStore = createUiStore();
