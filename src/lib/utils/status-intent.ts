import type {
  AutoStartSuppressionReason,
  Endpoint,
  MeasurementState,
  StatisticsState,
} from '../types';
import { isSafeSharedUrl } from './url-safety';

export type { AutoStartSuppressionReason } from '../types';

export interface AutoStartDecision {
  readonly shouldStart: boolean;
  readonly reason: AutoStartSuppressionReason | null;
}

export function autoStartDecision(input: {
  readonly endpoints: readonly Endpoint[];
  readonly isSharedView: boolean;
  readonly sharedReportMode: boolean;
  readonly hasPendingShare: boolean;
}): AutoStartDecision {
  if (input.isSharedView && input.sharedReportMode) {
    return { shouldStart: false, reason: 'shared-report' };
  }

  if (input.hasPendingShare) {
    return { shouldStart: false, reason: 'pending-share' };
  }

  const enabledEndpoints = input.endpoints.filter((endpoint) => endpoint.enabled);
  if (enabledEndpoints.length === 0) {
    return { shouldStart: false, reason: 'no-enabled-endpoints' };
  }

  if (enabledEndpoints.some((endpoint) => !isSafeSharedUrl(endpoint.url))) {
    return { shouldStart: false, reason: 'local-endpoint' };
  }

  return { shouldStart: true, reason: null };
}

export function selectInvestigationEndpointId(input: {
  readonly monitored: readonly Endpoint[];
  readonly stats: StatisticsState;
  readonly measurements: MeasurementState;
  readonly currentFocusedId: string | null;
  readonly worstEpId?: string | null;
  readonly recentEventEndpointIds?: readonly string[];
}): string | null {
  const monitoredIds = new Set(input.monitored.map((endpoint) => endpoint.id));

  if (input.currentFocusedId !== null && monitoredIds.has(input.currentFocusedId)) {
    return input.currentFocusedId;
  }

  if (input.worstEpId != null && monitoredIds.has(input.worstEpId)) {
    return input.worstEpId;
  }

  let highestReadyP95EndpointId: string | null = null;
  let highestReadyP95 = -Infinity;
  for (const endpoint of input.monitored) {
    const endpointStats = input.stats[endpoint.id];
    if (endpointStats?.ready === true && endpointStats.p95 > highestReadyP95) {
      highestReadyP95EndpointId = endpoint.id;
      highestReadyP95 = endpointStats.p95;
    }
  }
  if (highestReadyP95EndpointId !== null) {
    return highestReadyP95EndpointId;
  }

  for (const endpointId of input.recentEventEndpointIds ?? []) {
    if (monitoredIds.has(endpointId)) {
      return endpointId;
    }
  }

  for (const endpoint of input.monitored) {
    const samples = input.measurements.endpoints[endpoint.id]?.samples;
    if (samples !== undefined && samples.length > 0) {
      return endpoint.id;
    }
  }

  return input.monitored[0]?.id ?? null;
}
