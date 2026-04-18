// src/lib/utils/format.ts
// Pure formatting helpers for latency, counts, and ratios.
// Single source of truth for on-screen numeric displays across the v2 views —
// every rendered ms/count/percent routes through these so tabular numerals and
// precision rules stay consistent. No store imports, no side effects.

/**
 * Format a latency value in milliseconds for display.
 *
 *   fmt(0.43)    → "0.43"
 *   fmt(9.87)    → "9.9"
 *   fmt(127.4)   → "127"
 *   fmt(1234)    → "1,234"
 *   fmt(12500)   → "12.5s"
 *   fmt(null)    → "—"
 *   fmt(-1)      → "—"   (non-finite/negative renders as no-data)
 */
export function fmt(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1) return ms.toFixed(2);
  if (ms < 10) return ms.toFixed(1);
  if (ms < 10000) return Math.round(ms).toLocaleString();
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Split a latency into numeric part and unit label — for layouts where the
 * number and unit style independently (rail metric, overview triptych).
 *
 *   fmtParts(127.4)  → { num: "127",  unit: "ms" }
 *   fmtParts(12500)  → { num: "12.5", unit: "s"  }
 *   fmtParts(null)   → { num: "—",    unit: ""   }
 */
export function fmtParts(ms: number | null | undefined): { num: string; unit: string } {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return { num: '—', unit: '' };
  if (ms < 10000) return { num: fmt(ms), unit: 'ms' };
  return { num: (ms / 1000).toFixed(1), unit: 's' };
}

/**
 * Format a 0–1 ratio (or slight overshoot) as a rounded integer percent.
 *
 *   fmtPct(0.5)    → "50%"
 *   fmtPct(0.996)  → "100%"
 *   fmtPct(1.234)  → "123%"
 */
export function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Format an integer count with a locale-aware thousands separator.
 *
 *   fmtCount(1234)    → "1,234"
 *   fmtCount(1000000) → "1,000,000"
 */
export function fmtCount(n: number): string {
  return n.toLocaleString();
}
