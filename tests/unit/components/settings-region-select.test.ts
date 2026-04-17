import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';

// Mock stores and dependencies that SettingsDrawer imports
vi.mock('$lib/stores/ui', () => ({
  uiStore: {
    subscribe: vi.fn((cb: (v: { showSettings: boolean; lifecycle: string }) => void) => {
      cb({ showSettings: true, lifecycle: 'idle' });
      return () => {};
    }),
    toggleSettings: vi.fn(),
    setActiveView: vi.fn(),
    toggleCard: vi.fn(),
  },
}));
vi.mock('$lib/stores/measurements', () => ({
  measurementStore: {
    subscribe: vi.fn((cb: (v: { lifecycle: string; endpoints: Record<string, unknown> }) => void) => {
      cb({ lifecycle: 'idle', endpoints: {} });
      return () => {};
    }),
    reset: vi.fn(),
    initEndpoint: vi.fn(),
  },
}));
vi.mock('$lib/stores/endpoints', () => ({
  endpointStore: {
    subscribe: vi.fn((cb: (v: unknown[]) => void) => { cb([]); return () => {}; }),
    reset: vi.fn(),
  },
}));
vi.mock('$lib/utils/persistence', () => ({
  clearPersistedSettings: vi.fn(),
}));
vi.mock('$lib/regional-defaults', () => ({
  REGIONS: ['north-america', 'europe', 'east-asia', 'south-southeast-asia', 'latam', 'mea', 'oceania'],
  REGION_DISPLAY_NAMES: {
    'north-america': 'North America',
    'europe': 'Europe',
    'east-asia': 'East Asia',
    'south-southeast-asia': 'South & Southeast Asia',
    'latam': 'Latin America',
    'mea': 'Middle East & Africa',
    'oceania': 'Oceania',
  },
  detectRegion: vi.fn(() => 'north-america'),
}));

import { settingsStore } from '$lib/stores/settings';
import SettingsDrawer from '../../../src/lib/components/SettingsDrawer.svelte';

describe('SettingsDrawer Region select (AC3)', () => {
  it('renders a Region label associated with a select', async () => {
    const { getByLabelText } = render(SettingsDrawer);
    // AC3: label text MUST be exactly "Region" for Playwright getByLabel to work
    const select = getByLabelText('Region');
    expect(select.tagName).toBe('SELECT');
  });

  it('select has exactly 7 options', async () => {
    const { getByLabelText } = render(SettingsDrawer);
    const select = getByLabelText('Region') as HTMLSelectElement;
    expect(select.options.length).toBe(7);
  });

  it('option values match the 7 Region strings', async () => {
    const { getByLabelText } = render(SettingsDrawer);
    const select = getByLabelText('Region') as HTMLSelectElement;
    const values = Array.from(select.options).map(o => o.value);
    expect(values).toContain('north-america');
    expect(values).toContain('europe');
    expect(values).toContain('east-asia');
    expect(values).toContain('south-southeast-asia');
    expect(values).toContain('latam');
    expect(values).toContain('mea');
    expect(values).toContain('oceania');
  });

  it('option display text matches REGION_DISPLAY_NAMES', async () => {
    const { getByLabelText } = render(SettingsDrawer);
    const select = getByLabelText('Region') as HTMLSelectElement;
    const optionByValue = (v: string) =>
      Array.from(select.options).find(o => o.value === v)?.text;
    expect(optionByValue('north-america')).toBe('North America');
    expect(optionByValue('europe')).toBe('Europe');
    expect(optionByValue('latam')).toBe('Latin America');
  });

  it('changing the select updates settingsStore.region', async () => {
    const { getByLabelText } = render(SettingsDrawer);
    const select = getByLabelText('Region') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'east-asia' } });
    expect(get(settingsStore).region).toBe('east-asia');
  });

  it('Reset to regional defaults button is present', async () => {
    const { getByRole } = render(SettingsDrawer);
    // AC4: accessible name must match /reset to regional defaults/i
    const btn = getByRole('button', { name: /reset to regional defaults/i });
    expect(btn).toBeTruthy();
  });
});
