import { test, expect, type Locator, type Page } from '@playwright/test';
import { encodeSharePayload } from '../../src/lib/share/share-manager';
import { MAX_CAP } from '../../src/lib/limits';
import type { SharePayload } from '../../src/lib/types';

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

const RUN_CONTROL_NAME = /^(?:Start|Starting\.\.\.|Stop)$/i;
const INVESTIGATE_AUTO_SELECTION_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
] as const;

function runControl(page: Page): Locator {
  return page.getByRole('button', { name: RUN_CONTROL_NAME });
}

async function expectMeasuringStatus(page: Page): Promise<void> {
  await expect(page.locator('.run-status')).toHaveAttribute('aria-label', 'Measuring', { timeout: 3000 });
}

async function assertVerdictBeforeDial(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#chronoscope-root');

  const verdict = page.locator('.verdict.hero');
  const dial = page.locator('svg.dial');
  await expect(verdict).toBeVisible();
  await expect(dial).toBeVisible();

  const verdictBox = await verdict.boundingBox();
  const dialBox = await dial.boundingBox();
  expect(verdictBox).not.toBeNull();
  expect(dialBox).not.toBeNull();
  expect(verdictBox!.y).toBeLessThan(dialBox!.y);
}

function sharedReportUrl(): string {
  const endpoints = [
    { url: 'https://api.example.com', enabled: true },
    { url: 'https://www.google.com', enabled: true },
    { url: 'https://www.cloudflare.com', enabled: true },
  ];
  const results = [240, 45, 38].map((latency) => ({
    samples: Array.from({ length: 35 }, (_, i) => ({
      round: i + 1,
      latency,
      status: 'ok' as const,
    })),
  }));
  const payload: SharePayload = {
    v: 2,
    mode: 'results',
    endpoints,
    settings: {
      timeout: 5000,
      delay: 0,
      burstRounds: 50,
      monitorDelay: 1000,
      cap: MAX_CAP,
      corsMode: 'no-cors',
    },
    report: {
      createdAt: 1778352000000,
      healthThreshold: 120,
      corsMode: 'no-cors',
      roundCount: 35,
      totalSampleCount: 105,
      keptSampleCount: 105,
      truncated: false,
    },
    results,
  };

  return `/#s=${encodeSharePayload(payload)}`;
}

test.describe('Acceptance criteria verification', () => {
  test('data appears in the current Status surfaces after samples arrive', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await expectMeasuringStatus(page);

    await injectVisibleSamples(page);

    const racing = page.locator('section[aria-label="Per-endpoint comparison"]');
    await expect(racing.locator('.racing-stats-p95').first()).toContainText(/p95 \d+/);
    await expect(page.locator('svg.dial')).toBeVisible();
  });

  test('default public endpoint visit starts measuring', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await expectMeasuringStatus(page);
    await expect(runControl(page)).toHaveAccessibleName(/^Stop$/i, { timeout: 3000 });
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

  test('cold Status renders dial, racing comparison, and event feed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await expect(page.locator('section[aria-label="Status"]')).toBeVisible();
    await expect(page.locator('svg.dial')).toBeVisible();
    await expect(page.locator('section[aria-label="Per-endpoint comparison"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Recent events"]')).toBeAttached();
  });

  test('Status first paint shows verdict before the dial on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertVerdictBeforeDial(page);
  });

  test('Status first paint shows verdict before the dial on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertVerdictBeforeDial(page);
  });

  for (const vp of INVESTIGATE_AUTO_SELECTION_VIEWPORTS) {
    test(`Investigate tab auto-selects an endpoint detail with data on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
      await injectVisibleSamples(page);

      await page.getByRole('group', { name: 'Views' }).getByRole('button', { name: /^Investigate/ }).click();

      const investigate = page.locator('section[aria-label="Investigate"]');
      await expect(investigate).toBeVisible();
      await expect(investigate.locator('.diagnose-title-name')).toBeVisible({ timeout: 3000 });
      await expect(investigate.locator('section[aria-label="Diagnostic answer"]')).toBeVisible();
      await expect(investigate.getByText(/pick an endpoint from the left rail/i)).toHaveCount(0);
      await expect(investigate.locator('.diagnose-empty')).toHaveCount(0);
    });
  }

  test('diagnostic narrative exposes confidence and browser timing limits', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await injectVisibleSamples(page);

    await expect(page.locator('.verdict-confidence')).toContainText(/confidence/i);

    await page.locator('button[data-endpoint-id]').first().click();
    await page.getByRole('button', { name: /^Investigate/ }).click();

    await expect(page.locator('section[aria-label="Diagnostic answer"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Browser visibility"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Browser visibility"] .visibility-action')).toContainText(/Timing-Allow-Origin/i);
  });

  test('shared result link opens as a diagnostic report', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(sharedReportUrl());
    await page.waitForSelector('#chronoscope-root');

    await expect(page.getByText('Shared diagnostic report').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Only api\.example\.com looks slow/i })).toBeVisible();
    await expect(page.getByText(/medium confidence|high confidence/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Interactive Analysis/i })).toBeVisible();
    await expect(page.getByRole('table', { name: /Endpoint report table/i })).toContainText('likely source');
    await expect(page.getByText(/Timing-Allow-Origin/i)).toBeVisible();
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

    test('run button uses the current run button contract', async ({ page }) => {
      const button = runControl(page);
      await expect(button).toBeVisible();
      await expect(button).toHaveClass(/run-btn/);

      const label = (await button.getAttribute('aria-label')) ?? '';
      expect(label).toMatch(RUN_CONTROL_NAME);
      const className = (await button.getAttribute('class')) ?? '';
      if (/^Start$/i.test(label)) expect(className).toContain('start');
      if (/^Stop$/i.test(label)) expect(className).toContain('stop');
      if (/^Starting\.\.\.$/i.test(label)) await expect(button).toBeDisabled();
    });

    test('secondary topbar buttons do not use the run button class', async ({ page }) => {
      const settingsBtn = page.getByRole('button', { name: /open settings/i });
      const cls = await settingsBtn.getAttribute('class') ?? '';
      expect(cls).not.toContain('run-btn');
    });

    test('enabled view shortcuts match the shipped views', async ({ page }) => {
      await expect(page.locator('.view-switcher-trailing')).toContainText('1·2·3');
      await expect(page.getByRole('button', { name: /^Status/ })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^Live/ })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^Investigate/ })).toBeEnabled();
    });

    test('run button has a background transition for hover feedback', async ({ page }) => {
      const button = runControl(page);
      const transitionStyle = await button.evaluate(el => window.getComputedStyle(el).transition);
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
    const button = runControl(page);
    await expect(button).toBeVisible();
    const text = await button.textContent();
    expect(text?.trim()).toMatch(/start|starting|stop/i);
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

  test('run button transition-duration is 0s', async ({ page }) => {
    const button = runControl(page);
    const duration = await button.evaluate(el => window.getComputedStyle(el).transitionDuration);
    const durations = duration.split(',').map(d => d.trim());
    const property = await button.evaluate(el => window.getComputedStyle(el).transitionProperty);
    expect(property === 'none' || durations.every(d => d === '0s')).toBe(true);
  });
});
