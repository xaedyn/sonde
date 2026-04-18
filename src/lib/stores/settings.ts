// src/lib/stores/settings.ts
// Writable store for measurement settings with reset capability.

import { writable } from 'svelte/store';
import { DEFAULT_HEALTH_THRESHOLD, DEFAULT_SETTINGS } from '../types';
import type { Settings } from '../types';

/**
 * Clamp the health-alarm threshold so it can never reach or exceed the hard
 * abort `timeout`. The dial and classifier assume threshold < timeout.
 *
 * Both inputs are defensively validated: an invalid caller-supplied threshold
 * falls back to the project default, and the result is always re-clamped
 * against timeout so the invariant holds even for tiny or non-finite timeouts.
 */
function clampHealthThreshold(threshold: number, timeout: number): number {
  const safeTimeout = Number.isFinite(timeout) && timeout > 1
    ? timeout
    : DEFAULT_SETTINGS.timeout;
  const candidate = Number.isFinite(threshold) && threshold > 0
    ? threshold
    : DEFAULT_HEALTH_THRESHOLD;
  if (candidate >= safeTimeout) return safeTimeout - 1;
  return candidate;
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
