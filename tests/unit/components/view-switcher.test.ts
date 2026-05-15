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

  it('shows only shipped intent-oriented views', async () => {
    const { queryByText, getByText, getAllByRole } = render(ViewSwitcher);

    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => !button.hasAttribute('aria-disabled'))).toBe(true);

    const status = buttonFor(getByText('Status'));
    const live = buttonFor(getByText('Live'));
    const investigate = buttonFor(getByText('Investigate'));

    expect(queryByText('Overview')).toBeNull();
    expect(queryByText('Diagnose')).toBeNull();
    expect(queryByText('Strata')).toBeNull();
    expect(queryByText('Terminal')).toBeNull();

    await fireEvent.click(status);
    expect(get(uiStore).activeView).toBe('overview');
    expect(status.getAttribute('aria-current')).toBe('page');
    expect(status.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(live);
    expect(get(uiStore).activeView).toBe('live');
    expect(status.hasAttribute('aria-current')).toBe(false);
    expect(status.getAttribute('aria-pressed')).toBe('false');
    expect(live.getAttribute('aria-current')).toBe('page');
    expect(live.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(investigate);
    expect(get(uiStore).activeView).toBe('diagnose');
    expect(live.hasAttribute('aria-current')).toBe(false);
    expect(live.getAttribute('aria-pressed')).toBe('false');
    expect(investigate.getAttribute('aria-current')).toBe('page');
    expect(investigate.getAttribute('aria-pressed')).toBe('true');
  });

  it.each(['strata', 'terminal'] as const)('normalizes hidden active view %s so Status remains active', (view) => {
    uiStore.setActiveView(view);

    const { getByText } = render(ViewSwitcher);
    const status = buttonFor(getByText('Status'));

    expect(get(uiStore).activeView).toBe('overview');
    expect(status.getAttribute('aria-current')).toBe('page');
    expect(status.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not expose Report as a primary tab in PR 1 shared chrome', () => {
    const { queryByText, getAllByRole } = render(ViewSwitcher);

    expect(getAllByRole('button')).toHaveLength(3);
    expect(queryByText('Report')).toBeNull();
  });
});
