import { describe, it, expect } from 'vitest';
import {
  encodeSharePayload,
  decodeSharePayload,
  buildShareURL,
  estimateShareSize,
  truncatePayload,
} from '../../src/lib/share/share-manager';
import type { SharePayload } from '../../src/lib/types';
import { MAX_CAP } from '../../src/lib/limits';

// Mock window.location for URL-based tests
Object.defineProperty(global, 'window', {
  value: {
    location: {
      origin: 'https://chronoscope.example.com',
      pathname: '/',
      href: 'https://chronoscope.example.com/',
    },
  },
  writable: true,
});

describe('share-manager', () => {
  const configPayload: SharePayload = {
    v: 1,
    mode: 'config',
    endpoints: [{ url: 'https://example.com', enabled: true }],
    settings: { timeout: 5000, delay: 1000, cap: MAX_CAP, corsMode: 'no-cors' },
  };

  const resultsPayload: SharePayload = {
    v: 1,
    mode: 'results',
    endpoints: [
      { url: 'https://google.com', enabled: true },
      { url: 'https://1.1.1.1', enabled: true },
    ],
    settings: { timeout: 5000, delay: 1000, cap: MAX_CAP, corsMode: 'no-cors' },
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

  it('returns null for wrong schema version', async () => {
    const badPayload = { v: 2, mode: 'config', endpoints: [], settings: {} };
    // Manually encode so we bypass our own encodeSharePayload typed guard
    const { default: LZString } = await import('lz-string');
    const manualEncoded = LZString.compressToEncodedURIComponent(JSON.stringify(badPayload));
    expect(decodeSharePayload(manualEncoded)).toBeNull();
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
    expect(new URL(url).origin).toBe('https://chronoscope.example.com');
    expect(url).toContain('#s=');
  });

  describe('validateSharePayload — hardened validation', () => {
    async function manualEncode(data: unknown): Promise<string> {
      const { default: LZString } = await import('lz-string');
      return LZString.compressToEncodedURIComponent(JSON.stringify(data));
    }

    const validSettings = { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' };

    // AC #1 — URL scheme enforcement
    it('rejects javascript: URLs', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'javascript:alert(1)', enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects data: URLs', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'data:text/html,<h1>x</h1>', enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects empty string URLs', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: '', enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects relative path URLs', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: '/api/measure', enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts http:// URLs', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'http://example.com', enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // Private-host blocklist — share payload must never steer a victim's
    // browser at internal infrastructure.
    it.each([
      'http://127.0.0.1/',
      'http://localhost/',
      'http://192.168.1.1/',
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://169.254.169.254/', // AWS / Azure IMDS
      'http://[::1]/',
      'http://printer.local/',
    ])('rejects private/loopback URL %s', async (url) => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url, enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects URLs carrying userinfo credentials', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'http://user:pass@example.com/', enabled: true }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    // AC #2 — Non-negative finite numbers
    it('rejects Infinity timeout', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: Infinity, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects negative delay', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: -1, cap: MAX_CAP, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects negative cap', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: -5, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    // AC #2b — burstRounds and monitorDelay validation
    it('rejects Infinity burstRounds', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors', burstRounds: Infinity },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects negative monitorDelay', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors', monitorDelay: -100 },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts valid burstRounds and monitorDelay', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors', burstRounds: 50, monitorDelay: 3000 },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    it('accepts omitted burstRounds and monitorDelay', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // AC #2c — Sample value hardening
    it('rejects NaN sample latency', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: validSettings,
        results: [{ samples: [{ round: 0, latency: NaN, status: 'ok' }] }],
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects negative sample round', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: validSettings,
        results: [{ samples: [{ round: -1, latency: 50, status: 'ok' }] }],
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects invalid sample status string', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: validSettings,
        results: [{ samples: [{ round: 0, latency: 50, status: 'bogus' }] }],
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects endpoint with missing enabled field', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com' }],
        settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts valid sample with timeout status', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: validSettings,
        results: [{ samples: [{ round: 0, latency: 5000, status: 'timeout' }] }],
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // AC #3 — Array size limits
    it('rejects >50 endpoints', async () => {
      const endpoints = Array.from({ length: 51 }, (_, i) => ({
        url: `https://ep${i}.example.com`, enabled: true,
      }));
      const encoded = await manualEncode({
        v: 1, mode: 'config', endpoints, settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts exactly 50 endpoints', async () => {
      const endpoints = Array.from({ length: 50 }, (_, i) => ({
        url: `https://ep${i}.example.com`, enabled: true,
      }));
      const encoded = await manualEncode({
        v: 1, mode: 'config', endpoints, settings: validSettings,
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    it('rejects >50 results', async () => {
      const results = Array.from({ length: 51 }, () => ({ samples: [] }));
      const encoded = await manualEncode({
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: validSettings, results,
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects >10,000 samples per result', async () => {
      const samples = Array.from({ length: 10001 }, (_, i) => ({
        round: i, latency: 50, status: 'ok',
      }));
      const encoded = await manualEncode({
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: validSettings, results: [{ samples }],
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    // AC #4 — corsMode strict validation
    it('rejects invalid corsMode', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'same-origin' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('rejects missing corsMode', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts corsMode: cors', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // AC4 — cap > MAX_CAP rejection (round-cap-hardening)
    it('rejects cap > MAX_CAP (3601)', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP + 1, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).toBeNull();
    });

    it('accepts cap === MAX_CAP (3600) as boundary value', async () => {
      const encoded = await manualEncode({
        v: 1, mode: 'config',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
      });
      expect(decodeSharePayload(encoded)).not.toBeNull();
    });

    // Regression: keepRounds=0 still works
    it('truncatePayload with tiny limit produces empty samples', () => {
      const payload: SharePayload = {
        v: 1, mode: 'results',
        endpoints: [{ url: 'https://example.com', enabled: true }],
        settings: { timeout: 5000, delay: 0, cap: MAX_CAP, corsMode: 'no-cors' },
        results: [{ samples: [{ round: 1, latency: 50, status: 'ok' as const }] }],
      };
      const truncated = truncatePayload(payload, 1);
      expect(truncated.results?.[0]?.samples).toHaveLength(0);
    });
  });
});
