import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Lane from '../../../src/lib/components/Lane.svelte';

describe('Lane', () => {
  const props = {
    endpointId: 'ep-test-1',
    color: '#67e8f9',
    url: 'www.google.com',
    p50: 38,
    p95: 52,
    p99: 98,
    jitter: 4.2,
    lossPercent: 0,
    ready: true,
  };

  it('renders endpoint URL', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('www.google.com')).toBeTruthy();
  });

  it('renders hero P50 value', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('38')).toBeTruthy();
  });

  it('renders P50 Median Latency label', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText(/P50 Median Latency/i)).toBeTruthy();
  });

  it('renders latency label when lastLatency is set', () => {
    const { getByText } = render(Lane, {
      props: { ...props, lastLatency: 42.7 },
    });
    expect(getByText('43ms')).toBeTruthy();
  });

  it('does not render latency label when lastLatency is null', () => {
    const { container } = render(Lane, {
      props: { ...props, lastLatency: null },
    });
    expect(container.querySelector('.now-label')).toBeNull();
  });

  // ── Compact mode (AC1, AC2) ──────────────────────────────────────────────────

  it('renders .lane-panel visible when compact is false (AC1)', () => {
    const { container } = render(Lane, { props });
    const panel = container.querySelector('.lane-panel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('sr-only')).toBe(false);
  });

  it('hides .lane-panel via sr-only when compact is true (AC2)', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const panel = container.querySelector('.lane-panel');
    expect(panel).not.toBeNull(); // still in DOM for screen readers
    expect(panel?.classList.contains('sr-only')).toBe(true);
  });

  it('renders .lane-compact-header when compact is true (AC2)', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    expect(container.querySelector('.lane-compact-header')).not.toBeNull();
  });

  it('does not render .lane-compact-header when compact is false (AC1)', () => {
    const { container } = render(Lane, { props });
    expect(container.querySelector('.lane-compact-header')).toBeNull();
  });

  it('compact header contains the URL text (AC2)', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const header = container.querySelector('.lane-compact-header');
    expect(header?.textContent).toContain('www.google.com');
  });

  it('compact header shows P50 hero value (AC2)', () => {
    const { getAllByText } = render(Lane, { props: { ...props, compact: true } });
    const matches = getAllByText(/38/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('lane has compact class applied when compact=true', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    expect(container.querySelector('.lane.compact')).not.toBeNull();
  });
});
