import type { SharePayload } from '../../src/lib/types';
import type {
  HostedReportCreateResponse,
  HostedReportLoadResponse,
  RemoteVantageEdge,
  RemoteVantageProbeRequest,
  RemoteVantageProbeResponse,
  RemoteVantageResult,
  RemoteVantageTarget,
  RemoteVantageVerdict,
} from '../../src/lib/remote-vantage/types';

export interface ReportKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface SaturationBucket {
  get(key: string): Promise<{ readonly body: ReadableStream | null; readonly size: number } | null>;
}

export interface RemoteProbeOptions {
  readonly cf?: Partial<RemoteVantageEdge> | null;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

export interface HostedReportOptions {
  readonly reports?: ReportKV;
  readonly id?: string;
  readonly idFactory?: () => string;
  readonly now?: () => number;
}

export interface SaturationOptions {
  readonly bucket?: SaturationBucket;
}

export type DohDnsRecordType = 'A' | 'AAAA';

export interface DohDnsOptions {
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly performanceNow?: () => number;
}

export interface TopologyOptions {
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly performanceNow?: () => number;
}

const MAX_TARGETS = 8;
const MAX_REPORT_BYTES = 120_000;
const REPORT_TTL_SECONDS = 60 * 60 * 24 * 30;
const REPORT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const PROBE_TIMEOUT_MS = 4500;
const DOH_TIMEOUT_MS = 3000;
const TOPOLOGY_TIMEOUT_MS = 5500;
const SLOW_REMOTE_MS = 500;
const DEFAULT_SATURATION_BYTES = 25 * 1024 * 1024;
const MAX_SATURATION_BYTES = 100 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const PUBLIC_PORTS = new Set(['', '80', '443']);
const EXPOSED_HEADERS = ['content-type', 'server', 'cache-control', 'cf-cache-status'];
const DNS_TYPE_NUMBERS: Record<DohDnsRecordType, number> = {
  A: 1,
  AAAA: 28,
};

function json(status: number, payload: unknown, extraHeaders: HeadersInit = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extraHeaders,
    },
  });
}

function parseBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Expected application/json.');
  }
  return request.json() as Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets;
}

function isBlockedIPv4(hostname: string): boolean {
  const octets = parseIPv4(hostname);
  if (!octets) return false;
  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168 ||
    first === 100 && second >= 64 && second <= 127 ||
    first >= 224
  );
}

function isBlockedIPv4MappedIPv6(hostname: string): boolean {
  const stripped = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (!stripped.startsWith('::ffff:')) return false;

  const embedded = stripped.slice('::ffff:'.length);
  if (isBlockedIPv4(embedded)) return true;

  const hexMapped = embedded.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexMapped || hexMapped[1] === undefined || hexMapped[2] === undefined) return false;

  const hi = parseInt(hexMapped[1], 16);
  const lo = parseInt(hexMapped[2], 16);
  const ipv4 = [
    (hi >> 8) & 0xff,
    hi & 0xff,
    (lo >> 8) & 0xff,
    lo & 0xff,
  ].join('.');
  return isBlockedIPv4(ipv4);
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) return true;
  if (isBlockedIPv4(lower)) return true;
  if (lower.includes(':')) {
    const stripped = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
    if (isBlockedIPv4MappedIPv6(stripped)) return true;
    return lower === '::1' ||
      lower === '[::1]' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80') ||
      lower === '::';
  }
  return false;
}

function parsePublicUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.length > 2048) {
    throw new Error('Target URL must be a public http(s) URL.');
  }
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Target URL must be a public http(s) URL.');
  }
  if (url.username || url.password || isBlockedHostname(url.hostname) || !PUBLIC_PORTS.has(url.port)) {
    throw new Error('Target URL must be a public http(s) URL.');
  }
  return url;
}

function parseTargets(payload: unknown): RemoteVantageTarget[] {
  if (!isRecord(payload) || !Array.isArray(payload.targets)) {
    throw new Error('Request body must include targets.');
  }
  if (payload.targets.length === 0 || payload.targets.length > MAX_TARGETS) {
    throw new Error(`Remote vantage supports 1-${MAX_TARGETS} targets per request.`);
  }

  return payload.targets.map((target, index) => {
    if (!isRecord(target)) throw new Error('Each target must be an object.');
    const url = parsePublicUrl(target.url);
    return {
      id: typeof target.id === 'string' && target.id ? target.id.slice(0, 80) : `target-${index + 1}`,
      label: typeof target.label === 'string' && target.label ? target.label.slice(0, 120) : url.hostname,
      url: url.toString(),
    };
  });
}

