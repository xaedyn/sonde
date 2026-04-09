import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import CrossLaneHover from '../../../src/lib/components/CrossLaneHover.svelte';
import { uiStore } from '../../../src/lib/stores/ui';

describe('CrossLaneHover', () => {
  beforeEach(() => {
    uiStore.clearLaneHover();
  });
  it('renders hover line element', () => {
    const { container } = render(CrossLaneHover, { props: { totalRounds: 30 } });
    expect(container.querySelector('.hover-line')).not.toBeNull();
  });

  it('hover line is inactive by default', () => {
    const { container } = render(CrossLaneHover, { props: { totalRounds: 30 } });
    const line = container.querySelector('.hover-line');
    expect(line?.classList.contains('active')).toBe(false);
  });
});
