import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import CausalVerdictStrip from '../../../src/lib/components/CausalVerdictStrip.svelte';
import type { DiagnosticNarrative } from '../../../src/lib/utils/diagnostic-narrative';
import type { Endpoint } from '../../../src/lib/types';

const collectingDiagnosis = {
  verdict: { tone: 'good', headline: 'Measuring...' },
  kind: 'collecting',
  severity: 'watch',
  confidence: 'low',
  confidenceLabel: 'low confidence',
  confidenceReason: 'Waiting for the first successful checks.',
  explanation: 'Collecting enough data to call this test.',
  safeSummary: 'This browser test: Collecting enough data to call this test. (low confidence; Waiting for the first successful checks.)',
  primaryAnswer: {
    id: 'collecting',
    kind: 'measured',
    strength: 'low',
    text: 'Collecting enough data to call this test.',
    evidenceIds: [],
    requiredEvidence: ['sample-ready'],
  },
  primaryValidation: {
    id: 'collect-more-samples',
    label: 'Collect more samples',
    reason: 'The least-sampled site has 0 successful checks; 12 makes this actionable.',
    claim: {
      id: 'collecting',
      kind: 'measured',
      strength: 'low',
      text: 'Collecting enough data to call this test.',
      evidenceIds: [],
      requiredEvidence: ['sample-ready'],
    },
  },
  claims: [],
  snapshotEligibility: {
    eligible: false,
    reason: 'Still collecting enough samples.',
    facts: [],
  },
  evidence: [],
  limitations: [],
  nextSteps: [],
  timingVisibility: {
    level: 'none',
    headline: 'No successful checks yet',
    detail: 'Waiting for browser timing.',
    okSampleCount: 0,
    phaseSampleCount: 0,
  },
} as unknown as DiagnosticNarrative;

const degradedDiagnosis = {
  ...collectingDiagnosis,
  verdict: {
    tone: 'warn',
    headline: 'Only API looks slow - likely that site, not you.',
    worstEpId: 'api',
  },
  kind: 'isolated-endpoint',
  severity: 'degraded',
  explanation: 'API is slower than the others in this test.',
  safeSummary: 'This browser test: API is slower than the others in this test. (medium confidence; Based on 18+ successful checks across 3 sites.)',
  primaryAnswer: {
    id: 'isolated-endpoint',
    kind: 'inferred',
    strength: 'medium',
    text: 'API is slower than the others in this test.',
    evidenceIds: ['endpoint-to-inspect'],
    requiredEvidence: ['sample-actionable', 'total-timing'],
  },
  primaryValidation: {
    id: 'open-investigate',
    label: 'Open Investigate',
    reason: 'Compare this test from outside your network before assigning cause.',
    endpointId: 'api',
    claim: {
      id: 'isolated-endpoint',
      kind: 'inferred',
      strength: 'medium',
      text: 'API is slower than the others in this test.',
      evidenceIds: ['endpoint-to-inspect'],
      requiredEvidence: ['sample-actionable', 'total-timing'],
    },
  },
} as unknown as DiagnosticNarrative;

const drillEndpoint: Endpoint = {
  id: 'api',
  url: 'https://api.example.com',
  label: 'API',
  enabled: true,
  color: '#67e8f9',
};

function renderStrip(overrides: Partial<Record<string, unknown>> = {}) {
  return render(CausalVerdictStrip, {
    props: {
      diagnosis: collectingDiagnosis,
      avgP50: null,
      avgJitter: null,
      avgLoss: null,
      drillEndpoint: null,
      onDrill: vi.fn(),
      ...overrides,
    },
  });
}

describe('CausalVerdictStrip start CTA', () => {
  it('renders and invokes Start Measuring only when collection was suppressed and onStart is callable', async () => {
    const onStart = vi.fn();
    const { getByRole } = renderStrip({
      autoStartSuppressionReason: 'pending-share',
      onStart,
    });

    await fireEvent.click(getByRole('button', { name: /start measuring/i }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('hides Start Measuring when onStart is absent', () => {
    const { queryByRole } = renderStrip({
      autoStartSuppressionReason: 'pending-share',
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
  });

  it('hides Start Measuring when auto-start was not suppressed', () => {
    const { queryByRole } = renderStrip({
      onStart: vi.fn(),
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
  });

  it('hides Start Measuring for shared report suppression even when onStart is callable', () => {
    const { queryByRole } = renderStrip({
      autoStartSuppressionReason: 'shared-report',
      onStart: vi.fn(),
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
  });

  it('explains no enabled endpoints without rendering Start Measuring', () => {
    const { getByText, queryByRole } = renderStrip({
      autoStartSuppressionReason: 'no-enabled-endpoints',
      onStart: vi.fn(),
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
    expect(getByText(/no endpoints are enabled/i)).toBeTruthy();
    expect(getByText(/enable an endpoint before chronoscope can measure anything/i)).toBeTruthy();
  });

  it('explains local endpoint suppression and renders Start Measuring', () => {
    const { getByRole, getByText } = renderStrip({
      autoStartSuppressionReason: 'local-endpoint',
      onStart: vi.fn(),
    });

    expect(getByRole('button', { name: /start measuring/i })).toBeTruthy();
    expect(getByText(/start when you want chronoscope to probe your local or private endpoints/i)).toBeTruthy();
  });

  it('explains shared report suppression without rendering Start Measuring', () => {
    const { getByText, queryByRole } = renderStrip({
      autoStartSuppressionReason: 'shared-report',
      onStart: vi.fn(),
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
    expect(getByText(/this is a shared snapshot/i)).toBeTruthy();
    expect(getByText(/run your own test to measure from your location/i)).toBeTruthy();
  });

  it('hides Start Measuring outside collecting states', () => {
    const { queryByRole } = renderStrip({
      diagnosis: degradedDiagnosis,
      autoStartSuppressionReason: 'pending-share',
      onStart: vi.fn(),
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
  });

  it('does not interfere with the existing Investigate CTA', async () => {
    const onDrill = vi.fn();
    const { getByRole, queryByRole } = renderStrip({
      diagnosis: degradedDiagnosis,
      autoStartSuppressionReason: 'pending-share',
      drillEndpoint,
      onDrill,
      onStart: vi.fn(),
    });

    expect(queryByRole('button', { name: /start measuring/i })).toBeNull();
    await fireEvent.click(getByRole('button', { name: /investigate api/i }));

    expect(onDrill).toHaveBeenCalledWith('api');
  });

  it('renders the evidence-gated primary answer instead of the legacy verdict headline', () => {
    const { getByRole, queryByText, getByText } = renderStrip({
      diagnosis: degradedDiagnosis,
      drillEndpoint,
    });

    expect(getByRole('heading', { name: /API is slower than the others/i })).toBeTruthy();
    expect(queryByText(/likely that site/i)).toBeNull();
    expect(getByText(/Compare this test from outside your network/i)).toBeTruthy();
  });
});
