import { test, expect } from '@playwright/test';
import { REGIONAL_DEFAULTS } from '../../src/lib/regional-defaults';

test.describe('Regional Default Lanes — E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#chronoscope-root');
  });

  // AC4: manual region override reseeds lanes and survives reload
  test('AC4: select LATAM region + reset → 4 LATAM URLs persist across reload', async ({ page }) => {
    // Open settings drawer
    await page.getByRole('button', { name: /open settings/i }).click();
    await expect(page.getByRole('dialog', { name: /^settings$/i })).toBeVisible({ timeout: 2000 });

    // AC3: Region select is present with exactly 7 options
    const regionSelect = page.getByLabel('Region');
    await expect(regionSelect).toBeVisible();
    const options = regionSelect.locator('option');
    await expect(options).toHaveCount(7);

    // Select LATAM
    await regionSelect.selectOption('latam');

    // Click Reset to regional defaults — should show confirmation dialog
    await page.getByRole('button', { name: /reset to regional defaults/i }).click();

    // Confirm dialog
    await page.getByRole('button', { name: /yes, reset/i }).click();

    // Close settings drawer
    await page.getByRole('button', { name: /close settings/i }).click();

    // Wait for DOM to reflect 4 lanes
    const laneArticles = page.locator('article[data-endpoint-id]');
    await expect(laneArticles).toHaveCount(4, { timeout: 3000 });

    // Assert URLs match LATAM defaults — via aria-label on the Lane article
    const expectedUrls = REGIONAL_DEFAULTS['latam'].map(s => s.url);
    for (const url of expectedUrls) {
      await expect(page.locator(`[aria-label="Endpoint ${url}"]`)).toBeVisible({ timeout: 3000 });
    }

    // Reload and verify persistence
    await page.reload();
    await page.waitForSelector('#chronoscope-root');

    // Same 4 lanes must be present after reload
    const lanesAfterReload = page.locator('article[data-endpoint-id]');
    await expect(lanesAfterReload).toHaveCount(4, { timeout: 3000 });

    for (const url of expectedUrls) {
      await expect(page.locator(`[aria-label="Endpoint ${url}"]`)).toBeVisible({ timeout: 3000 });
    }
  });

  // AC5: UTC timezone falls back to NA defaults
  test('AC5: fresh install with UTC timezone gets NA defaults', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = Intl.DateTimeFormat;
      // @ts-expect-error — browser context override
      Intl.DateTimeFormat = function(...args: unknown[]) {
        const fmt = new orig(...(args as []));
        const origResolved = fmt.resolvedOptions.bind(fmt);
        fmt.resolvedOptions = () => ({ ...origResolved(), timeZone: 'UTC' });
        return fmt;
      };
      Object.assign(Intl.DateTimeFormat, orig);
      localStorage.clear();
    });

    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    const lanes = page.locator('article[data-endpoint-id]');
    await expect(lanes).toHaveCount(4, { timeout: 3000 });

    // NA defaults: Google, Self (TAO-anchor), AWS, Fastly
    await expect(page.locator('[aria-label="Endpoint https://www.google.com"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[aria-label="Endpoint https://www.fastly.com/robots.txt"]')).toBeVisible({ timeout: 3000 });
  });
});
