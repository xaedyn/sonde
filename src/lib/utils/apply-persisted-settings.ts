// src/lib/utils/apply-persisted-settings.ts
// Applies a loaded PersistedSettings payload to the runtime stores.
// Always replaces the endpoint store (including with empty array) so persisted
// state — including explicit "no endpoints" — is faithfully restored.
//
// Shape migration belongs in persistence.ts; this file only hydrates the runtime
// stores from an already-shaped v5 payload.

import { get } from 'svelte/store';
import { endpointStore } from '../stores/endpoints';
import { settingsStore } from '../stores/settings';
import { uiStore } from '../stores/ui';
import type { PersistedSettings } from '../types';
import { brandFor } from '../regional-defaults';

export function applyPersistedSettings(persisted: PersistedSettings): void {
  // Settings (includes region if present in persisted data)
  settingsStore.set(persisted.settings);

  // Endpoints: ALWAYS clear the module-load placeholder first, then repopulate.
  // This ensures persisted.endpoints:[] is respected and not silently overridden
  // by the module-load NA seed (spec §6.2).
  endpointStore.setEndpoints([]);
  for (const ep of persisted.endpoints) {
    const url = ep.url.trim();
    if (url) {
      const label = brandFor(url)?.label ?? url;
      const id = endpointStore.addEndpoint(url, label);
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

  // v5: focusedEndpointId — drop silently if the id no longer resolves, since
  // the user may have deleted that endpoint between sessions.
  const storedFocus = persisted.ui.focusedEndpointId ?? null;
  if (storedFocus !== null) {
    const exists = get(endpointStore).some((e) => e.id === storedFocus);
    uiStore.setFocusedEndpoint(exists ? storedFocus : null);
  }

  // v5: liveOptions
  if (persisted.ui.liveOptions) {
    uiStore.setLiveSplit(persisted.ui.liveOptions.split);
    uiStore.setLiveTimeRange(persisted.ui.liveOptions.timeRange);
  }

  // v5: terminalFilters (serialized as array → runtime Set)
  if (persisted.ui.terminalFilters && persisted.ui.terminalFilters.length > 0) {
    uiStore.clearTerminalFilters();
    for (const type of persisted.ui.terminalFilters) {
      uiStore.toggleTerminalFilter(type);
    }
  }
}
