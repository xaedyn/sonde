import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  REGIONS,
  REGION_DISPLAY_NAMES,
  REGIONAL_DEFAULTS,
  isValidRegion,
  detectRegion,
  brandFor,
  normalizeUrlForBrandLookup,
} from '../../src/lib/regional-defaults';
import type { Region } from '../../src/lib/regional-defaults';

// ── REGIONAL_DEFAULTS invariants ───────────────────────────────────────────

describe('REGIONAL_DEFAULTS', () => {
  it('all 7 regions have exactly 4 entries', () => {
    for (const region of REGIONS) {
      expect(REGIONAL_DEFAULTS[region]).toHaveLength(4);
    }
  });

  it('lane 1 is Google URL for every region', () => {
    for (const region of REGIONS) {
      expect(REGIONAL_DEFAULTS[region][0]?.url).toBe('https://www.google.com');
    }
  });

  it('lane 2 is the TAO-anchor self-probe for every region', () => {
    for (const region of REGIONS) {
      expect(REGIONAL_DEFAULTS[region][1]?.url).toBe('https://chronoscope.dev/probe');
      expect(REGIONAL_DEFAULTS[region][1]?.role).toBe('TAO-anchor');
    }
  });

  it('lane 3 is AWS URL for every region', () => {
    for (const region of REGIONS) {
      expect(REGIONAL_DEFAULTS[region][2]?.url).toBe('https://aws.amazon.com');
    }
  });

  it('NA/EU/LATAM lane 4 is Fastly (Fourth-operator)', () => {
    for (const region of ['north-america', 'europe', 'latam'] as Region[]) {
      expect(REGIONAL_DEFAULTS[region][3]?.url).toBe('https://www.fastly.com/robots.txt');
      expect(REGIONAL_DEFAULTS[region][3]?.role).toBe('Fourth-operator');
    }
  });

  it('East Asia/SEA/MEA/Oceania lane 4 is Wikipedia (Long-haul)', () => {
    for (const region of ['east-asia', 'south-southeast-asia', 'mea', 'oceania'] as Region[]) {
      expect(REGIONAL_DEFAULTS[region][3]?.url).toBe('https://en.wikipedia.org');
      expect(REGIONAL_DEFAULTS[region][3]?.role).toBe('Long-haul');
    }
  });

  it('every URL in the table has a matching BRAND_LABELS entry (brandFor returns non-null)', () => {
    for (const region of REGIONS) {
      for (const spec of REGIONAL_DEFAULTS[region]) {
        expect(brandFor(spec.url)).not.toBeNull();
      }
    }
  });

  it('all entries have enabled: true', () => {
    for (const region of REGIONS) {
      for (const spec of REGIONAL_DEFAULTS[region]) {
        expect(spec.enabled).toBe(true);
      }
    }
  });
});

describe('REGION_DISPLAY_NAMES', () => {
  it('has exactly 7 keys matching REGIONS', () => {
    expect(Object.keys(REGION_DISPLAY_NAMES)).toHaveLength(7);
    for (const region of REGIONS) {
      expect(REGION_DISPLAY_NAMES[region]).toBeTruthy();
    }
  });

  it('has correct display strings', () => {
    expect(REGION_DISPLAY_NAMES['north-america']).toBe('North America');
    expect(REGION_DISPLAY_NAMES['europe']).toBe('Europe');
    expect(REGION_DISPLAY_NAMES['east-asia']).toBe('East Asia');
    expect(REGION_DISPLAY_NAMES['south-southeast-asia']).toBe('South & Southeast Asia');
    expect(REGION_DISPLAY_NAMES['latam']).toBe('Latin America');
    expect(REGION_DISPLAY_NAMES['mea']).toBe('Middle East & Africa');
    expect(REGION_DISPLAY_NAMES['oceania']).toBe('Oceania');
  });
});

describe('isValidRegion', () => {
  it('returns true for all 7 valid region strings', () => {
    for (const region of REGIONS) {
      expect(isValidRegion(region)).toBe(true);
    }
  });
  it('returns false for undefined', () => { expect(isValidRegion(undefined)).toBe(false); });
  it('returns false for null', () => { expect(isValidRegion(null)).toBe(false); });
  it('returns false for empty string', () => { expect(isValidRegion('')).toBe(false); });
  it('returns false for hyphen-missing variant', () => { expect(isValidRegion('northamerica')).toBe(false); });
  it('returns false for uppercase', () => { expect(isValidRegion('NA')).toBe(false); });
  it('returns false for plain object', () => { expect(isValidRegion({})).toBe(false); });
  it('returns false for number', () => { expect(isValidRegion(42)).toBe(false); });
});

function mockTz(tz: string, lang = 'en-US'): void {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: tz } as Intl.ResolvedDateTimeFormatOptions),
  } as Intl.DateTimeFormat);
  Object.defineProperty(navigator, 'language', { value: lang, configurable: true });
}

