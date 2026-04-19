/**
 * Verifies that every color-mix() usage in CSS has a preceding fallback
 * declaration so Safari <16.2 and Firefox <113 see a valid value.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const root = resolve(__dirname, '../../src/lib/components');

function read(name: string): string {
  return readFileSync(resolve(root, name), 'utf8');
}

describe('color-mix() CSS fallbacks', () => {
  // Lane.svelte assertions were removed alongside Phase 7's Lanes view retirement.
  // The remaining assertions cover EndpointRow + LoadingAnimation which still ship.

  it('EndpointRow.svelte: .dot box-shadow has plain fallback before color-mix()', () => {
    const src = read('EndpointRow.svelte');
    const styleStart = src.indexOf('<style>');
    const styleEnd = src.indexOf('</style>');
    const css = src.slice(styleStart, styleEnd);

    const colorMixIdx = css.indexOf('color-mix(in srgb, var(--dot-color) 40%');
    expect(colorMixIdx).toBeGreaterThan(-1);

    const fallbackPattern = 'box-shadow: 0 0 8px var(--dot-color);';
    const fallbackIdx = css.indexOf(fallbackPattern);
    expect(fallbackIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeLessThan(colorMixIdx);
  });

  it('LoadingAnimation.svelte: .ring border has rgba() fallback before color-mix()', () => {
    const src = read('LoadingAnimation.svelte');
    const styleStart = src.indexOf('<style>');
    const styleEnd = src.indexOf('</style>');
    const css = src.slice(styleStart, styleEnd);

    const colorMixIdx = css.indexOf('color-mix(in srgb, var(--accent) 20%');
    expect(colorMixIdx).toBeGreaterThan(-1);

    const fallbackPattern = 'border: 1.5px solid rgba(103, 232, 249, 0.2);';
    const fallbackIdx = css.indexOf(fallbackPattern);
    expect(fallbackIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeLessThan(colorMixIdx);
  });
});
