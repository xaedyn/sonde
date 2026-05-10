import type {
  SharePayload,
  ShareRemoteVantageEdge,
  ShareRemoteVantageResult,
  ShareRemoteVantageSnapshot,
  ShareRemoteVantageVerdict,
} from '../types';

export interface RemoteVantageTarget {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

export interface RemoteVantageProbeRequest {
  readonly targets: readonly RemoteVantageTarget[];
}

export type RemoteVantageEdge = ShareRemoteVantageEdge;

export type RemoteVantageVerdict = ShareRemoteVantageVerdict;

export type RemoteVantageResult = ShareRemoteVantageResult;

export interface RemoteVantageProbeResponse extends ShareRemoteVantageSnapshot {
  readonly ok: boolean;
}

export interface HostedReportSuccess {
  readonly ok: true;
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
}

export interface HostedReportFallback {
  readonly ok: false;
  readonly fallback: 'hash';
  readonly error: string;
}

export type HostedReportCreateResponse = HostedReportSuccess | HostedReportFallback;

export interface HostedReportLoadResponse {
  readonly ok: true;
  readonly payload: SharePayload;
}
