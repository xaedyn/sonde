// src/lib/regional-defaults.ts
// Regional defaults module — single source of truth for Region enum, detection,
// the 7-region endpoint table, and URL-to-brand lookup.

// ── Region type ────────────────────────────────────────────────────────────

export type Region =
  | 'north-america'
  | 'europe'
  | 'east-asia'
  | 'south-southeast-asia'
  | 'latam'
  | 'mea'
  | 'oceania';

export const REGIONS: readonly Region[] = [
  'north-america',
  'europe',
  'east-asia',
  'south-southeast-asia',
  'latam',
  'mea',
  'oceania',
];

export const REGION_DISPLAY_NAMES: Readonly<Record<Region, string>> = {
  'north-america':        'North America',
  'europe':               'Europe',
  'east-asia':            'East Asia',
  'south-southeast-asia': 'South & Southeast Asia',
  'latam':                'Latin America',
  'mea':                  'Middle East & Africa',
  'oceania':              'Oceania',
};

// ── LaneRole ───────────────────────────────────────────────────────────────

export type LaneRole =
  | 'Baseline'
  | 'Alt-operator'
  | 'Third-operator'
  | 'Fourth-operator'
  | 'Long-haul';

export interface RegionalEndpointSpec {
  readonly url: string;
  readonly label: string;
  readonly role: LaneRole;
  readonly enabled: true;
}

// ── REGIONAL_DEFAULTS ──────────────────────────────────────────────────────

export const REGIONAL_DEFAULTS: Readonly<Record<Region, readonly RegionalEndpointSpec[]>> = {
  'north-america': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.fastly.com',     label: 'Fastly',     role: 'Fourth-operator', enabled: true },
  ],
  'europe': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.fastly.com',     label: 'Fastly',     role: 'Fourth-operator', enabled: true },
  ],
  'east-asia': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.wikipedia.org',  label: 'Wikipedia',  role: 'Long-haul',       enabled: true },
  ],
  'south-southeast-asia': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.wikipedia.org',  label: 'Wikipedia',  role: 'Long-haul',       enabled: true },
  ],
  'latam': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.fastly.com',     label: 'Fastly',     role: 'Fourth-operator', enabled: true },
  ],
  'mea': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.wikipedia.org',  label: 'Wikipedia',  role: 'Long-haul',       enabled: true },
  ],
  'oceania': [
    { url: 'https://www.google.com',     label: 'Google',     role: 'Baseline',        enabled: true },
    { url: 'https://www.cloudflare.com', label: 'Cloudflare', role: 'Alt-operator',    enabled: true },
    { url: 'https://aws.amazon.com',     label: 'AWS',        role: 'Third-operator',  enabled: true },
    { url: 'https://www.wikipedia.org',  label: 'Wikipedia',  role: 'Long-haul',       enabled: true },
  ],
};

// ── isValidRegion ──────────────────────────────────────────────────────────

export function isValidRegion(value: unknown): value is Region {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
}

// ── TZ city sets for detectRegion ──────────────────────────────────────────

const LATAM_TZ_CITIES: ReadonlySet<string> = new Set([
  'Bogota', 'Buenos_Aires', 'Caracas', 'Cayenne', 'Costa_Rica', 'El_Salvador',
  'Guatemala', 'Guayaquil', 'Havana', 'La_Paz', 'Lima', 'Managua', 'Mazatlan',
  'Mexico_City', 'Montevideo', 'Panama', 'Paramaribo', 'Port-au-Prince',
  'Puerto_Rico', 'Santiago', 'Santo_Domingo', 'Sao_Paulo', 'Tegucigalpa', 'Tijuana',
]);

const EAST_ASIA_TZ_CITIES: ReadonlySet<string> = new Set([
  'Shanghai', 'Beijing', 'Chongqing', 'Harbin', 'Kashgar', 'Urumqi',
  'Hong_Kong', 'Macau', 'Taipei', 'Tokyo', 'Seoul', 'Pyongyang', 'Ulaanbaatar',
]);

const MEA_TZ_CITIES: ReadonlySet<string> = new Set([
  'Dubai', 'Muscat', 'Riyadh', 'Qatar', 'Bahrain', 'Kuwait', 'Baghdad', 'Tehran',
  'Jerusalem', 'Beirut', 'Damascus', 'Amman', 'Aden', 'Yerevan', 'Tbilisi',
  'Baku', 'Nicosia',
]);

// ── detectRegion ──────────────────────────────────────────────────────────
// Never throws. Returns 'north-america' for any unrecognized TZ, UTC, empty, or exception.

export function detectRegion(): Region {
  try {
    const tz = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    const lang = String(navigator.language || '').toLowerCase();
    const slashIdx = tz.indexOf('/');
    const continent = slashIdx === -1 ? tz : tz.slice(0, slashIdx);
    const afterContinent = slashIdx === -1 ? '' : tz.slice(slashIdx + 1);
    const firstSegment = afterContinent.split('/')[0] ?? '';

    switch (continent) {
      case 'America': {
        if (lang.startsWith('pt-br') || lang.startsWith('es-')) return 'latam';
        if (tz.startsWith('America/Argentina/')) return 'latam';
        if (tz.startsWith('America/Indiana/')) return 'north-america';
        if (tz.startsWith('America/Kentucky/')) return 'north-america';
        if (tz.startsWith('America/North_Dakota/')) return 'north-america';
        if (LATAM_TZ_CITIES.has(firstSegment)) return 'latam';
        return 'north-america';
      }
      case 'Europe':
      case 'Atlantic':
        return 'europe';
      case 'Asia': {
        if (EAST_ASIA_TZ_CITIES.has(firstSegment)) return 'east-asia';
        if (MEA_TZ_CITIES.has(firstSegment))       return 'mea';
        return 'south-southeast-asia';
      }
      case 'Africa':
      case 'Indian':
        return 'mea';
      case 'Australia':
      case 'Pacific':
        return 'oceania';
      default:
        return 'north-america';
    }
  } catch {
    return 'north-america';
  }
}

// ── URL normalization + brand lookup ───────────────────────────────────────

export function normalizeUrlForBrandLookup(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.protocol}//${parsed.hostname}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

const BRAND_LABELS: ReadonlyMap<string, { readonly label: string; readonly role: LaneRole }> =
  new Map([
    ['https://www.google.com',     { label: 'Google',     role: 'Baseline' }],
    ['https://www.cloudflare.com', { label: 'Cloudflare', role: 'Alt-operator' }],
    ['https://aws.amazon.com',     { label: 'AWS',        role: 'Third-operator' }],
    ['https://www.fastly.com',     { label: 'Fastly',     role: 'Fourth-operator' }],
    ['https://www.wikipedia.org',  { label: 'Wikipedia',  role: 'Long-haul' }],
  ]);

export function brandFor(url: string): { readonly label: string; readonly role: LaneRole } | null {
  return BRAND_LABELS.get(normalizeUrlForBrandLookup(url)) ?? null;
}
