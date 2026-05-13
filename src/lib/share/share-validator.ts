import { MAX_CAP } from '../limits';
import type { SharePayload } from '../types';
import { isSafeSharedUrl } from '../utils/url-safety';

const ALLOWED_TOP_LEVEL = new Set(['v', 'mode', 'endpoints', 'settings', 'results', 'report', 'remoteVantage', 'localCompanion']);
const ALLOWED_REPORT_KEYS = new Set([
  'reportKind',
  'createdAt',
  'healthThreshold',
  'corsMode',
  'roundCount',
  'totalSampleCount',
  'keptSampleCount',
  'truncated',
]);
const ALLOWED_REMOTE_KEYS = new Set(['generatedAt', 'edge', 'results']);
const ALLOWED_EDGE_KEYS = new Set(['colo', 'country', 'city', 'region', 'timezone']);
const ALLOWED_REMOTE_RESULT_KEYS = new Set([
  'endpointId',
  'label',
  'url',
  'ok',
  'status',
  'statusText',
  'durationMs',
  'checkedAt',
  'verdict',
  'headers',
  'error',
]);
const ALLOWED_REMOTE_HEADERS = new Set(['content-type', 'server', 'cache-control', 'cf-cache-status']);
const ALLOWED_LOCAL_KEYS = new Set(['generatedAt', 'targetHost', 'summary', 'sections', 'wifi']);
const ALLOWED_LOCAL_SECTION_KEYS = new Set(['name', 'status', 'ok', 'durationMs', 'detail']);
const ALLOWED_LOCAL_WIFI_KEYS = new Set(['rssi', 'noise', 'ssid', 'bssid']);
const ALLOWED_RESULT_KEYS = new Set(['samples']);
const MAX_DELAY_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): boolean {
  return isFiniteNumber(value) && (value as number) >= 0;
}

function isStringWithin(value: unknown, maxLength: number, minLength = 0): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function validateReport(report: unknown, obj: Record<string, unknown>): boolean {
  if (obj['mode'] !== 'results' || obj['v'] !== 2) return false;
  if (!isRecord(report)) return false;
  if (!hasOnlyKeys(report, ALLOWED_REPORT_KEYS)) return false;
  if (report['reportKind'] === undefined) {
    report['reportKind'] = 'support';
  }
  if (
    report['reportKind'] !== 'support' &&
    report['reportKind'] !== 'snapshot'
  ) return false;
  if (!isNonNegativeFiniteNumber(report['createdAt'])) return false;
  if (!isNonNegativeFiniteNumber(report['healthThreshold']) || (report['healthThreshold'] as number) > 15000) return false;
  if (report['corsMode'] !== 'no-cors' && report['corsMode'] !== 'cors') return false;
  if (!isNonNegativeFiniteNumber(report['roundCount']) || (report['roundCount'] as number) > 1_000_000) return false;
  if (!isNonNegativeFiniteNumber(report['totalSampleCount']) || (report['totalSampleCount'] as number) > 500_000) return false;
  if (!isNonNegativeFiniteNumber(report['keptSampleCount']) || (report['keptSampleCount'] as number) > 500_000) return false;
  if ((report['keptSampleCount'] as number) > (report['totalSampleCount'] as number)) return false;
  return typeof report['truncated'] === 'boolean';
}

function validateRemoteHeaders(headers: unknown): boolean {
  if (!isRecord(headers)) return false;
  if (Object.keys(headers).length > ALLOWED_REMOTE_HEADERS.size) return false;
  for (const [key, value] of Object.entries(headers)) {
    if (!ALLOWED_REMOTE_HEADERS.has(key)) return false;
    if (!isStringWithin(value, 160)) return false;
  }
  return true;
}

function validateRemoteEdge(edge: unknown): boolean {
  if (!isRecord(edge)) return false;
  if (!hasOnlyKeys(edge, ALLOWED_EDGE_KEYS)) return false;
  for (const value of Object.values(edge)) {
    if (value !== undefined && !isStringWithin(value, 120)) return false;
  }
  return true;
}

