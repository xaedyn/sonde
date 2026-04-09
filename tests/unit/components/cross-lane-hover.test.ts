import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CrossLaneHover from '../../../src/lib/components/CrossLaneHover.svelte';

describe('CrossLaneHover', () => {
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
