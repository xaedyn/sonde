import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('dead CSS cleanup', () => {
  const css = readFileSync(resolve(__dirname, '../../src/app.css'), 'utf-8');

  it('does not contain .glass selector', () => {
    // Use a regex that matches .glass as a class selector (not .glass-strong)
    expect(css).not.toMatch(/\.glass\s*\{/);
  });

  it('does not contain .glass-strong selector', () => {
    expect(css).not.toMatch(/\.glass-strong\s*\{/);
  });

  it('does not contain backdrop-filter', () => {
    expect(css).not.toMatch(/backdrop-filter/);
  });
});
