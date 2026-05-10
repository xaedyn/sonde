#!/usr/bin/env node
// companion/local-agent.cjs
// Optional Chronoscope localhost companion. Binds to loopback only and requires
// signed requests for diagnostics.

const nodeCrypto = require('node:crypto');
const dns = require('node:dns/promises');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const tls = require('node:tls');
const { DatabaseSync } = require('node:sqlite');

const VERSION = '0.1.0';
const PROTOCOL_VERSION = 1;
const DEFAULT_PORT = 47317;
const MAX_BODY_BYTES = 64 * 1024;
const SIGNATURE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://chronoscope.dev',
  'https://chronoscope.pages.dev',
];

function json(response, status, payload, origin = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Chronoscope-Timestamp,X-Chronoscope-Nonce,X-Chronoscope-Signature',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function canonicalSignedRequest(input) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.body,
  ].join('\n');
}

function signAgentRequest(secret, message) {
  return nodeCrypto.createHmac('sha256', secret).update(message).digest('hex');
}

function timingSafeEqualHex(a, b) {
  if (
    !/^[0-9a-f]+$/i.test(a) ||
    !/^[0-9a-f]+$/i.test(b) ||
    a.length % 2 !== 0 ||
    b.length % 2 !== 0
  ) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && nodeCrypto.timingSafeEqual(left, right);
}

function verifySignedRequest(input) {
  const timestamp = input.headers['x-chronoscope-timestamp'];
  const nonce = input.headers['x-chronoscope-nonce'];
  const signature = input.headers['x-chronoscope-signature'];
  if (!timestamp || !nonce || !signature) return { ok: false, reason: 'missing-signature' };

  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt) || Math.abs(input.now - issuedAt) > SIGNATURE_TTL_MS) {
    return { ok: false, reason: 'stale-signature' };
  }
  if (input.seenNonces?.has(nonce)) return { ok: false, reason: 'replay' };

  const expected = signAgentRequest(input.secret, canonicalSignedRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  }));
  if (!timingSafeEqualHex(expected, signature)) return { ok: false, reason: 'bad-signature' };
  input.seenNonces?.add(nonce);
  return { ok: true };
}

function cleanExpiredNonces(seenNonces) {
  if (seenNonces.size < 2000) return;
  seenNonces.clear();
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function targetHostFromUrl(raw) {
  const parsed = new URL(String(raw));
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Target URL must be http or https.');
  }
  return {
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
    protocol: parsed.protocol,
  };
}

function timeoutPromise(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
}

async function timed(label, fn) {
  const startedAt = Date.now();
  try {
    const value = await Promise.race([fn(), timeoutPromise(7000, label)]);
    return { ok: true, durationMs: Date.now() - startedAt, value };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function dnsTrace(hostname) {
  return timed('DNS trace', async () => {
    const [lookup, a, aaaa, cname] = await Promise.allSettled([
      dns.lookup(hostname, { all: true }),
      dns.resolve4(hostname),
      dns.resolve6(hostname),
      dns.resolveCname(hostname),
    ]);
    const settled = (result) => result.status === 'fulfilled' ? result.value : [];
    return {
      lookup: settled(lookup),
      a: settled(a).slice(0, 8),
      aaaa: settled(aaaa).slice(0, 8),
      cname: settled(cname).slice(0, 8),
    };
  });
}

function tlsCheck(hostname, port) {
  return timed('TLS check', () => new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      timeout: 7000,
    }, () => {
      const cert = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      const result = {
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ?? null,
        protocol: socket.getProtocol(),
        cipher: cipher?.standardName ?? cipher?.name ?? null,
        validFrom: cert.valid_from ?? null,
        validTo: cert.valid_to ?? null,
        subject: cert.subject?.CN ?? null,
        issuer: cert.issuer?.CN ?? null,
        fingerprint256: cert.fingerprint256 ?? null,
      };
      socket.end();
      resolve(result);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TLS socket timed out.'));
    });
    socket.on('error', reject);
  }));
}

function commandExists(command) {
  const paths = (process.env.PATH ?? '').split(path.delimiter);
  return paths.some((dir) => {
    try {
      return fs.existsSync(path.join(dir, command));
    } catch {
      return false;
    }
  });
}

function runCommand(command, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: '', stderr: error.message });
    });
  });
}

function parseRouteOutput(output) {
  return output.split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+/.test(line))
    .slice(0, 32)
    .map((line) => ({ raw: line.replace(/\s+/g, ' ') }));
}

