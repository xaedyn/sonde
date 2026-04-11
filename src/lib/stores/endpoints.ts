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
  return palette[index % palette.length] ?? (tokens.color.endpoint[0] as string);
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

export const MAX_ENDPOINTS = 10;

function createEndpointStore() {
  const { subscribe, set, update } = writable<Endpoint[]>(buildDefaultEndpoints());

  return {
    subscribe,

    addEndpoint(url: string, label?: string): string {
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
