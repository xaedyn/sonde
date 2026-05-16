import { fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ViewSwitcher from '../../../src/lib/components/ViewSwitcher.svelte';
import { uiStore } from '../../../src/lib/stores/ui';

function buttonFor(label: HTMLElement): HTMLButtonElement {
  const button = label.closest('button');
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

describe('ViewSwitcher', () => {
  beforeEach(() => {
    uiStore.reset();
  });

  afterEach(() => {
    uiStore.reset();
  });

  it('shows Figma-aligned top-level views', async () => {
    const { queryByText, getByText, getAllByRole } = render(ViewSwitcher);

    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => !button.hasAttribute('aria-disabled'))).toBe(true);

    const overview = buttonFor(getByText('Overview'));
    const live = buttonFor(getByText('Live'));
    const investigate = buttonFor(getByText('Investigate'));
    const report = buttonFor(getByText('Report'));

    expect(queryByText('Status')).toBeNull();
    expect(queryByText('Diagnose')).toBeNull();
    expect(queryByText('Strata')).toBeNull();
    expect(queryByText('Terminal')).toBeNull();

    await fireEvent.click(overview);
    expect(get(uiStore).activeView).toBe('overview');
    expect(overview.getAttribute('aria-current')).toBe('page');
    expect(overview.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(live);
    expect(get(uiStore).activeView).toBe('live');
    expect(overview.hasAttribute('aria-current')).toBe(false);
    expect(overview.getAttribute('aria-pressed')).toBe('false');
    expect(live.getAttribute('aria-current')).toBe('page');
    expect(live.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(investigate);
    expect(get(uiStore).activeView).toBe('diagnose');
    expect(live.hasAttribute('aria-current')).toBe(false);
    expect(live.getAttribute('aria-pressed')).toBe('false');
    expect(investigate.getAttribute('aria-current')).toBe('page');
    expect(investigate.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(report);
    expect(get(uiStore).activeView).toBe('report');
    expect(investigate.hasAttribute('aria-current')).toBe(false);
    expect(investigate.getAttribute('aria-pressed')).toBe('false');
    expect(report.getAttribute('aria-current')).toBe('page');
    expect(report.getAttribute('aria-pressed')).toBe('true');
  });

  it.each(['strata', 'terminal'] as const)('normalizes hidden active view %s so Status remains active', (view) => {
    uiStore.setActiveView(view);

    const { getByText } = render(ViewSwitcher);
    const overview = buttonFor(getByText('Overview'));

    expect(get(uiStore).activeView).toBe('overview');
    expect(overview.getAttribute('aria-current')).toBe('page');
    expect(overview.getAttribute('aria-pressed')).toBe('true');
  });
});
