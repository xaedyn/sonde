// tests/unit/endpoint/displayLabel.test.ts
import { describe, it, expect } from 'vitest';
import { displayLabel, displayHostname } from '../../../src/lib/endpoint/displayLabel';

describe('displayLabel', () => {
  // AC1: nickname wins over brandFor and hostname
  it('returns nickname when set and non-empty (AC1 tier-1)', () => {
    expect(displayLabel({ url: 'https://www.google.com', nickname: 'My Google' })).toBe('My Google');
  });

  // AC1: whitespace-only nickname falls through to brandFor
  it('falls through to brandFor when nickname is whitespace-only (AC1 tier-1 edge)', () => {
    expect(displayLabel({ url: 'https://www.google.com', nickname: '   ' })).toBe('Google');
  });

  // AC1: brandFor wins over hostname
  it('returns brandFor label when no nickname and URL matches brand map (AC1 tier-2)', () => {
    expect(displayLabel({ url: 'https://www.google.com' })).toBe('Google');
  });

  // AC1: hostname fallback
  it('returns hostname when no nickname and no brandFor match (AC1 tier-3)', () => {
    expect(displayLabel({ url: 'https://api.example.com/v1/health' })).toBe('api.example.com');
  });

  // AC1: primary line never contains https://
  it('result never contains https:// as a substring in hostname tier (AC1 no-raw-url)', () => {
    const result = displayLabel({ url: 'https://api.example.com/v1/health' });
    expect(result).not.toContain('https://');
  });

  // AC1: primary line never contains http://
  it('result never contains http:// as a substring (AC1 no-raw-url)', () => {
    const result = displayLabel({ url: 'http://internal.corp/' });
    expect(result).not.toContain('http://');
  });

  // AC1: www is stripped from hostname (displayHostname handles this via URL.hostname)
  it('strips www from hostname tier (AC1 no-www)', () => {
    expect(displayLabel({ url: 'https://www.fastly.com/robots.txt' })).toBe('Fastly');
  });

  // Edge: undefined nickname treated same as absent
  it('treats undefined nickname as absent', () => {
    expect(displayLabel({ url: 'https://api.example.com', nickname: undefined })).toBe('api.example.com');
  });

  // Edge: empty-string nickname falls through
  it('treats empty-string nickname as absent', () => {
    expect(displayLabel({ url: 'https://api.example.com', nickname: '' })).toBe('api.example.com');
  });
});

describe('displayHostname', () => {
  // Standard HTTPS (default port stripped by URL constructor)
  it('returns hostname for standard HTTPS URL', () => {
    expect(displayHostname('https://api.example.com/v1/health')).toBe('api.example.com');
  });

  // Non-default port preserved
  it('preserves non-default port (AC1 IP/port edge)', () => {
    expect(displayHostname('https://api.example.com:8443/path')).toBe('api.example.com:8443');
  });

  // Default port 443 stripped
  it('strips default :443 from HTTPS URL', () => {
    expect(displayHostname('https://api.example.com:443/path')).toBe('api.example.com');
  });

  // Default port 80 stripped
  it('strips default :80 from HTTP URL', () => {
    expect(displayHostname('http://api.example.com:80/path')).toBe('api.example.com');
  });

  // IPv6 brackets preserved
  it('preserves IPv6 brackets with port (AC1 IPv6 edge)', () => {
    expect(displayHostname('http://[::1]:8080/')).toBe('[::1]:8080');
  });

  // IPv6 default port stripped
  it('IPv6 without port returns bracketed hostname', () => {
    expect(displayHostname('http://[::1]/')).toBe('[::1]');
  });

  // localhost
  it('returns localhost for localhost URLs', () => {
    expect(displayHostname('https://localhost/path')).toBe('localhost');
  });

  // Invalid URL — returns '(invalid URL)', never throws
  it('returns "(invalid URL)" on parse failure, never throws (AC5 fail-closed)', () => {
    expect(() => displayHostname('not a url at all')).not.toThrow();
    expect(displayHostname('not a url at all')).toBe('(invalid URL)');
  });

  // userinfo not exposed
  it('does not include userinfo (username/password) in output', () => {
    expect(displayHostname('https://user:pass@api.example.com/')).toBe('api.example.com');
  });
});
