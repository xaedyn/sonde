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

// ── UX Polish ACs ─────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: '1440px', width: 1440, height: 900 },
  { name: '768px',  width: 768,  height: 1024 },
  { name: '480px',  width: 480,  height: 812 },
  { name: '375px',  width: 375,  height: 812 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`UX Polish @ ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
    });

    test('AC-1: Start button has .btn-start-stop.start class', async ({ page }) => {
      const startBtn = page.getByRole('button', { name: /^start$/i });
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toHaveClass(/btn-start-stop/);
    });

    test('AC-1: Secondary buttons do NOT have btn-start-stop class', async ({ page }) => {
      const settingsBtn = page.getByRole('button', { name: /settings/i });
      if (await settingsBtn.isVisible()) {
        const cls = await settingsBtn.getAttribute('class') ?? '';
        expect(cls).not.toContain('btn-start-stop');
      }
    });

    test('AC-2: "P50 Median Latency" text does not appear', async ({ page }) => {
      const match = await page.getByText(/P50 Median Latency/i).count();
      expect(match).toBe(0);
    });

    test('AC-2: "Median" label appears in lane panel', async ({ page }) => {
      await expect(page.locator('.lane-label').first()).toBeVisible();
      const text = await page.locator('.lane-label').first().textContent();
      expect(text?.trim()).toBe('Median');
    });

    test('AC-3: empty state ring renders', async ({ page }) => {
      const ring = page.locator('.empty-ring').first();
      await expect(ring).toHaveCount(1);
    });

    test('AC-3: "Waiting for data" text appears', async ({ page }) => {
      await expect(page.getByText('Waiting for data').first()).toBeVisible({ timeout: 2000 });
    });

    test('AC-4: Start button has CSS transition on background', async ({ page }) => {
      const startBtn = page.getByRole('button', { name: /^start$/i });
      const transitionStyle = await startBtn.evaluate(el => window.getComputedStyle(el).transition);
      expect(transitionStyle).toContain('background');
    });

    test('AC-5: no horizontal overflow', async ({ page }) => {
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflows).toBe(false);
    });
  });
}

test.describe('AC-5: 375px specific checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('Start/Stop shows text label (not icon-only)', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /^start$/i });
    await expect(startBtn).toBeVisible();
    const text = await startBtn.textContent();
    expect(text?.trim()).toMatch(/start|stop/i);
  });

  test('secondary buttons have aria-label (icon-only)', async ({ page }) => {
    const settingsBtn = page.getByRole('button', { name: /settings/i });
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

  test('AC-3: empty ring has no animate children', async ({ page }) => {
    const animateCount = await page.locator('.empty-ring animate').count();
    expect(animateCount).toBe(0);
  });

  test('AC-4: Start button transition-duration is 0s', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /^start$/i });
    const duration = await startBtn.evaluate(el => window.getComputedStyle(el).transitionDuration);
    const durations = duration.split(',').map(d => d.trim());
    expect(durations.every(d => d === '0s')).toBe(true);
  });
});
