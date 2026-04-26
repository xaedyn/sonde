// src/lib/limits.ts
// Safety-critical bounds for the measurement engine.
// MAX_CAP is not a security boundary — it is functionality abuse mitigation
// (OWASP DoS Cheat Sheet + API4:2023 Unrestricted Resource Consumption).
// Client-side code cannot defend against determined attackers who modify the
// JS bundle; this prevents non-malicious volume problems and raises the bar
// against casual tampering.

/** Maximum number of rounds a measurement session may run. */
export const MAX_CAP = 3600;

/**
 * Clamp an arbitrary input to a finite integer in [1, MAX_CAP].
 *
 * Contract:
 *   - Finite integer in [1, MAX_CAP]    → returned unchanged
 *   - Finite integer > MAX_CAP          → MAX_CAP
 *   - 0 (legacy "unlimited" sentinel)   → MAX_CAP (preserves user intent as "max")
 *   - Finite integer < 0 (negative)     → 1 (minimum)
 *   - Finite non-integer (e.g., 100.5)  → Math.round(n) then re-clamp
 *   - NaN, Infinity, -Infinity          → MAX_CAP (garbage in → safe default)
 *   - Non-numeric (string, null, etc.)  → MAX_CAP (parse failure → safe default)
 *
 * CRITICAL: this function MUST never return NaN. roundCounter >= NaN is always
 * false, which would silently disable the engine cap check entirely.
 */
export function clampCap(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return MAX_CAP;
  if (n === 0) return MAX_CAP; // legacy "unlimited" sentinel
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > MAX_CAP) return MAX_CAP;
  return rounded;
}
