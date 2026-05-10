import { writable } from 'svelte/store';
import {
  endpointsToRemoteTargets,
  remoteVantageClient,
  type RemoteVantageClient,
  type RemoteVantageHealth,
} from '../remote-vantage/client';
import type { HostedReportCreateResponse, RemoteVantageProbeResponse } from '../remote-vantage/types';
import type { Endpoint, SharePayload } from '../types';

export type RemoteVantageStatus = 'idle' | 'checking' | 'connected' | 'probing' | 'error';

export interface RemoteVantageState {
  readonly status: RemoteVantageStatus;
  readonly health: RemoteVantageHealth | null;
  readonly lastProbe: RemoteVantageProbeResponse | null;
  readonly hostedReport: HostedReportCreateResponse | null;
  readonly hostedReportFallback: 'hash' | null;
  readonly error: string | null;
}

export interface RemoteVantageStore {
  subscribe: ReturnType<typeof writable<RemoteVantageState>>['subscribe'];
  checkHealth(): Promise<boolean>;
  runProbe(endpoints: readonly Endpoint[]): Promise<RemoteVantageProbeResponse | null>;
  createHostedReport(payload: SharePayload): Promise<string | null>;
  setProbe(probe: RemoteVantageProbeResponse | null): void;
  reset(): void;
}

const initialState: RemoteVantageState = {
  status: 'idle',
  health: null,
  lastProbe: null,
  hostedReport: null,
  hostedReportFallback: null,
  error: null,
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createRemoteVantageStore(client: RemoteVantageClient = remoteVantageClient): RemoteVantageStore {
  const { subscribe, set, update } = writable<RemoteVantageState>(initialState);

  async function checkHealth(): Promise<boolean> {
    update((state) => ({ ...state, status: 'checking', error: null }));
    try {
      const health = await client.checkHealth();
      update((state) => ({ ...state, status: 'connected', health, error: null }));
      return true;
    } catch (error) {
      update((state) => ({ ...state, status: 'error', error: messageFrom(error) }));
      return false;
    }
  }

  async function runProbe(endpoints: readonly Endpoint[]): Promise<RemoteVantageProbeResponse | null> {
    const targets = endpointsToRemoteTargets(endpoints);
    if (targets.length === 0) {
      update((state) => ({
        ...state,
        status: 'error',
        error: 'Enable at least one endpoint before running a remote check.',
      }));
      return null;
    }

    update((state) => ({ ...state, status: 'probing', error: null }));
    try {
      const probe = await client.runProbe({ targets });
      update((state) => ({ ...state, status: 'connected', lastProbe: probe, error: null }));
      return probe;
    } catch (error) {
      update((state) => ({ ...state, status: 'error', error: messageFrom(error) }));
      return null;
    }
  }

  async function createHostedReport(payload: SharePayload): Promise<string | null> {
    update((state) => ({ ...state, status: 'checking', error: null }));
    try {
      const response = await client.createHostedReport(payload);
      if (!response.ok) {
        update((state) => ({
          ...state,
          status: 'connected',
          hostedReport: response,
          hostedReportFallback: response.fallback,
          error: null,
        }));
        return null;
      }
      update((state) => ({
        ...state,
        status: 'connected',
        hostedReport: response,
        hostedReportFallback: null,
        error: null,
      }));
      return response.url;
    } catch (error) {
      update((state) => ({
        ...state,
        status: 'error',
        hostedReportFallback: 'hash',
        error: messageFrom(error),
      }));
      return null;
    }
  }

  function setProbe(probe: RemoteVantageProbeResponse | null): void {
    update((state) => ({ ...state, lastProbe: probe }));
  }

  function reset(): void {
    set(initialState);
  }

  return {
    subscribe,
    checkHealth,
    runProbe,
    createHostedReport,
    setProbe,
    reset,
  };
}

export const remoteVantageStore = createRemoteVantageStore();
