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
import { displayLabel } from '../endpoint/displayLabel';

// Helpers are declared as const arrows (not `function` declarations) to stay
// clear of DeepSource's "function declaration in global scope" rule, and each
// helper holds a single concern so cyclomatic complexity stays below threshold.

// Hydrate one persisted endpoint into the runtime store. Nickname is trimmed
// once at the boundary so storage and display agree (displayLabel re-trims at
// render time, so an untrimmed value would display correctly but persist
// padded — round-trip divergence).
const hydrateEndpoint = (ep: { url: string; enabled: boolean; nickname?: string }): void => {
  const url = ep.url.trim();
  if (!url) return;
  const nickname = ep.nickname?.trim() || undefined;
  const label = displayLabel({ url, nickname });
  const id = endpointStore.addEndpoint(url, label, nickname);
  endpointStore.updateEndpoint(id, { enabled: ep.enabled });
};

// Per-section UI helpers — each takes a narrow payload slice so callers can't
// accidentally couple unrelated UI state.

const hydrateActiveView = (view: PersistedSettings['ui']['activeView']): void => {
  if (view) uiStore.setActiveView(view);
};

const hydrateExpandedCards = (cards: PersistedSettings['ui']['expandedCards']): void => {
  for (const cardId of cards) {
    if (!get(uiStore).expandedCards.has(cardId)) {
      uiStore.toggleCard(cardId);
    }
  }
};

// v5: focusedEndpointId — drop silently if the id no longer resolves, since
// the user may have deleted that endpoint between sessions.
const hydrateFocusedEndpoint = (focusedId: PersistedSettings['ui']['focusedEndpointId']): void => {
  const storedFocus = focusedId ?? null;
  if (storedFocus === null) return;
  const exists = get(endpointStore).some((e) => e.id === storedFocus);
  uiStore.setFocusedEndpoint(exists ? storedFocus : null);
};

const hydrateLiveOptions = (opts: PersistedSettings['ui']['liveOptions']): void => {
  if (!opts) return;
  uiStore.setLiveSplit(opts.split);
  uiStore.setLiveTimeRange(opts.timeRange);
};

// v5: terminalFilters (serialized as array → runtime Set).
const hydrateTerminalFilters = (filters: PersistedSettings['ui']['terminalFilters']): void => {
  if (!filters || filters.length === 0) return;
  uiStore.clearTerminalFilters();
  for (const type of filters) {
    uiStore.toggleTerminalFilter(type);
  }
};

const hydrateUiState = (ui: PersistedSettings['ui']): void => {
  hydrateActiveView(ui.activeView);
  hydrateExpandedCards(ui.expandedCards);
  hydrateFocusedEndpoint(ui.focusedEndpointId);
  hydrateLiveOptions(ui.liveOptions);
  hydrateTerminalFilters(ui.terminalFilters);
};

// Exported as a const arrow (not `export function`) for consistency with the
// file's module-scope helpers and to keep DeepSource's rule against global-scope
// function declarations satisfied. Callers using `import { applyPersistedSettings }`
// are unaffected — ES modules treat both export forms identically at call sites.
export const applyPersistedSettings = (persisted: PersistedSettings): void => {
  // Settings (includes region if present in persisted data)
  settingsStore.set(persisted.settings);

  // Endpoints: ALWAYS clear the module-load placeholder first, then repopulate.
  // This ensures persisted.endpoints:[] is respected and not silently overridden
  // by the module-load NA seed (spec §6.2).
  endpointStore.setEndpoints([]);
  for (const ep of persisted.endpoints) {
    hydrateEndpoint(ep);
  }

  hydrateUiState(persisted.ui);
};