function parseDnsHostname(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 253) {
    throw new Error('DNS lookup requires a public hostname.');
  }

  const trimmed = raw.trim().replace(/\.$/, '').toLowerCase();
  if (
    trimmed.length === 0 ||
    trimmed.includes('/') ||
    trimmed.includes('@') ||
    trimmed.includes(':') ||
    parseIPv4(trimmed) !== null ||
    isBlockedHostname(trimmed)
  ) {
    throw new Error('DNS lookup requires a public hostname.');
  }

  const labels = trimmed.split('.');
  const validLabels = labels.length >= 2 && labels.every((label) => (
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
  if (!validLabels) throw new Error('DNS lookup requires a public hostname.');
  return trimmed;
}

function parseDnsRecordType(raw: string | null): DohDnsRecordType {
  const normalized = (raw ?? 'A').toUpperCase();
  if (normalized === 'A' || normalized === 'AAAA') return normalized;
  throw new Error('DNS lookup supports A and AAAA records.');
}

function edgeFrom(cf?: Partial<RemoteVantageEdge> | null): RemoteVantageEdge {
  return {
    ...(cf?.colo ? { colo: String(cf.colo) } : {}),
    ...(cf?.country ? { country: String(cf.country) } : {}),
    ...(cf?.city ? { city: String(cf.city) } : {}),
    ...(cf?.region ? { region: String(cf.region) } : {}),
    ...(cf?.timezone ? { timezone: String(cf.timezone) } : {}),
  };
}

function exposedHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of EXPOSED_HEADERS) {
    const value = headers.get(key);
    if (value) out[key] = value.slice(0, 160);
  }
  return out;
}

function verdictFor(status: number | null, durationMs: number, ok: boolean): RemoteVantageVerdict {
  if (!ok || status === null) return 'unreachable';
  if (status >= 500) return 'http-error';
  if (durationMs >= SLOW_REMOTE_MS) return 'slow';
  return 'reachable';
}

async function probeTarget(target: RemoteVantageTarget, options: Required<Pick<RemoteProbeOptions, 'fetcher' | 'now'>>): Promise<RemoteVantageResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await options.fetcher(target.url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: '*/*',
        'Cache-Control': 'no-cache',
        Range: 'bytes=0-0',
        'User-Agent': 'Chronoscope-Remote-Vantage/1.0',
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    } as RequestInit & { cf: Record<string, unknown> });
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const ok = response.status < 500;
    await response.body?.cancel().catch(() => undefined);
    return {
      endpointId: target.id,
      label: target.label,
      url: target.url,
      ok,
      status: response.status,
      statusText: response.statusText || null,
      durationMs,
      checkedAt: options.now(),
      verdict: verdictFor(response.status, durationMs, ok),
      headers: exposedHeaders(response.headers),
    };
  } catch (error) {
    return {
      endpointId: target.id,
      label: target.label,
      url: target.url,
      ok: false,
      status: null,
      statusText: null,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      checkedAt: options.now(),
      verdict: 'unreachable',
      headers: {},
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleRemoteProbe(request: Request, options: RemoteProbeOptions = {}): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, {});
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });

  try {
    const body = await parseBody(request);
    const parsed: RemoteVantageProbeRequest = { targets: parseTargets(body) };
    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const now = options.now ?? Date.now;
    const results = await Promise.all(parsed.targets.map((target) => probeTarget(target, { fetcher, now })));
    const payload: RemoteVantageProbeResponse = {
      ok: true,
      generatedAt: now(),
      edge: edgeFrom(options.cf),
      results,
    };
    return json(200, payload);
  } catch (error) {
    return json(400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseDohRecords(payload: unknown, recordType: DohDnsRecordType): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.Answer)) return [];
  const typeNumber = DNS_TYPE_NUMBERS[recordType];
  return payload.Answer
    .filter((answer): answer is Record<string, unknown> => isRecord(answer))
    .filter((answer) => answer.type === typeNumber && typeof answer.data === 'string')
    .map((answer) => String(answer.data).slice(0, 255))
    .slice(0, 16);
}

