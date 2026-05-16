import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const MIN_ENDPOINT_HISTORY_HEIGHT = 44;

type OverviewFixture = 'collecting' | 'healthy' | 'isolated-slow' | 'request-failures';

async function seedOverviewFixture(page: Page, fixture: OverviewFixture): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#chronoscope-root');
  await expect(page.locator('section[aria-label="Overview"]')).toBeVisible();

  await page.evaluate(async (fixtureName) => {
    const [{ endpointStore }, { measurementStore }, { uiStore }] = await Promise.all([
      import('/src/lib/stores/endpoints.ts'),
      import('/src/lib/stores/measurements.ts'),
      import('/src/lib/stores/ui.ts'),
    ]);
    let endpoints = [];
    const unsubscribe = endpointStore.subscribe((value) => {
      endpoints = value.filter((endpoint) => endpoint.enabled).slice(0, 4);
    });
    unsubscribe();

    const now = Date.now();
    const count = fixtureName === 'collecting' ? 0 : 36;
    const slowIndex = Math.min(1, endpoints.length - 1);
    const samplesFor = (index) => Array.from({ length: count }, (_, sampleIndex) => {
      const isSlow = fixtureName === 'isolated-slow' && index === slowIndex;
      const hasFailures = fixtureName === 'request-failures' && index === slowIndex && sampleIndex >= 30;
      const latency = isSlow ? 320 : 42 + index * 8;
      return {
        round: sampleIndex + 1,
        latency: hasFailures ? 5000 : latency,
        status: hasFailures ? 'timeout' : 'ok',
        timestamp: now - (count - sampleIndex) * 1000,
      };
    });

    measurementStore.loadSnapshot({
      lifecycle: 'running',
      epoch: 9_000,
      roundCounter: count,
      startedAt: now - Math.max(count, 1) * 1000,
      stoppedAt: null,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 0,
      endpoints: Object.fromEntries(endpoints.map((endpoint, index) => {
        const samples = samplesFor(index);
        const last = samples.at(-1) ?? null;
        return [endpoint.id, {
          endpointId: endpoint.id,
          tierLevel: 1,
          lastLatency: last?.latency ?? null,
          lastStatus: last?.status ?? null,
          lastErrorMessage: null,
          samples,
        }];
      })),
    });
    uiStore.setFocusedEndpoint(null);
    uiStore.setActiveView('overview');
  }, fixture);
}

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
      await expect(page.locator('.verdict-actions .primary-action')).toBeVisible();
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

  test('Overview collecting state does not ask users to validate a sparse result', async ({ page }) => {
    await seedOverviewFixture(page, 'collecting');

    await expect(page.locator('.severity-pill')).toHaveText('Collecting');
    await expect(page.locator('.verdict-card h1')).toContainText('Collecting enough data');
    await expect(page.locator('.verdict-actions .primary-action')).toHaveText(/Collect more samples/i);
    await expect(page.locator('.verdict-actions .primary-action')).toBeDisabled();
    await expect(page.locator('.score-ring strong')).toHaveText('—');
  });

  test('Overview healthy state promotes a snapshot instead of an outside-network chase', async ({ page }) => {
    await seedOverviewFixture(page, 'healthy');

    await expect(page.locator('.severity-pill')).toHaveText('Good');
    await expect(page.locator('.verdict-card h1')).toContainText(/healthy|Looks good/i);
    await expect(page.locator('.verdict-actions .primary-action')).toHaveText(/Copy Snapshot Link/i);
    await expect(page.locator('.endpoint-row')).toContainText(['Stable performance']);
  });

  test('Overview degraded state follows the diagnostic action and highlights the slow endpoint', async ({ page }) => {
    await seedOverviewFixture(page, 'isolated-slow');

    await expect(page.locator('.severity-pill')).toHaveText('Degraded');
    await expect(page.locator('.verdict-card h1')).toContainText('is slower than the others');
    await expect(page.locator('.verdict-actions .primary-action')).toHaveText(/Review browser visibility/i);
    await expect(page.locator('.endpoint-row[data-tone="warn"]')).toContainText('Latency spikes detected');
  });

  test('Overview failure state names failed browser checks without implying cause', async ({ page }) => {
    await seedOverviewFixture(page, 'request-failures');

    await expect(page.locator('.severity-pill')).toHaveText('Degraded');
    await expect(page.locator('.verdict-card h1')).toContainText('Some requests are failing');
    await expect(page.locator('.endpoint-row[data-tone="bad"]')).toContainText('Request failed in browser check');
    await expect(page.locator('.verdict-card')).not.toContainText(/cause|prove|your local Wi-Fi .* fine/i);
  });

  test('Overview lower evidence area is time-aware and drills into Investigate', async ({ page }) => {
    await seedOverviewFixture(page, 'isolated-slow');

    await expect(page.locator('.overview-time-window').first()).toContainText(/Last \d+(s|m)/);
    await expect(page.locator('.overview-time-axis').first()).toContainText('Now');

    const history = page.locator('.endpoint-row[data-tone="warn"] .endpoint-history').first();
    await expect(history).toBeVisible();
    const box = await history.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_ENDPOINT_HISTORY_HEIGHT);

    const markers = page.locator('.endpoint-row[data-tone="warn"] .endpoint-history-marker');
    expect(await markers.count()).toBeGreaterThan(0);

    const event = page.locator('.event-entry[data-tone="bad"]').first();
    await expect(event).toContainText(/T\+\d{2}:\d{2}/);
    await expect(event).toContainText(/ago/);
    await event.click();
    await expect(page.locator('section[aria-label="Investigate"]')).toBeVisible();
  });

  test('Overview failure history exposes visible failure markers', async ({ page }) => {
    await seedOverviewFixture(page, 'request-failures');

    await expect(page.locator('.overview-time-axis').first()).toContainText('Now');
    const failures = page.locator('.endpoint-row[data-tone="bad"] .endpoint-history-marker[data-status="failed"]');
    expect(await failures.count()).toBeGreaterThan(0);
    await expect(page.locator('.event-timeline .overview-time-window')).toContainText(/Last \d+(s|m)/);
  });

  test('Overview lower evidence stays readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedOverviewFixture(page, 'isolated-slow');

    const history = page.locator('.endpoint-row[data-tone="warn"] .endpoint-history').first();
    const box = await history.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_ENDPOINT_HISTORY_HEIGHT);
    await expect(page.locator('.event-timeline')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
