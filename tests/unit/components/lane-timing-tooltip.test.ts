// tests/unit/components/lane-timing-tooltip.test.ts
// Tests for LaneTimingTooltip component — floating tier2 timing decomposition tooltip.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LaneTimingTooltip from '../../../src/lib/components/LaneTimingTooltip.svelte';
import type { MeasurementSample, TimingPayload } from '../../../src/lib/types';

function makeSample(latency: number, tier2?: Partial<TimingPayload>): MeasurementSample {
  const base: MeasurementSample = { round: 1, latency, status: 'ok', timestamp: Date.now() };
  if (tier2) {
    const full: TimingPayload = {
      total: latency,
      dnsLookup: 0,
      tcpConnect: 0,
      tlsHandshake: 0,
      ttfb: latency,
      contentTransfer: 0,
      connectionReused: false,
      protocol: undefined,
      ...tier2,
    };
    return { ...base, tier2: full };
  }
  return base;
}

const defaultProps = {
  x: 100,
  y: 200,
  color: '#67e8f9',
};

describe('LaneTimingTooltip', () => {
  it('renders .lt-tooltip container', () => {
    const sample = makeSample(120);
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    expect(container.querySelector('.lt-tooltip')).not.toBeNull();
  });

  it('shows total latency text rounded to nearest ms', () => {
    const sample = makeSample(120.4);
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    const total = container.querySelector('.lt-total');
    expect(total).not.toBeNull();
    expect(total?.textContent).toContain('120ms');
  });

  it('shows only total when no tier2 data — no .lt-phases, no .lt-mini-bar', () => {
    const sample = makeSample(120);
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    expect(container.querySelector('.lt-phases')).toBeNull();
    expect(container.querySelector('.lt-mini-bar')).toBeNull();
  });

  it('shows only total when tier2 exists but all phases are 0', () => {
    const sample = makeSample(0, {
      total: 0,
      dnsLookup: 0,
      tcpConnect: 0,
      tlsHandshake: 0,
      ttfb: 0,
      contentTransfer: 0,
    });
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    expect(container.querySelector('.lt-phases')).toBeNull();
    expect(container.querySelector('.lt-mini-bar')).toBeNull();
  });

  it('renders phase breakdown when tier2 present with non-zero phases', () => {
    const sample = makeSample(150, {
      dnsLookup: 10,
      tcpConnect: 20,
      tlsHandshake: 15,
      ttfb: 80,
      contentTransfer: 25,
    });
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    expect(container.querySelector('.lt-phases')).not.toBeNull();
  });

  it('renders mini waterfall when tier2 present with non-zero phases', () => {
    const sample = makeSample(150, {
      dnsLookup: 10,
      tcpConnect: 20,
      tlsHandshake: 15,
      ttfb: 80,
      contentTransfer: 25,
    });
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    expect(container.querySelector('.lt-mini-bar')).not.toBeNull();
  });

  it('skips zero-value phases in phase list', () => {
    // dnsLookup=0, tcpConnect=0, tlsHandshake=0 → only ttfb and contentTransfer rows
    const sample = makeSample(105, {
      dnsLookup: 0,
      tcpConnect: 0,
      tlsHandshake: 0,
      ttfb: 80,
      contentTransfer: 25,
    });
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    const rows = container.querySelectorAll('.lt-phase-row');
    expect(rows.length).toBe(2);
  });

  it('shows protocol badge when protocol present', () => {
    const sample = makeSample(120, {
      ttfb: 120,
      protocol: 'h2',
    });
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    const badge = container.querySelector('.lt-protocol');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('h2');
  });

  it('no protocol badge when protocol absent', () => {
    const sample = makeSample(120, {
      ttfb: 120,
      protocol: undefined,
    });
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    expect(container.querySelector('.lt-protocol')).toBeNull();
  });

  it('has aria-live="polite"', () => {
    const sample = makeSample(120);
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    const tooltip = container.querySelector('.lt-tooltip');
    expect(tooltip?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('LaneTimingTooltip — AC2 dim border', () => {
  it('injects --border-dim from tokens.color.surface.border.dim', () => {
    const sample = makeSample(120);
    const { container } = render(LaneTimingTooltip, { props: { sample, ...defaultProps } });
    const tooltip = container.querySelector('.lt-tooltip') as HTMLElement;
    expect(tooltip).not.toBeNull();
    expect(tooltip.style.getPropertyValue('--border-dim')).toBe('rgba(255,255,255,.04)');
  });
});
