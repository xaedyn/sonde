import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Figma redesign guardrails', () => {
  it('does not add prototype framework dependencies to production package manifests', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(deps).not.toHaveProperty('react');
    expect(deps).not.toHaveProperty('react-dom');
    expect(deps).not.toHaveProperty('@mui/material');
    expect(deps).not.toHaveProperty('@radix-ui/react-dialog');
    expect(deps).not.toHaveProperty('recharts');
    expect(deps).not.toHaveProperty('tailwindcss');
  });

  it('keeps PR 1 shell files free of prototype data and unsupported cause claims', () => {
    const shellSource = [
      'src/lib/components/Layout.svelte',
      'src/lib/components/Topbar.svelte',
      'src/lib/components/ViewSwitcher.svelte',
    ].map(readRepoFile).join('\n');

    expect(shellSource).not.toMatch(/Math\.random\(/);
    expect(shellSource).not.toMatch(/your local Wi-Fi and core ISP connection are likely fine/i);
    expect(shellSource).not.toMatch(/affects everyone globally/i);
    expect(shellSource).not.toMatch(/\bprove\b/i);
  });

  it('uses the aligned Overview shell instead of the old permanent endpoint rail', () => {
    const layoutSource = readRepoFile('src/lib/components/Layout.svelte');

    expect(layoutSource).toContain('FigmaOverviewView');
    expect(layoutSource).not.toContain('EndpointRail');
  });

  it('exposes the Figma-aligned primary shell navigation', () => {
    const switcherSource = readRepoFile('src/lib/components/ViewSwitcher.svelte');

    expect(switcherSource).toContain("label: 'Overview'");
    expect(switcherSource).toContain("label: 'Live'");
    expect(switcherSource).toContain("label: 'Investigate'");
    expect(switcherSource).toContain("label: 'Report'");
    expect(switcherSource).not.toMatch(/label:\s*['"]Status['"]/);
  });
});