async function routeTrace(hostname) {
  if (commandExists('mtr')) {
    const result = await runCommand('mtr', ['--report', '--report-cycles', '3', '--no-dns', hostname], 15000);
    if (result.code === 0) {
      return { ok: true, tool: 'mtr', hops: parseRouteOutput(result.stdout), stderr: result.stderr };
    }
  }
  if (process.platform === 'win32') {
    const result = await runCommand('tracert', ['-d', '-h', '16', hostname]);
    return { ok: result.code === 0, tool: 'tracert', hops: parseRouteOutput(result.stdout), stderr: result.stderr };
  }
  if (!commandExists('traceroute')) {
    return { ok: false, tool: 'traceroute', unavailable: true, reason: 'traceroute command not found' };
  }
  const result = await runCommand('traceroute', ['-n', '-m', '16', hostname]);
  return { ok: result.code === 0, tool: 'traceroute', hops: parseRouteOutput(result.stdout), stderr: result.stderr };
}

function redactWifiInfo(input, includePrivate = false) {
  return {
    ssid: includePrivate && input.ssid ? input.ssid : input.ssid ? 'redacted' : undefined,
    bssid: includePrivate && input.bssid ? input.bssid : input.bssid ? 'redacted' : undefined,
    rssi: input.rssi,
    noise: input.noise,
  };
}

function parseAirportInfo(output) {
  const lines = Object.fromEntries(output.split('\n').map((line) => {
    const index = line.indexOf(':');
    if (index < 0) return ['', ''];
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }).filter(([key]) => key));
  return {
    ssid: lines.SSID,
    bssid: lines.BSSID,
    rssi: lines.agrCtlRSSI ? Number(lines.agrCtlRSSI) : null,
    noise: lines.agrCtlNoise ? Number(lines.agrCtlNoise) : null,
  };
}

async function wifiSignal(includePrivate) {
  if (process.platform !== 'darwin') {
    return { ok: false, unavailable: true, reason: 'WiFi signal is currently implemented for macOS only.' };
  }
  const airport = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
  if (!fs.existsSync(airport)) {
    return { ok: false, unavailable: true, reason: 'macOS airport utility not found.' };
  }
  const result = await runCommand(airport, ['-I'], 4000);
  if (result.code !== 0) return { ok: false, stderr: result.stderr };
  return { ok: true, ...redactWifiInfo(parseAirportInfo(result.stdout), includePrivate) };
}

