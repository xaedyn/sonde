import { describe, expect, it } from 'vitest';
import {
  canRenderClaim,
  renderClaim,
  type ClaimEvidenceState,
} from '../../../src/lib/utils/claim-registry';

const measured: ClaimEvidenceState = {
  sampleReady: true,
  sampleActionable: true,
  sampleMature: true,
  allEnabledReady: true,
  totalTiming: true,
  phaseTiming: false,
  remoteVantage: false,
  baselineReady: false,
  localAgent: false,
};

describe('claim-registry', () => {
  it('allows measured browser comparison claims when samples are ready', () => {
    const claim = renderClaim('browser-measured-comparison', measured, { endpointLabel: 'API' });

    expect(canRenderClaim('browser-measured-comparison', measured)).toBe(true);
    expect(claim).toMatchObject({
      id: 'browser-measured-comparison',
      kind: 'measured',
      strength: 'medium',
      requiredEvidence: ['sample-ready', 'all-enabled-ready', 'total-timing'],
    });
    expect(claim?.text).toContain('measured');
    expect(claim?.text).toContain('API');
  });

  it('blocks local-path claims without outside proof or local proof', () => {
    expect(canRenderClaim('local-path-needs-proof', measured)).toBe(false);
    expect(renderClaim('local-path-needs-proof', measured, { endpointLabel: 'API' })).toBeNull();
  });

  it('renders next validation claims when evidence is missing', () => {
    expect(renderClaim('run-outside-check-next', measured, { endpointLabel: 'API' })).toMatchObject({
      id: 'run-outside-check-next',
      kind: 'next-validation',
      text: 'Run an outside check for API to compare your browser path with a Cloudflare edge.',
      requiredEvidence: [],
    });
  });

  it('keeps registry text away from unsupported cause and fix claims', () => {
    const rendered = [
      renderClaim('browser-measured-comparison', measured, { endpointLabel: 'API' }),
      renderClaim('browser-visibility-limited', measured),
      renderClaim('run-outside-check-next', measured, { endpointLabel: 'API' }),
      renderClaim('run-local-agent-next', measured, { endpointLabel: 'API' }),
    ].filter((claim) => claim !== null);

    for (const claim of rendered) {
      expect(claim.text).not.toMatch(/your ISP is|your router is|the server is the cause|this will fix|guaranteed/i);
    }
  });
});
