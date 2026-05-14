import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Layout bottom chrome', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/components/Layout.svelte'), 'utf-8');

  it('does not render the legacy permanent footer bar', () => {
    expect(source).not.toContain("import FooterBar from './FooterBar.svelte'");
    expect(source).not.toContain('<FooterBar');
  });
});
