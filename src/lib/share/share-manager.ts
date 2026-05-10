// src/lib/share/share-manager.ts
// URL-safe share payload encoding using lz-string compression.
// All functions are pure (no DOM side effects) except buildShareURL and parseShareURL.

import LZString from 'lz-string';
import type { SharePayload, Settings } from '../types';
import { validateSharePayload } from './share-validator';

// ── Share settings helper ──────────────────────────────────────────────────
// Explicitly destructures only the 6 allowed share fields.
// Prevents region (and any future Settings-only fields) from leaking
// into share links via TypeScript's structural-subtype-allows-excess-fields behavior.

export function toSharedSettings(s: Settings): SharePayload['settings'] {
  const { timeout, delay, burstRounds, monitorDelay, cap, corsMode } = s;
  return { timeout, delay, burstRounds, monitorDelay, cap, corsMode };
}

// ── Encode / Decode ────────────────────────────────────────────────────────

export function encodeSharePayload(payload: SharePayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  if (!encoded) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) {
      console.warn('[Chronoscope] Share URL decompression failed — link may be corrupted');
      return null;
    }
    const parsed: unknown = JSON.parse(json);
    const validated = validateSharePayload(parsed);
    if (!validated) {
      console.warn('[Chronoscope] Share URL validation failed — schema mismatch or out-of-range values');
    }
    return validated;
  } catch (err: unknown) {
    console.warn('[Chronoscope] Share URL decode error:', err);
    return null;
  }
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
