import { describe, expect, it } from 'vitest';
import { sanitizeCompanionProbeForReport } from '../../../src/lib/companion/sanitize';
import type { CompanionProbeResponse } from '../../../src/lib/companion/protocol';

const probe: CompanionProbeResponse = {
  ok: true,
  id: 'probe-1',
  targetHost: 'api.example.com',
  createdAt: 1778352000000,
  summary: 'DNS, TLS, route, and WiFi completed.',
  results: {
    dns: {
      ok: true,
      durationMs: 12,
      value: {
        lookup: [{ address: '203.0.113.10', family: 4 }],
        a: ['203.0.113.10'],
        aaaa: [],
        cname: [],
      },
    },
    tls: {
      ok: true,
      durationMs: 32,
      value: {
        authorized: true,
        authorizationError: null,
        protocol: 'TLSv1.3',
        cipher: 'TLS_AES_128_GCM_SHA256',
        validFrom: 'Jan 1 00:00:00 2026 GMT',
        validTo: 'Dec 31 23:59:59 2026 GMT',
        subject: 'api.example.com',
        issuer: 'Example CA',
        fingerprint256: 'AA:BB:CC',
      },
    },
    route: {
      ok: true,
      durationMs: 55,
      value: {
        tool: 'traceroute',
        hops: [
          { raw: '1  home-router.local (192.168.1.1)  1.2 ms' },
          { raw: '2  isp.example.net (198.51.100.1)  9.8 ms' },
        ],
      },
    },
    wifi: {
      ok: true,
      durationMs: 5,
      value: {
        ssid: 'HomeNetwork',
        bssid: 'aa:bb:cc:dd:ee:ff',
        rssi: -51,
        noise: -90,
      },
    },
  },
};

describe('sanitizeCompanionProbeForReport', () => {
  it('redacts private WiFi identifiers by default while keeping signal evidence', () => {
    const sanitized = sanitizeCompanionProbeForReport(probe, { includePrivateWifi: false });

    expect(sanitized.wifi).toMatchObject({
      rssi: -51,
      noise: -90,
      ssid: 'redacted',
      bssid: 'redacted',
    });
    expect(JSON.stringify(sanitized)).not.toContain('HomeNetwork');
    expect(JSON.stringify(sanitized)).not.toContain('aa:bb:cc:dd:ee:ff');
  });

  it('keeps private WiFi identifiers only when explicitly allowed', () => {
    const sanitized = sanitizeCompanionProbeForReport(probe, { includePrivateWifi: true });

    expect(sanitized.wifi).toMatchObject({
      ssid: 'HomeNetwork',
      bssid: 'aa:bb:cc:dd:ee:ff',
    });
  });

  it('summarizes route evidence without exporting raw hop lines or private LAN addresses', () => {
    const sanitized = sanitizeCompanionProbeForReport(probe, { includePrivateWifi: false });

    expect(sanitized.sections.find((section) => section.name === 'route')).toMatchObject({
      name: 'route',
      status: 'captured',
      detail: 'traceroute captured 2 hops; raw hop details stay local.',
    });
    expect(JSON.stringify(sanitized)).not.toContain('home-router.local');
    expect(JSON.stringify(sanitized)).not.toContain('192.168.1.1');
  });
});
