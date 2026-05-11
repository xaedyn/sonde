import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '../..');

function findSourceFilesContaining(dir: string, needle: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = resolve(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) return findSourceFilesContaining(path, needle);
    if (!/\.(css|html|svelte|ts|js)$/.test(entry)) return [];
    return readFileSync(path, 'utf-8').includes(needle) ? [path] : [];
  });
}

describe('production CSP assets', () => {
  const headers = readFileSync(resolve(repoRoot, 'public/_headers'), 'utf-8');

  it('keeps data images out of application source', () => {
    const offenders = findSourceFilesContaining(resolve(repoRoot, 'src'), 'data:image');

    expect(offenders).toEqual([]);
  });

  it('allows Cloudflare script elements while blocking inline event handlers', () => {
    expect(headers).toContain("script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com");
    expect(headers).toContain("script-src-attr 'none'");
  });

  it('keeps image sources self-hosted only', () => {
    expect(headers).toContain("img-src 'self'");
    expect(headers).not.toContain('img-src data:');
  });
});
