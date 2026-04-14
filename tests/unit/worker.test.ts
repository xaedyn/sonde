import { describe, it, expect } from 'vitest';
import { extractTimingPayload, classifyLatencyTier, resolveProbeUrl } from '../../src/lib/engine/worker';

describe('worker — extractTimingPayload', () => {
  it('returns tier 1 data (zeros) when TAO is absent', () => {
    const entry = {
      duration: 150,
      domainLookupStart: 0, domainLookupEnd: 0,
      connectStart: 0, connectEnd: 0, secureConnectionStart: 0,
      requestStart: 0, responseStart: 0, responseEnd: 0, fetchStart: 0,
    } as PerformanceResourceTiming;
    const result = extractTimingPayload(entry);
    expect(result.total).toBe(150);
    expect(result.dnsLookup).toBe(0);
    expect(result.tcpConnect).toBe(0);
    expect(result.ttfb).toBe(0);
  });

  it('returns tier 2 data when TAO sub-fields are non-zero', () => {
    const entry = {
      duration: 150,
      domainLookupStart: 10, domainLookupEnd: 20,
      connectStart: 20, connectEnd: 35, secureConnectionStart: 22,
      requestStart: 35, responseStart: 120, responseEnd: 150, fetchStart: 0,
    } as PerformanceResourceTiming;
    const result = extractTimingPayload(entry);
    expect(result.dnsLookup).toBe(10);
    expect(result.tcpConnect).toBe(15);
    expect(result.tlsHandshake).toBe(13);
    expect(result.ttfb).toBe(85);
    expect(result.contentTransfer).toBe(30);
  });
});

describe('worker — resolveProbeUrl', () => {
  it('appends /favicon.ico to bare origin', () => {
    expect(resolveProbeUrl('https://www.google.com')).toBe('https://www.google.com/favicon.ico');
  });

  it('appends /favicon.ico when path is just /', () => {
    expect(resolveProbeUrl('https://www.google.com/')).toBe('https://www.google.com/favicon.ico');
  });

  it('preserves explicit path (user intent)', () => {
    expect(resolveProbeUrl('https://api.example.com/health')).toBe('https://api.example.com/health');
  });

  it('preserves path with trailing slash', () => {
    expect(resolveProbeUrl('https://example.com/api/')).toBe('https://example.com/api/');
  });

  it('handles IP addresses', () => {
    expect(resolveProbeUrl('https://1.1.1.1')).toBe('https://1.1.1.1/favicon.ico');
  });

  it('handles ports', () => {
    expect(resolveProbeUrl('https://example.com:8080')).toBe('https://example.com:8080/favicon.ico');
  });

  it('handles port with explicit path', () => {
    expect(resolveProbeUrl('https://example.com:8080/status')).toBe('https://example.com:8080/status');
  });

  it('returns original URL for invalid input', () => {
    expect(resolveProbeUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('worker — classifyLatencyTier', () => {
  it('classifies fast latency', () => {
    expect(classifyLatencyTier(20)).toBe('fast');
    expect(classifyLatencyTier(49)).toBe('fast');
  });
  it('classifies medium latency', () => {
    expect(classifyLatencyTier(50)).toBe('medium');
    expect(classifyLatencyTier(199)).toBe('medium');
  });
  it('classifies slow latency', () => {
    expect(classifyLatencyTier(200)).toBe('slow');
  });
  it('classifies timeout', () => {
    expect(classifyLatencyTier(null)).toBe('timeout');
  });
});
