import { fireEvent, render, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import RunStorylineCard from '../../../src/lib/components/RunStorylineCard.svelte';
import type { RunStoryline } from '../../../src/lib/utils/run-storyline';

const BASE = 1_765_000_000_000;

function storyline(over: Partial<RunStoryline> = {}): RunStoryline {
  return {
    windowStart: BASE,
    windowEnd: BASE + 60_000,
    confidence: 'medium',
    sampleCount: 40,
    readyEndpointCount: 2,
    summary: 'AWS slowed briefly; the other paths stayed clean.',
    phases: [
      { start: BASE, end: BASE + 30_000, label: 'steady', kind: 'steady' },
      { start: BASE + 30_000, end: BASE + 45_000, label: 'AWS slow', kind: 'isolated-slow' },
      { start: BASE + 45_000, end: BASE + 60_000, label: 'recovered', kind: 'recovered' },
    ],
    rows: [
      {
        endpointId: 'google',
        label: 'Google',
        color: '#67e8f9',
        summary: 'Google stayed clean.',
        points: [
          { t: BASE, round: 1, latency: 40, normalizedLatency: 0.2, status: 'ok', threshold: 120, sampleCount: 1 },
          { t: BASE + 30_000, round: 2, latency: 42, normalizedLatency: 0.21, status: 'ok', threshold: 120, sampleCount: 2 },
          { t: BASE + 60_000, round: 3, latency: 41, normalizedLatency: 0.2, status: 'ok', threshold: 120, sampleCount: 3 },
        ],
      },
      {
        endpointId: 'aws',
        label: 'AWS',
        color: '#fbbf24',
        summary: 'AWS crossed the trigger.',
        points: [
          { t: BASE, round: 1, latency: 50, normalizedLatency: 0.2, status: 'ok', threshold: 120, sampleCount: 1 },
          { t: BASE + 30_000, round: 2, latency: 180, normalizedLatency: 0.88, status: 'slow', threshold: 120, sampleCount: 2 },
          { t: BASE + 60_000, round: 3, latency: 55, normalizedLatency: 0.24, status: 'ok', threshold: 120, sampleCount: 3 },
        ],
      },
    ],
    markers: [
      {
        t: BASE + 30_000,
        round: 2,
        endpointId: 'aws',
        kind: 'slowdown',
        label: 'AWS slow',
        evidence: 'AWS had 2 of the last 3 samples above 120 ms.',
      },
    ],
    overflow: null,
    ...over,
  };
}

describe('RunStorylineCard', () => {
  it('renders the native timeline heading and summary', () => {
    const { getByRole, getByText } = render(RunStorylineCard, {
      props: {
        storyline: storyline(),
        onDrill: vi.fn(),
      },
    });

    expect(getByRole('heading', { name: 'What happened' })).toBeTruthy();
    expect(getByText('Last 60s · newest on right')).toBeTruthy();
    expect(getByText('AWS slowed briefly; the other paths stayed clean.')).toBeTruthy();
  });

  it('renders readable time labels and a status legend', () => {
    const { getByRole, getByText } = render(RunStorylineCard, {
      props: {
        storyline: storyline(),
        onDrill: vi.fn(),
      },
    });

    expect(getByText('60s ago')).toBeTruthy();
    expect(getByText('45s')).toBeTruthy();
    expect(getByText('30s')).toBeTruthy();
    expect(getByText('15s')).toBeTruthy();
    expect(getByText('now')).toBeTruthy();
    const legend = within(getByRole('list', { name: 'Timeline status legend' }));
    expect(legend.getByText('steady')).toBeTruthy();
    expect(legend.getByText('elevated')).toBeTruthy();
    expect(legend.getByText('slow')).toBeTruthy();
    expect(legend.getByText('failed')).toBeTruthy();
  });

  it('positions alert markers with proportional track coordinates', () => {
    const { container } = render(RunStorylineCard, {
      props: {
        storyline: storyline({
          rows: [
            {
              endpointId: 'aws',
              label: 'AWS',
              color: '#fbbf24',
              summary: 'AWS changed state.',
              points: [
                { t: BASE, round: 1, latency: 50, normalizedLatency: 0, status: 'ok', threshold: 120, sampleCount: 1 },
                { t: BASE + 30_000, round: 2, latency: 105, normalizedLatency: 0.5, status: 'elevated', threshold: 120, sampleCount: 2 },
                { t: BASE + 45_000, round: 3, latency: 0, normalizedLatency: 1, status: 'failed', threshold: 120, sampleCount: 3 },
              ],
            },
          ],
          markers: [],
        }),
        onDrill: vi.fn(),
      },
    });

    const elevated = container.querySelector<HTMLElement>('.story-elevated');
    const failure = container.querySelector<HTMLElement>('.story-failure');
    expect(elevated?.style.top).toMatch(/%$/);
    expect(failure?.style.top).toMatch(/%$/);

    const path = container.querySelector<SVGPathElement>('.story-spark path');
    const yValues = Array.from(path?.getAttribute('d')?.matchAll(/[ML] [\d.]+ ([\d.]+)/g) ?? [])
      .map((match) => Number(match[1]));
    expect(yValues.every((y) => y >= 0 && y <= 40)).toBe(true);
  });

  it('uses fewer axis ticks for very short runs so time remains readable', () => {
    const { getByText, queryByText } = render(RunStorylineCard, {
      props: {
        storyline: storyline({
          windowEnd: BASE + 7_000,
          phases: [{ start: BASE, end: BASE + 7_000, label: 'collecting', kind: 'collecting' }],
          markers: [],
        }),
        onDrill: vi.fn(),
      },
    });

    expect(getByText('Last 7s · newest on right')).toBeTruthy();
    expect(getByText('7s ago')).toBeTruthy();
    expect(getByText('4s')).toBeTruthy();
    expect(getByText('now')).toBeTruthy();
    expect(queryByText('5s')).toBeNull();
    expect(queryByText('2s')).toBeNull();
  });

  it('does not render a confusing 0s interior tick while a run is just starting', () => {
    const { getByText, queryByText } = render(RunStorylineCard, {
      props: {
        storyline: storyline({
          windowEnd: BASE + 800,
          phases: [{ start: BASE, end: BASE + 800, label: 'collecting', kind: 'collecting' }],
          markers: [],
        }),
        onDrill: vi.fn(),
      },
    });

    expect(getByText('1s ago')).toBeTruthy();
    expect(getByText('now')).toBeTruthy();
    expect(queryByText('0s')).toBeNull();
  });

  it('renders per-row time summaries so each trace has temporal meaning', () => {
    const { getByText, getByRole } = render(RunStorylineCard, {
      props: {
        storyline: storyline(),
        onDrill: vi.fn(),
      },
    });

    expect(getByText('Steady for 60s')).toBeTruthy();
    expect(getByText('Slow 30s ago')).toBeTruthy();
    expect(getByRole('button', { name: /AWS, Slow 30s ago, AWS crossed the trigger/i })).toBeTruthy();
  });

  it('renders endpoint rows with accessible status labels', () => {
    const { getByRole } = render(RunStorylineCard, {
      props: {
        storyline: storyline(),
        onDrill: vi.fn(),
      },
    });

    expect(getByRole('button', { name: /Google, Steady for 60s, Google stayed clean/i })).toBeTruthy();
    expect(getByRole('button', { name: /AWS, Slow 30s ago, AWS crossed the trigger/i })).toBeTruthy();
  });

  it('renders overflow text when extra endpoints are hidden', () => {
    const { getByText } = render(RunStorylineCard, {
      props: {
        storyline: storyline({
          overflow: {
            hiddenCount: 2,
            summary: '2 more paths steady.',
          },
        }),
        onDrill: vi.fn(),
      },
    });

    expect(getByText('2 more paths steady.')).toBeTruthy();
  });

  it('drills into the clicked endpoint', async () => {
    const onDrill = vi.fn();
    const { getByRole } = render(RunStorylineCard, {
      props: {
        storyline: storyline(),
        onDrill,
      },
    });

    await fireEvent.click(getByRole('button', { name: /AWS, Slow 30s ago, AWS crossed the trigger/i }));

    expect(onDrill).toHaveBeenCalledWith('aws');
  });

  it('drills into the clicked event marker', async () => {
    const onDrill = vi.fn();
    const { getByRole } = render(RunStorylineCard, {
      props: {
        storyline: storyline(),
        onDrill,
      },
    });

    await fireEvent.click(getByRole('button', { name: /AWS slow, 30s ago, AWS had 2 of the last 3 samples/i }));

    expect(onDrill).toHaveBeenCalledWith('aws');
  });
});
