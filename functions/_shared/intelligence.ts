export interface IntelligenceStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list?(options?: { readonly prefix?: string; readonly limit?: number }): Promise<{ readonly keys: readonly { readonly name: string }[] }>;
}

export interface IntelligenceIngestOptions {
  readonly store?: IntelligenceStore;
  readonly now?: () => number;
}

type IntelligenceConsent = 'anonymous-aggregate' | 'named-public-endpoint';

interface ValidIntelligencePayload {
  readonly v: 1;
  readonly consent: IntelligenceConsent;
  readonly originHost: string | null;
  readonly publicOriginHash: null;
  readonly p50: number;
  readonly p95: number;
  readonly lossPercent: number;
  readonly sampleCount: number;
  readonly createdAt: number;
}

interface IntelligenceAggregate {
  readonly v: 1;
  readonly bucket: string;
  readonly consent: IntelligenceConsent;
  readonly originHost: string | null;
  readonly count: number;
  readonly sampleCount: number;
  readonly p50Sum: number;
  readonly p95Sum: number;
  readonly lossPercentSum: number;
  readonly updatedAt: number;
}

interface IntelligenceSummaryBucket {
  readonly bucket: string;
  readonly consent: IntelligenceConsent;
  readonly originHost: string | null;
  readonly count: number;
  readonly sampleCount: number;
  readonly p50Avg: number;
  readonly p95Avg: number;
  readonly lossPercentAvg: number;
  readonly updatedAt: number;
}

const PRIVATE_FIELD_KEYS = new Set([
  'url',
  'endpointurl',
  'wifi',
  'ssid',
  'bssid',
  'history',
  'localstorage',
  'indexeddb',
]);
const MAX_SAMPLE_COUNT = 10_000;
const MAX_LATENCY_MS = 600_000;
const INTELLIGENCE_KEY_PREFIX = 'intelligence:v1:';

function json(status: number, payload: unknown, extraHeaders: HeadersInit = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extraHeaders,
    },
  });
}

function hasPrivateField(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasPrivateField(item));
  for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE_FIELD_KEYS.has(key.toLowerCase())) return true;
    if (hasPrivateField(nested)) return true;
  }
  return false;
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === '0.0.0.0') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h) || /^0\./.test(h)) return true;
  const stripped = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (stripped === '::1' || stripped === '::' || stripped === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(stripped)) return true;
  return /^fe[89ab][0-9a-f]:/.test(stripped);
}

function isIpLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.includes(':');
}

function isPublicNamedHost(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 253
    && !value.includes('/')
    && !isPrivateHost(value)
    && !isIpLiteral(value);
}

function parseAggregate(value: string | null, fallback: IntelligenceAggregate): IntelligenceAggregate {
  if (value === null) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<IntelligenceAggregate>;
    return {
      ...fallback,
      count: finiteNumber(parsed.count, 0, Number.MAX_SAFE_INTEGER) ? parsed.count : fallback.count,
      sampleCount: finiteNumber(parsed.sampleCount, 0, Number.MAX_SAFE_INTEGER) ? parsed.sampleCount : fallback.sampleCount,
      p50Sum: finiteNumber(parsed.p50Sum, 0, Number.MAX_SAFE_INTEGER) ? parsed.p50Sum : fallback.p50Sum,
      p95Sum: finiteNumber(parsed.p95Sum, 0, Number.MAX_SAFE_INTEGER) ? parsed.p95Sum : fallback.p95Sum,
      lossPercentSum: finiteNumber(parsed.lossPercentSum, 0, Number.MAX_SAFE_INTEGER) ? parsed.lossPercentSum : fallback.lossPercentSum,
    };
  } catch {
    return fallback;
  }
}

function bucketDay(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 10);
}

function aggregateKey(payload: ValidIntelligencePayload): string {
  const hostKey = payload.originHost === null ? 'anonymous' : `host:${payload.originHost}`;
  return `intelligence:v1:${bucketDay(payload.createdAt)}:${payload.consent}:${hostKey}`;
}

