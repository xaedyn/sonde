import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('no axe violations on empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#sonde-root');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('skip link is keyboard-accessible', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeFocused();
  });

  test('all canvas elements have ARIA attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#sonde-root');

    const canvases = page.locator('canvas[tabindex="0"]');
    const count = await canvases.count();

    for (let i = 0; i < count; i++) {
      const canvas = canvases.nth(i);
      await expect(canvas).toHaveAttribute('role', 'application');
      const desc = await canvas.getAttribute('aria-roledescription');
      expect(desc).toBeTruthy();
    }
  });
});
