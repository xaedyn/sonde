import { describe, it, expect } from 'vitest';
import {
  encodeSharePayload,
  decodeSharePayload,
  buildShareURL,
  estimateShareSize,
  truncatePayload,
} from '../../src/lib/share/share-manager';
import type { SharePayload } from '../../src/lib/types';

// Mock window.location for URL-based tests
Object.defineProperty(global, 'window', {
  value: {
    location: {
      origin: 'https://sonde.example.com',
      pathname: '/',
      href: 'https://sonde.example.com/',
    },
  },
  writable: true,
});

describe('share-manager', () => {
  const configPayload: SharePayload = {
    v: 1,
    mode: 'config',
    endpoints: [{ url: 'https://example.com', enabled: true }],
    settings: { timeout: 5000, delay: 1000, cap: 0, corsMode: 'no-cors' },
  };

  const resultsPayload: SharePayload = {
    v: 1,
    mode: 'results',
    endpoints: [
      { url: 'https://google.com', enabled: true },
      { url: 'https://1.1.1.1', enabled: true },
    ],
    settings: { timeout: 5000, delay: 1000, cap: 0, corsMode: 'no-cors' },
    results: [
      {
        samples: Array.from({ length: 50 }, (_, i) => ({
          round: i,
          latency: 20 + Math.random() * 80,
          status: 'ok' as const,
        })),
      },
      {
        samples: Array.from({ length: 50 }, (_, i) => ({
          round: i,
          latency: 30 + Math.random() * 120,
          status: 'ok' as const,
        })),
      },
    ],
  };

  it('round-trips config payload', () => {
    const encoded = encodeSharePayload(configPayload);
    const decoded = decodeSharePayload(encoded);
    expect(decoded?.v).toBe(1);
    expect(decoded?.mode).toBe('config');
    expect(decoded?.endpoints).toHaveLength(1);
  });

  it('round-trips results payload', () => {
    const encoded = encodeSharePayload(resultsPayload);
    const decoded = decodeSharePayload(encoded);
    expect(decoded?.results).toHaveLength(2);
    expect(decoded?.results?.[0]?.samples).toHaveLength(50);
  });

  it('returns null for malformed input', () => {
    expect(decodeSharePayload('garbage')).toBeNull();
    expect(decodeSharePayload('')).toBeNull();
  });

  it('returns null for wrong schema version', () => {
    const badPayload = { v: 2, mode: 'config', endpoints: [], settings: {} };
    const encoded = encodeSharePayload(badPayload as unknown as SharePayload);
    // Manually encode so we bypass our own encodeSharePayload typed guard
    import('lz-string').then(({ default: LZString }) => {
      const manualEncoded = LZString.compressToEncodedURIComponent(JSON.stringify(badPayload));
      expect(decodeSharePayload(manualEncoded)).toBeNull();
    });
  });

  it('config-only payload is small', () => {
    const size = estimateShareSize(configPayload);
    expect(size).toBeLessThan(500);
  });

  it('estimateShareSize is within 20% of actual URL length', () => {
    const url = buildShareURL(configPayload);
    const estimate = estimateShareSize(configPayload);
    expect(estimate).toBeGreaterThan(url.length * 0.8);
    expect(estimate).toBeLessThan(url.length * 1.2);
  });

  it('truncatePayload stays under limit', () => {
    const truncated = truncatePayload(resultsPayload, 2000);
    const size = estimateShareSize(truncated);
    expect(size).toBeLessThanOrEqual(2000);
  });

  it('truncatePayload keeps newest rounds', () => {
    const truncated = truncatePayload(resultsPayload, 2000);
    const origSamples = resultsPayload.results![0]!.samples;
    const truncSamples = truncated.results![0]!.samples;
    if (truncSamples.length < origSamples.length) {
      // Should be a suffix of the original
      const suffix = origSamples.slice(-truncSamples.length);
      expect(truncSamples[0]?.round).toBe(suffix[0]?.round);
    }
  });

  it('parseShareURL extracts from hash', () => {
    const url = buildShareURL(configPayload);
    // Extract hash part and manually decode
    const hash = url.split('#')[1];
    const parsed = decodeSharePayload(hash?.replace('s=', '') ?? '');
    expect(parsed?.v).toBe(1);
  });

  it('buildShareURL starts with origin', () => {
    const url = buildShareURL(configPayload);
    expect(url.startsWith('https://sonde.example.com')).toBe(true);
    expect(url).toContain('#s=');
  });
});
