// src/lib/share/share-manager.ts
// URL-safe share payload encoding using lz-string compression.
// All functions are pure (no DOM side effects) except buildShareURL and parseShareURL.

import LZString from 'lz-string';
import type { SharePayload } from '../types';

// ── Encode / Decode ────────────────────────────────────────────────────────

export function encodeSharePayload(payload: SharePayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  if (!encoded) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    return validateSharePayload(parsed);
  } catch {
    return null;
  }
}

// ── Schema validation ──────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeFiniteNumber(v: unknown): boolean {
  return isFiniteNumber(v) && (v as number) >= 0;
}

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string' || v === '') return false;
  return v.startsWith('http://') || v.startsWith('https://');
}

function validateSharePayload(data: unknown): SharePayload | null {
  if (data === null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  if (obj['v'] !== 1) return null;
  if (obj['mode'] !== 'config' && obj['mode'] !== 'results') return null;
  if (!Array.isArray(obj['endpoints'])) return null;
  if ((obj['endpoints'] as unknown[]).length > 50) return null;

  for (const ep of obj['endpoints'] as unknown[]) {
    if (ep === null || typeof ep !== 'object') return null;
    const e = ep as Record<string, unknown>;
    if (!isHttpUrl(e['url'])) return null;
    if ('enabled' in e && typeof e['enabled'] !== 'boolean') return null;
  }

  const settings = obj['settings'];
  if (settings === null || typeof settings !== 'object') return null;
  const s = settings as Record<string, unknown>;
  if (!isNonNegativeFiniteNumber(s['timeout'])) return null;
  if (!isNonNegativeFiniteNumber(s['delay'])) return null;
  if (!isNonNegativeFiniteNumber(s['cap'])) return null;
  if (s['burstRounds'] !== undefined && !isNonNegativeFiniteNumber(s['burstRounds'])) return null;
  if (s['monitorDelay'] !== undefined && !isNonNegativeFiniteNumber(s['monitorDelay'])) return null;
  if (s['corsMode'] !== 'no-cors' && s['corsMode'] !== 'cors') return null;

  if (obj['results'] !== undefined) {
    if (!Array.isArray(obj['results'])) return null;
    if ((obj['results'] as unknown[]).length > 50) return null;
    for (const result of obj['results'] as unknown[]) {
      if (result === null || typeof result !== 'object') return null;
      const r = result as Record<string, unknown>;
      if (!Array.isArray(r['samples'])) return null;
      if ((r['samples'] as unknown[]).length > 10_000) return null;
      for (const sample of r['samples'] as unknown[]) {
        if (sample === null || typeof sample !== 'object') return null;
        const samp = sample as Record<string, unknown>;
        if (
          !isNonNegativeFiniteNumber(samp['round']) ||
          !isNonNegativeFiniteNumber(samp['latency']) ||
          (samp['status'] !== 'ok' && samp['status'] !== 'timeout' && samp['status'] !== 'error')
        ) return null;
      }
    }
  }

  return data as SharePayload;
}

// ── URL construction ───────────────────────────────────────────────────────

export function buildShareURL(payload: SharePayload): string {
  const encoded = encodeSharePayload(payload);
  return `${window.location.origin}${window.location.pathname}#s=${encoded}`;
}

export function parseShareURL(url?: string): SharePayload | null {
  const target = url ?? window.location.href;
  const hashIndex = target.indexOf('#');
  if (hashIndex === -1) return null;

  const fragment = target.slice(hashIndex + 1);
  if (!fragment.startsWith('s=')) return null;

  const encoded = fragment.slice(2);
  return decodeSharePayload(encoded);
}

// ── Size estimation ────────────────────────────────────────────────────────

export function estimateShareSize(payload: SharePayload): number {
  const encoded = encodeSharePayload(payload);
  // "#s=" is 3 chars; origin + pathname are not predictable here, use a representative estimate
  // We return total URL character count using a typical base URL length
  return (typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`.length
    : 30) + 3 + encoded.length;
}

// ── Payload truncation ─────────────────────────────────────────────────────

/**
 * Binary-search for the maximum number of rounds that fit within maxChars.
 * Keeps the newest rounds (tail of samples array).
 */
export function truncatePayload(payload: SharePayload, maxChars: number): SharePayload {
  if (!payload.results || payload.results.length === 0) return payload;

  // Determine total rounds available (use first endpoint as reference)
  const firstResult = payload.results[0];
  if (!firstResult) return payload;

  const totalRounds = firstResult.samples.length;

  // Check if full payload fits
  if (estimateShareSize(payload) <= maxChars) return payload;

  // Binary search for max rounds that fit
  let lo = 0;
  let hi = totalRounds;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = slicePayload(payload, mid);
    if (estimateShareSize(candidate) <= maxChars) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return slicePayload(payload, best);
}

function slicePayload(payload: SharePayload, keepRounds: number): SharePayload {
  if (!payload.results) return payload;

  const results = payload.results.map((endpoint) => ({
    ...endpoint,
    samples: keepRounds <= 0 ? [] : endpoint.samples.slice(-keepRounds),
  }));

  return { ...payload, results };
}
