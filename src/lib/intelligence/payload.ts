import { isSafeSharedUrl } from '../utils/url-safety';

export type IntelligenceConsent = 'anonymous-aggregate' | 'named-public-endpoint';

export interface IntelligencePayloadInput {
  readonly endpointUrl: string;
  readonly p50: number;
  readonly p95: number;
  readonly lossPercent: number;
  readonly sampleCount: number;
  readonly createdAt: number;
  readonly consent: IntelligenceConsent;
}

export interface IntelligencePayload {
  readonly v: 1;
  readonly consent: IntelligenceConsent;
  readonly originHost: string | null;
  readonly publicOriginHash: string | null;
  readonly p50: number;
  readonly p95: number;
  readonly lossPercent: number;
  readonly sampleCount: number;
  readonly createdAt: number;
}

function publicHostname(endpointUrl: string): string | null {
  if (!isSafeSharedUrl(endpointUrl)) return null;
  return new URL(endpointUrl).hostname.toLowerCase();
}

export function buildIntelligencePayload(input: IntelligencePayloadInput): IntelligencePayload {
  const host = publicHostname(input.endpointUrl);
  return {
    v: 1,
    consent: input.consent,
    originHost: input.consent === 'named-public-endpoint' ? host : null,
    publicOriginHash: null,
    p50: Math.round(input.p50),
    p95: Math.round(input.p95),
    lossPercent: Number(input.lossPercent.toFixed(2)),
    sampleCount: Math.round(input.sampleCount),
    createdAt: input.createdAt,
  };
}
