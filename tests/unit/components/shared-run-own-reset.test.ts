import { fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Topbar from '../../../src/lib/components/Topbar.svelte';
import SharedResultsBanner from '../../../src/lib/components/SharedResultsBanner.svelte';
import ReportView from '../../../src/lib/components/ReportView.svelte';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { uiStore } from '../../../src/lib/stores/ui';

vi.mock('$lib/stores/history', () => ({
  historyStore: {
    subscribe(run: (state: { sessions: readonly unknown[] }) => void): () => void {
      run({ sessions: [] });
      return () => {};
    },
  },
}));

vi.mock('$lib/stores/remote-vantage', () => ({
  remoteVantageStore: {
    subscribe(run: (state: { lastProbe: null }) => void): () => void {
      run({ lastProbe: null });
      return () => {};
    },
    createHostedReport: vi.fn<() => Promise<null>>().mockResolvedValue(null),
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
});
