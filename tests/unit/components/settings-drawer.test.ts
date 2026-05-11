// tests/unit/components/settings-drawer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import SettingsDrawer from '../../../src/lib/components/SettingsDrawer.svelte';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { MAX_CAP } from '../../../src/lib/limits';

beforeEach(() => {
  settingsStore.reset();
  measurementStore.reset();
  uiStore.reset();
  // Ensure drawer is open BEFORE rendering so dialog content is in the initial DOM.
  // uiStore initial state has showSettings: false; toggleSettings() flips to true.
  uiStore.toggleSettings();
});

describe('SettingsDrawer — AC3: cap input constraints', () => {
  it('cap input has max attribute of MAX_CAP (3600)', () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const input = container.querySelector('#setting-cap') as HTMLInputElement | null;
    // Sanity: if this assertion fails, the drawer did not mount — check uiStore.toggleSettings() ordering above.
    expect(input, 'cap input not found in DOM — drawer may not have mounted').not.toBeNull();
    if (!input) return;
    expect(input.getAttribute('max')).toBe(String(MAX_CAP));
  });

  it('cap input has min attribute of 1', () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const input = container.querySelector('#setting-cap') as HTMLInputElement | null;
    expect(input, 'cap input not found in DOM — drawer may not have mounted').not.toBeNull();
    if (!input) return;
    expect(input.getAttribute('min')).toBe('1');
  });

  it('applyCap clamps value above MAX_CAP to MAX_CAP', async () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const input = container.querySelector('#setting-cap') as HTMLInputElement | null;
    expect(input, 'cap input not found in DOM — drawer may not have mounted').not.toBeNull();
    if (!input) return;
    // Simulate user typing 9999
    input.value = '9999';
    await fireEvent.change(input);
    expect(get(settingsStore).cap).toBe(MAX_CAP);
  });

  it('applyCap clamps 0 to MAX_CAP (legacy unlimited sentinel)', async () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const input = container.querySelector('#setting-cap') as HTMLInputElement | null;
    expect(input, 'cap input not found in DOM — drawer may not have mounted').not.toBeNull();
    if (!input) return;
    input.value = '0';
    await fireEvent.change(input);
    expect(get(settingsStore).cap).toBe(MAX_CAP);
  });

  it('applyCap clamps negative value to 1', async () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const input = container.querySelector('#setting-cap') as HTMLInputElement | null;
    expect(input, 'cap input not found in DOM — drawer may not have mounted').not.toBeNull();
    if (!input) return;
    input.value = '-100';
    await fireEvent.change(input);
    expect(get(settingsStore).cap).toBe(1);
  });

  it('applyCap accepts valid value in range', async () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const input = container.querySelector('#setting-cap') as HTMLInputElement | null;
    expect(input, 'cap input not found in DOM — drawer may not have mounted').not.toBeNull();
    if (!input) return;
    input.value = '500';
    await fireEvent.change(input);
    expect(get(settingsStore).cap).toBe(500);
  });

  it('hint text reflects new range (no "0 = unlimited")', () => {
    const { container } = render(SettingsDrawer, { props: {} });
    const hints = container.querySelectorAll('.field-hint');
    const capHints = Array.from(hints).map(h => h.textContent ?? '');
    expect(capHints.some(h => h.includes('0 = unlimited'))).toBe(false);
    // Hint should reference MAX_CAP
    expect(capHints.some(h => h.includes(String(MAX_CAP)))).toBe(true);
  });
});

describe('SettingsDrawer — running lock and helper copy', () => {
  it('explains locked controls while a test is running', () => {
    measurementStore.setLifecycle('running');
    const { getByText } = render(SettingsDrawer, { props: {} });

    expect(getByText('Stop test to edit locked settings.')).toBeTruthy();
    expect(getByText('Stop test to edit')).toBeTruthy();
    expect(getByText('Stop test to use reset, history, and clear actions.')).toBeTruthy();
  });

  it('explains timing, CORS, and region behavior in plain language', () => {
    const { getByText } = render(SettingsDrawer, { props: {} });

    expect(getByText('Per-request ceiling before a target is marked timed out.')).toBeTruthy();
    expect(getByText('Initial fast rounds before monitor cadence begins. Set 0 to skip burst.')).toBeTruthy();
    expect(getByText('Delay between monitor rounds after the burst. Set 0 for continuous rounds.')).toBeTruthy();
    expect(getByText('Maximum rounds per run; Chronoscope stops automatically at the cap.')).toBeTruthy();
    expect(getByText('Use by default for public URLs; browsers may expose total timing only.')).toBeTruthy();
    expect(getByText('Use when the server allows your origin and sends Timing-Allow-Origin for phase timing.')).toBeTruthy();
    expect(getByText('Used for regional reset defaults; changing it does not rewrite current endpoints.')).toBeTruthy();
  });
});
