import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import XAxisBar from '../../../src/lib/components/XAxisBar.svelte';

const BASE_TS = 1_700_000_000_000; // arbitrary epoch

function makeTimestamps(count: number, intervalMs = 5000): readonly number[] {
  return Array.from({ length: count }, (_, i) => BASE_TS + i * intervalMs);
}

describe('XAxisBar', () => {
  it('renders the Elapsed spacer label', () => {
    const { getByText } = render(XAxisBar, {
      props: {
        startRound: 1,
        endRound: 30,
        currentRound: 15,
        startedAt: BASE_TS,
        sampleTimestamps: makeTimestamps(30),
      },
    });
    // DOM text is "Elapsed"; CSS text-transform: uppercase handles the visual casing
    expect(getByText('Elapsed')).toBeTruthy();
  });

  it('does not render a Round spacer label', () => {
    const { queryByText } = render(XAxisBar, {
      props: {
        startRound: 1,
        endRound: 30,
        currentRound: 15,
        startedAt: BASE_TS,
        sampleTimestamps: makeTimestamps(30),
      },
    });
    expect(queryByText('Round')).toBeNull();
  });

  it('formats elapsed time for ticks when startedAt is provided', () => {
    // 30 rounds at 5s each → last tick is round 30 = 145s elapsed = "2:25"
    const { container } = render(XAxisBar, {
      props: {
        startRound: 1,
        endRound: 30,
        currentRound: 30,
        startedAt: BASE_TS,
        sampleTimestamps: makeTimestamps(30, 5000),
      },
    });
    const ticks = Array.from(container.querySelectorAll('.x-tick')).map(el => el.textContent);
    // All ticks should be elapsed strings, not raw round numbers like "30"
    expect(ticks.some(t => /^\d+:\d{2}$|^\d+\.\d+s$/.test(t ?? ''))).toBe(true);
    expect(ticks.every(t => !/^\d+$/.test(t ?? ''))).toBe(true);
  });

  it('shows "0:00" for all ticks when startedAt is null', () => {
    const { container } = render(XAxisBar, {
      props: {
        startRound: 1,
        endRound: 10,
        currentRound: 10,
        startedAt: null,
        sampleTimestamps: makeTimestamps(10),
      },
    });
    const ticks = Array.from(container.querySelectorAll('.x-tick')).map(el => el.textContent);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(t => t === '0:00')).toBe(true);
  });

  it('applies future class to rounds beyond currentRound', () => {
    const { container } = render(XAxisBar, {
      props: {
        startRound: 1,
        endRound: 30,
        currentRound: 10,
        startedAt: BASE_TS,
        sampleTimestamps: makeTimestamps(30),
      },
    });
    const futureTicks = container.querySelectorAll('.x-tick.future');
    expect(futureTicks.length).toBeGreaterThan(0);
  });
});
