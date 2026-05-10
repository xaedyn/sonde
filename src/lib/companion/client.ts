// src/lib/companion/client.ts
// Fetch client for the optional local companion agent.

import {
  buildCompanionHeaders,
  DEFAULT_COMPANION_BASE_URL,
  normalizeCompanionBaseUrl,
  type CompanionHistoryResponse,
  type CompanionHealth,
  type CompanionProbeRequest,
  type CompanionProbeResponse,
} from './protocol';

const HEALTH_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;

export interface CompanionClient {
  checkHealth(baseUrl: string): Promise<CompanionHealth>;
  runProbe(baseUrl: string, secret: string, request: CompanionProbeRequest): Promise<CompanionProbeResponse>;
  listHistory(baseUrl: string, secret: string): Promise<CompanionHistoryResponse>;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Companion request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createCompanionClient(fetcher: typeof fetch = fetch): CompanionClient {
  return {
    async checkHealth(baseUrl: string = DEFAULT_COMPANION_BASE_URL): Promise<CompanionHealth> {
      const normalized = normalizeCompanionBaseUrl(baseUrl);
      const response = await fetchWithTimeout(fetcher, `${normalized}/health`, { method: 'GET' }, HEALTH_TIMEOUT_MS);
      return parseJsonResponse<CompanionHealth>(response);
    },

    async runProbe(
      baseUrl: string,
      secret: string,
      request: CompanionProbeRequest,
    ): Promise<CompanionProbeResponse> {
      const normalized = normalizeCompanionBaseUrl(baseUrl);
      const path = '/v1/probe';
      const body = JSON.stringify(request);
      const headers = await buildCompanionHeaders({
        method: 'POST',
        path,
        body,
        secret,
      });
      const response = await fetchWithTimeout(fetcher, `${normalized}${path}`, {
        method: 'POST',
        headers,
        body,
      }, REQUEST_TIMEOUT_MS);
      return parseJsonResponse<CompanionProbeResponse>(response);
    },

    async listHistory(baseUrl: string, secret: string): Promise<CompanionHistoryResponse> {
      const normalized = normalizeCompanionBaseUrl(baseUrl);
      const path = '/v1/history';
      const headers = await buildCompanionHeaders({
        method: 'GET',
        path,
        body: '',
        secret,
      });
      const response = await fetchWithTimeout(fetcher, `${normalized}${path}`, {
        method: 'GET',
        headers,
      }, REQUEST_TIMEOUT_MS);
      return parseJsonResponse<CompanionHistoryResponse>(response);
    },
  };
}

export const companionClient = createCompanionClient();
