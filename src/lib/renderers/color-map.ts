// src/lib/renderers/color-map.ts
// Pre-computed 1,501-entry latency → hex color lookup table.
// Interpolates between 8 weather-radar anchor points using linear RGB blending.
// No runtime math needed during rendering — just an O(1) array lookup.

export const COLOR_MAP_SIZE = 1501;

export const STATUS_COLORS = {
  timeout: '#9b5de5',
  error: '#c77dff',
} as const;

// ── Anchor points ──────────────────────────────────────────────────────────
// Each entry: [latency_ms, r, g, b]
const ANCHORS: readonly [number, number, number, number][] = [
  [0,    0x00, 0xb4, 0xd8], // #00b4d8 — excellent/cyan
  [25,   0x00, 0x96, 0xc7], // #0096c7 — fast
  [50,   0x00, 0x77, 0xb6], // #0077b6 — good/blue
  [100,  0x90, 0xbe, 0x6d], // #90be6d — moderate/green
  [200,  0xf9, 0xc7, 0x4f], // #f9c74f — elevated/yellow
  [500,  0xf8, 0x96, 0x1e], // #f8961e — slow/orange
  [1000, 0xf3, 0x72, 0x2c], // #f3722c — critical
  [1500, 0xf9, 0x41, 0x44], // #f94144 — failing/red
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
