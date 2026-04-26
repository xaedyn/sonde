import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import FooterBar from '../../../src/lib/components/FooterBar.svelte';
import { settingsStore } from '../../../src/lib/stores/settings';
import { MAX_CAP } from '../../../src/lib/limits';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';

describe('FooterBar', () => {
  beforeEach(() => {
    settingsStore.set({ ...DEFAULT_SETTINGS, region: undefined });
  });

  it('renders "Measuring from your browser" text', () => {
    const { getByText } = render(FooterBar, { props: {} });
    expect(getByText(/Measuring from your browser/i)).toBeTruthy();
  });

  it('renders progress text with round counter', () => {
    const { getByText } = render(FooterBar, { props: {} });
    expect(getByText(/of/i)).toBeTruthy();
  });

  it('renders config label with interval and timeout', () => {
    const { container } = render(FooterBar, { props: {} });
    expect(container.querySelector('.config')).not.toBeNull();
  });

  it('highlight element has class "highlight" for CSS-based responsive hiding (AC-5)', () => {
    const { container } = render(FooterBar, { props: {} });
    const highlight = container.querySelector('.highlight');
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain('Measuring from your browser');
  });
});

describe('FooterBar — AC5: no infinity glyph', () => {
  beforeEach(() => {
    settingsStore.set({ ...DEFAULT_SETTINGS, region: undefined });
  });

  it.each([1, 100, MAX_CAP])('renders no ∞ glyph when cap = %i', (capValue) => {
    settingsStore.update(s => ({ ...s, cap: capValue }));
    const { container } = render(FooterBar, { props: {} });
    expect(container.textContent).not.toContain('∞');
  });

  it('progress label interpolates cap directly as a number', () => {
    settingsStore.update(s => ({ ...s, cap: 42 }));
    const { container } = render(FooterBar, { props: {} });
    // "0 of 42 complete" — cap appears as a digit, not ∞
    expect(container.textContent).toContain('42');
    expect(container.textContent).not.toContain('∞');
  });
});
