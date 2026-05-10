import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createCompanionStore } from '../../../src/lib/stores/companion';

describe('companionStore', () => {
  it('checks local companion health through the injected client', async () => {
    const client = {
      checkHealth: vi.fn(() => Promise.resolve({
        ok: true,
        version: '0.1.0',
        protocolVersion: 1,
        capabilities: {
          dns: true,
          tls: true,
          route: false,
          wifi: false,
          sqliteHistory: true,
        },
      })),
      runProbe: vi.fn(),
      listHistory: vi.fn(),
    };
    const store = createCompanionStore(client);

    store.configure({ baseUrl: 'http://127.0.0.1:47317', secret: 'secret' });
    await store.checkHealth();

    expect(client.checkHealth).toHaveBeenCalledWith('http://127.0.0.1:47317');
    expect(get(store)).toMatchObject({
      status: 'connected',
      version: '0.1.0',
      capabilities: {
        dns: true,
        tls: true,
        route: false,
        wifi: false,
        sqliteHistory: true,
      },
    });
  });

  it('requires a pairing secret before running signed probes', async () => {
    const client = {
      checkHealth: vi.fn(),
      runProbe: vi.fn(),
      listHistory: vi.fn(),
    };
    const store = createCompanionStore(client);

    await expect(store.runProbe('https://example.com')).resolves.toBeNull();

    expect(client.runProbe).not.toHaveBeenCalled();
    expect(get(store).status).toBe('error');
    expect(get(store).error).toContain('pairing token');
  });

  it('falls back to the default loopback URL when the configured URL is blank', () => {
    const client = {
      checkHealth: vi.fn(),
      runProbe: vi.fn(),
      listHistory: vi.fn(),
    };
    const store = createCompanionStore(client);

    store.configure({ baseUrl: '   ', secret: 'secret' });

    expect(get(store).baseUrl).toBe('http://127.0.0.1:47317');
  });

  it('clears authenticated companion state when the token is forgotten', async () => {
    const client = {
      checkHealth: vi.fn(async () => ({
        ok: true,
        version: '0.1.0',
        protocolVersion: 1,
        capabilities: {
          dns: true,
          tls: true,
          route: true,
          wifi: true,
          sqliteHistory: true,
        },
      })),
      runProbe: vi.fn(async () => ({
        ok: true,
        id: 'probe-1',
        targetHost: 'example.com',
        createdAt: 1765300000000,
        summary: 'DNS completed.',
        results: { dns: { ok: true } },
      })),
      listHistory: vi.fn(async () => ({ ok: true, history: [] })),
    };
    const store = createCompanionStore(client);

    store.configure({ secret: 'secret' });
    await store.checkHealth();
    await store.runProbe('https://example.com', { probes: ['dns'] });
    store.clearSecret();

    expect(get(store)).toMatchObject({
      hasSecret: false,
      status: 'idle',
      version: null,
      capabilities: null,
      lastProbe: null,
      history: [],
      error: null,
    });
  });
});
