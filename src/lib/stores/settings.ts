// src/lib/stores/settings.ts
// Writable store for measurement settings with reset capability.

import { writable } from 'svelte/store';
import { DEFAULT_SETTINGS } from '../types';
import type { Settings } from '../types';

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>({ ...DEFAULT_SETTINGS });

  return {
    subscribe,
    update,
    set,
    reset() {
      set({ ...DEFAULT_SETTINGS });
    },
  };
}

export const settingsStore = createSettingsStore();