function validateRemoteVantage(remote: unknown, obj: Record<string, unknown>): boolean {
  if (obj['mode'] !== 'results' || obj['v'] !== 2) return false;
  if (!isRecord(remote)) return false;
  if (!hasOnlyKeys(remote, ALLOWED_REMOTE_KEYS)) return false;
  if (!isNonNegativeFiniteNumber(remote['generatedAt'])) return false;
  if (!validateRemoteEdge(remote['edge'])) return false;
  if (!Array.isArray(remote['results']) || remote['results'].length === 0 || remote['results'].length > 8) return false;

  for (const result of remote['results']) {
    if (!isRecord(result)) return false;
    if (!hasOnlyKeys(result, ALLOWED_REMOTE_RESULT_KEYS)) return false;
    if (!isStringWithin(result['endpointId'], 80, 1)) return false;
    if (!isStringWithin(result['label'], 120, 1)) return false;
    if (!isSafeSharedUrl(result['url'])) return false;
    if (typeof result['ok'] !== 'boolean') return false;
    const status = result['status'];
    if (status !== null && (!Number.isInteger(status) || (status as number) < 100 || (status as number) > 599)) return false;
    const statusText = result['statusText'];
    if (statusText !== null && !isStringWithin(statusText, 80)) return false;
    if (!isNonNegativeFiniteNumber(result['durationMs']) || (result['durationMs'] as number) > 60_000) return false;
    if (!isNonNegativeFiniteNumber(result['checkedAt'])) return false;
    if (
      result['verdict'] !== 'reachable' &&
      result['verdict'] !== 'slow' &&
      result['verdict'] !== 'http-error' &&
      result['verdict'] !== 'unreachable'
    ) return false;
    if (!validateRemoteHeaders(result['headers'])) return false;
    if (result['error'] !== undefined && !isStringWithin(result['error'], 240)) return false;
  }

  return true;
}

function allowedEndpointHosts(obj: Record<string, unknown>): Set<string> {
  const hosts = new Set<string>();
  const endpoints = obj['endpoints'];
  if (!Array.isArray(endpoints)) return hosts;
  for (const endpoint of endpoints) {
    if (!isRecord(endpoint) || typeof endpoint['url'] !== 'string') continue;
    try {
      hosts.add(new URL(endpoint['url']).hostname);
    } catch {
      // endpoint validation reports the structural failure elsewhere.
    }
  }
  return hosts;
}

function validateNullableSignal(value: unknown): boolean {
  if (value === null) return true;
  return isFiniteNumber(value) && (value as number) >= -150 && (value as number) <= 50;
}

function validateLocalWifi(wifi: unknown): boolean {
  if (!isRecord(wifi)) return false;
  if (!hasOnlyKeys(wifi, ALLOWED_LOCAL_WIFI_KEYS)) return false;
  if (!validateNullableSignal(wifi['rssi'])) return false;
  if (!validateNullableSignal(wifi['noise'])) return false;
  if (wifi['ssid'] !== undefined && !isStringWithin(wifi['ssid'], 64)) return false;
  return wifi['bssid'] === undefined || isStringWithin(wifi['bssid'], 64);
}

