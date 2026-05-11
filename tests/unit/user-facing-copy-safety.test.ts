import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '../..');
const sourceRoot = resolve(repoRoot, 'src/lib');

const forbiddenClaims: readonly RegExp[] = [
  /likely your network/i,
  /likely that site/i,
  /likely source/i,
  /likely affected/i,
  /pointing toward your .*?(ISP|VPN|WiFi|Wi-Fi|local network)/i,
  /origin, CDN, or DNS path is the likely source/i,
  /endpoint, CDN, or a broad upstream path is implicated/i,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return sourceFiles(path);
    return /\.(svelte|ts)$/.test(entry) ? [path] : [];
  });
}

describe('user-facing diagnostic copy safety', () => {
  it('does not ship unsupported root-cause phrasing in source strings', () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      const content = readFileSync(path, 'utf-8');
      return forbiddenClaims
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${path.replace(`${repoRoot}/`, '')}: ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });
});
