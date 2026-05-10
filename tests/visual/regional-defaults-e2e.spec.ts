import { test, expect, type Page } from '@playwright/test';
import { REGIONAL_DEFAULTS } from '../../src/lib/regional-defaults';

const endpointRows = (page: Page) =>
  page.locator('.racing-row[data-endpoint-id]');

async function stopAutoStartedRun(page: Page): Promise<void> {
  const control = page.getByRole('button', { name: /^(?:Start|Starting\.\.\.|Stop)$/i });
  await expect(control).toBeVisible({ timeout: 3000 });
  const label = (await control.getAttribute('aria-label')) ?? '';
  if (/^Start$/i.test(label)) return;

  const stopButton = page.getByRole('button', { name: /^Stop$/i });
  await expect(stopButton).toBeVisible({ timeout: 3000 });
  await stopButton.click();
  await expect(page.getByRole('button', { name: /^Start$/i })).toBeVisible({ timeout: 3000 });
}

test.describe('Regional Default Endpoints — E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#chronoscope-root');
  });

  // AC4: manual region override reseeds endpoints and survives reload
  test('AC4: select LATAM region + reset → 4 LATAM URLs persist across reload', async ({ page }) => {
    await stopAutoStartedRun(page);

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

    // Wait for the Status comparison rows to reflect 4 endpoints. These
    // rows are visible on both desktop and mobile; the fixed rail is hidden on
    // mobile.
    const endpoints = endpointRows(page);
    await expect(endpoints).toHaveCount(4, { timeout: 3000 });

    // Assert visible labels match LATAM defaults.
    const expected = REGIONAL_DEFAULTS['latam'];
    for (const endpoint of expected) {
      await expect(endpoints.filter({ hasText: endpoint.label })).toBeVisible({ timeout: 3000 });
    }

    // Reload and verify persistence
    await page.reload();
    await page.waitForSelector('#chronoscope-root');

    // Same 4 endpoints must be present after reload
    const endpointsAfterReload = endpointRows(page);
    await expect(endpointsAfterReload).toHaveCount(4, { timeout: 3000 });

    for (const endpoint of expected) {
      await expect(endpointsAfterReload.filter({ hasText: endpoint.label })).toBeVisible({ timeout: 3000 });
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

    const endpoints = endpointRows(page);
    await expect(endpoints).toHaveCount(4, { timeout: 3000 });

    // NA defaults: Google, Edge (Timing self-probe), AWS, Fastly
    for (const endpoint of REGIONAL_DEFAULTS['north-america']) {
      await expect(endpoints.filter({ hasText: endpoint.label })).toBeVisible({ timeout: 3000 });
    }
  });
});