async function runDohLookup(input: {
  readonly hostname: string;
  readonly recordType: DohDnsRecordType;
  readonly fetcher: typeof fetch;
  readonly now: () => number;
  readonly performanceNow: () => number;
}): Promise<Response> {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.searchParams.set('name', input.hostname);
  endpoint.searchParams.set('type', input.recordType);

  const startedAt = input.performanceNow();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);

  try {
    const response = await input.fetcher(endpoint.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/dns-json',
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    } as RequestInit & { cf: Record<string, unknown> });
    const payload = await response.json() as unknown;
    const durationMs = Math.max(0, Math.round(input.performanceNow() - startedAt));

    if (!response.ok) {
      return json(424, {
        ok: false,
        error: `Cloudflare DNS-over-HTTPS returned HTTP ${response.status}.`,
      });
    }

    return json(200, {
      ok: true,
      resolver: 'cloudflare-doh',
      hostname: input.hostname,
      recordType: input.recordType,
      records: parseDohRecords(payload, input.recordType),
      durationMs,
      checkedAt: input.now(),
    });
  } catch {
    return json(424, {
      ok: false,
      error: 'Cloudflare DNS-over-HTTPS lookup did not complete.',
    });
  } finally {
    clearTimeout(timer);
  }
}

export function handleDohDnsRequest(request: Request, options: DohDnsOptions = {}): Response | Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, {});
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed.' });

  let hostname: string;
  let recordType: DohDnsRecordType;
  try {
    const url = new URL(request.url);
    hostname = parseDnsHostname(url.searchParams.get('hostname'));
    recordType = parseDnsRecordType(url.searchParams.get('type'));
  } catch {
    return json(400, {
      ok: false,
      error: 'DNS lookup requires a public hostname and A or AAAA record type.',
    });
  }

  return runDohLookup({
    hostname,
    recordType,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
    now: options.now ?? Date.now,
    performanceNow: options.performanceNow ?? performance.now.bind(performance),
  });
}

function firstPublicARecord(payload: unknown): string | null {
  const records = parseDohRecords(payload, 'A');
  for (const record of records) {
    if (parseIPv4(record) !== null && !isBlockedIPv4(record)) return record;
  }
  return null;
}

function parseAsn(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(raw) && raw > 0 && raw <= 4_294_967_295 ? raw : null;
}

function parseNetworkInfo(payload: unknown): { readonly asn: number | null; readonly prefix: string | null } {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  const rawAsns = Array.isArray(data.asns) ? data.asns : [];
  const asn = rawAsns.map(parseAsn).find((candidate) => candidate !== null) ?? null;
  const prefix = typeof data.prefix === 'string' ? data.prefix.slice(0, 80) : null;
  return { asn, prefix };
}

function parseAsOverviewHolder(payload: unknown): string | null {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  return typeof data.holder === 'string' ? data.holder.slice(0, 160) : null;
}

async function fetchJson(input: {
  readonly url: string;
  readonly fetcher: typeof fetch;
  readonly signal: AbortSignal;
  readonly accept?: string;
}): Promise<unknown> {
  const response = await input.fetcher(input.url, {
    method: 'GET',
    signal: input.signal,
    headers: { Accept: input.accept ?? 'application/json' },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  } as RequestInit & { cf: Record<string, unknown> });
  if (!response.ok) throw new Error(`Topology source returned HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

async function runTopologyLookup(input: {
  readonly hostname: string;
  readonly fetcher: typeof fetch;
  readonly now: () => number;
  readonly performanceNow: () => number;
}): Promise<Response> {
  const startedAt = input.performanceNow();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOPOLOGY_TIMEOUT_MS);

  try {
    const dnsEndpoint = new URL('https://cloudflare-dns.com/dns-query');
    dnsEndpoint.searchParams.set('name', input.hostname);
    dnsEndpoint.searchParams.set('type', 'A');
    const dnsPayload = await fetchJson({
      url: dnsEndpoint.toString(),
      fetcher: input.fetcher,
      signal: controller.signal,
      accept: 'application/dns-json',
    });
    const ip = firstPublicARecord(dnsPayload);
    if (ip === null) {
      return json(400, {
        ok: false,
        error: 'No public DNS A record was available for topology context.',
      });
    }

    const networkInfoUrl = `https://stat.ripe.net/data/network-info/data.json?resource=${encodeURIComponent(ip)}`;
    const networkInfo = parseNetworkInfo(await fetchJson({
      url: networkInfoUrl,
      fetcher: input.fetcher,
      signal: controller.signal,
    }));

    let organization: string | null = null;
    if (networkInfo.asn !== null) {
      const asOverviewUrl = `https://stat.ripe.net/data/as-overview/data.json?resource=AS${networkInfo.asn}`;
      organization = parseAsOverviewHolder(await fetchJson({
        url: asOverviewUrl,
        fetcher: input.fetcher,
        signal: controller.signal,
      }));
    }

    return json(200, {
      ok: true,
      vantage: 'public-topology',
      hostname: input.hostname,
      ip,
      prefix: networkInfo.prefix,
      asn: networkInfo.asn,
      organization,
      durationMs: Math.max(0, Math.round(input.performanceNow() - startedAt)),
      checkedAt: input.now(),
    });
  } catch {
    return json(424, {
      ok: false,
      error: 'Topology context lookup did not complete.',
    });
  } finally {
    clearTimeout(timer);
  }
}

