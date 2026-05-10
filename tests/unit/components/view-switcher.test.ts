import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ViewSwitcher from '../../../src/lib/components/ViewSwitcher.svelte';

describe('ViewSwitcher', () => {
  it('shows only shipped intent-oriented views', () => {
    const { queryByText, getByText } = render(ViewSwitcher);
    expect(getByText('Status')).toBeTruthy();
    expect(getByText('Live')).toBeTruthy();
    expect(getByText('Investigate')).toBeTruthy();
    expect(queryByText('Overview')).toBeNull();
    expect(queryByText('Diagnose')).toBeNull();
    expect(queryByText('Strata')).toBeNull();
    expect(queryByText('Terminal')).toBeNull();
  });
});
