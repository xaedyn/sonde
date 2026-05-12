import { describe, expect, it } from 'vitest';
import { reportModeCopy } from '../../../src/lib/utils/report-mode';

describe('reportModeCopy', () => {
  it('uses singular nouns when counts are 1', () => {
    const copy = reportModeCopy({
      reportKind: 'support',
      primaryAnswer: 'Single endpoint check.',
      confidenceLabel: 'High confidence',
      sampleCount: 1,
      endpointCount: 1,
      timingHeadline: 'Detailed timing visible',
    });

    expect(copy.lede).toContain('1 sample across 1 endpoint');
  });

  it('keeps support mode focused on facts, caveats, and next validation', () => {
    const copy = reportModeCopy({
      reportKind: 'support',
      primaryAnswer: 'One site is slower than the others.',
      confidenceLabel: 'Medium confidence',
      sampleCount: 105,
      endpointCount: 3,
      timingHeadline: 'Some timing details are hidden by the browser',
    });

    expect(copy).toMatchObject({
      kicker: 'Support report',
      primaryActionLabel: 'Copy Support Summary',
    });
    expect(copy.lede).toContain('One site is slower than the others.');
    expect(copy.lede).toContain('Medium confidence.');
    expect(copy.lede).toContain('105 samples across 3 endpoints');
    expect(copy.lede).toContain('Some timing details are hidden by the browser.');
    expect(copy.lede).not.toMatch(/will fix|the problem is your|your ISP is/i);
  });

  it('keeps snapshot mode brag-friendly without dropping evidence', () => {
    const copy = reportModeCopy({
      reportKind: 'snapshot',
      primaryAnswer: 'All measured sites look healthy.',
      confidenceLabel: 'High confidence',
      sampleCount: 180,
      endpointCount: 4,
      timingHeadline: 'Detailed timing visible',
    });

    expect(copy).toMatchObject({
      kicker: 'Performance snapshot',
      primaryActionLabel: 'Copy Snapshot Summary',
    });
    expect(copy.lede).toContain('All measured sites look healthy.');
    expect(copy.lede).toContain('180 samples across 4 endpoints');
    expect(copy.lede).toContain('Detailed timing visible.');
    expect(copy.lede).not.toMatch(/guaranteed|perfect|fastest|beats/i);
  });
});
