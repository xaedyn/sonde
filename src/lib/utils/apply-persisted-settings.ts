// src/lib/utils/apply-persisted-settings.ts
// Applies a loaded PersistedSettings payload to the runtime stores.
// Always replaces the endpoint store (including with empty array) so persisted
// state — including explicit "no endpoints" — is faithfully restored.

import { get } from 'svelte/store';
import { endpointStore } from '../stores/endpoints';
import { settingsStore } from '../stores/settings';
import { uiStore } from '../stores/ui';
import type { PersistedSettings } from '../types';

export function applyPersistedSettings(persisted: PersistedSettings): void {
  // Settings (includes region if present in persisted data)
  settingsStore.set(persisted.settings);

  // Endpoints: ALWAYS clear the module-load placeholder first, then repopulate.
  // This ensures persisted.endpoints:[] is respected and not silently overridden
  // by the module-load NA seed (spec §6.2).
  endpointStore.setEndpoints([]);
  for (const ep of persisted.endpoints) {
    if (ep.url.trim()) {
      const id = endpointStore.addEndpoint(ep.url, ep.url);
      endpointStore.updateEndpoint(id, { enabled: ep.enabled });
    }
  }

  // UI state
  if (persisted.ui.activeView) {
    uiStore.setActiveView(persisted.ui.activeView);
  }
  for (const cardId of persisted.ui.expandedCards) {
    if (!get(uiStore).expandedCards.has(cardId)) {
      uiStore.toggleCard(cardId);
    }
  }

  // v5 UI additions — guarded so v2–v4 payloads that were up-migrated without
  // these fields still apply cleanly.
  if (persisted.ui.focusedEndpointId !== undefined) {
    uiStore.setFocusedEndpoint(persisted.ui.focusedEndpointId);
  }
  if (persisted.ui.liveOptions) {
    uiStore.setLiveSplit(persisted.ui.liveOptions.split);
    uiStore.setLiveTimeRange(persisted.ui.liveOptions.timeRange);
  }
  if (persisted.ui.terminalFilters && persisted.ui.terminalFilters.length > 0) {
    for (const type of persisted.ui.terminalFilters) {
      uiStore.toggleTerminalFilter(type);
    }
  }
}
