import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';
import EndpointPanel from '../../../src/lib/components/EndpointPanel.svelte';

// Reset all stores that EndpointPanel (and its child EndpointRow) transitively
// reads. Without this, stale state from other tests in the same Vitest worker
// can cause render failures or false positives.
beforeEach(() => {
  endpointStore.setEndpoints([]);
  measurementStore.reset();
  settingsStore.set({ ...DEFAULT_SETTINGS });
  uiStore.reset();
});

describe('EndpointPanel — G6 add endpoint call signature', () => {
  it('should create new endpoint with a non-empty label when Add endpoint is clicked', async () => {
    const { getByText } = render(EndpointPanel);
    const addButton = getByText('+ Add endpoint');

    await fireEvent.click(addButton);

    const eps = get(endpointStore);
    // Explicit length check so leftover state cannot produce a false positive.
    expect(eps).toHaveLength(1);
    const newEp = eps.find(e => e.url === 'https://');
    expect(newEp).toBeTruthy();
    // displayLabel returns '(invalid URL)' for malformed placeholder URLs —
    // the fail-closed sentinel prevents raw URLs from leaking through as labels.
    expect(newEp?.label).toBe('(invalid URL)');
    expect(newEp?.label).not.toBe('');
  });
});

describe('EndpointPanel — running edit lock', () => {
  it('explains why endpoint edits are locked while running', () => {
    measurementStore.setLifecycle('running');
    const { getByRole, getByText } = render(EndpointPanel);

    const addButton = getByRole('button', { name: /add endpoint/i });
    expect(addButton.hasAttribute('disabled')).toBe(true);
    expect(addButton.getAttribute('title')).toBe('Stop test to edit endpoints');
    expect(getByText('Stop test to edit endpoints.')).toBeTruthy();
  });

  it('does not add endpoints while running', async () => {
    measurementStore.setLifecycle('running');
    const { getByRole } = render(EndpointPanel);

    await fireEvent.click(getByRole('button', { name: /add endpoint/i }));

    expect(get(endpointStore)).toHaveLength(0);
  });
});
