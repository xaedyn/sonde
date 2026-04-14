// src/lib/renderers/color-map.ts
// Pre-computed 1,501-entry latency → hex color lookup table.
// Interpolates between 8 weather-radar anchor points using linear RGB blending.
// No runtime math needed during rendering — just an O(1) array lookup.

export const COLOR_MAP_SIZE = 1501;

import { tokens } from '$lib/tokens';

export const STATUS_COLORS = {
  timeout: tokens.color.status.timeout,
  error: tokens.color.status.error,
} as const;

// ── Anchor points ──────────────────────────────────────────────────────────
// Cyan-anchored thermal gradient with log-weighted thresholds.
// Cool→warm sweep preserves brand identity while reading intuitively.
// Each entry: [latency_ms, r, g, b]
const ANCHORS: readonly [number, number, number, number][] = [
  [0,    0x67, 0xe8, 0xf9], // #67e8f9 — excellent / cyan (brand accent)
  [10,   0x2d, 0xd4, 0xbf], // #2dd4bf — great / teal
  [25,   0x22, 0xc5, 0x5e], // #22c55e — good / green
  [50,   0xea, 0xb3, 0x08], // #eab308 — moderate / yellow
  [100,  0xf9, 0x73, 0x16], // #f97316 — elevated / orange
  [200,  0xef, 0x44, 0x44], // #ef4444 — degraded / red
  [500,  0xdc, 0x26, 0x26], // #dc2626 — critical / deep red
  [1500, 0xb9, 0x1c, 0x1c], // #b91c1c — failing / crimson
];

// ── Interpolation helper ────────────────────────────────────────────────────
function toHex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

function interpolate(ms: number): string {
  // Find the surrounding anchors
  let lo = ANCHORS[0];
  let hi = ANCHORS[ANCHORS.length - 1];

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    if (ms >= ANCHORS[i][0] && ms <= ANCHORS[i + 1][0]) {
      lo = ANCHORS[i];
      hi = ANCHORS[i + 1];
      break;
    }
  }

  if (ms <= lo[0]) {
    return `#${toHex(lo[1])}${toHex(lo[2])}${toHex(lo[3])}`;
  }
  if (ms >= hi[0]) {
    return `#${toHex(hi[1])}${toHex(hi[2])}${toHex(hi[3])}`;
  }

  const t = (ms - lo[0]) / (hi[0] - lo[0]);
  const r = lo[1] + t * (hi[1] - lo[1]);
  const g = lo[2] + t * (hi[2] - lo[2]);
  const b = lo[3] + t * (hi[3] - lo[3]);

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── Build the lookup table ─────────────────────────────────────────────────
function buildColorMap(): readonly string[] {
  const map: string[] = new Array(COLOR_MAP_SIZE);
  for (let ms = 0; ms < COLOR_MAP_SIZE; ms++) {
    map[ms] = interpolate(ms);
  }
  return map;
}

export const colorMap: readonly string[] = buildColorMap();

// ── Public API ─────────────────────────────────────────────────────────────
export function latencyToColor(ms: number): string {
  const index = Math.round(Math.max(0, Math.min(COLOR_MAP_SIZE - 1, ms)));
  return colorMap[index];
}
