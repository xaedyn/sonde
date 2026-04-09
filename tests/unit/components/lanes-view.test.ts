import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LanesView from '../../../src/lib/components/LanesView.svelte';

describe('LanesView', () => {
  it('renders a lanes container', () => {
    const { container } = render(LanesView, { props: {} });
    expect(container.querySelector('.lanes')).not.toBeNull();
  });

  it('renders lane cards for default endpoints', () => {
    const { container } = render(LanesView, { props: {} });
    // Default store has 2 enabled endpoints (Google, Cloudflare)
    const lanes = container.querySelectorAll('.lane');
    expect(lanes.length).toBeGreaterThanOrEqual(2);
  });
});
