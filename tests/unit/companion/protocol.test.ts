import { describe, expect, it } from 'vitest';
import {
  buildCompanionHeaders,
  canonicalCompanionRequest,
  normalizeCompanionBaseUrl,
  type CompanionProbeResults,
} from '../../../src/lib/companion/protocol';

describe('companion protocol', () => {
  it('normalizes loopback companion URLs and rejects non-loopback URLs', () => {
    expect(normalizeCompanionBaseUrl('http://127.0.0.1:47317/')).toBe('http://127.0.0.1:47317');
    expect(normalizeCompanionBaseUrl('http://localhost:47317')).toBe('http://localhost:47317');
    expect(() => normalizeCompanionBaseUrl('https://example.com')).toThrow('loopback');
    expect(() => normalizeCompanionBaseUrl('http://192.168.1.2:47317')).toThrow('loopback');
  });

  it('builds a stable canonical request string for HMAC signing', () => {
    expect(canonicalCompanionRequest({
      method: 'post',
      path: '/v1/probe',
      timestamp: '1765300000000',
      nonce: 'nonce-1',
      body: '{"targetUrl":"https://example.com"}',
    })).toBe([
      'POST',
      '/v1/probe',
      '1765300000000',
      'nonce-1',
      '{"targetUrl":"https://example.com"}',
    ].join('\n'));
  });

  it('builds signed headers without persisting the pairing secret', async () => {
    const headers = await buildCompanionHeaders({
      method: 'POST',
      path: '/v1/probe',
      body: '{}',
      secret: 'pairing-secret',
      now: () => 1765300000000,
      nonceFactory: () => 'nonce-1',
      signer: (secret, message) => Promise.resolve(`${secret}:${message.length}`),
    });

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'X-Chronoscope-Timestamp': '1765300000000',
      'X-Chronoscope-Nonce': 'nonce-1',
      'X-Chronoscope-Signature': 'pairing-secret:39',
    });
  });

  it('allows typed companion probe sections', () => {
    const results: CompanionProbeResults = {
      dns: {
        ok: true,
        durationMs: 12,
        value: {
          lookup: [{ address: '203.0.113.1', family: 4 }],
          a: ['203.0.113.1'],
          aaaa: [],
          cname: [],
        },
      },
      tls: {
        ok: true,
        durationMs: 28,
        value: {
          authorized: true,
          authorizationError: null,
          protocol: 'TLSv1.3',
          cipher: 'TLS_AES_128_GCM_SHA256',
          validFrom: 'Jan 1',
          validTo: 'Dec 31',
          subject: 'example.com',
          issuer: 'Example CA',
          fingerprint256: 'AA:BB',
        },
      },
      route: {
        ok: false,
        durationMs: 10000,
        error: 'traceroute command not found',
        unavailable: true,
        reason: 'traceroute command not found',
      },
      wifi: {
        ok: true,
        durationMs: 4,
        value: {
          ssid: 'redacted',
          bssid: 'redacted',
          rssi: -48,
          noise: -91,
        },
      },
    };

    expect(results.dns?.ok).toBe(true);
    expect(results.route?.durationMs).toBe(10000);
    expect(results.wifi?.value?.ssid).toBe('redacted');
  });
});