describe('detectRegion', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('UTC → north-america (AC5)', () => { mockTz('UTC'); expect(detectRegion()).toBe('north-america'); });
  it('empty string → north-america (AC5)', () => { mockTz(''); expect(detectRegion()).toBe('north-america'); });
  it('Asia/Tokyo → east-asia', () => { mockTz('Asia/Tokyo'); expect(detectRegion()).toBe('east-asia'); });
  it('Asia/Kolkata → south-southeast-asia', () => { mockTz('Asia/Kolkata'); expect(detectRegion()).toBe('south-southeast-asia'); });
  it('Asia/Dubai → mea', () => { mockTz('Asia/Dubai'); expect(detectRegion()).toBe('mea'); });
  it('America/Sao_Paulo → latam', () => { mockTz('America/Sao_Paulo', 'pt-BR'); expect(detectRegion()).toBe('latam'); });
  it('America/Argentina/Buenos_Aires → latam', () => { mockTz('America/Argentina/Buenos_Aires', 'es-AR'); expect(detectRegion()).toBe('latam'); });
  it('America/Indiana/Indianapolis → north-america (US nested zone)', () => { mockTz('America/Indiana/Indianapolis', 'en-US'); expect(detectRegion()).toBe('north-america'); });
  it('America/New_York + pt-BR → latam (locale tiebreaker)', () => { mockTz('America/New_York', 'pt-BR'); expect(detectRegion()).toBe('latam'); });
  it('America/New_York + en-US → north-america', () => { mockTz('America/New_York', 'en-US'); expect(detectRegion()).toBe('north-america'); });
  it('Europe/Berlin → europe', () => { mockTz('Europe/Berlin'); expect(detectRegion()).toBe('europe'); });
  it('Atlantic/Azores → europe', () => { mockTz('Atlantic/Azores'); expect(detectRegion()).toBe('europe'); });
  it('Australia/Sydney → oceania', () => { mockTz('Australia/Sydney'); expect(detectRegion()).toBe('oceania'); });
  it('Pacific/Auckland → oceania', () => { mockTz('Pacific/Auckland'); expect(detectRegion()).toBe('oceania'); });
  it('Africa/Johannesburg → mea', () => { mockTz('Africa/Johannesburg'); expect(detectRegion()).toBe('mea'); });
  it('Indian/Mauritius → mea', () => { mockTz('Indian/Mauritius'); expect(detectRegion()).toBe('mea'); });
  it('Antarctica/* → north-america (default fallback)', () => { mockTz('Antarctica/McMurdo'); expect(detectRegion()).toBe('north-america'); });
  it('does not throw when Intl.DateTimeFormat throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new Error('Intl unavailable'); });
    expect(() => detectRegion()).not.toThrow();
    expect(detectRegion()).toBe('north-america');
  });
});

describe('brandFor', () => {
  it('returns Google/Baseline for canonical URL', () => {
    expect(brandFor('https://www.google.com')).toEqual({ label: 'Google', role: 'Baseline' });
  });
  it('returns Self/TAO-anchor for the probe URL', () => {
    expect(brandFor('https://chronoscope.dev/probe')).toEqual({ label: 'Self', role: 'TAO-anchor' });
  });
  it('returns AWS/Third-operator', () => {
    expect(brandFor('https://aws.amazon.com')).toEqual({ label: 'AWS', role: 'Third-operator' });
  });
  it('returns Fastly/Fourth-operator', () => {
    expect(brandFor('https://www.fastly.com/robots.txt')).toEqual({ label: 'Fastly', role: 'Fourth-operator' });
  });
  it('returns Wikipedia/Long-haul', () => {
    expect(brandFor('https://en.wikipedia.org')).toEqual({ label: 'Wikipedia', role: 'Long-haul' });
  });
  it('matches trailing slash variant', () => {
    expect(brandFor('https://www.google.com/')).toEqual({ label: 'Google', role: 'Baseline' });
  });
  it('matches mixed-case URL', () => {
    expect(brandFor('HTTPS://WWW.GOOGLE.COM')).toEqual({ label: 'Google', role: 'Baseline' });
  });
  it('returns null for http:// (protocol difference — intentional miss)', () => {
    expect(brandFor('http://www.google.com')).toBeNull();
  });
  it('returns null for no-protocol URL', () => {
    expect(brandFor('google.com')).toBeNull();
  });
  it('returns null for arbitrary user-added URL', () => {
    expect(brandFor('https://example.com')).toBeNull();
  });
});

describe('normalizeUrlForBrandLookup', () => {
  it('lowercases hostname', () => {
    expect(normalizeUrlForBrandLookup('https://WWW.GOOGLE.COM')).toBe('https://www.google.com');
  });
  it('strips trailing slash on root path', () => {
    expect(normalizeUrlForBrandLookup('https://www.google.com/')).toBe('https://www.google.com');
  });
  it('preserves non-root path', () => {
    expect(normalizeUrlForBrandLookup('https://www.google.com/search')).toBe('https://www.google.com/search');
  });
  it('preserves protocol (http vs https treated as distinct)', () => {
    expect(normalizeUrlForBrandLookup('http://www.google.com')).toBe('http://www.google.com');
  });
  it('returns input as-is for malformed URL', () => {
    expect(normalizeUrlForBrandLookup('not a url')).toBe('not a url');
  });
});
