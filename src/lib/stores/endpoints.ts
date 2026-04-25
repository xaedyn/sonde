// src/lib/stores/endpoints.ts
// Writable store for endpoint list with CRUD helpers.

import { writable } from 'svelte/store';
import { tokens } from '../tokens';
import { REGIONAL_DEFAULTS } from '../regional-defaults';
import type { Region } from '../regional-defaults';
import type { Endpoint } from '../types';
import { displayLabel } from '../endpoint/displayLabel';

let _idCounter = 0;

function generateId(): string {
  return `ep-${++_idCounter}-${Date.now()}`;
}

function pickColor(index: number): string {
  const palette = tokens.color.endpoint;
  return palette[index % palette.length] ?? (tokens.color.endpoint[0] as string);
}

// Exported so App.svelte can call it with a detected region at onMount.
// Does NOT call detectRegion() — detection is the caller's responsibility.
// When region is undefined, returns north-america defaults (deterministic module-load behavior).
export function buildDefaultEndpoints(region?: Region): Endpoint[] {
  const specs = REGIONAL_DEFAULTS[region ?? 'north-america'];
  return specs.map((spec, i) => ({
    id: generateId(),
    url: spec.url,
    enabled: spec.enabled,
    label: spec.label,
    color: pickColor(i),
  }));
}

export const MAX_ENDPOINTS = 10;

function createEndpointStore() {
  const { subscribe, set, update } = writable<Endpoint[]>(buildDefaultEndpoints());

  return {
    subscribe,

    addEndpoint(url: string, label?: string, nickname?: string): string {
      let newId = '';
      update(endpoints => {
        if (endpoints.length >= MAX_ENDPOINTS) return endpoints; // no-op at cap
        const id = generateId();
        newId = id;
        const color = pickColor(endpoints.length);
        const newEndpoint: Endpoint = {
          id,
          url,
          enabled: true,
          label: label ?? displayLabel({ url, nickname }),
          color,
          ...(nickname !== undefined ? { nickname } : {}),
        };
        return [...endpoints, newEndpoint];
      });
      return newId;
    },

    removeEndpoint(id: string): void {
      update(endpoints => endpoints.filter(ep => ep.id !== id));
    },

    updateEndpoint(id: string, patch: Partial<Omit<Endpoint, 'id'>>): void {
      update(endpoints =>
        endpoints.map(ep => {
          if (ep.id !== id) return ep;
          const merged = { ...ep, ...patch };
          // Recompute label whenever url or nickname changes so the displayed
          // name stays in sync. A caller-supplied label in the patch takes
          // precedence (explicit wins), but if no label is patched we derive
          // one from the merged url + nickname.
          if (('url' in patch || 'nickname' in patch) && !('label' in patch)) {
            merged.label = displayLabel({ url: merged.url, nickname: merged.nickname });
          }
          return merged;
        })
      );
    },

    reorderEndpoint(fromId: string, toId: string): void {
      update(endpoints => {
        const fromIndex = endpoints.findIndex(ep => ep.id === fromId);
        const toIndex = endpoints.findIndex(ep => ep.id === toId);
        if (
          fromIndex === -1 ||
          toIndex === -1 ||
          fromIndex === toIndex
        ) {
          return endpoints;
        }
        const next = [...endpoints];
        const moved = next.splice(fromIndex, 1)[0];
        if (moved === undefined) return endpoints;
        next.splice(toIndex, 0, moved);
        return next;
      });
    },

    setEndpoints(endpoints: Endpoint[]): void {
      set(endpoints);
    },

    reset(region?: Region): void {
      set(buildDefaultEndpoints(region));
    },
  };
}

export const endpointStore = createEndpointStore();
