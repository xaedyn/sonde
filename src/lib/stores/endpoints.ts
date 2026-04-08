// src/lib/stores/endpoints.ts
// Writable store for endpoint list with CRUD helpers and a derived valid-only view.

import { writable, derived } from 'svelte/store';
import { tokens } from '../tokens';
import { DEFAULT_ENDPOINTS } from '../types';
import type { Endpoint } from '../types';

let _idCounter = 0;

function generateId(): string {
  return `ep-${++_idCounter}-${Date.now()}`;
}

function pickColor(index: number): string {
  const palette = tokens.color.endpoint;
  return palette[index % palette.length] ?? '#4a90d9';
}

function buildDefaultEndpoints(): Endpoint[] {
  return DEFAULT_ENDPOINTS.map((def, i) => ({
    id: generateId(),
    url: def.url,
    enabled: def.enabled,
    label: def.label,
    color: pickColor(i),
  }));
}

function createEndpointStore() {
  const { subscribe, set, update } = writable<Endpoint[]>(buildDefaultEndpoints());

  return {
    subscribe,

    addEndpoint(url: string, label?: string): string {
      let newId = '';
      update(endpoints => {
        const id = generateId();
        newId = id;
        const color = pickColor(endpoints.length);
        const newEndpoint: Endpoint = {
          id,
          url,
          enabled: true,
          label: label ?? url,
          color,
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
        endpoints.map(ep => (ep.id === id ? { ...ep, ...patch } : ep))
      );
    },

    setEndpoints(endpoints: Endpoint[]): void {
      set(endpoints);
    },

    reset(): void {
      set(buildDefaultEndpoints());
    },
  };
}

export const endpointStore = createEndpointStore();

/** Only enabled endpoints with a non-empty URL. */
export const validEndpoints = derived(
  endpointStore,
  $endpoints => $endpoints.filter(ep => ep.enabled && ep.url.trim().length > 0)
);
