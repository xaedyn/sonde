import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';
import EndpointRail from '../../../src/lib/components/EndpointRail.svelte';

// Reset all stores EndpointRail (and its children) transitively read.
// Vitest runs test files in a shared worker; stale endpoint/measurement/settings
// state from other test files would leak here without explicit resets.
beforeEach(() => {
  endpointStore.setEndpoints([]);
  measurementStore.reset();
  settingsStore.set({ ...DEFAULT_SETTINGS });
  uiStore.reset();
});

// Helper: seed the store and render the rail. Declared as a const arrow
// rather than a function declaration to avoid DeepSource's module-scope
// function-declaration warning (idiomatic Vitest pattern).
const renderRailWith = (endpoints: readonly { id: string; url: string; label: string; enabled: boolean; color: string }[]) => {
  endpointStore.setEndpoints(endpoints);
  return render(EndpointRail);
};

describe('EndpointRail — G6 URL subtitle dedup truth table', () => {
  // Case A: label !== url (known brand) — two lines expected.
  it('should render URL subtitle when label differs from url (e.g. Google)', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://www.google.com', label: 'Google', enabled: true, color: '#fff' },
    ]);
    const urlSpan = container.querySelector('.rail-row-url');
    expect(urlSpan).not.toBeNull();
    expect(urlSpan?.textContent).toBe('https://www.google.com');
  });

  // Case B: label === url (user-added or post-4.4.2 default) — URL line hidden.
  it('should NOT render URL subtitle when label equals url', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://foo.com', label: 'https://foo.com', enabled: true, color: '#fff' },
    ]);
    const urlSpan = container.querySelector('.rail-row-url');
    expect(urlSpan).toBeNull();
  });

  // Case C: blank label — URL rendered in label slot, subtitle hidden.
  // Symmetric with aria-label's trim() === '' fallback — row collapses to one line.
  it('should render URL in label slot and hide subtitle when label is blank', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://foo.com', label: '', enabled: true, color: '#fff' },
    ]);
    const labelSpan = container.querySelector('.rail-row-label');
    const urlSpan = container.querySelector('.rail-row-url');
    expect(labelSpan?.textContent).toBe('https://foo.com');
    expect(urlSpan).toBeNull();
  });

  // Case C': whitespace-only label — same treatment as blank. Locks the
  // trim() === '' branch so a future refactor can't quietly regress to
  // rendering an empty-looking top line above the URL.
  it('should render URL in label slot and hide subtitle when label is whitespace-only', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://foo.com', label: '   ', enabled: true, color: '#fff' },
    ]);
    const labelSpan = container.querySelector('.rail-row-label');
    const urlSpan = container.querySelector('.rail-row-url');
    expect(labelSpan?.textContent).toBe('https://foo.com');
    expect(urlSpan).toBeNull();
  });

  // Case D: new placeholder from EndpointPanel ('https://') — label === url, URL hidden.
  it('should NOT render URL subtitle for placeholder label === url ("https://")', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://', label: 'https://', enabled: true, color: '#fff' },
    ]);
    const urlSpan = container.querySelector('.rail-row-url');
    expect(urlSpan).toBeNull();
  });
});

describe('EndpointRail — G6 aria-label dedup (SR double-voice prevention)', () => {
  // aria-label used to be `"{label}, {url}, status: ..."` which reads the URL
  // twice for user-added rows where label === url. Dedup the aria-label in
  // lockstep with the visual dedup so screen reader users don't hear the URL
  // twice.
  it('should NOT repeat url in aria-label when label equals url', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://foo.com', label: 'https://foo.com', enabled: true, color: '#fff' },
    ]);
    const row = container.querySelector('.rail-row');
    const aria = row?.getAttribute('aria-label') ?? '';
    // "https://foo.com" should appear exactly once in the aria-label.
    const matches = aria.match(/https:\/\/foo\.com/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('should include both label and url in aria-label when they differ', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://www.google.com', label: 'Google', enabled: true, color: '#fff' },
    ]);
    const row = container.querySelector('.rail-row');
    const aria = row?.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Google');
    expect(aria).toContain('https://www.google.com');
  });

  it('should fall back to url-only in aria-label when label is blank', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://foo.com', label: '', enabled: true, color: '#fff' },
    ]);
    const row = container.querySelector('.rail-row');
    const aria = row?.getAttribute('aria-label') ?? '';
    // "https://foo.com" appears once. A leading empty-string concatenation
    // would produce ", https://foo.com," — dedup must prevent that.
    const matches = aria.match(/https:\/\/foo\.com/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(aria).not.toMatch(/^,\s/); // no leading comma from an empty label
  });

  it('should fall back to url-only in aria-label when label is whitespace-only', () => {
    const { container } = renderRailWith([
      { id: 'ep1', url: 'https://foo.com', label: '   ', enabled: true, color: '#fff' },
    ]);
    const row = container.querySelector('.rail-row');
    const aria = row?.getAttribute('aria-label') ?? '';
    const matches = aria.match(/https:\/\/foo\.com/g) ?? [];
    expect(matches).toHaveLength(1);
    // Whitespace label must not leak into aria-label — no "   , ..." prefix.
    expect(aria).not.toMatch(/^\s*,\s/);
  });
});
