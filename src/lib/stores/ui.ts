// src/lib/stores/ui.ts
// UI state store — manages view mode, card expansion, hover/selection targets,
// and panel visibility. No side effects; all state is local to this module.

import { writable } from 'svelte/store';
import type { LiveTimeRange, TerminalEventType, UIState } from '../types';

const initialState = (): UIState => ({
  // 'overview' is the v2 default; v4 persisted payloads are migrated in
  // persistence.ts so 'split'/'timeline'/'heatmap' never land here directly.
  activeView: 'overview',
  expandedCards: new Set<string>(),
  hoverTarget: null,
  selectedTarget: null,
  showCrosshairs: false,
  showSettings: false,
  showShare: false,
  showKeyboardHelp: false,
  isSharedView: false,
  laneHoverRound: null,
  laneHoverX: null,
  laneHoverY: null,
  heatmapTooltip: null,
  showEndpoints: false,
  focusedEndpointId: null,
  liveOptions: {
    split: false,
    timeRange: '5m',
  },
  terminalFilters: new Set<TerminalEventType>(),
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
        if (next.has(endpointId)) {
          next.delete(endpointId);
        } else {
          next.add(endpointId);
        }
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
    setSharedView(isShared: boolean): void {
      update((s) => ({ ...s, isSharedView: isShared }));
    },
    clearSharedView(): void {
      update((s) => ({ ...s, isSharedView: false }));
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
    setFocusedEndpoint(id: string | null): void {
      update((s) => ({ ...s, focusedEndpointId: id }));
    },
    toggleFocusedEndpoint(id: string): void {
      update((s) => ({
        ...s,
        focusedEndpointId: s.focusedEndpointId === id ? null : id,
      }));
    },
    setLiveSplit(split: boolean): void {
      update((s) => ({ ...s, liveOptions: { ...s.liveOptions, split } }));
    },
    setLiveTimeRange(range: LiveTimeRange): void {
      update((s) => ({ ...s, liveOptions: { ...s.liveOptions, timeRange: range } }));
    },
    toggleTerminalFilter(type: TerminalEventType): void {
      update((s) => {
        const next = new Set(s.terminalFilters);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return { ...s, terminalFilters: next };
      });
    },
    clearTerminalFilters(): void {
      update((s) => ({ ...s, terminalFilters: new Set<TerminalEventType>() }));
    },
    reset(): void {
      set(initialState());
    },
  };
}

export const uiStore = createUiStore();
