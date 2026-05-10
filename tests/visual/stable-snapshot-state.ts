import { expect, type Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../src/lib/types';
import { CURRENT_VERSION } from '../../src/lib/utils/persistence';

const STORAGE_KEY = 'chronoscope_settings';

const STABLE_SNAPSHOT_PAYLOAD = {
  version: CURRENT_VERSION,
  endpoints: [
    { url: 'https://www.google.com/favicon.ico', enabled: false, nickname: 'Google' },
    { url: 'https://www.cloudflare.com/favicon.ico', enabled: false, nickname: 'Cloudflare' },
    { url: 'https://www.fastly.com/favicon.ico', enabled: false, nickname: 'Fastly' },
  ],
  settings: { ...DEFAULT_SETTINGS },
  ui: {
    expandedCards: [],
    activeView: 'overview',
    focusedEndpointId: null,
    liveOptions: { split: false, timeRange: '5m' },
    terminalFilters: [],
  },
} as const;

export async function seedStableSnapshotState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, payload }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(payload));
    },
    { key: STORAGE_KEY, payload: STABLE_SNAPSHOT_PAYLOAD },
  );
}

export async function waitForStableSnapshotState(page: Page): Promise<void> {
  await page.waitForSelector('#chronoscope-root');
  await expect(page.locator('.run-status')).toHaveAttribute('aria-label', 'Ready');
  await expect(page.getByRole('button', { name: /^Start$/i })).toBeVisible();
  await expect(page.locator('.verdict.hero')).toBeVisible();
  await expect(page.locator('svg.dial')).toBeVisible();
}
