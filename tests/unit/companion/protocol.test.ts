import { describe, expect, it } from 'vitest';
import {
  buildCompanionHeaders,
  canonicalCompanionRequest,
  normalizeCompanionBaseUrl,
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
      signer: async (secret, message) => `${secret}:${message.length}`,
    });

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'X-Chronoscope-Timestamp': '1765300000000',
      'X-Chronoscope-Nonce': 'nonce-1',
      'X-Chronoscope-Signature': 'pairing-secret:39',
    });
  });
});
