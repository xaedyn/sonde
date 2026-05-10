import type { Endpoint, SharePayload } from '../types';
import type {
  HostedReportCreateResponse,
  HostedReportLoadResponse,
  RemoteVantageProbeRequest,
  RemoteVantageProbeResponse,
  RemoteVantageTarget,
} from './types';

export interface RemoteVantageHealth {
  readonly ok: boolean;
  readonly version: number;
  readonly edge?: {
    readonly colo?: string;
    readonly country?: string;
    readonly city?: string;
  };
  readonly capabilities: {
    readonly remoteHttpTiming: boolean;
    readonly hostedReports: boolean;
    readonly saturationEndpoint: boolean;
  };
}

export interface RemoteVantageClient {
  checkHealth(): Promise<RemoteVantageHealth>;
  runProbe(request: RemoteVantageProbeRequest): Promise<RemoteVantageProbeResponse>;
  createHostedReport(payload: SharePayload): Promise<HostedReportCreateResponse>;
  loadHostedReport(id: string): Promise<HostedReportLoadResponse>;
}

async function parseJsonResponse<T>(response: Response, allowedStatuses: readonly number[] = []): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Remote vantage request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  if (payload === null) {
    throw new Error('Remote vantage returned an empty response.');
  }
  return payload as T;
}

export function endpointsToRemoteTargets(endpoints: readonly Endpoint[]): RemoteVantageTarget[] {
  return endpoints
    .filter((endpoint) => endpoint.enabled)
    .slice(0, 8)
    .map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
    }));
}

export function createRemoteVantageClient(fetcher: typeof fetch = fetch): RemoteVantageClient {
  return {
    async checkHealth(): Promise<RemoteVantageHealth> {
      const response = await fetcher('/api/vantage/health', { method: 'GET' });
      return parseJsonResponse<RemoteVantageHealth>(response);
    },

    async runProbe(request: RemoteVantageProbeRequest): Promise<RemoteVantageProbeResponse> {
      const response = await fetcher('/api/vantage/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      return parseJsonResponse<RemoteVantageProbeResponse>(response);
    },

    async createHostedReport(payload: SharePayload): Promise<HostedReportCreateResponse> {
      const response = await fetcher('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      return parseJsonResponse<HostedReportCreateResponse>(response, [503]);
    },

    async loadHostedReport(id: string): Promise<HostedReportLoadResponse> {
      const response = await fetcher(`/api/reports/${encodeURIComponent(id)}`, { method: 'GET' });
      return parseJsonResponse<HostedReportLoadResponse>(response);
    },
  };
}

export const remoteVantageClient = createRemoteVantageClient();
