// src/lib/stores/settings.ts
// Writable store for measurement settings with reset capability.

import { writable } from 'svelte/store';
import { DEFAULT_HEALTH_THRESHOLD, DEFAULT_SETTINGS } from '../types';
import type { Settings } from '../types';

/**
 * Clamp the health-alarm threshold so it can never reach or exceed the hard
 * abort `timeout`. The dial and classifier assume threshold < timeout; a caller
 * that passes an invalid value gets silently clamped to `timeout - 1`.
 */
function clampHealthThreshold(threshold: number, timeout: number): number {
  if (!Number.isFinite(threshold) || threshold <= 0) return DEFAULT_HEALTH_THRESHOLD;
  if (threshold >= timeout) return Math.max(1, timeout - 1);
  return threshold;
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>({ ...DEFAULT_SETTINGS, region: undefined });

  return {
    subscribe,
    update,
    set,
    setHealthThreshold(ms: number): void {
      update((s) => ({ ...s, healthThreshold: clampHealthThreshold(ms, s.timeout) }));
    },
    reset() {
      set({ ...DEFAULT_SETTINGS, region: undefined });
    },
  };
}

export const settingsStore = createSettingsStore();