function validateLocalCompanion(local: unknown, obj: Record<string, unknown>): boolean {
  if (obj['mode'] !== 'results' || obj['v'] !== 2) return false;
  if (!isRecord(local)) return false;
  if (!hasOnlyKeys(local, ALLOWED_LOCAL_KEYS)) return false;
  if (!isNonNegativeFiniteNumber(local['generatedAt'])) return false;
  if (!isStringWithin(local['targetHost'], 253, 1)) return false;
  if (!allowedEndpointHosts(obj).has(local['targetHost'] as string)) return false;
  if (!isStringWithin(local['summary'], 160, 1)) return false;
  if (!Array.isArray(local['sections']) || local['sections'].length === 0 || local['sections'].length > 4) return false;

  for (const section of local['sections']) {
    if (!isRecord(section)) return false;
    if (!hasOnlyKeys(section, ALLOWED_LOCAL_SECTION_KEYS)) return false;
    if (
      section['name'] !== 'dns' &&
      section['name'] !== 'tls' &&
      section['name'] !== 'route' &&
      section['name'] !== 'wifi'
    ) return false;
    if (
      section['status'] !== 'captured' &&
      section['status'] !== 'failed' &&
      section['status'] !== 'unavailable'
    ) return false;
    if (typeof section['ok'] !== 'boolean') return false;
    if (!isNonNegativeFiniteNumber(section['durationMs']) || (section['durationMs'] as number) > 60_000) return false;
    if (!isStringWithin(section['detail'], 180, 1)) return false;
  }

  return local['wifi'] === undefined || validateLocalWifi(local['wifi']);
}

export function validateSharePayload(data: unknown): SharePayload | null {
  if (!isRecord(data)) return null;
  const obj = data;

  if (obj['v'] !== 1 && obj['v'] !== 2) return null;
  if (obj['mode'] !== 'config' && obj['mode'] !== 'results') return null;
  if (!Array.isArray(obj['endpoints'])) return null;
  if ((obj['endpoints'] as unknown[]).length > 50) return null;

  // mode:'results' without a results array is structurally invalid: the
  // payload claims to carry a snapshot but doesn't.
  if (obj['mode'] === 'results' && obj['results'] === undefined) return null;

  for (const ep of obj['endpoints'] as unknown[]) {
    if (!isRecord(ep)) return null;
    if (!isSafeSharedUrl(ep['url'])) return null;
    if (typeof ep['enabled'] !== 'boolean') return null;
    for (const key of Object.keys(ep)) {
      if (key !== 'url' && key !== 'enabled') return null;
    }
  }

  const settings = obj['settings'];
  if (!isRecord(settings)) return null;
  if (!isNonNegativeFiniteNumber(settings['timeout']) || (settings['timeout'] as number) > 15000) return null;
  if (!isNonNegativeFiniteNumber(settings['delay']) || (settings['delay'] as number) > MAX_DELAY_MS) return null;
  if (!isNonNegativeFiniteNumber(settings['cap']) || (settings['cap'] as number) > MAX_CAP) return null;
  if (settings['burstRounds'] !== undefined && (!isNonNegativeFiniteNumber(settings['burstRounds']) || (settings['burstRounds'] as number) > 500)) return null;
  if (settings['monitorDelay'] !== undefined && (!isNonNegativeFiniteNumber(settings['monitorDelay']) || (settings['monitorDelay'] as number) > 60000)) return null;
  if (settings['corsMode'] !== 'no-cors' && settings['corsMode'] !== 'cors') return null;

  if (obj['report'] !== undefined && !validateReport(obj['report'], obj)) return null;
  if (obj['remoteVantage'] !== undefined && !validateRemoteVantage(obj['remoteVantage'], obj)) return null;
  if (obj['localCompanion'] !== undefined && !validateLocalCompanion(obj['localCompanion'], obj)) return null;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) return null;
  }

  if (obj['results'] !== undefined) {
    if (!Array.isArray(obj['results'])) return null;
    if ((obj['results'] as unknown[]).length > 50) return null;
    for (const result of obj['results'] as unknown[]) {
      if (!isRecord(result)) return null;
      if (!hasOnlyKeys(result, ALLOWED_RESULT_KEYS)) return null;
      if (!Array.isArray(result['samples'])) return null;
      if ((result['samples'] as unknown[]).length > 10_000) return null;
      for (const sample of result['samples'] as unknown[]) {
        if (!isRecord(sample)) return null;
        if (
          !isNonNegativeFiniteNumber(sample['round']) ||
          !isNonNegativeFiniteNumber(sample['latency']) ||
          (sample['status'] !== 'ok' && sample['status'] !== 'timeout' && sample['status'] !== 'error')
        ) return null;
      }
    }
  }

  return data as unknown as SharePayload;
}
