import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import CausalVerdictStrip from '../../../src/lib/components/CausalVerdictStrip.svelte';
import type { DiagnosticNarrative } from '../../../src/lib/utils/diagnostic-narrative';
import type { ScoreExplanation } from '../../../src/lib/utils/score-explanation';
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

const scoreExplanation: ScoreExplanation = {
  score: 80,
  rawScore: 80,
  verdict: 'good',
  headline: 'Score 80 · Good',
  summary: '2 sites clean; 2 have some slower checks.',
  detail: 'Endpoint scores: Google 100: clean; Cloudflare 100: clean; AWS 60: some slower checks; API 60: some slower checks.',
  contributions: [
    { endpointId: 'google', label: 'Google', bucket: 'healthy', points: 100, reason: 'clean' },
    { endpointId: 'cloudflare', label: 'Cloudflare', bucket: 'healthy', points: 100, reason: 'clean' },
    { endpointId: 'aws', label: 'AWS', bucket: 'degraded', points: 60, reason: 'some slower checks' },
    { endpointId: 'api', label: 'API', bucket: 'degraded', points: 60, reason: 'some slower checks' },
  ],
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

  it('renders compact score evidence without hiding the diagnostic answer', () => {
    const { getByRole, getByText } = renderStrip({
      diagnosis: {
        ...degradedDiagnosis,
        verdict: { tone: 'good', headline: 'All links within tolerance.' },
        kind: 'healthy',
        severity: 'healthy',
        primaryAnswer: {
          ...degradedDiagnosis.primaryAnswer,
          id: 'healthy',
          kind: 'measured',
          text: 'Looks good, with minor variation.',
        },
        supportingSummary: 'Good browser-visible run with variation: no site is consistently slow; 40+ successful checks across 4 sites.',
      },
      scoreExplanation,
    });

    expect(getByRole('heading', { name: /Looks good, with minor variation/i })).toBeTruthy();
    expect(getByText('Score 80 · Good')).toBeTruthy();
    expect(getByText('2 sites clean; 2 have some slower checks.')).toBeTruthy();
    expect(getByText('Google 100')).toBeTruthy();
    expect(getByText('API 60')).toBeTruthy();
  });

  it('orders the status answer as verdict, facts, limitation, next check, then score', () => {
    const diagnosis = {
      ...degradedDiagnosis,
      supportingSummary: 'API is slower than the others in this browser-visible run; total timing is available.',
      limitations: [{
        id: 'timing-visibility',
        headline: 'Browser timing does not expose every network phase for this site.',
        detail: 'Chronoscope can compare total time, but DNS, TCP, TLS, server, and transfer timing may be hidden.',
      }],
      triageActions: [{
        id: 'open-investigate',
        label: 'Open Investigate',
        action: 'Compare API from another vantage point before assigning cause.',
        why: 'A browser-only test can show which endpoint is slower, but not every upstream cause.',
        watchFor: 'If the remote check is also slow, the API path or service is more likely than this device.',
        requiredEvidence: ['remote-vantage'],
        endpointId: 'api',
      }],
      nextSteps: ['Compare API from another vantage point before assigning cause.'],
    } as unknown as DiagnosticNarrative;

    const { getByLabelText } = renderStrip({
      diagnosis,
      avgP50: 84,
      avgJitter: 7.2,
      avgLoss: 0,
      drillEndpoint,
      scoreExplanation,
    });

    const statusAnswer = getByLabelText('Status answer');
    const measuredFacts = getByLabelText('Measured facts');
    const limitation = getByLabelText('Browser limitation');
    const nextCheck = getByLabelText('Next useful check');
    const qualityScore = getByLabelText('Quality score explanation');

    expect(measuredFacts.textContent).toContain('Median');
    expect(measuredFacts.textContent).toContain('84');
    expect(measuredFacts.textContent).toContain('Jitter');
    expect(measuredFacts.textContent).toContain('7.2');
    expect(limitation.textContent).toContain('Browser timing does not expose every network phase');
    expect(nextCheck.textContent).toContain('Compare API from another vantage point');
    expect(qualityScore.textContent).toContain('Score 80 · Good');

    const text = statusAnswer.textContent ?? '';
    expect(text.indexOf('API is slower than the others')).toBeLessThan(text.indexOf('Measured facts'));
    expect(text.indexOf('Measured facts')).toBeLessThan(text.indexOf('Browser limit'));
    expect(text.indexOf('Browser limit')).toBeLessThan(text.indexOf('Next check'));
    expect(text.indexOf('Next check')).toBeLessThan(text.indexOf('Score 80 · Good'));
  });
});
