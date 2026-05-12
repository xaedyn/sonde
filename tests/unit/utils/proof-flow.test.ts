import { describe, expect, it } from 'vitest';
import {
  buildProofActionState,
  isProofStale,
  proofFreshnessLabel,
  summarizeRemoteProof,
} from '../../../src/lib/utils/proof-flow';
import type { RemoteVantageProbeResponse } from '../../../src/lib/remote-vantage/types';

const cleanProbe: RemoteVantageProbeResponse = {
  ok: true,
  generatedAt: 1778352005000,
  edge: { colo: 'IAD', city: 'Ashburn', country: 'US' },
  results: [{
    endpointId: 'api',
    label: 'API',
    url: 'https://api.example.com',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 42,
    checkedAt: 1778352005000,
    verdict: 'reachable',
    headers: {},
  }],
};

describe('proof-flow', () => {
  it('marks proof as stale when a report is newer than the captured proof', () => {
    expect(isProofStale({ reportCreatedAt: 2000, proofGeneratedAt: 1000 })).toBe(true);
    expect(isProofStale({ reportCreatedAt: 1000, proofGeneratedAt: 2000 })).toBe(false);
  });

  it('uses compact freshness labels', () => {
    expect(proofFreshnessLabel({ reportCreatedAt: 2000, proofGeneratedAt: 1000 })).toBe('Stale');
    expect(proofFreshnessLabel({ reportCreatedAt: 1000, proofGeneratedAt: 2000 })).toBe('Fresh');
    expect(proofFreshnessLabel({ reportCreatedAt: 1000, proofGeneratedAt: null })).toBe('Not run');
  });

  it('summarizes outside proof without causal overclaiming', () => {
    expect(summarizeRemoteProof(cleanProbe)).toMatchObject({
      tone: 'good',
      status: 'Captured',
      text: 'Cloudflare reached 1 endpoint without slow or failed results',
    });
  });

  it('maps running and failed actions to visible card states', () => {
    expect(buildProofActionState({
      kind: 'remote',
      status: 'probing',
      hasProof: false,
      hasError: false,
    })).toMatchObject({
      label: 'Running',
      disabled: true,
      tone: 'watch',
    });
    expect(buildProofActionState({
      kind: 'remote',
      status: 'error',
      hasProof: false,
      hasError: true,
    })).toMatchObject({
      label: 'Failed',
      disabled: false,
      tone: 'watch',
    });
  });
});
