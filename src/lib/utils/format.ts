// src/lib/utils/format.ts
// Pure formatting helpers for latency, counts, and ratios.
// Single source of truth for on-screen numeric displays across the v2 views —
// every rendered ms/count/percent routes through these so tabular numerals and
// precision rules stay consistent. No store imports, no side effects.

import type { HistogramBin } from './diagnose-stats';

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

/**
 * Format an elapsed-time duration in milliseconds as a human-readable clock.
 *
 *   formatElapsed(0)        → "0:00"
 *   formatElapsed(2500)     → "2.5s"
 *   formatElapsed(45000)    → "0:45"
 *   formatElapsed(125000)   → "2:05"
 *   formatElapsed(3_725_000) → "1:02:05"
 *
 * Sub-10-second durations render with a decimal; 10s–1h renders as M:SS;
 * ≥1h renders as H:MM:SS. Non-positive input coerces to "0:00".
 */
export function formatElapsed(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor((ms / 1000) * 10) / 10;
  if (totalSec < 10) {
    return `${totalSec.toFixed(1)}s`;
  }
  const totalSecInt = Math.floor(totalSec);
  const hours = Math.floor(totalSecInt / 3600);
  const minutes = Math.floor((totalSecInt % 3600) / 60);
  const seconds = totalSecInt % 60;
  if (hours > 0) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
  }
  const ss = String(seconds).padStart(2, '0');
  return `${minutes}:${ss}`;
}

/**
 * Render a URL as a compact human label while preserving enough path context
 * to distinguish probes on the same host. The full URL stays available in
 * aria labels and titles where components need it.
 */
export function compactUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return path ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

// ── Histogram axis and tooltip helpers ────────────────────────────────────────
// These helpers are colocated in format.ts (not in DiagnoseView.svelte) so they
// are unit-testable without mounting a component. No store imports, no DOM.

/**
 * Format a millisecond value for use as a histogram axis tick label.
 * Below 1000 ms: bare integer ("2", "50", "500").
 * At or above 1000 ms: seconds with no trailing zero ("1s", "2s", "2.5s").
 *
 *   fmtAxisMs(50)   → "50"
 *   fmtAxisMs(500)  → "500"
 *   fmtAxisMs(1000) → "1s"
 *   fmtAxisMs(2500) → "2.5s"
 */
export function fmtAxisMs(ms: number): string {
  if (ms < 1000) return Math.round(ms).toString();
  return `${ms / 1000}s`;
}

/**
 * Format an axis-edge value with its unit. Below 1000 ms appends " ms";
 * at or above 1000 ms uses fmtAxisMs which already includes the "s" suffix.
 *
 * This helper exists so the unit-suffix decision lives in ONE place and is
 * unit-testable. Without it, the .svelte template needs an inline
 * `value >= 1000 ? '' : ' ms'` ternary, which previously drifted to `> 1000`
 * and produced "1s ms" at the bin-8 boundary.
 *
 *   axisEdgeLabel(50)   → "50 ms"
 *   axisEdgeLabel(500)  → "500 ms"
 *   axisEdgeLabel(1000) → "1s"            ← the bin-8 boundary case
 *   axisEdgeLabel(2000) → "2s"
 */
export function axisEdgeLabel(ms: number): string {
  return ms >= 1000 ? fmtAxisMs(ms) : `${fmtAxisMs(ms)} ms`;
}

/**
 * Format a HistogramBin as a human-readable label for bar tooltips and axis
 * outer-bin markers. Hop from ms to s between bin 8 (toMs===1000) and bin 9
 * (toMs===2000) — the rule is toMs > 1000, not toMs >= 1000.
 *
 * Bin 0 (fromMs <= 0):        "<{toMs} ms"           e.g. "<2 ms"
 * Bin 10 (toMs === +∞):       "≥{N} s" / "≥{N} ms"
 * Internal ms bins:           "{from}–{to} ms"       e.g. "500–1000 ms"
 * Internal s bins (toMs>1000): "{f/1000}–{t/1000} s" e.g. "1–2 s"
 */
export function binLabel(bin: HistogramBin): string {
  // Bin 0 — open-low boundary bin.
  if (bin.fromMs <= 0) return `<${bin.toMs} ms`;

  // Bin 10 — open-high boundary bin.
  if (!Number.isFinite(bin.toMs)) {
    return bin.fromMs >= 1000
      ? `≥${bin.fromMs / 1000} s`
      : `≥${bin.fromMs} ms`;
  }

  // Internal bin — single unit per bin, hop at toMs > 1000.
  return bin.toMs <= 1000
    ? `${bin.fromMs}–${bin.toMs} ms`
    : `${bin.fromMs / 1000}–${bin.toMs / 1000} s`;
}
