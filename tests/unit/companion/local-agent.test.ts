// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

interface AgentHistoryStore {
  record(entry: {
    id: string;
    targetHost: string;
    createdAt: number;
    summary: string;
    payload: unknown;
  }): void;
  list(limit?: number): unknown[];
  close(): void;
}

const agent = await import(pathToFileURL(path.resolve('companion/local-agent.mjs')).href) as {
  canonicalSignedRequest(input: {
    method: string;
    path: string;
    timestamp: string;
    nonce: string;
    body: string;
  }): string;
  signAgentRequest(secret: string, message: string): string;
  verifySignedRequest(input: {
    method: string;
    path: string;
    body: string;
    headers: Record<string, string | undefined>;
    secret: string;
    now: number;
    seenNonces?: Set<string>;
  }): { ok: boolean; reason?: string };
  redactWifiInfo(input: {
    ssid?: string;
    bssid?: string;
    rssi: number | null;
    noise: number | null;
  }, includePrivate?: boolean): {
    ssid?: string;
    bssid?: string;
    rssi: number | null;
    noise: number | null;
  };
  createHistoryStore(path: string): AgentHistoryStore;
  createServer(options?: {
    secret?: string;
    allowedOrigins?: Set<string>;
    history?: AgentHistoryStore;
  }): {
    server: import('node:http').Server;
    secret: string;
    history: AgentHistoryStore;
  };
};

describe('local companion agent helpers', () => {
  it('verifies HMAC signatures and rejects replayed nonces', () => {
    const body = '{"targetUrl":"https://example.com"}';
    const timestamp = '1765300000000';
    const nonce = 'nonce-1';
    const message = agent.canonicalSignedRequest({
      method: 'POST',
      path: '/v1/probe',
      timestamp,
      nonce,
      body,
    });
    const signature = agent.signAgentRequest('pairing-secret', message);
    const seenNonces = new Set<string>();

    expect(agent.verifySignedRequest({
      method: 'POST',
      path: '/v1/probe',
      body,
      headers: {
        'x-chronoscope-timestamp': timestamp,
        'x-chronoscope-nonce': nonce,
        'x-chronoscope-signature': signature,
      },
      secret: 'pairing-secret',
      now: 1765300000100,
      seenNonces,
    })).toEqual({ ok: true });

    expect(agent.verifySignedRequest({
      method: 'POST',
      path: '/v1/probe',
      body,
      headers: {
        'x-chronoscope-timestamp': timestamp,
        'x-chronoscope-nonce': nonce,
        'x-chronoscope-signature': signature,
      },
      secret: 'pairing-secret',
      now: 1765300000200,
      seenNonces,
    })).toMatchObject({ ok: false, reason: 'replay' });
  });

  it('redacts private WiFi identifiers by default', () => {
    expect(agent.redactWifiInfo({
      ssid: 'Home Network',
      bssid: 'aa:bb:cc:dd:ee:ff',
      rssi: -61,
      noise: -92,
    })).toEqual({
      ssid: 'redacted',
      bssid: 'redacted',
      rssi: -61,
      noise: -92,
    });
  });

  it('records probe summaries in SQLite history', () => {
    const path = ':memory:';
    const history = agent.createHistoryStore(path);

    history.record({
      id: 'probe-1',
      targetHost: 'example.com',
      createdAt: 1765300000000,
      summary: 'DNS and TLS completed',
      payload: { dns: { ok: true } },
    });

    expect(history.list(1)).toEqual([
      expect.objectContaining({
        id: 'probe-1',
        targetHost: 'example.com',
        summary: 'DNS and TLS completed',
      }),
    ]);
    history.close();
  });

  it('allows health checks unsigned but requires signatures for local history', async () => {
    const history = agent.createHistoryStore(':memory:');
    const { server } = agent.createServer({
      secret: 'pairing-secret',
      allowedOrigins: new Set(['http://localhost:5173']),
      history,
    });
    const baseUrl = await new Promise<string>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') reject(new Error('Unexpected server address.'));
        else resolve(`http://127.0.0.1:${address.port}`);
      });
    });

    try {
      const health = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(health.status).toBe(200);

      const unsignedHistory = await fetch(`${baseUrl}/v1/history`, {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(unsignedHistory.status).toBe(401);

      const timestamp = String(Date.now());
      const nonce = 'history-nonce';
      const signature = agent.signAgentRequest('pairing-secret', agent.canonicalSignedRequest({
        method: 'GET',
        path: '/v1/history',
        timestamp,
        nonce,
        body: '',
      }));
      const signedHistory = await fetch(`${baseUrl}/v1/history`, {
        headers: {
          Origin: 'http://localhost:5173',
          'X-Chronoscope-Timestamp': timestamp,
          'X-Chronoscope-Nonce': nonce,
          'X-Chronoscope-Signature': signature,
        },
      });
      expect(signedHistory.status).toBe(200);
      await expect(signedHistory.json()).resolves.toMatchObject({ ok: true, history: [] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      history.close();
    }
  });
});
