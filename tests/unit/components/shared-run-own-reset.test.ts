import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Topbar from '../../../src/lib/components/Topbar.svelte';
import SharedResultsBanner from '../../../src/lib/components/SharedResultsBanner.svelte';
import ReportView from '../../../src/lib/components/ReportView.svelte';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { uiStore } from '../../../src/lib/stores/ui';

const mocks = vi.hoisted(() => ({
  historyUnsubscribe: vi.fn(),
  remoteUnsubscribe: vi.fn(),
  createHostedReport: vi.fn<() => Promise<null>>().mockResolvedValue(null),
}));

vi.mock('$lib/stores/history', () => ({
  historyStore: {
    subscribe(run: (state: { sessions: readonly unknown[] }) => void): () => void {
      run({ sessions: [] });
      return mocks.historyUnsubscribe;
    },
  },
}));

vi.mock('$lib/stores/remote-vantage', () => ({
  remoteVantageStore: {
    subscribe(run: (state: { lastProbe: null }) => void): () => void {
      run({ lastProbe: null });
      return mocks.remoteUnsubscribe;
    },
    createHostedReport: mocks.createHostedReport,
  },
}));

function seedSharedSuppression(): void {
  uiStore.reset();
  measurementStore.reset();
  uiStore.setSharedView(true);
  uiStore.setSharedReportMode(true);
  uiStore.setAutoStartSuppressionReason('shared-report');
}

describe('shared run-own reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedSharedSuppression();
  });

  it('Topbar Run Your Own Test clears stale auto-start suppression', async () => {
    const { getByRole } = render(Topbar, { props: {} });

    await fireEvent.click(getByRole('button', { name: /run your own test/i }));

    expect(get(uiStore).isSharedView).toBe(false);
    expect(get(uiStore).autoStartSuppressionReason).toBeNull();
  });

  it('SharedResultsBanner Run Your Own Test clears stale auto-start suppression', async () => {
    const { getByRole } = render(SharedResultsBanner);

    await fireEvent.click(getByRole('button', { name: /run your own test/i }));

    expect(get(uiStore).isSharedView).toBe(false);
    expect(get(uiStore).autoStartSuppressionReason).toBeNull();
  });

  it('ReportView Run Your Own Test clears stale auto-start suppression', async () => {
    const { getByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /run your own test/i }));

    expect(get(uiStore).isSharedView).toBe(false);
    expect(get(uiStore).autoStartSuppressionReason).toBeNull();
  });

  it('ReportView Copy Summary handles clipboard rejection without claiming success', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { getByRole, queryByRole } = render(ReportView);

    await fireEvent.click(getByRole('button', { name: /copy summary/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(queryByRole('button', { name: /summary copied/i })).toBeNull();
    expect(getByRole('button', { name: /copy failed/i })).toBeTruthy();
  });
});
