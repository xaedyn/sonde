// src/lib/endpoint/displayLabel.ts
// Pure helpers for deriving a human-readable display label from an endpoint.
// No side-effects, no module-level mutable state. Safe to tree-shake.

import { brandFor } from '../regional-defaults';

// -- Types -------------------------------------------------------------------

export type LabelInput = { url: string; nickname?: string };

// -- Regex constants (\uXXXX escapes required for ESLint + editor safety) -----

/** C0 controls (U+0000-U+001F) and C1 controls (U+007F-U+009F). */
const RE_CONTROL = /[\u0000-\u001F\u007F-\u009F]/u;

/**
 * Bidi-override characters.
 * U+202A-U+202E (LRE, RLE, PDF, LRO, RLO) and
 * U+2066-U+2069 (LRI, RLI, FSI, PDI).
 */
const RE_BIDI = /[\u202A-\u202E\u2066-\u2069]/u;

/**
 * Zero-width and invisible formatting characters.
 * U+200B-U+200D (ZWSP, ZWNJ, ZWJ), U+FEFF (BOM),
 * U+2060-U+206F (word joiner, invisible operators, deprecated formatting).
 */
const RE_ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060-\u206F]/u;

/**
 * Unicode line/paragraph separators.
 * U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR).
 */
const RE_LINE_SEP = /[\u2028\u2029]/u;

// -- displayLabel ------------------------------------------------------------

/**
 * Returns the best human-readable label for an endpoint using a 3-tier
 * priority: nickname -> brandFor(url) -> displayHostname(url).
 *
 * Whitespace-only or absent nicknames fall through to the next tier so that
 * callers which bypass isValidNickname (test fixtures, in-memory pre-save
 * state) still produce sensible output.
 */
export function displayLabel(input: LabelInput): string {
  const trimmed = input.nickname?.trim();
  return (trimmed ? trimmed : null) ?? brandFor(input.url)?.label ?? displayHostname(input.url);
}

// -- displayHostname ---------------------------------------------------------

/**
 * Extracts the hostname (plus non-default port) from a URL string.
 * WHATWG URL strips default ports (:443 for https, :80 for http) automatically.
 * IPv6 bracket notation is preserved.
 *
 * Returns the literal string '(invalid URL)' on parse failure -- never throws.
 * The fail-closed sentinel prevents raw URLs from leaking through AC5 textContent
 * sweep if a malformed entry somehow passes upstream validation.
 */
export function displayHostname(url: string): string {
  try {
    const parsed = new URL(url);
    // URL.port is empty string when the port is the scheme default.
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return '(invalid URL)';
  }
}

// -- isValidNickname ---------------------------------------------------------

/**
 * Type-guard validating a persisted / user-typed nickname.
 *
 * Accepts: non-empty string, <= 80 chars after trimming, free of control,
 * bidi-override, zero-width, and line/paragraph-separator characters.
 *
 * Rejects without throwing for all other inputs, including non-string types,
 * >80-char strings (DoS guard), and empty/whitespace-only values.
 *
 * On rejection at the load boundary, callers set nickname = undefined and
 * keep the endpoint -- never drop the row.
 */
export function isValidNickname(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  if (RE_CONTROL.test(value)) return false;
  if (RE_BIDI.test(value)) return false;
  if (RE_ZERO_WIDTH.test(value)) return false;
  if (RE_LINE_SEP.test(value)) return false;
  return true;
}
