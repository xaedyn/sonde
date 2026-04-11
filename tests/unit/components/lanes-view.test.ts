import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import LanesView from '../../../src/lib/components/LanesView.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';

describe('LanesView', () => {
  beforeEach(() => {
    endpointStore.reset();
  });

  it('renders a lanes container', () => {
    const { container } = render(LanesView, { props: {} });
    expect(container.querySelector('.lanes')).not.toBeNull();
  });

  it('renders lane cards for default endpoints', () => {
    const { container } = render(LanesView, { props: {} });
    const lanes = container.querySelectorAll('.lane');
    expect(lanes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders grip handles for each lane when multiple endpoints', () => {
    const { container } = render(LanesView, { props: {} });
    const grips = container.querySelectorAll('.lane-grip');
    const lanes = container.querySelectorAll('.lane');
    expect(grips.length).toBeGreaterThanOrEqual(lanes.length);
  });

  it('hides grip when only one endpoint is enabled', () => {
    const eps = get(endpointStore);
    eps.slice(1).forEach(ep => endpointStore.updateEndpoint(ep.id, { enabled: false }));

    const { container } = render(LanesView, { props: {} });
    const grips = container.querySelectorAll('.lane-grip');
    expect(grips.length).toBe(0);
  });
});
