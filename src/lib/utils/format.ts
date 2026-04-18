// src/lib/utils/format.ts
// Single source of truth for rendering ms/percent/count values in the v2 views.
// Every latency readout in chrono/live/atlas/strata/terminal goes through fmt().
// Ad-hoc `toFixed` calls in component templates are forbidden (see 03-components/shared.md).

/**
 * Format a millisecond value for display.
 *
 *   fmt(0.43)      → "0.43"
 *   fmt(1)         → "1.0"
 *   fmt(127.4)     → "127"
 *   fmt(1234)      → "1,234"
 *   fmt(12345)     → "12.3s"
 *   fmt(null)      → "—"
 *   fmt(NaN)       → "—"
 *   fmt(Infinity)  → "—"
 *   fmt(-1)        → "—"  (negative latency is invalid)
 */
export function fmt(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1)     return ms.toFixed(2);
  if (ms < 10)    return ms.toFixed(1);
  if (ms < 10_000) return Math.round(ms).toLocaleString('en-US');
  return (ms / 1000).toFixed(1) + 's';
}

/**
 * Split into independently-styleable number and unit parts.
 * Used by the rail metric + overview triptych where the unit is typographically
 * smaller than the numeric value.
 */
export function fmtParts(ms: number | null | undefined): { num: string; unit: string } {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return { num: '—', unit: '' };
  if (ms < 10_000) return { num: fmt(ms), unit: 'ms' };
  return { num: (ms / 1000).toFixed(1), unit: 's' };
}

/** Ratio in 0..1 → rounded integer percent with `%` suffix. */
export function fmtPct(ratio: number): string {
  return Math.round(ratio * 100) + '%';
}

/** Integer with locale thousands separator. */
export function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}
