import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Lane from '../../../src/lib/components/Lane.svelte';

describe('Lane', () => {
  const props = {
    endpointId: 'ep-test-1',
    color: '#67e8f9',
    url: 'www.google.com',
    p50: 38,
    p95: 52,
    p99: 98,
    jitter: 4.2,
    lossPercent: 0,
    ready: true,
  };

  it('renders endpoint URL', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('www.google.com')).toBeTruthy();
  });

  it('renders hero P50 value', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('38')).toBeTruthy();
  });

  it('renders P50 Median Latency label', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText(/P50 Median Latency/i)).toBeTruthy();
  });
});
