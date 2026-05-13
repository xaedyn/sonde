import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IntelligencePanel from '../../../src/lib/components/IntelligencePanel.svelte';

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('IntelligencePanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the proof boundary before loading aggregate context', () => {
    const { getByText, getByRole } = render(IntelligencePanel);

    expect(getByText(/population-level context from consented reports/i)).toBeTruthy();
    expect(getByText(/does not prove what is happening on your path/i)).toBeTruthy();
    expect(getByRole('button', { name: /check context/i })).toBeTruthy();
  });

  it('loads and renders privacy-safe aggregate buckets', async () => {
    const fetcher = stubFetch(new Response(JSON.stringify({
      ok: true,
      buckets: [{
        bucket: '2026-05-13',
        consent: 'named-public-endpoint',
        originHost: 'api.example.com',
        count: 2,
        sampleCount: 70,
        p50Avg: 45,
        p95Avg: 85,
        lossPercentAvg: 0.75,
        updatedAt: 1778352060000,
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const { container, getByRole, getByText } = render(IntelligencePanel);

    await fireEvent.click(getByRole('button', { name: /check context/i }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith('/api/intelligence/summary', expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      }));
      expect(getByText('api.example.com')).toBeTruthy();
      expect(getByText(/2 reports \/ 70 samples/i)).toBeTruthy();
      expect(getByText(/avg P50 45 ms \/ avg P95 85 ms \/ avg loss 0.75%/i)).toBeTruthy();
    });
    expect(container.textContent).not.toMatch(/https?:\/\//);
    expect(container.textContent).not.toMatch(/ssid|bssid|history/i);
  });

  it('treats missing storage as unavailable rather than an alarming diagnosis', async () => {
    stubFetch(new Response(JSON.stringify({
      ok: false,
      error: 'Intelligence summary storage is not configured.',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));
    const { getByRole, getByText } = render(IntelligencePanel);

    await fireEvent.click(getByRole('button', { name: /check context/i }));

    await waitFor(() => {
      expect(getByText(/aggregate context is not available yet/i)).toBeTruthy();
    });
  });
});
