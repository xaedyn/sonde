import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SharePopover from '../../../src/lib/components/SharePopover.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import type { Endpoint, MeasurementSample, MeasurementState, SharePayload } from '../../../src/lib/types';

const mocks = vi.hoisted(() => ({
  remoteUnsubscribe: vi.fn(),
  createHostedReport: vi.fn<(payload: SharePayload) => Promise<string | null>>(),
}));

vi.mock('$lib/stores/remote-vantage', () => ({
  remoteVantageStore: {
    subscribe(run: (state: { lastProbe: null; hostedReportFallback: null; error: null }) => void): () => void {
      run({ lastProbe: null, hostedReportFallback: null, error: null });
      return mocks.remoteUnsubscribe;
    },
    createHostedReport: mocks.createHostedReport,
  },
}));

const endpoint: Endpoint = {
  id: 'api',
  url: 'https://api.example.com/health',
  enabled: true,
  label: 'API',
  color: '#67e8f9',
};

function samples(): MeasurementSample[] {
  return Array.from({ length: 4 }, (_, index) => ({
    round: index + 1,
    latency: 40 + index,
    status: 'ok' as const,
    timestamp: index + 1,
  }));
}

function seedResults(): void {
  const endpointSamples = samples();
  endpointStore.setEndpoints([endpoint]);
  measurementStore.loadSnapshot({
    lifecycle: 'completed',
    epoch: 1,
    roundCounter: endpointSamples.length,
    startedAt: null,
    stoppedAt: null,
    freezeEvents: [],
    errorCount: 0,
    timeoutCount: 0,
    endpoints: {
      api: {
        endpointId: 'api',
        tierLevel: 1,
        lastLatency: endpointSamples.at(-1)?.latency ?? null,
        lastStatus: 'ok',
        lastErrorMessage: null,
        samples: endpointSamples,
      },
    },
  } satisfies MeasurementState);
}

describe('SharePopover hosted support reports', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    endpointStore.setEndpoints([]);
    measurementStore.reset();
    settingsStore.reset();
    uiStore.reset();
    uiStore.toggleShare();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('creates and copies a hosted support report as the primary action', async () => {
    seedResults();
    mocks.createHostedReport.mockResolvedValue('https://chronoscope.dev/r/report_123');

    const { getByRole } = render(SharePopover);
    await fireEvent.click(getByRole('button', { name: /create support report/i }));

    await waitFor(() => {
      expect(mocks.createHostedReport).toHaveBeenCalledTimes(1);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://chronoscope.dev/r/report_123');
    });
    const payload = mocks.createHostedReport.mock.calls[0]?.[0];
    expect(payload?.mode).toBe('results');
    expect(payload?.results?.[0]?.samples).toHaveLength(4);
  });

  it('falls back to a compact results URL when hosted reports are unavailable', async () => {
    seedResults();
    mocks.createHostedReport.mockResolvedValue(null);

    const { getByRole, getByText } = render(SharePopover);
    await fireEvent.click(getByRole('button', { name: /create support report/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/#s='));
    });
    await waitFor(() => {
      expect(getByText(/hosted report was unavailable/i)).toBeTruthy();
    });
  });

  it('disables support reports until a run has samples', () => {
    endpointStore.setEndpoints([endpoint]);

    const { getByRole } = render(SharePopover);
    const button = getByRole('button', { name: /create support report/i });

    expect(button.hasAttribute('disabled')).toBe(true);
    expect(get(uiStore).showShare).toBe(true);
  });

  it('orders share actions as support report, snapshot link, then configuration link', () => {
    seedResults();

    const { container, getByRole, getByText, queryByText } = render(SharePopover);
    const text = container.textContent ?? '';

    expect(text.indexOf('Support report')).toBeLessThan(text.indexOf('Snapshot link'));
    expect(text.indexOf('Snapshot link')).toBeLessThan(text.indexOf('Configuration link'));
    expect(getByRole('button', { name: /copy snapshot link/i })).toBeTruthy();
    expect(getByText(/measured results/i)).toBeTruthy();
    expect(queryByText(/compact results url/i)).toBeNull();
  });
});
