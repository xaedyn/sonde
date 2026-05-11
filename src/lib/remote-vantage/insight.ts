import type { Endpoint, EndpointStatistics } from '../types';
import type { RemoteVantageProbeResponse, RemoteVantageResult } from './types';

export type RemoteVantageInsightStatus =
  | 'unavailable'
  | 'remote-normal'
  | 'remote-slow-only'
  | 'local-path'
  | 'remote-confirms'
  | 'remote-error';

export interface RemoteVantageInsight {
  readonly status: RemoteVantageInsightStatus;
  readonly headline: string;
  readonly detail: string;
  readonly action: string;
  readonly edgeLabel: string;
  readonly result: RemoteVantageResult | null;
}

interface RemoteVantageInsightInput {
  readonly endpoint: Endpoint | null;
  readonly stats: EndpointStatistics | undefined;
  readonly threshold: number;
  readonly probe: RemoteVantageProbeResponse | null;
}

function fmtMs(value: number): string {
  return `${Math.round(value)} ms`;
}

function edgeLabel(probe: RemoteVantageProbeResponse | null): string {
  if (!probe) return 'Cloudflare edge';
  const parts = [probe.edge.colo, probe.edge.city, probe.edge.country].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Cloudflare edge';
}

function resultFor(endpoint: Endpoint | null, probe: RemoteVantageProbeResponse | null): RemoteVantageResult | null {
  if (!endpoint || !probe) return null;
  return probe.results.find((result) => result.endpointId === endpoint.id || result.url === endpoint.url) ?? null;
}

export function buildRemoteVantageInsight(input: RemoteVantageInsightInput): RemoteVantageInsight {
  const result = resultFor(input.endpoint, input.probe);
  const label = input.endpoint?.label ?? 'this endpoint';
  const edge = edgeLabel(input.probe);

  if (!input.endpoint || !result) {
    return {
      status: 'unavailable',
      headline: 'Remote vantage not checked yet',
      detail: 'Chronoscope can ask Cloudflare to fetch the same endpoint from outside your network.',
      action: 'Run a remote check to compare your browser path against a Cloudflare edge.',
      edgeLabel: edge,
      result: null,
    };
  }

  const browserP50 = input.stats?.ready ? input.stats.p50 : null;
  const browserSlow = browserP50 !== null && browserP50 > input.threshold;
  const remoteSlow = result.verdict === 'slow' || result.durationMs > input.threshold;

  if (!result.ok || result.verdict === 'unreachable' || result.verdict === 'http-error') {
    return {
      status: 'remote-error',
      headline: `${edge} cannot cleanly reach ${label}`,
      detail: result.status === null
        ? `The remote probe failed after ${fmtMs(result.durationMs)}.`
        : `The remote probe got HTTP ${result.status} in ${fmtMs(result.durationMs)}.`,
      action: 'Compare from your browser and another network; repeated failures become outside-vantage evidence to share with the service owner.',
      edgeLabel: edge,
      result,
    };
  }

  if (browserSlow && !remoteSlow) {
    return {
      status: 'local-path',
      headline: `Cloudflare reaches ${label} normally`,
      detail: `${edge} reached it in ${fmtMs(result.durationMs)} while your browser-visible path has p50 ${fmtMs(browserP50 ?? 0)}.`,
      action: 'Use the local companion agent or another network to narrow the local path.',
      edgeLabel: edge,
      result,
    };
  }

  if (browserSlow && remoteSlow) {
    return {
      status: 'remote-confirms',
      headline: `${label} is also slow from Cloudflare`,
      detail: `${edge} took ${fmtMs(result.durationMs)} and your browser p50 is ${fmtMs(browserP50 ?? 0)}; both vantage points observed elevated latency.`,
      action: 'Share the report with the service owner; it now contains outside-vantage evidence.',
      edgeLabel: edge,
      result,
    };
  }

  if (!browserSlow && remoteSlow) {
    return {
      status: 'remote-slow-only',
      headline: `${label} is slow from ${edge}, but not your browser`,
      detail: `${edge} took ${fmtMs(result.durationMs)}${browserP50 !== null ? ` while your browser p50 is ${fmtMs(browserP50)}` : ''}, suggesting the outside edge path or origin may be inconsistent right now.`,
      action: 'Run the check again or compare another outside vantage before drawing a local-path conclusion.',
      edgeLabel: edge,
      result,
    };
  }

  return {
    status: 'remote-normal',
    headline: `${edge} reaches ${label} in ${fmtMs(result.durationMs)}`,
    detail: 'The outside vantage is currently healthy for this endpoint.',
    action: 'Keep the check available for intermittent issues or include it in a support report.',
    edgeLabel: edge,
    result,
  };
}
