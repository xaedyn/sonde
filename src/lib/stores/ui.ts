// src/lib/stores/ui.ts
// UI state store — manages view mode, card expansion, hover/selection targets,
// and panel visibility. No side effects; all state is local to this module.

import { writable } from 'svelte/store';
import type { LiveTimeRange, PendingShare, SharedReportContext, TerminalEventType, UIState } from '../types';

const initialState = (): UIState => ({
  // 'overview' is the v2 default. Phase 7 migration (v6→v7) collapses any
  // persisted Lanes-family view ('lanes'/'timeline'/'heatmap'/'split') to
  // 'overview' before reaching here, so only the five current views land.
  activeView: 'overview',
  expandedCards: new Set<string>(),
  showSettings: false,
  showShare: false,
  showKeyboardHelp: false,
  isSharedView: false,
  sharedReportMode: false,
  sharedReportContext: null,
  pendingShare: null,
  showEndpoints: false,
  focusedEndpointId: null,
  liveOptions: {
    split: false,
    timeRange: '5m',
  },
  terminalFilters: new Set<TerminalEventType>(),
  overviewSubtab: 'racing',
  autoStartSuppressionReason: null,
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
      update((s) => ({
        ...s,
        isSharedView: false,
        sharedReportMode: false,
        sharedReportContext: null,
      }));
    },
    setSharedReportMode(enabled: boolean): void {
      update((s) => ({ ...s, sharedReportMode: enabled }));
    },
    setSharedReportContext(context: SharedReportContext | null): void {
      update((s) => ({ ...s, sharedReportContext: context }));
    },
    setPendingShare(pending: PendingShare): void {
      update((s) => ({ ...s, pendingShare: pending }));
    },
    clearPendingShare(): void {
      update((s) => ({ ...s, pendingShare: null }));
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
    setOverviewSubtab(tab: UIState['overviewSubtab']): void {
      update((s) => ({ ...s, overviewSubtab: tab }));
    },
    setAutoStartSuppressionReason(reason: UIState['autoStartSuppressionReason']): void {
      update((s) => ({ ...s, autoStartSuppressionReason: reason }));
    },
    reset(): void {
      set(initialState());
    },
  };
}

export const uiStore = createUiStore();
