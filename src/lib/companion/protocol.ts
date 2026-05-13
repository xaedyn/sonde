// src/lib/companion/protocol.ts
// Shared browser-side protocol helpers for the optional local companion agent.

export const DEFAULT_COMPANION_BASE_URL = 'http://127.0.0.1:47317';
export const COMPANION_PROTOCOL_VERSION = 1;

export interface CompanionCapabilities {
  readonly dns: boolean;
  readonly tls: boolean;
  readonly route: boolean;
  readonly wifi: boolean;
  readonly sqliteHistory: boolean;
}

export type CompanionProbeName = 'dns' | 'tls' | 'route' | 'wifi';

export interface CompanionHealth {
  readonly ok: boolean;
  readonly version: string;
  readonly protocolVersion: number;
  readonly capabilities: CompanionCapabilities;
}

export interface CompanionProbeRequest {
  readonly targetUrl: string;
  readonly probes?: readonly CompanionProbeName[];
  readonly includePrivateWifi?: boolean;
}

export interface CompanionTimedResult<T> {
  readonly ok: boolean;
  readonly durationMs: number;
  readonly value?: T;
  readonly error?: string;
  readonly unavailable?: boolean;
  readonly reason?: string;
}

export interface CompanionProbeResults {
  readonly dns?: CompanionTimedResult<{
    readonly lookup: readonly { readonly address: string; readonly family: number }[];
    readonly a: readonly string[];
    readonly aaaa: readonly string[];
    readonly cname: readonly string[];
  }>;
  readonly tls?: CompanionTimedResult<{
    readonly authorized: boolean;
    readonly authorizationError: string | null;
    readonly protocol: string | null;
    readonly cipher: string | null;
    readonly validFrom: string | null;
    readonly validTo: string | null;
    readonly subject: string | null;
    readonly issuer: string | null;
    readonly fingerprint256: string | null;
  }>;
  readonly route?: CompanionTimedResult<{
    readonly tool: string;
    readonly hops: readonly { readonly raw: string }[];
    readonly stderr?: string;
  }>;
  readonly wifi?: CompanionTimedResult<{
    readonly ssid?: string;
    readonly bssid?: string;
    readonly rssi: number | null;
    readonly noise: number | null;
  }>;
}

export interface CompanionProbeResponse {
  readonly ok: boolean;
  readonly id: string;
  readonly targetHost: string;
  readonly createdAt: number;
  readonly summary: string;
  readonly results: CompanionProbeResults;
}

export interface CompanionHistoryEntry {
  readonly id: string;
  readonly targetHost: string;
  readonly createdAt: number;
  readonly summary: string;
  readonly payload: CompanionProbeResponse;
}

export interface CompanionHistoryResponse {
  readonly ok: boolean;
  readonly history: readonly CompanionHistoryEntry[];
}

interface CanonicalRequestInput {
  readonly method: string;
  readonly path: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly body: string;
}

export interface BuildCompanionHeadersInput {
  readonly method: string;
  readonly path: string;
  readonly body: string;
  readonly secret: string;
  readonly now?: () => number;
  readonly nonceFactory?: () => string;
  readonly signer?: (secret: string, message: string) => Promise<string>;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function normalizeCompanionBaseUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  if (parsed.protocol !== 'http:') {
    throw new Error('Companion URL must use http on a loopback address.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('Companion URL must point to a loopback host.');
  }
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function canonicalCompanionRequest(input: CanonicalRequestInput): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.body,
  ].join('\n');
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes.buffer);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(signature);
}

export async function buildCompanionHeaders(input: BuildCompanionHeadersInput): Promise<Record<string, string>> {
  const timestamp = String((input.now ?? Date.now)());
  const nonce = (input.nonceFactory ?? makeNonce)();
  const message = canonicalCompanionRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  });
  const signature = await (input.signer ?? hmacSha256Hex)(input.secret, message);

  return {
    'Content-Type': 'application/json',
    'X-Chronoscope-Timestamp': timestamp,
    'X-Chronoscope-Nonce': nonce,
    'X-Chronoscope-Signature': signature,
  };
}
