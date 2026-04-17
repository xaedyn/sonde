import { test, expect } from '@playwright/test';

test.describe('Visual polish v3 — Topbar icons (AC3) + touch targets (AC5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('AC3: +Endpoint ghost button renders an SVG icon at 1440px', async ({ page }) => {
    const btn = page.getByRole('button', { name: /add or remove endpoints/i });
    await expect(btn).toBeVisible();
    await expect(btn.locator('svg')).toBeVisible();
    await expect(btn.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('AC3: Settings ghost button renders an SVG icon at 1440px', async ({ page }) => {
    const btn = page.getByRole('button', { name: /open settings/i });
    await expect(btn).toBeVisible();
    await expect(btn.locator('svg')).toBeVisible();
    await expect(btn.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('AC3: Share ghost button renders an SVG icon at 1440px', async ({ page }) => {
    const btn = page.getByRole('button', { name: /share results/i });
    await expect(btn).toBeVisible();
    await expect(btn.locator('svg')).toBeVisible();
    await expect(btn.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('AC5: desktop ghost buttons have min-width 44px at 1440px', async ({ page }) => {
    const btn = page.getByRole('button', { name: /open settings/i });
    await expect(btn).toHaveCSS('min-width', '44px');
    await expect(btn).toHaveCSS('min-height', '44px');
  });
});

test.describe('Visual polish v3 — Lane + Topbar elevation borders (AC2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('AC2: Lane border is rgba(255,255,255,.08) (surface.border.mid)', async ({ page }) => {
    const lane = page.locator('article.lane').first();
    await expect(lane).toBeVisible();
    await expect(lane).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.08)');
  });

  test('AC2: Topbar border is rgba(255,255,255,.14) (surface.border.bright)', async ({ page }) => {
    const topbar = page.locator('header.topbar');
    await expect(topbar).toBeVisible();
    await expect(topbar).toHaveCSS('border-bottom-color', 'rgba(255, 255, 255, 0.14)');
  });
});

test.describe('Visual polish v3 — Mobile a11y (AC5)', () => {
  test('AC5: no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('AC5: ghost buttons have 44x44 touch targets at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    const btn = page.getByRole('button', { name: /open settings/i });
    await expect(btn).toHaveCSS('min-width', '44px');
    await expect(btn).toHaveCSS('min-height', '44px');
  });
});
