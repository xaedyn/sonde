// src/lib/stores/history.ts
// Svelte facade over local-only session history persistence.

import { writable } from 'svelte/store';
import type { BuildHistorySessionSummaryInput, HistorySessionSummary } from '../history/session-summary';
import { buildHistorySessionSummary } from '../history/session-summary';
import {
  clearHistorySessions,
  deleteHistorySession,
  listHistorySessions,
  pruneHistorySessions,
  saveHistorySession,
} from '../history/indexeddb-history';

export interface HistoryStoreState {
  readonly sessions: readonly HistorySessionSummary[];
  readonly hydrated: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

export interface HistoryStorage {
  list(): Promise<readonly HistorySessionSummary[]>;
  save(session: HistorySessionSummary): Promise<boolean | undefined>;
  delete(id: string): Promise<boolean | undefined>;
  clear(): Promise<boolean | undefined>;
  prune(): Promise<boolean | undefined>;
}

export interface HistoryStore {
  subscribe: ReturnType<typeof writable<HistoryStoreState>>['subscribe'];
  hydrate(): Promise<readonly HistorySessionSummary[]>;
  saveSession(session: HistorySessionSummary): Promise<boolean>;
  recordSession(input: BuildHistorySessionSummaryInput): Promise<HistorySessionSummary | null>;
  deleteSession(id: string): Promise<boolean>;
  clear(): Promise<boolean>;
}

const initialState: HistoryStoreState = {
  sessions: [],
  hydrated: false,
  saving: false,
  error: null,
};

export const indexedDbHistoryStorage: HistoryStorage = {
  list: () => listHistorySessions(),
  save: (session) => saveHistorySession(session),
  delete: (id) => deleteHistorySession(id),
  clear: () => clearHistorySessions(),
  prune: () => pruneHistorySessions(),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sortSessions(sessions: readonly HistorySessionSummary[]): HistorySessionSummary[] {
  return [...sessions].sort((a, b) => b.createdAt - a.createdAt);
}

function upsertSession(
  sessions: readonly HistorySessionSummary[],
  next: HistorySessionSummary,
): HistorySessionSummary[] {
  const filtered = sessions.filter((session) => session.id !== next.id);
  return sortSessions([next, ...filtered]);
}

export function createHistoryStore(storage: HistoryStorage = indexedDbHistoryStorage): HistoryStore {
  const { subscribe, set, update } = writable<HistoryStoreState>(initialState);

  async function hydrate(): Promise<readonly HistorySessionSummary[]> {
    try {
      const sessions = sortSessions(await storage.list());
      set({ sessions, hydrated: true, saving: false, error: null });
      return sessions;
    } catch (error) {
      const message = errorMessage(error);
      update((state) => ({ ...state, hydrated: true, saving: false, error: message }));
      return [];
    }
  }

  async function saveSession(session: HistorySessionSummary): Promise<boolean> {
    update((state) => ({ ...state, saving: true, error: null }));
    try {
      const saved = await storage.save(session);
      if (saved === false) {
        update((state) => ({ ...state, saving: false, error: 'History storage is unavailable.' }));
        return false;
      }
      await storage.prune();
      update((state) => ({
        ...state,
        sessions: upsertSession(state.sessions, session),
        saving: false,
        error: null,
      }));
      return true;
    } catch (error) {
      const message = errorMessage(error);
      update((state) => ({ ...state, saving: false, error: message }));
      return false;
    }
  }

  async function recordSession(input: BuildHistorySessionSummaryInput): Promise<HistorySessionSummary | null> {
    const session = buildHistorySessionSummary(input);
    if (!session || session.baselineEligibleEndpointCount === 0) return null;
    return await saveSession(session) ? session : null;
  }

  async function deleteSession(id: string): Promise<boolean> {
    try {
      const deleted = await storage.delete(id);
      if (deleted === false) return false;
      update((state) => ({
        ...state,
        sessions: state.sessions.filter((session) => session.id !== id),
        error: null,
      }));
      return true;
    } catch (error) {
      const message = errorMessage(error);
      update((state) => ({ ...state, error: message }));
      return false;
    }
  }

  async function clear(): Promise<boolean> {
    try {
      const cleared = await storage.clear();
      if (cleared === false) return false;
      set({ sessions: [], hydrated: true, saving: false, error: null });
      return true;
    } catch (error) {
      const message = errorMessage(error);
      update((state) => ({ ...state, error: message }));
      return false;
    }
  }

  return {
    subscribe,
    hydrate,
    saveSession,
    recordSession,
    deleteSession,
    clear,
  };
}

export const historyStore = createHistoryStore();
