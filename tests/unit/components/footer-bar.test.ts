import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import FooterBar from '../../../src/lib/components/FooterBar.svelte';

describe('FooterBar', () => {
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
});
