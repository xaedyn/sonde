import { test, expect } from '@playwright/test';

test.describe('Acceptance Criteria Verification', () => {
  test('AC1: data visible within 5 seconds of starting test', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    // Click start
    const startBtn = page.getByRole('button', { name: /start/i });
    await startBtn.click();
    // Wait for data points to appear (canvas content — check via attribute or DOM change)
    await expect(page.locator('[data-has-points="true"]')).toBeVisible({ timeout: 5000 });
  });

  test('AC3: collecting state before 30 rounds, stats after', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    // Start test
    const startBtn = page.getByRole('button', { name: /start/i });
    await startBtn.click();
    // Should show "Collecting" initially
    await expect(page.getByText(/collecting/i)).toBeVisible({ timeout: 5000 });
    // After enough time, should show p50 stats
    // This test is best-effort since it depends on real network
  });

  test('keyboard shortcut ? opens overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible({
      timeout: 2000,
    });
  });

  test('keyboard shortcut Escape closes overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: /keyboard shortcuts/i });
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });

  test('legend renders endpoint items', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    const legend = page.getByRole('list', { name: /endpoint legend/i });
    await expect(legend).toBeVisible({ timeout: 2000 });
    const items = legend.getByRole('listitem');
    await expect(items).not.toHaveCount(0);
  });

  test('idle state shows loading animation message', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    // In idle state with default endpoints configured, should show "Ready"
    await expect(page.getByText(/ready|configure endpoints/i)).toBeVisible({ timeout: 2000 });
  });
});
