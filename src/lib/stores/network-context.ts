import { writable } from 'svelte/store';
import { describeDohInsight, type DohInsight } from '../dns/doh-insight';
import { describeTopologyContext } from '../topology/asn-context';
import type { Endpoint } from '../types';

export type NetworkContextStatus = 'idle' | 'running' | 'complete' | 'error';

export interface NetworkContextState {
  readonly status: NetworkContextStatus;
  readonly hostname: string | null;
  readonly dnsInsight: DohInsight | null;
  readonly topologyInsight: string | null;
  readonly dnsError: string | null;
  readonly topologyError: string | null;
  readonly error: string | null;
}

export interface NetworkContextStoreOptions {
  readonly fetcher?: typeof fetch;
}

export interface NetworkContextStore {
  subscribe: ReturnType<typeof writable<NetworkContextState>>['subscribe'];
  run(endpoint: Endpoint): Promise<NetworkContextState>;
  reset(): void;
}

interface DnsContextResponse {
  readonly ok: true;
  readonly resolver: 'cloudflare-doh';
  readonly hostname: string;
  readonly records: readonly string[];
  readonly durationMs: number;
}

interface TopologyContextResponse {
  readonly ok: true;
  readonly hostname: string;
  readonly asn: number | null;
  readonly organization: string | null;
}

const initialState: NetworkContextState = {
  status: 'idle',
  hostname: null,
  dnsInsight: null,
  topologyInsight: null,
  dnsError: null,
  topologyError: null,
  error: null,
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hostnameFromEndpoint(endpoint: Endpoint): string {
  try {
    return new URL(endpoint.url).hostname;
  } catch {
    throw new Error('Network context requires a valid endpoint URL.');
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text.length > 0 ? JSON.parse(text) as unknown : null;
  } catch {
    if (!response.ok) {
      throw new Error(`Network context request failed with HTTP ${response.status}`);
    }
    throw new Error('Network context response was not valid JSON.');
  }
  if (!response.ok || typeof payload !== 'object' || payload === null || !('ok' in payload) || payload.ok !== true) {
    const error = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { readonly error: unknown }).error)
      : `Network context request failed with HTTP ${response.status}`;
    throw new Error(error);
  }
  return payload as T;
}

export function createNetworkContextStore(options: NetworkContextStoreOptions = {}): NetworkContextStore {
  const { subscribe, set } = writable<NetworkContextState>(initialState);
  const fetcher = options.fetcher ?? fetch;
  let runSerial = 0;

  async function run(endpoint: Endpoint): Promise<NetworkContextState> {
    const serial = runSerial + 1;
    runSerial = serial;

    let hostname: string;
    try {
      hostname = hostnameFromEndpoint(endpoint);
    } catch (error) {
      const next = {
        ...initialState,
        status: 'error' as const,
        error: messageFrom(error),
      };
      set(next);
      return next;
    }

    set({
      ...initialState,
      status: 'running',
      hostname,
    });

    const encodedHostname = encodeURIComponent(hostname);
    const dns = fetcher(`/api/vantage/dns?hostname=${encodedHostname}&type=A`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then((response) => parseJsonResponse<DnsContextResponse>(response))
      .then((payload) => describeDohInsight({
        hostname: payload.hostname,
        resolver: payload.resolver,
        records: payload.records,
        durationMs: payload.durationMs,
      }));

    const topology = fetcher(`/api/vantage/topology?hostname=${encodedHostname}`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then((response) => parseJsonResponse<TopologyContextResponse>(response))
      .then((payload) => describeTopologyContext({
        hostname: payload.hostname,
        asn: payload.asn,
        organization: payload.organization,
      }));

    const [dnsResult, topologyResult] = await Promise.allSettled([dns, topology]);
    const next: NetworkContextState = {
      status: dnsResult.status === 'fulfilled' || topologyResult.status === 'fulfilled' ? 'complete' : 'error',
      hostname,
      dnsInsight: dnsResult.status === 'fulfilled' ? dnsResult.value : null,
      topologyInsight: topologyResult.status === 'fulfilled' ? topologyResult.value : null,
      dnsError: dnsResult.status === 'rejected' ? messageFrom(dnsResult.reason) : null,
      topologyError: topologyResult.status === 'rejected' ? messageFrom(topologyResult.reason) : null,
      error: dnsResult.status === 'rejected' && topologyResult.status === 'rejected'
        ? 'Network context did not complete.'
        : null,
    };

    if (serial === runSerial) set(next);
    return next;
  }

  function reset(): void {
    runSerial += 1;
    set(initialState);
  }

  return {
    subscribe,
    run,
    reset,
  };
}

export const networkContextStore = createNetworkContextStore();
