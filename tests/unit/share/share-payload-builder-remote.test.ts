import { describe, expect, it } from 'vitest';
import { buildResultsSharePayload } from '../../../src/lib/share/share-payload-builder';
import type { Endpoint, MeasurementState, Settings } from '../../../src/lib/types';
import type { RemoteVantageProbeResponse } from '../../../src/lib/remote-vantage/types';

const endpoint: Endpoint = {
  id: 'ep-1',
  label: 'API',
  url: 'https://api.example.com',
  enabled: true,
  color: '#67e8f9',
};

const settings: Settings = {
  timeout: 5000,
  delay: 0,
  burstRounds: 10,
  monitorDelay: 1000,
  cap: 100,
  corsMode: 'no-cors',
  healthThreshold: 120,
};

const measurements = {
  lifecycle: 'completed',
  epoch: 1,
  roundCounter: 1,
  endpoints: {
    'ep-1': {
      endpointId: 'ep-1',
      samples: [{ round: 1, latency: 80, status: 'ok', timestamp: 1778352000000 }],
      lastLatency: 80,
      lastStatus: 'ok',
      lastErrorMessage: null,
      tierLevel: 1,
    },
  },
  startedAt: 1778351999000,
  stoppedAt: 1778352001000,
  freezeEvents: [],
  errorCount: 0,
  timeoutCount: 0,
} as unknown as MeasurementState;

const remoteProbe: RemoteVantageProbeResponse = {
  ok: true,
  generatedAt: 1778352000500,
  edge: { colo: 'IAD', country: 'US' },
  results: [{
    endpointId: 'ep-1',
    label: 'API',
    url: 'https://api.example.com',
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 41,
    checkedAt: 1778352000500,
    verdict: 'reachable',
    headers: { 'content-type': 'text/plain' },
  }],
};

describe('buildResultsSharePayload remote vantage snapshot', () => {
  it('embeds outside-vantage evidence without the transport-only ok flag', () => {
    const built = buildResultsSharePayload(
      [endpoint],
      settings,
      measurements,
      8000,
      1778352000000,
      {},
      remoteProbe,
    );

    expect(built.payload.remoteVantage).toMatchObject({
      generatedAt: 1778352000500,
      edge: { colo: 'IAD', country: 'US' },
      results: [{ endpointId: 'ep-1', durationMs: 41, verdict: 'reachable' }],
    });
    expect('ok' in (built.payload.remoteVantage as Record<string, unknown>)).toBe(false);
  });
});
