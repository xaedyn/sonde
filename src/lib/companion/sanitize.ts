// src/lib/companion/sanitize.ts
// Converts local companion probe output into report-safe, bounded evidence.

import type { CompanionProbeName, CompanionProbeResponse, CompanionTimedResult } from './protocol';
import type {
  ShareLocalCompanionProbeName,
  ShareLocalCompanionSection,
  ShareLocalCompanionSectionStatus,
  ShareLocalCompanionSnapshot,
  ShareLocalCompanionWifi,
} from '../types';

const PROBE_ORDER: readonly CompanionProbeName[] = ['dns', 'tls', 'route', 'wifi'];
const MAX_SUMMARY_LENGTH = 160;
const MAX_DETAIL_LENGTH = 180;

function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`;
}

function statusFor(section: CompanionTimedResult<unknown>): ShareLocalCompanionSectionStatus {
  if (section.ok) return 'captured';
  return section.unavailable ? 'unavailable' : 'failed';
}

function durationMs(section: CompanionTimedResult<unknown>): number {
  return Number.isFinite(section.durationMs) && section.durationMs >= 0
    ? Math.round(section.durationMs)
    : 0;
}

function probeLabel(name: CompanionProbeName): string {
  switch (name) {
    case 'dns':
      return 'DNS';
    case 'tls':
      return 'TLS';
    case 'route':
      return 'route';
    case 'wifi':
      return 'WiFi';
  }
}

function joinList(parts: readonly string[]): string {
  if (parts.length === 0) return 'Local agent ran.';
  if (parts.length === 1) return `${parts[0]} completed.`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]} completed.`;
}

function dnsDetail(section: NonNullable<CompanionProbeResponse['results']['dns']>): string {
  if (!section.ok || !section.value) return detailForUnavailableOrFailed('DNS lookup', section);
  const addressCount = section.value.lookup.length;
  const cnameCount = section.value.cname.length;
  return `DNS lookup captured ${addressCount} ${addressCount === 1 ? 'address' : 'addresses'}${cnameCount > 0 ? ` and ${cnameCount} CNAME ${cnameCount === 1 ? 'record' : 'records'}` : ''}.`;
}

function tlsDetail(section: NonNullable<CompanionProbeResponse['results']['tls']>): string {
  if (!section.ok || !section.value) return detailForUnavailableOrFailed('TLS check', section);
  if (section.value.authorized) return 'TLS certificate was accepted by the local system trust store.';
  return section.value.authorizationError
    ? `TLS certificate was not accepted: ${truncate(section.value.authorizationError, 72)}.`
    : 'TLS certificate was not accepted by the local system trust store.';
}

function routeDetail(section: NonNullable<CompanionProbeResponse['results']['route']>): string {
  if (!section.ok || !section.value) return detailForUnavailableOrFailed('Route check', section);
  const tool = section.value.tool || 'route check';
  const hopCount = section.value.hops.length;
  return `${tool} captured ${hopCount} ${hopCount === 1 ? 'hop' : 'hops'}; raw hop details stay local.`;
}

function wifiDetail(
  section: NonNullable<CompanionProbeResponse['results']['wifi']>,
  includePrivateWifi: boolean,
): string {
  if (!section.ok || !section.value) return detailForUnavailableOrFailed('WiFi signal check', section);
  return includePrivateWifi
    ? 'WiFi signal captured; private network names were explicitly included.'
    : 'WiFi signal captured; private network names are redacted.';
}

function detailForUnavailableOrFailed(label: string, section: CompanionTimedResult<unknown>): string {
  const reason = section.reason ?? section.error;
  if (section.unavailable) {
    return reason ? `${label} unavailable: ${truncate(reason, 88)}.` : `${label} unavailable on this device.`;
  }
  return reason ? `${label} failed: ${truncate(reason, 96)}.` : `${label} did not complete.`;
}

function detailFor(
  name: CompanionProbeName,
  section: CompanionProbeResponse['results'][CompanionProbeName],
  includePrivateWifi: boolean,
): string {
  if (!section) return '';
  switch (name) {
    case 'dns':
      return dnsDetail(section as NonNullable<CompanionProbeResponse['results']['dns']>);
    case 'tls':
      return tlsDetail(section as NonNullable<CompanionProbeResponse['results']['tls']>);
    case 'route':
      return routeDetail(section as NonNullable<CompanionProbeResponse['results']['route']>);
    case 'wifi':
      return wifiDetail(
        section as NonNullable<CompanionProbeResponse['results']['wifi']>,
        includePrivateWifi,
      );
  }
}

function sectionFor(
  name: CompanionProbeName,
  section: CompanionProbeResponse['results'][CompanionProbeName],
  includePrivateWifi: boolean,
): ShareLocalCompanionSection | null {
  if (!section) return null;
  return {
    name: name as ShareLocalCompanionProbeName,
    status: statusFor(section),
    ok: section.ok,
    durationMs: durationMs(section),
    detail: truncate(detailFor(name, section, includePrivateWifi), MAX_DETAIL_LENGTH),
  };
}

function wifiForReport(
  probe: CompanionProbeResponse,
  includePrivateWifi: boolean,
): ShareLocalCompanionWifi | undefined {
  const wifi = probe.results.wifi;
  if (!wifi?.value) return undefined;
  const ssid = wifi.value.ssid;
  const bssid = wifi.value.bssid;
  return {
    rssi: wifi.value.rssi,
    noise: wifi.value.noise,
    ...(ssid ? { ssid: includePrivateWifi ? truncate(ssid, 64) : 'redacted' } : {}),
    ...(bssid ? { bssid: includePrivateWifi ? truncate(bssid, 64) : 'redacted' } : {}),
  };
}

function summaryFor(sections: readonly ShareLocalCompanionSection[]): string {
  const captured = sections
    .filter((section) => section.status === 'captured')
    .map((section) => probeLabel(section.name));
  if (captured.length > 0) return joinList(captured);

  const unavailable = sections.filter((section) => section.status === 'unavailable').length;
  if (unavailable === sections.length) return 'Local companion probes were unavailable on this device.';
  return 'Local companion probes did not complete.';
}

export function sanitizeCompanionProbeForReport(
  probe: CompanionProbeResponse,
  options: { readonly includePrivateWifi: boolean },
): ShareLocalCompanionSnapshot {
  const sections = PROBE_ORDER
    .map((name) => sectionFor(name, probe.results[name], options.includePrivateWifi))
    .filter((section): section is ShareLocalCompanionSection => section !== null);
  const wifi = wifiForReport(probe, options.includePrivateWifi);

  return {
    generatedAt: probe.createdAt,
    targetHost: truncate(probe.targetHost, 253),
    summary: truncate(summaryFor(sections), MAX_SUMMARY_LENGTH),
    sections,
    ...(wifi ? { wifi } : {}),
  };
}
