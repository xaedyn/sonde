import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import App from '../../../src/lib/components/App.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';
import type { Endpoint, PersistedSettings } from '../../../src/lib/types';

interface OrderedMock {
  readonly mock: {
    readonly invocationCallOrder: readonly number[];
  };
}

const mocks = vi.hoisted(() => ({
  engineStart: vi.fn(),
  engineStop: vi.fn(),
  initHashRouter: vi.fn<() => 'config' | 'results' | null>(),
  initHostedReportRouter: vi.fn<() => Promise<'config' | 'results' | null>>(),
  loadPersistedSettings: vi.fn<() => PersistedSettings | null>(),
  saveSettings: vi.fn(),
  historyHydrate: vi.fn<() => Promise<readonly unknown[]>>(),
  historyRecordSession: vi.fn<() => Promise<unknown | null>>(),
  historyUnsubscribe: vi.fn(),
  shortcutCleanup: vi.fn(),
  initShortcuts: vi.fn<() => () => void>(),
}));

vi.mock('$lib/engine/measurement-engine', () => {
  class MockMeasurementEngine {
    start = mocks.engineStart;
    stop = mocks.engineStop;
  }

  return {
    MeasurementEngine: vi.fn(MockMeasurementEngine),
  };
});

vi.mock('$lib/share/hash-router', () => ({
  initHashRouter: mocks.initHashRouter,
  initHostedReportRouter: mocks.initHostedReportRouter,
}));

vi.mock('$lib/utils/persistence', () => ({
  CURRENT_VERSION: 11,
  loadPersistedSettings: mocks.loadPersistedSettings,
  saveSettings: mocks.saveSettings,
}));

vi.mock('$lib/utils/shortcuts', () => ({
  initShortcuts: mocks.initShortcuts,
}));

vi.mock('$lib/stores/history', () => ({
  historyStore: {
    subscribe(run: (state: {
      sessions: readonly unknown[];
      hydrated: boolean;
      saving: boolean;
      error: string | null;
    }) => void): () => void {
      run({ sessions: [], hydrated: true, saving: false, error: null });
      return mocks.historyUnsubscribe;
    },
    hydrate: mocks.historyHydrate,
    recordSession: mocks.historyRecordSession,
    clear: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  },
}));

function publicEndpoint(id = 'ep-1', enabled = true): Endpoint {
  return {
    id,
    url: `https://${id}.example.com`,
    enabled,
    label: id,
    color: '#67e8f9',
  };
}

function persistedSettings(endpoints: PersistedSettings['endpoints']): PersistedSettings {
  return {
    version: 11,
    endpoints,
    settings: { ...DEFAULT_SETTINGS },
    ui: {
      expandedCards: [],
      activeView: 'overview',
      focusedEndpointId: null,
      liveOptions: { split: false, timeRange: '5m' },
      terminalFilters: [],
    },
  };
}

function firstCallOrder(mock: OrderedMock): number {
  const order = mock.mock.invocationCallOrder[0];
  expect(order).toBeDefined();
  return order ?? Number.POSITIVE_INFINITY;
}

function expectCalledBefore(first: OrderedMock, second: OrderedMock): void {
  expect(firstCallOrder(first)).toBeLessThan(firstCallOrder(second));
}

async function renderAndWaitForBootstrap(): Promise<void> {
  render(App);
  await waitFor(() => {
    expect(mocks.initShortcuts).toHaveBeenCalledTimes(1);
  });
}

describe('App auto-start bootstrap', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    endpointStore.reset();
    settingsStore.reset();
    measurementStore.reset();
    uiStore.reset();
    mocks.initHashRouter.mockReturnValue(null);
    mocks.initHostedReportRouter.mockResolvedValue(null);
    mocks.loadPersistedSettings.mockReturnValue(null);
    mocks.historyHydrate.mockResolvedValue([]);
    mocks.historyRecordSession.mockResolvedValue(null);
    mocks.initShortcuts.mockReturnValue(mocks.shortcutCleanup);
  });

  afterEach(() => {
    cleanup();
  });

  it('starts normal public sessions after share and persistence initialization', async () => {
    await renderAndWaitForBootstrap();

    expectCalledBefore(mocks.initHashRouter, mocks.loadPersistedSettings);
    expectCalledBefore(mocks.loadPersistedSettings, mocks.engineStart);
    expect(mocks.engineStart).toHaveBeenCalledTimes(1);
    expect(get(uiStore).autoStartSuppressionReason).toBeNull();
  });

  it('suppresses auto-start when a config share is pending', async () => {
    mocks.initHashRouter.mockImplementation(() => {
      uiStore.setPendingShare({
        mode: 'config',
        endpoints: [{ url: 'https://shared.example.com', enabled: true }],
      });
      return 'config';
    });

    await renderAndWaitForBootstrap();

    expectCalledBefore(mocks.initHashRouter, mocks.loadPersistedSettings);
    expect(mocks.engineStart).not.toHaveBeenCalled();
    expect(get(uiStore).autoStartSuppressionReason).toBe('pending-share');
  });

  it('suppresses auto-start for shared report results', async () => {
    mocks.initHashRouter.mockImplementation(() => {
      endpointStore.setEndpoints([publicEndpoint('shared')]);
      uiStore.setSharedView(true);
      uiStore.setSharedReportMode(true);
      return 'results';
    });

    await renderAndWaitForBootstrap();

    expect(mocks.loadPersistedSettings).not.toHaveBeenCalled();
    expect(mocks.engineStart).not.toHaveBeenCalled();
    expect(get(uiStore).autoStartSuppressionReason).toBe('shared-report');
  });

  it('suppresses auto-start after persisted endpoints hydrate as all disabled', async () => {
    mocks.loadPersistedSettings.mockReturnValue(
      persistedSettings([{ url: 'https://disabled.example.com', enabled: false }]),
    );

    await renderAndWaitForBootstrap();

    expect(mocks.loadPersistedSettings).toHaveBeenCalledTimes(1);
    expect(mocks.engineStart).not.toHaveBeenCalled();
    expect(get(uiStore).autoStartSuppressionReason).toBe('no-enabled-endpoints');
  });
});
