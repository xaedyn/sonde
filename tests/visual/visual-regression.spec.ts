import { test, expect } from '@playwright/test';

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1440, height: 900 },
];

for (const bp of BREAKPOINTS) {
  test.describe(`Visual regression @ ${bp.name} (${bp.width}px)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
    });

    test(`empty state`, async ({ page }) => {
      await expect(page).toHaveScreenshot(`${bp.name}-empty.png`, { maxDiffPixelRatio: 0.001 });
    });

    test(`settings drawer open`, async ({ page }) => {
      // Click settings button
      const settingsBtn = page.getByRole('button', { name: /settings/i });
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await page.waitForTimeout(300); // wait for animation
      }
      await expect(page).toHaveScreenshot(`${bp.name}-settings.png`, { maxDiffPixelRatio: 0.001 });
    });
  });
}
