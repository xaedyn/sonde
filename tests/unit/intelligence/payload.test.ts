import { describe, expect, it } from 'vitest';
import { buildIntelligencePayload } from '../../../src/lib/intelligence/payload';

describe('buildIntelligencePayload', () => {
  it('strips path, query, fragment, and private fields for anonymous aggregate consent', () => {
    const payload = buildIntelligencePayload({
      endpointUrl: 'https://api.example.com/private/path?fixture=redacted#hash',
      p50: 42,
      p95: 80,
      lossPercent: 0,
      sampleCount: 35,
      createdAt: 1778352000000,
      consent: 'anonymous-aggregate',
    });

    expect(JSON.stringify(payload)).not.toContain('private');
    expect(JSON.stringify(payload)).not.toContain('fixture=');
    expect(JSON.stringify(payload)).not.toContain('https://');
    expect(payload.originHost).toBeNull();
    expect(payload.publicOriginHash).toBeNull();
  });

  it('includes named public endpoint only with named consent', () => {
    const payload = buildIntelligencePayload({
      endpointUrl: 'https://api.example.com/path',
      p50: 42,
      p95: 80,
      lossPercent: 0,
      sampleCount: 35,
      createdAt: 1778352000000,
      consent: 'named-public-endpoint',
    });

    expect(payload.originHost).toBe('api.example.com');
    expect(JSON.stringify(payload)).not.toContain('/path');
  });

  it('does not include local or private hosts even with named consent', () => {
    for (const endpointUrl of [
      'http://localhost/status',
      'http://192.168.1.1/admin',
      'http://router.local/health',
      'http://[::1]/probe',
    ]) {
      const payload = buildIntelligencePayload({
        endpointUrl,
        p50: 42,
        p95: 80,
        lossPercent: 0,
        sampleCount: 35,
        createdAt: 1778352000000,
        consent: 'named-public-endpoint',
      });

      expect(payload.originHost).toBeNull();
      expect(JSON.stringify(payload)).not.toContain(endpointUrl);
    }
  });

  it('rounds timing and loss values to aggregate-safe precision', () => {
    const payload = buildIntelligencePayload({
      endpointUrl: 'https://api.example.com/path',
      p50: 42.4,
      p95: 80.6,
      lossPercent: 1.234,
      sampleCount: 35,
      createdAt: 1778352000000,
      consent: 'anonymous-aggregate',
    });

    expect(payload.p50).toBe(42);
    expect(payload.p95).toBe(81);
    expect(payload.lossPercent).toBe(1.23);
  });
});
