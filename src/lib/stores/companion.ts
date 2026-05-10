// src/lib/stores/companion.ts
// Ephemeral browser state for the optional local companion agent.

import { writable } from 'svelte/store';
import { companionClient, type CompanionClient } from '../companion/client';
import {
  DEFAULT_COMPANION_BASE_URL,
  type CompanionCapabilities,
  type CompanionHistoryEntry,
  type CompanionProbeName,
  type CompanionProbeResponse,
} from '../companion/protocol';

export type CompanionStatus = 'idle' | 'checking' | 'connected' | 'probing' | 'error';

export interface CompanionState {
  readonly baseUrl: string;
  readonly hasSecret: boolean;
  readonly status: CompanionStatus;
  readonly version: string | null;
  readonly capabilities: CompanionCapabilities | null;
  readonly lastProbe: CompanionProbeResponse | null;
  readonly history: readonly CompanionHistoryEntry[];
  readonly error: string | null;
}

export interface CompanionStore {
  subscribe: ReturnType<typeof writable<CompanionState>>['subscribe'];
  configure(input: { readonly baseUrl?: string; readonly secret?: string }): void;
  checkHealth(): Promise<boolean>;
  runProbe(
    targetUrl: string,
    options?: { readonly probes?: readonly CompanionProbeName[]; readonly includePrivateWifi?: boolean },
  ): Promise<CompanionProbeResponse | null>;
  loadHistory(): Promise<readonly CompanionHistoryEntry[]>;
  clearSecret(): void;
}

const initialState: CompanionState = {
  baseUrl: DEFAULT_COMPANION_BASE_URL,
  hasSecret: false,
  status: 'idle',
  version: null,
  capabilities: null,
  lastProbe: null,
  history: [],
  error: null,
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCompanionStore(client: CompanionClient = companionClient): CompanionStore {
  const { subscribe, update } = writable<CompanionState>(initialState);
  let secret = '';
  let currentBaseUrl = DEFAULT_COMPANION_BASE_URL;

  function configure(input: { readonly baseUrl?: string; readonly secret?: string }): void {
    if (input.baseUrl !== undefined) {
      const trimmed = input.baseUrl.trim();
      currentBaseUrl = trimmed.length > 0 ? trimmed : DEFAULT_COMPANION_BASE_URL;
    }
    if (input.secret !== undefined) secret = input.secret.trim();
    update((state) => ({
      ...state,
      baseUrl: currentBaseUrl,
      hasSecret: secret.length > 0,
      error: null,
    }));
  }

  async function checkHealth(): Promise<boolean> {
    update((state) => ({ ...state, status: 'checking', error: null }));
    try {
      const health = await client.checkHealth(currentBaseUrl);
      update((state) => ({
        ...state,
        status: 'connected',
        version: health.version,
        capabilities: health.capabilities,
        error: null,
      }));
      return true;
    } catch (error) {
      update((state) => ({ ...state, status: 'error', error: messageFrom(error) }));
      return false;
    }
  }

  function requireSecret(): boolean {
    if (secret.length === 0) {
      update((state) => ({
        ...state,
        status: 'error',
        error: 'Enter the companion pairing token before running signed probes.',
      }));
      return false;
    }
    return true;
  }

  async function runProbe(
    targetUrl: string,
    options: { readonly probes?: readonly CompanionProbeName[]; readonly includePrivateWifi?: boolean } = {},
  ): Promise<CompanionProbeResponse | null> {
    if (!requireSecret()) return null;

    update((state) => ({ ...state, status: 'probing', error: null }));
    try {
      const probe = await client.runProbe(currentBaseUrl, secret, { targetUrl, ...options });
      update((state) => ({
        ...state,
        status: 'connected',
        lastProbe: probe,
        error: null,
      }));
      return probe;
    } catch (error) {
      update((state) => ({ ...state, status: 'error', error: messageFrom(error) }));
      return null;
    }
  }

  async function loadHistory(): Promise<readonly CompanionHistoryEntry[]> {
    if (!requireSecret()) return [];

    update((state) => ({ ...state, error: null }));
    try {
      const response = await client.listHistory(currentBaseUrl, secret);
      update((state) => ({ ...state, history: response.history, error: null }));
      return response.history;
    } catch (error) {
      update((state) => ({ ...state, status: 'error', error: messageFrom(error) }));
      return [];
    }
  }

  function clearSecret(): void {
    secret = '';
    update((state) => ({
      ...state,
      hasSecret: false,
      status: 'idle',
      version: null,
      capabilities: null,
      lastProbe: null,
      history: [],
      error: null,
    }));
  }

  return {
    subscribe,
    configure,
    checkHealth,
    runProbe,
    loadHistory,
    clearSecret,
  };
}

export const companionStore = createCompanionStore();
