import { describe, expect, it } from 'vitest';
import { canContributeIntelligence, contributionCopy } from '../../../src/lib/intelligence/consent';

describe('collective intelligence consent', () => {
  it('blocks contribution when explicit opt-in is absent', () => {
    expect(canContributeIntelligence({ optedIn: false, reportHasResults: true })).toBe(false);
  });

  it('blocks contribution when no measured results exist', () => {
    expect(canContributeIntelligence({ optedIn: true, reportHasResults: false })).toBe(false);
  });

  it('allows contribution only when consent and measured results are present', () => {
    expect(canContributeIntelligence({ optedIn: true, reportHasResults: true })).toBe(true);
  });

  it('uses explicit consent copy', () => {
    expect(contributionCopy()).toContain('optional');
    expect(contributionCopy()).toContain('anonymous aggregate');
    expect(contributionCopy()).toContain('will not send full URLs');
  });
});
