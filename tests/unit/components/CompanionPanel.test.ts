import { render, fireEvent } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanionPanel from '../../../src/lib/components/CompanionPanel.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { uiStore } from '../../../src/lib/stores/ui';
import type { CompanionState, CompanionStore } from '../../../src/lib/stores/companion';

function createFakeCompanionStore(): CompanionStore {
  const state = writable<CompanionState>({
    baseUrl: 'http://127.0.0.1:47317',
    hasSecret: false,
    status: 'idle',
    version: null,
    capabilities: null,
    lastProbe: null,
    history: [],
    error: null,
  });

  return {
    subscribe: state.subscribe,
    configure: vi.fn(),
    checkHealth: vi.fn(async () => {
      state.update((current) => ({
        ...current,
        status: 'connected',
        version: '0.1.0',
        capabilities: {
          dns: true,
          tls: true,
          route: true,
          wifi: false,
          sqliteHistory: true,
        },
      }));
      return true;
    }),
    runProbe: vi.fn(async () => {
      const probe = {
        ok: true,
        id: 'probe-1',
        targetHost: 'b.example.com',
        createdAt: 1765300000000,
        summary: 'DNS completed.',
        results: { dns: { ok: true } },
      };
      state.update((current) => ({ ...current, status: 'connected', lastProbe: probe }));
      return probe;
    }),
    loadHistory: vi.fn(async () => []),
    clearSecret: vi.fn(),
  };
}

beforeEach(() => {
  endpointStore.setEndpoints([
    { id: 'ep-a', url: 'https://a.example.com', enabled: true, label: 'A', color: 'red' },
    { id: 'ep-b', url: 'https://b.example.com', enabled: true, label: 'B', color: 'blue' },
  ]);
  uiStore.reset();
  uiStore.setFocusedEndpoint('ep-b');
});

describe('CompanionPanel', () => {
  it('checks local companion health with the configured loopback URL', async () => {
    const store = createFakeCompanionStore();
    const { getByLabelText, getByRole, findByText } = render(CompanionPanel, { props: { agentStore: store } });

    await fireEvent.input(getByLabelText('Agent URL'), {
      target: { value: 'http://localhost:47317' },
    });
    await fireEvent.input(getByLabelText('Pairing token'), {
      target: { value: 'pairing-secret' },
    });
    await fireEvent.click(getByRole('button', { name: /check agent/i }));

    expect(store.configure).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:47317',
      secret: 'pairing-secret',
    });
    expect(store.checkHealth).toHaveBeenCalledTimes(1);
    expect(await findByText('Connected')).toBeTruthy();
  });

  it('runs a signed probe against the focused endpoint with selected probe types', async () => {
    const store = createFakeCompanionStore();
    const { getByLabelText, getByRole, findByText } = render(CompanionPanel, { props: { agentStore: store } });

    expect((getByLabelText('Probe URL') as HTMLInputElement).value).toBe('https://b.example.com');
    const routeToggle = getByLabelText('Route/MTR') as HTMLInputElement;
    expect(routeToggle.checked).toBe(true);
    await fireEvent.click(routeToggle);
    expect(routeToggle.checked).toBe(false);
    await fireEvent.click(getByRole('button', { name: /run local probe/i }));

    expect(store.runProbe).toHaveBeenCalledWith('https://b.example.com', {
      probes: ['dns', 'tls', 'wifi'],
      includePrivateWifi: false,
    });
    expect(await findByText('DNS completed.')).toBeTruthy();
  });
});
