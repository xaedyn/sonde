import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import RacingStrip from '../../../src/lib/components/RacingStrip.svelte';

// Minimal prop set. RacingStrip renders the hint regardless of data.
const baseProps = {
  endpoints: [],
  stats: {},
  lastLatencies: {},
  samplesByEndpoint: {},
  threshold: 120,
  focusedEndpointId: null,
};

describe('RacingStrip — G5 hint copy', () => {
  it('should render exactly "Click → Live · ⇧-click → Diagnose"', () => {
    const { getByText } = render(RacingStrip, { props: baseProps });
    expect(getByText('Click → Live · ⇧-click → Diagnose')).toBeTruthy();
  });

  it('should NOT contain the old ambiguous "⇧ → Diagnose" text', () => {
    const { queryByText } = render(RacingStrip, { props: baseProps });
    expect(queryByText('Click → Live · ⇧ → Diagnose')).toBeNull();
  });
});