function createHistoryStore(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS probes (
      id TEXT PRIMARY KEY,
      target_host TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      summary TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_probes_created_at ON probes(created_at DESC);
  `);
  const insert = db.prepare('INSERT OR REPLACE INTO probes (id, target_host, created_at, summary, payload) VALUES (?, ?, ?, ?, ?)');
  const listStatement = db.prepare('SELECT id, target_host AS targetHost, created_at AS createdAt, summary, payload FROM probes ORDER BY created_at DESC LIMIT ?');

  function parseStoredPayload(row) {
    try {
      return JSON.parse(row.payload);
    } catch {
      console.warn(`[Chronoscope companion] Ignoring corrupted history payload for ${row.id}`);
      return null;
    }
  }

  return {
    record(entry) {
      insert.run(entry.id, entry.targetHost, entry.createdAt, entry.summary, JSON.stringify(entry.payload));
    },
    list(limit = 20) {
      return listStatement.all(limit).map((row) => ({
        ...row,
        payload: parseStoredPayload(row),
      }));
    },
    close() {
      db.close();
    },
  };
}

function defaultHistoryPath() {
  const dir = path.join(os.homedir(), '.chronoscope');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'agent-history.sqlite');
}

function writePairingToken(secret) {
  const dir = path.join(os.homedir(), '.chronoscope');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tokenPath = path.join(dir, 'agent-token.txt');
  fs.writeFileSync(tokenPath, `${secret}\n`, { mode: 0o600 });
  return tokenPath;
}

function capabilitySnapshot() {
  return {
    dns: true,
    tls: true,
    route: process.platform === 'win32' || commandExists('mtr') || commandExists('traceroute'),
    wifi: process.platform === 'darwin',
    sqliteHistory: true,
  };
}

function summarizeProbe(results) {
  const ok = Object.entries(results)
    .filter(([, value]) => typeof value === 'object' && value !== null && value.ok === true)
    .map(([key]) => key.toUpperCase());
  const failed = Object.entries(results)
    .filter(([, value]) => typeof value === 'object' && value !== null && value.ok === false)
    .map(([key]) => key.toUpperCase());
  if (failed.length === 0) return `${ok.join(', ')} completed.`;
  return `${ok.join(', ') || 'No probes'} completed; ${failed.join(', ')} unavailable or failed.`;
}

async function runProbe(payload) {
  const target = targetHostFromUrl(payload.targetUrl);
  const requested = new Set(payload.probes ?? ['dns', 'tls', 'route', 'wifi']);
  const results = {};
  if (requested.has('dns')) results.dns = await dnsTrace(target.hostname);
  if (requested.has('tls') && target.protocol === 'https:') results.tls = await tlsCheck(target.hostname, target.port);
  if (requested.has('route')) results.route = await routeTrace(target.hostname);
  if (requested.has('wifi')) results.wifi = await wifiSignal(Boolean(payload.includePrivateWifi));
  const createdAt = Date.now();
  return {
    ok: true,
    id: `probe_${createdAt}_${nodeCrypto.randomBytes(4).toString('hex')}`,
    targetHost: target.hostname,
    createdAt,
    summary: summarizeProbe(results),
    results,
  };
}

function parseAllowedOrigins() {
  return new Set((process.env.CHRONOSCOPE_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean));
}

function createServer(options = {}) {
  const secret = options.secret ?? process.env.CHRONOSCOPE_AGENT_SECRET ?? nodeCrypto.randomBytes(24).toString('base64url');
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins();
  const seenNonces = new Set();
  const history = options.history ?? createHistoryStore(options.historyPath ?? process.env.CHRONOSCOPE_AGENT_DB ?? defaultHistoryPath());

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowedOrigin = isOriginAllowed(origin, allowedOrigins) ? origin : null;
    if (origin && !allowedOrigin) {
      json(response, 403, { error: 'Origin is not allowed.' });
      return;
    }
    if (request.method === 'OPTIONS') {
      json(response, 204, {}, allowedOrigin);
      return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, {
          ok: true,
          version: VERSION,
          protocolVersion: PROTOCOL_VERSION,
          capabilities: capabilitySnapshot(),
        }, allowedOrigin);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/history') {
        cleanExpiredNonces(seenNonces);
        const verified = verifySignedRequest({
          method: request.method,
          path: url.pathname,
          body: '',
          headers: request.headers,
          secret,
          now: Date.now(),
          seenNonces,
        });
        if (!verified.ok) {
          json(response, 401, { error: `Signed request rejected: ${verified.reason}` }, allowedOrigin);
          return;
        }
        json(response, 200, { ok: true, history: history.list(20) }, allowedOrigin);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/probe') {
        const body = await readBody(request);
        cleanExpiredNonces(seenNonces);
        const verified = verifySignedRequest({
          method: request.method,
          path: url.pathname,
          body,
          headers: request.headers,
          secret,
          now: Date.now(),
          seenNonces,
        });
        if (!verified.ok) {
          json(response, 401, { error: `Signed request rejected: ${verified.reason}` }, allowedOrigin);
          return;
        }
        const probe = await runProbe(JSON.parse(body));
        history.record({
          id: probe.id,
          targetHost: probe.targetHost,
          createdAt: probe.createdAt,
          summary: probe.summary,
          payload: probe,
        });
        json(response, 200, probe, allowedOrigin);
        return;
      }

      json(response, 404, { error: 'Not found.' }, allowedOrigin);
    } catch {
      json(response, 500, { error: 'Internal companion error.' }, allowedOrigin);
    }
  });

  return { server, secret, history };
}

function main() {
  const port = Number(process.env.CHRONOSCOPE_AGENT_PORT ?? DEFAULT_PORT);
  const { server, secret } = createServer();
  server.listen(port, '127.0.0.1', () => {
    const tokenPath = writePairingToken(secret);
    process.stdout.write(`Chronoscope local companion listening on http://127.0.0.1:${port}\n`);
    process.stdout.write(`Pairing token written to ${tokenPath}\n`);
    process.stdout.write('Keep this file private; paste its token into Chronoscope Settings to enable signed probes.\n');
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  canonicalSignedRequest,
  signAgentRequest,
  verifySignedRequest,
  redactWifiInfo,
  createHistoryStore,
  createServer,
};