export function handleTopologyRequest(request: Request, options: TopologyOptions = {}): Response | Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, {});
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed.' });

  let hostname: string;
  try {
    const url = new URL(request.url);
    hostname = parseDnsHostname(url.searchParams.get('hostname'));
  } catch {
    return json(400, {
      ok: false,
      error: 'Topology context requires a public hostname.',
    });
  }

  return runTopologyLookup({
    hostname,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
    now: options.now ?? Date.now,
    performanceNow: options.performanceNow ?? performance.now.bind(performance),
  });
}

function isSharePayloadLike(value: unknown): value is SharePayload {
  if (!isRecord(value)) return false;
  if (value.v !== 1 && value.v !== 2) return false;
  if (value.mode !== 'config' && value.mode !== 'results') return false;
  if (!Array.isArray(value.endpoints) || value.endpoints.length > 50) return false;
  if (!isRecord(value.settings)) return false;
  return value.mode !== 'results' || Array.isArray(value.results);
}

function reportId(factory?: () => string): string {
  if (factory) return factory();
  return `r_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

export async function handleCreateHostedReport(request: Request, options: HostedReportOptions = {}): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, {});
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (!options.reports) {
    const fallback: HostedReportCreateResponse = {
      ok: false,
      fallback: 'hash',
      error: 'Report persistence is not configured.',
    };
    return json(503, fallback);
  }

  try {
    const raw = await parseBody(request);
    if (!isRecord(raw) || !isSharePayloadLike(raw.payload)) {
      return json(400, { ok: false, error: 'Invalid report payload.' });
    }
    const serialized = JSON.stringify(raw.payload);
    if (new TextEncoder().encode(serialized).byteLength > MAX_REPORT_BYTES) {
      return json(413, { ok: false, error: 'Report payload is too large.' });
    }

    const id = reportId(options.idFactory);
    const now = options.now ?? Date.now;
    await options.reports.put(`report:${id}`, serialized, { expirationTtl: REPORT_TTL_SECONDS });
    return json(201, {
      ok: true,
      id,
      url: `${new URL(request.url).origin}/r/${id}`,
      expiresAt: now() + REPORT_TTL_SECONDS * 1000,
    } satisfies HostedReportCreateResponse);
  } catch (error) {
    return json(400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleGetHostedReport(request: Request, options: HostedReportOptions = {}): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, {});
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed.' });
  const id = options.id ?? new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (!REPORT_ID_PATTERN.test(id)) return json(400, { ok: false, error: 'Invalid report id.' });
  if (!options.reports) return json(503, { ok: false, error: 'Report persistence is not configured.' });

  const stored = await options.reports.get(`report:${id}`);
  if (!stored) return json(404, { ok: false, error: 'Report not found or expired.' });

  try {
    const payload = JSON.parse(stored) as unknown;
    if (!isSharePayloadLike(payload)) return json(500, { ok: false, error: 'Stored report is invalid.' });
    return json(200, { ok: true, payload } satisfies HostedReportLoadResponse);
  } catch {
    return json(500, { ok: false, error: 'Stored report is invalid.' });
  }
}

function requestedSaturationBytes(request: Request): number {
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get('bytes') ?? DEFAULT_SATURATION_BYTES);
  if (!Number.isFinite(raw)) return DEFAULT_SATURATION_BYTES;
  return Math.max(1, Math.min(MAX_SATURATION_BYTES, Math.floor(raw)));
}

function generatedSaturationStream(totalBytes: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const remaining = totalBytes - sent;
      if (remaining <= 0) {
        controller.close();
        return;
      }
      const size = Math.min(CHUNK_BYTES, remaining);
      const chunk = new Uint8Array(size);
      for (let index = 0; index < size; index++) chunk[index] = (sent + index) % 251;
      sent += size;
      controller.enqueue(chunk);
    },
  });
}

export async function handleSaturationRequest(request: Request, options: SaturationOptions = {}): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, {});
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }
  const bytes = requestedSaturationBytes(request);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': String(bytes),
    'X-Chronoscope-Saturation-Bytes': String(bytes),
  };

  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

  const bucketObject = await options.bucket?.get('chronoscope-saturation.bin');
  if (bucketObject?.body && bucketObject.size === bytes) {
    return new Response(bucketObject.body.pipeThrough(new TransformStream()), { status: 200, headers });
  }
  return new Response(generatedSaturationStream(bytes), { status: 200, headers });
}
