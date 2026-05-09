import { test, expect, type Page } from '@playwright/test';

async function uniqueEndpointIds(page: Page): Promise<string[]> {
  await page.waitForSelector('[data-endpoint-id]', { state: 'attached', timeout: 3000 });
  return await page
    .locator('[data-endpoint-id]')
    .evaluateAll((els) =>
      [...new Set(
        els.map((el) => el.getAttribute('data-endpoint-id')).filter((id): id is string => Boolean(id)),
      )],
    );
}

async function injectVisibleSamples(page: Page): Promise<void> {
  const ids = await uniqueEndpointIds(page);
  await page.waitForFunction(() => typeof window.__chronoscope_inject_samples === 'function');
  await page.evaluate((endpointIds) => {
    const inject = window.__chronoscope_inject_samples;
    if (!inject) throw new Error('__chronoscope_inject_samples is unavailable');
    inject(endpointIds.map((id, index) => ({
      endpointId: id,
      count: 12,
      latencyMs: 40 + index * 20,
      jitterMs: 3,
    })));
  }, ids);
}

test.describe('Acceptance criteria verification', () => {
  test('data appears in the current Overview surfaces after samples arrive', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await page.getByRole('button', { name: /^start$/i }).click();
    await injectVisibleSamples(page);

    const racing = page.locator('section[aria-label="Per-endpoint comparison"]');
    await expect(racing.locator('.racing-stats-p95').first()).toContainText(/p95 \d+/);
    await expect(page.locator('svg.dial')).toBeVisible();
  });

  test('start button enters the running control state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await page.getByRole('button', { name: /^start$/i }).click();

    await expect(page.getByRole('button', { name: /^halt$/i })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.run-status')).toHaveText(/measuring|starting/i, { timeout: 3000 });
  });

  test('keyboard shortcut ? opens overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await page.keyboard.press('?');

    await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible({
      timeout: 2000,
    });
    await expect(page.getByText('1 / 2 / 3')).toBeVisible();
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

  test('endpoint rail renders default endpoint controls on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    const rail = page.getByRole('navigation', { name: 'Endpoints' });
    await expect(rail).toBeVisible();
    const endpointButtons = rail.locator('button[data-endpoint-id]');
    await expect(endpointButtons.first()).toBeVisible();
    expect(await endpointButtons.count()).toBeGreaterThan(0);
  });

  test('cold Overview renders dial, racing comparison, and event feed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await expect(page.locator('section[aria-label="Overview"]')).toBeVisible();
    await expect(page.locator('svg.dial')).toBeVisible();
    await expect(page.locator('section[aria-label="Per-endpoint comparison"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Recent events"]')).toBeAttached();
  });
});

const VIEWPORTS = [
  { name: '1440px', width: 1440, height: 900 },
  { name: '768px',  width: 768,  height: 1024 },
  { name: '480px',  width: 480,  height: 812 },
  { name: '375px',  width: 375,  height: 812 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`UX polish @ ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
    });

    test('Start button uses the current run button contract', async ({ page }) => {
      const startBtn = page.getByRole('button', { name: /^start$/i });
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toHaveClass(/run-btn/);
      await expect(startBtn).toHaveClass(/start/);
    });

    test('secondary topbar buttons do not use the run button class', async ({ page }) => {
      const settingsBtn = page.getByRole('button', { name: /open settings/i });
      const cls = await settingsBtn.getAttribute('class') ?? '';
      expect(cls).not.toContain('run-btn');
    });

    test('enabled view shortcuts match the shipped views', async ({ page }) => {
      await expect(page.locator('.view-switcher-trailing')).toContainText('1·2·3');
      await expect(page.getByRole('button', { name: /^Overview/ })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^Live/ })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^Diagnose/ })).toBeEnabled();
    });

    test('Start button has a background transition for hover feedback', async ({ page }) => {
      const startBtn = page.getByRole('button', { name: /^start$/i });
      const transitionStyle = await startBtn.evaluate(el => window.getComputedStyle(el).transition);
      expect(transitionStyle).toContain('background');
    });

    test('no horizontal overflow', async ({ page }) => {
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflows).toBe(false);
    });
  });
}

test.describe('375px specific checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('Start/Stop keeps its text label', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /^start$/i });
    await expect(startBtn).toBeVisible();
    const text = await startBtn.textContent();
    expect(text?.trim()).toMatch(/start|halt/i);
  });

  test('secondary topbar buttons keep accessible labels', async ({ page }) => {
    const settingsBtn = page.getByRole('button', { name: /open settings/i });
    await expect(settingsBtn).toBeVisible();
    const label = await settingsBtn.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });
});

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('Dial emits no SVG animate elements in reduced motion', async ({ page }) => {
    const animateCount = await page.locator('svg.dial animate').count();
    expect(animateCount).toBe(0);
  });

  test('Start button transition-duration is 0s', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /^start$/i });
    const duration = await startBtn.evaluate(el => window.getComputedStyle(el).transitionDuration);
    const durations = duration.split(',').map(d => d.trim());
    const property = await startBtn.evaluate(el => window.getComputedStyle(el).transitionProperty);
    expect(property === 'none' || durations.every(d => d === '0s')).toBe(true);
  });
});