function summaryBucketFromAggregate(value: string | null): IntelligenceSummaryBucket | null {
  if (value === null) return null;
  let record: Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    record = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (record.v !== 1) return null;
  if (record.consent !== 'anonymous-aggregate' && record.consent !== 'named-public-endpoint') return null;
  if (typeof record.bucket !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.bucket)) return null;
  if (!finiteNumber(record.count, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (!finiteNumber(record.sampleCount, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (!finiteNumber(record.p50Sum, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!finiteNumber(record.p95Sum, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!finiteNumber(record.lossPercentSum, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!finiteNumber(record.updatedAt, 0, Number.MAX_SAFE_INTEGER)) return null;

  let originHost: string | null = null;
  if (record.consent === 'named-public-endpoint') {
    if (!isPublicNamedHost(record.originHost)) return null;
    originHost = record.originHost;
  } else if (record.originHost !== null) {
    return null;
  }

  return {
    bucket: record.bucket,
    consent: record.consent,
    originHost,
    count: record.count,
    sampleCount: record.sampleCount,
    p50Avg: Math.round(record.p50Sum / record.count),
    p95Avg: Math.round(record.p95Sum / record.count),
    lossPercentAvg: Number((record.lossPercentSum / record.count).toFixed(2)),
    updatedAt: record.updatedAt,
  };
}

async function recordAggregate(
  store: IntelligenceStore,
  payload: ValidIntelligencePayload,
  updatedAt: number,
): Promise<void> {
  const key = aggregateKey(payload);
  const fallback: IntelligenceAggregate = {
    v: 1,
    bucket: bucketDay(payload.createdAt),
    consent: payload.consent,
    originHost: payload.originHost,
    count: 0,
    sampleCount: 0,
    p50Sum: 0,
    p95Sum: 0,
    lossPercentSum: 0,
    updatedAt,
  };
  const current = parseAggregate(await store.get(key), fallback);
  await store.put(key, JSON.stringify({
    ...fallback,
    count: current.count + 1,
    sampleCount: current.sampleCount + payload.sampleCount,
    p50Sum: current.p50Sum + payload.p50,
    p95Sum: current.p95Sum + payload.p95,
    lossPercentSum: Number((current.lossPercentSum + payload.lossPercent).toFixed(2)),
    updatedAt,
  } satisfies IntelligenceAggregate));
}

export function validateIntelligencePayload(
  value: unknown,
): { readonly ok: true; readonly payload: ValidIntelligencePayload } | { readonly ok: false; readonly error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'Invalid payload.' };
  const record = value as Record<string, unknown>;
  if (hasPrivateField(record)) return { ok: false, error: 'Payload contains private fields.' };
  if (record.v !== 1) return { ok: false, error: 'Invalid version.' };
  if (record.consent !== 'anonymous-aggregate' && record.consent !== 'named-public-endpoint') {
    return { ok: false, error: 'Consent is required.' };
  }
  if (!finiteNumber(record.sampleCount, 1, MAX_SAMPLE_COUNT) || !Number.isInteger(record.sampleCount)) {
    return { ok: false, error: 'Invalid sample count.' };
  }
  if (!finiteNumber(record.p50, 0, MAX_LATENCY_MS) || !finiteNumber(record.p95, 0, MAX_LATENCY_MS)) {
    return { ok: false, error: 'Invalid timing values.' };
  }
  if (!finiteNumber(record.lossPercent, 0, 100)) {
    return { ok: false, error: 'Invalid loss value.' };
  }
  if (!finiteNumber(record.createdAt, 0, Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: 'Invalid timestamp.' };
  }
  if (record.publicOriginHash !== null) {
    return { ok: false, error: 'Origin hash is not supported yet.' };
  }
  let originHost: string | null = null;
  if (record.consent === 'anonymous-aggregate') {
    if (record.originHost !== null) return { ok: false, error: 'Anonymous payload cannot include a named endpoint.' };
  } else {
    if (!isPublicNamedHost(record.originHost)) return { ok: false, error: 'Named endpoint must be a public hostname.' };
    originHost = record.originHost;
  }
  return {
    ok: true,
    payload: {
      v: 1,
      consent: record.consent,
      originHost,
      publicOriginHash: null,
      p50: record.p50,
      p95: record.p95,
      lossPercent: record.lossPercent,
      sampleCount: record.sampleCount,
      createdAt: record.createdAt,
    },
  };
}

export async function handleIntelligenceIngest(
  request: Request,
  options: IntelligenceIngestOptions = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, null);
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST, OPTIONS' });
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return json(400, { ok: false, error: 'Expected application/json.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON.' });
  }

  const validated = validateIntelligencePayload(body);
  if (!validated.ok) return json(400, { ok: false, error: validated.error });
  if (!options.store) return json(503, { ok: false, error: 'Intelligence storage is not configured.' });

  await recordAggregate(options.store, validated.payload, options.now?.() ?? Date.now());
  return json(202, { ok: true, accepted: true });
}

export async function handleIntelligenceSummary(
  request: Request,
  options: IntelligenceIngestOptions = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, null, { 'Access-Control-Allow-Methods': 'GET,OPTIONS' });
  if (request.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed.' }, {
    Allow: 'GET, OPTIONS',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  });
  if (!options.store?.list) {
    return json(200, {
      ok: true,
      buckets: [],
      unavailable: true,
      message: 'Aggregate context is not available yet.',
    }, {
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    });
  }

  const listed = await options.store.list({ prefix: INTELLIGENCE_KEY_PREFIX, limit: 50 });
  const buckets = (await Promise.all(
    listed.keys.map(async (key) => summaryBucketFromAggregate(await options.store?.get(key.name) ?? null)),
  ))
    .filter((bucket): bucket is IntelligenceSummaryBucket => bucket !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);

  return json(200, { ok: true, buckets }, {
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  });
}
