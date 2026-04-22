import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import RacingStrip from '../../../src/lib/components/RacingStrip.svelte';
import { fmtParts } from '../../../src/lib/utils/format';

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

describe('RacingStrip — G4 unit suffix', () => {
  it('should render "ms" unit span for finite latency under 10000ms', () => {
    const props = {
      ...baseProps,
      endpoints: [{ id: 'ep1', url: 'https://a.com', label: 'A', enabled: true, color: '#fff' }],
      lastLatencies: { ep1: 127 },
      stats: {},
      samplesByEndpoint: { ep1: [] },
    };
    const { container } = render(RacingStrip, { props });
    const unitSpan = container.querySelector('.racing-stats-live-unit');
    expect(unitSpan).not.toBeNull();
    expect(unitSpan?.textContent).toBe('ms');
    expect(unitSpan?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should render "s" unit span for latency ≥ 10000ms', () => {
    const props = {
      ...baseProps,
      endpoints: [{ id: 'ep1', url: 'https://a.com', label: 'A', enabled: true, color: '#fff' }],
      lastLatencies: { ep1: 12500 },
      stats: {},
      samplesByEndpoint: { ep1: [] },
    };
    const { container } = render(RacingStrip, { props });
    const unitSpan = container.querySelector('.racing-stats-live-unit');
    expect(unitSpan).not.toBeNull();
    expect(unitSpan?.textContent).toBe('s');
    expect(unitSpan?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should render "—" with no unit span for null latency', () => {
    const props = {
      ...baseProps,
      endpoints: [{ id: 'ep1', url: 'https://a.com', label: 'A', enabled: true, color: '#fff' }],
      lastLatencies: { ep1: null },
      stats: {},
      samplesByEndpoint: { ep1: [] },
    };
    const { container } = render(RacingStrip, { props });
    const liveSpan = container.querySelector('.racing-stats-live');
    const unitSpan = container.querySelector('.racing-stats-live-unit');
    expect(unitSpan).toBeNull();
    expect(liveSpan?.textContent?.trim()).toBe('—');
  });

  it('fmtParts contract: finite <10000ms yields ms unit', () => {
    expect(fmtParts(21)).toEqual({ num: '21', unit: 'ms' });
    expect(fmtParts(127)).toEqual({ num: '127', unit: 'ms' });
  });

  it('fmtParts contract: ≥10000ms yields s unit', () => {
    expect(fmtParts(12500)).toEqual({ num: '12.5', unit: 's' });
  });

  it('fmtParts contract: null yields no unit', () => {
    expect(fmtParts(null)).toEqual({ num: '—', unit: '' });
  });

  it('aria-label reads "no data" for non-finite live latency (NaN)', () => {
    const props = {
      ...baseProps,
      endpoints: [{ id: 'ep1', url: 'https://a.com', label: 'A', enabled: true, color: '#fff' }],
      lastLatencies: { ep1: NaN },
      stats: {},
      samplesByEndpoint: { ep1: [] },
    };
    const { container } = render(RacingStrip, { props });
    const row = container.querySelector('.racing-row');
    expect(row?.getAttribute('aria-label')).toContain('live no data');
    expect(row?.getAttribute('aria-label')).not.toContain('NaN');
  });
});
