import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { uiStore } from '../../../src/lib/stores/ui';
import { initShortcuts } from '../../../src/lib/utils/shortcuts';

let cleanup: (() => void) | undefined;

function press(key: string, options: Partial<KeyboardEventInit> = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    code: /^[0-9]$/.test(key) ? `Digit${key}` : undefined,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('global shortcuts', () => {
  beforeEach(() => {
    endpointStore.reset('north-america');
    uiStore.reset();
    cleanup = initShortcuts();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('uses plain number keys for the visible view tabs', () => {
    uiStore.setActiveView('diagnose');

    expect(press('1')).toBe(true);
    expect(get(uiStore).activeView).toBe('overview');

    expect(press('2')).toBe(true);
    expect(get(uiStore).activeView).toBe('live');

    expect(press('3')).toBe(true);
    expect(get(uiStore).activeView).toBe('diagnose');

    expect(press('4')).toBe(true);
    expect(get(uiStore).activeView).toBe('report');
  });

  it('ignores shifted number keys for view tabs', () => {
    uiStore.setActiveView('live');

    expect(press('1', { shiftKey: true })).toBe(false);
    expect(get(uiStore).activeView).toBe('live');

    expect(press('2', { shiftKey: true })).toBe(false);
    expect(get(uiStore).activeView).toBe('live');

    expect(press('3', { shiftKey: true })).toBe(false);
    expect(get(uiStore).activeView).toBe('live');
  });

  it('ignores shifted top-row symbols for view tabs', () => {
    uiStore.setActiveView('live');

    expect(press('!', { code: 'Digit1', shiftKey: true })).toBe(false);

    expect(get(uiStore).activeView).toBe('live');
  });

  it('does not toggle endpoints when users press disabled view numbers', () => {
    const before = get(endpointStore).map((ep) => ep.enabled);

    expect(press('5')).toBe(false);

    expect(get(endpointStore).map((ep) => ep.enabled)).toEqual(before);
    expect(get(uiStore).activeView).toBe('overview');
  });

  it('uses Alt plus a digit for endpoint visibility toggles', () => {
    const first = get(endpointStore)[0];
    expect(first?.enabled).toBe(true);

    expect(press('1', { altKey: true })).toBe(true);

    expect(get(endpointStore)[0]?.enabled).toBe(false);
    expect(get(uiStore).activeView).toBe('overview');
  });

  it('keeps Alt plus shifted digit available for endpoint visibility toggles', () => {
    const first = get(endpointStore)[0];
    expect(first?.enabled).toBe(true);

    expect(press('1', { altKey: true, shiftKey: true })).toBe(true);

    expect(get(endpointStore)[0]?.enabled).toBe(false);
    expect(get(uiStore).activeView).toBe('overview');
  });

  it('keeps Alt plus shifted top-row symbols available for endpoint visibility toggles', () => {
    const first = get(endpointStore)[0];
    expect(first?.enabled).toBe(true);

    expect(press('!', { code: 'Digit1', altKey: true, shiftKey: true })).toBe(true);

    expect(get(endpointStore)[0]?.enabled).toBe(false);
    expect(get(uiStore).activeView).toBe('overview');
  });

  it('keeps shifted question mark available for keyboard help', () => {
    expect(get(uiStore).showKeyboardHelp).toBe(false);

    expect(press('?', { shiftKey: true })).toBe(true);

    expect(get(uiStore).showKeyboardHelp).toBe(true);
  });

  it('closes panels and clears focused endpoints with Escape', () => {
    uiStore.toggleEndpoints();
    uiStore.setFocusedEndpoint('ep-1');

    expect(press('Escape')).toBe(true);
    expect(get(uiStore).showEndpoints).toBe(false);
    expect(get(uiStore).focusedEndpointId).toBe('ep-1');

    expect(press('Escape')).toBe(true);
    expect(get(uiStore).focusedEndpointId).toBeNull();
  });
});
