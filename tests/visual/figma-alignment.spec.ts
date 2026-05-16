import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

test.describe('Figma alignment shell', () => {
  for (const viewport of VIEWPORTS) {
    test(`Overview first impression matches aligned shell at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
      await expect(page.locator('section[aria-label="Overview"]')).toBeVisible();

      await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Investigate', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
      await expect(page.locator('.verdict-card')).toBeVisible();
      await expect(page.getByRole('button', { name: /Verify from outside network/i })).toBeVisible();
      await expect(page.locator('.rail')).toHaveCount(0);
      await expect(page.locator('svg.dial')).toHaveCount(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  }

  test('Report is a first-class top-level surface', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await page.getByRole('button', { name: 'Report', exact: true }).click();

    await expect(page.locator('section[aria-label="Diagnostic report"]')).toBeVisible();
    await expect(page.locator('.rail')).toHaveCount(0);
  });
});
