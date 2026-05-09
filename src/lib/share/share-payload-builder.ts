// src/lib/share/share-payload-builder.ts
// Pure builders for config and result share payloads. Keeping this outside the
// popover lets ReportView copy the exact report link that SharePopover emits.

import type { Endpoint, MeasurementState, Settings, SharePayload, ShareReportMetadata } from '../types';
import { estimateShareSize, toSharedSettings, truncatePayload } from './share-manager';

export const MAX_SHARE_URL_CHARS = 8000;

export interface BuiltResultsSharePayload {
  readonly payload: SharePayload;
  readonly estimatedSize: number;
  readonly truncated: boolean;
}

export function buildConfigSharePayload(
  endpoints: readonly Endpoint[],
  settings: Settings,
): SharePayload {
  return {
    v: 1,
    mode: 'config',
    endpoints: endpoints.map(ep => ({ url: ep.url, enabled: ep.enabled })),
    settings: toSharedSettings(settings),
  };
}

function countSamples(results: NonNullable<SharePayload['results']>): number {
  let count = 0;
  for (const result of results) count += result.samples.length;
  return count;
}

function buildResults(
  endpoints: readonly Endpoint[],
  measurements: MeasurementState,
): NonNullable<SharePayload['results']> {
  return endpoints.map(ep => {
    const epState = measurements.endpoints[ep.id];
    return {
      samples: (epState?.samples ?? []).map(s => ({
        round: s.round,
        latency: s.latency,
        status: s.status,
        ...(s.tier2 ? { tier2: s.tier2 } : {}),
      })),
    };
  });
}

function withReportMetadata(
  payload: SharePayload,
  metadata: ShareReportMetadata,
): SharePayload {
  return { ...payload, report: metadata };
}

export function buildResultsSharePayload(
  endpoints: readonly Endpoint[],
  settings: Settings,
  measurements: MeasurementState,
  maxChars = MAX_SHARE_URL_CHARS,
  now = Date.now(),
  reportMetadata: Partial<ShareReportMetadata> = {},
): BuiltResultsSharePayload {
  const results = buildResults(endpoints, measurements);
  const keptSampleCount = countSamples(results);
  const totalSampleCount = Math.max(
    reportMetadata.totalSampleCount ?? keptSampleCount,
    keptSampleCount,
  );

  const metadata: ShareReportMetadata = {
    createdAt: reportMetadata.createdAt ?? now,
    healthThreshold: reportMetadata.healthThreshold ?? settings.healthThreshold,
    corsMode: reportMetadata.corsMode ?? settings.corsMode,
    roundCount: reportMetadata.roundCount ?? measurements.roundCounter,
    totalSampleCount,
    keptSampleCount,
    truncated: reportMetadata.truncated ?? false,
  };

  const basePayload: SharePayload = {
    v: 2,
    mode: 'results',
    endpoints: endpoints.map(ep => ({ url: ep.url, enabled: ep.enabled })),
    settings: toSharedSettings(settings),
    report: metadata,
    results,
  };

  if (estimateShareSize(basePayload) <= maxChars) {
    return {
      payload: basePayload,
      estimatedSize: estimateShareSize(basePayload),
      truncated: false,
    };
  }

  const truncatedPayload = truncatePayload(basePayload, maxChars);
  const truncatedKeptSampleCount = countSamples(truncatedPayload.results ?? []);
  const payload = withReportMetadata(truncatedPayload, {
    ...metadata,
    keptSampleCount: truncatedKeptSampleCount,
    truncated: true,
  });

  return {
    payload,
    estimatedSize: estimateShareSize(payload),
    truncated: true,
  };
}
