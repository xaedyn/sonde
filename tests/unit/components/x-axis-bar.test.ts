import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import XAxisBar from '../../../src/lib/components/XAxisBar.svelte';

describe('XAxisBar', () => {
  it('renders tick labels for given totalRounds', () => {
    const { getByText } = render(XAxisBar, {
      props: { totalRounds: 30, currentRound: 15 },
    });
    expect(getByText('30')).toBeTruthy();
  });

  it('applies future class to rounds beyond currentRound', () => {
    const { container } = render(XAxisBar, {
      props: { totalRounds: 30, currentRound: 10 },
    });
    const futureTicks = container.querySelectorAll('.x-tick.future');
    expect(futureTicks.length).toBeGreaterThan(0);
  });
});
