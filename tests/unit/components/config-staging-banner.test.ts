import { fireEvent, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import ConfigStagingBanner from '../../../src/lib/components/ConfigStagingBanner.svelte';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { uiStore } from '../../../src/lib/stores/ui';

function stageConfigShare(): void {
  uiStore.setPendingShare({
    mode: 'config',
    endpoints: [{ url: 'https://shared.example.com', enabled: true }],
  });
}

describe('ConfigStagingBanner', () => {
  beforeEach(() => {
    endpointStore.setEndpoints([]);
    measurementStore.reset();
    uiStore.reset();
    stageConfigShare();
  });

  it('disables Accept while measurement is running', async () => {
    endpointStore.setEndpoints([{
      id: 'current',
      url: 'https://current.example.com',
      enabled: true,
      label: 'Current',
      color: '#67e8f9',
    }]);
    measurementStore.setLifecycle('running');
    const { getByRole, getByText } = render(ConfigStagingBanner);

    const accept = getByRole('button', { name: /accept/i });
    expect(accept).toHaveProperty('disabled', true);
    expect(accept.getAttribute('title')).toBe('Stop measuring before accepting shared endpoints.');
    expect(getByText(/stop measuring before accepting shared endpoints/i)).toBeTruthy();

    await fireEvent.click(accept);

    expect(get(endpointStore).map((ep) => ep.url)).toEqual(['https://current.example.com']);
    expect(get(uiStore).pendingShare).not.toBeNull();
  });

  it('enables Accept when measurement is idle', async () => {
    const { getByRole } = render(ConfigStagingBanner);

    const accept = getByRole('button', { name: /accept/i });
    expect(accept).toHaveProperty('disabled', false);

    await fireEvent.click(accept);

    expect(get(endpointStore).map((ep) => ep.url)).toEqual(['https://shared.example.com']);
    expect(get(uiStore).pendingShare).toBeNull();
  });
});
