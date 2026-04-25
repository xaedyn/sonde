import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import type { Endpoint } from '../../../src/lib/types';
import EndpointRow from '../../../src/lib/components/EndpointRow.svelte';

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-1',
    url: 'https://api.example.com',
    enabled: true,
    color: '#67e8f9',
    label: 'Prod API',
    nickname: 'Prod API',
    ...overrides,
  };
}

function renderRow(overrides: Partial<Endpoint> = {}, props: Record<string, unknown> = {}) {
  const endpoint = makeEndpoint(overrides);
  return render(EndpointRow, {
    props: {
      endpoint,
      isRunning: false,
      isLast: false,
      ...props,
    },
  });
}

describe('EndpointRow — edit affordance (AC2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a pencil/edit button in read mode', () => {
    const { container } = renderRow();
    const editBtn = container.querySelector('.edit-btn');
    expect(editBtn).not.toBeNull();
  });

  // Mobile drawer fix: read mode shows the derived label, NOT the URL input.
  // Without this, mobile users (who only see EndpointRow inside EndpointDrawer)
  // see truncated URLs as primary identity instead of brand/hostname labels.
  it('read mode shows derived label, not URL input', () => {
    const { container } = renderRow({ url: 'https://api.example.com', label: 'My API' });
    expect(container.querySelector('.url-input')).toBeNull();
    const rowLabel = container.querySelector('.row-label');
    expect(rowLabel).not.toBeNull();
    expect(rowLabel?.textContent).toBe('My API');
  });

  it('read mode label exposes full URL via title attribute (hover-disclose)', () => {
    const { container } = renderRow({ url: 'https://api.example.com/v1/health', label: 'api.example.com' });
    const rowLabel = container.querySelector('.row-label');
    expect(rowLabel?.getAttribute('title')).toBe('https://api.example.com/v1/health');
  });

  it('clicking pencil reveals URL input and nickname input', async () => {
    const { container } = renderRow();
    const editBtn = container.querySelector('.edit-btn') as HTMLButtonElement;
    await fireEvent.click(editBtn);

    expect(container.querySelector('.url-input')).not.toBeNull();
    const nickInput = container.querySelector('.nickname-input') as HTMLInputElement | null;
    expect(nickInput).not.toBeNull();
    expect(nickInput?.placeholder).toMatch(/nickname/i);
  });

  it('URL input shows endpoint URL while editing', async () => {
    const { container } = renderRow({ url: 'https://api.example.com' });
    const editBtn = container.querySelector('.edit-btn') as HTMLButtonElement;
    await fireEvent.click(editBtn);

    const urlInput = container.querySelector('.url-input') as HTMLInputElement | null;
    expect(urlInput).not.toBeNull();
    expect(urlInput?.value).toBe('https://api.example.com');
  });

  it('pressing Enter in nickname input calls onUpdate with nickname', async () => {
    const onUpdate = vi.fn();
    const { container } = renderRow({}, { onUpdate });
    const editBtn = container.querySelector('.edit-btn') as HTMLButtonElement;
    await fireEvent.click(editBtn);

    const nickInput = container.querySelector('.nickname-input') as HTMLInputElement;
    await fireEvent.input(nickInput, { target: { value: 'Prod API' } });
    await fireEvent.keyDown(nickInput, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledOnce();
    const [, patch] = onUpdate.mock.calls[0] as [string, { nickname: string }];
    expect(patch.nickname).toBe('Prod API');
  });

  it('pressing Escape cancels edit without calling onUpdate', async () => {
    const onUpdate = vi.fn();
    const { container } = renderRow({}, { onUpdate });
    const editBtn = container.querySelector('.edit-btn') as HTMLButtonElement;
    await fireEvent.click(editBtn);

    const nickInput = container.querySelector('.nickname-input') as HTMLInputElement;
    await fireEvent.keyDown(nickInput, { key: 'Escape' });

    expect(onUpdate).not.toHaveBeenCalled();
    // Pencil button should be visible again (not in editing mode)
    expect(container.querySelector('.edit-btn')).not.toBeNull();
    expect(container.querySelector('.nickname-input')).toBeNull();
  });

  // Mobile cannot easily reach Esc — explicit Cancel/Save buttons are required
  // for the edit form to be usable on touch devices.
  it('Cancel button exits edit mode without calling onUpdate', async () => {
    const onUpdate = vi.fn();
    const { container, getByText } = renderRow({}, { onUpdate });
    await fireEvent.click(container.querySelector('.edit-btn') as HTMLButtonElement);

    await fireEvent.click(getByText('Cancel'));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.querySelector('.nickname-input')).toBeNull();
  });

  it('Save button calls onUpdate with current url and nickname', async () => {
    const onUpdate = vi.fn();
    const { container, getByText } = renderRow({}, { onUpdate });
    await fireEvent.click(container.querySelector('.edit-btn') as HTMLButtonElement);

    const nickInput = container.querySelector('.nickname-input') as HTMLInputElement;
    await fireEvent.input(nickInput, { target: { value: 'Prod API' } });

    await fireEvent.click(getByText('Save'));

    expect(onUpdate).toHaveBeenCalledOnce();
    const [, patch] = onUpdate.mock.calls[0] as [string, { url: string; nickname: string }];
    expect(patch.url).toBe('https://api.example.com');
    expect(patch.nickname).toBe('Prod API');
  });

  // Edit form layout: inputs stack vertically rather than competing for
  // horizontal space within a single row. Verifies the .edit-form container
  // exists when isEditing — that's how the row knows to switch from the
  // horizontal flex layout to the vertical stack.
  it('edit mode renders an .edit-form vertical-stack container', async () => {
    const { container } = renderRow();
    await fireEvent.click(container.querySelector('.edit-btn') as HTMLButtonElement);
    expect(container.querySelector('.edit-form')).not.toBeNull();
    expect(container.querySelector('.edit-actions')).not.toBeNull();
  });

  // WCAG 2.4.3: focus must not be lost when the pencil unmounts. Without the
  // focus-on-mount behavior, keyboard/SR users land on <body> and have to
  // re-traverse to reach the URL input.
  it('moves focus into URL input after entering edit mode', async () => {
    const { container } = renderRow();
    await fireEvent.click(container.querySelector('.edit-btn') as HTMLButtonElement);
    // tick() inside the handler resolves on the next microtask
    await new Promise(r => setTimeout(r, 0));
    const urlInput = container.querySelector('.url-input') as HTMLInputElement;
    expect(document.activeElement).toBe(urlInput);
  });

  it('invalid nickname (too long) sets aria-invalid', async () => {
    const onUpdate = vi.fn();
    const { container } = renderRow({}, { onUpdate });
    const editBtn = container.querySelector('.edit-btn') as HTMLButtonElement;
    await fireEvent.click(editBtn);

    const nickInput = container.querySelector('.nickname-input') as HTMLInputElement;
    const longNick = 'a'.repeat(81);
    await fireEvent.input(nickInput, { target: { value: longNick } });
    await fireEvent.keyDown(nickInput, { key: 'Enter' });

    expect(nickInput.getAttribute('aria-invalid')).toBe('true');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('remove button aria-label uses ep.label not ep.url', () => {
    const { container } = renderRow({ label: 'Prod API', url: 'https://api.example.com' });
    const removeBtn = container.querySelector('.remove-btn');
    expect(removeBtn).not.toBeNull();
    const label = removeBtn?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Prod API');
    expect(label).not.toContain('https://');
  });

  // jsdom can't measure computed dimensions; this test only verifies the class
  // is applied. The actual 44×44 WCAG 2.5.5 target size is enforced by the
  // .edit-btn CSS rule and observable via the Playwright sweep, not here.
  it('edit button is rendered with edit-btn class', () => {
    const { container } = renderRow();
    const editBtn = container.querySelector('.edit-btn');
    expect(editBtn).not.toBeNull();
    expect(editBtn?.classList.contains('edit-btn')).toBe(true);
  });
});
