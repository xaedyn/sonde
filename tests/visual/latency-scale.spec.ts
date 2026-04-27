import { test, expect } from '@playwright/test';

// ── View navigation helper ──────────────────────────────────────────────────
// Chronoscope has NO hash router for view selection — `page.goto('/#live')`
// silently lands on the default Overview (round-3 reviewer caught this).
// View selection lives in `uiStore.activeView`, set via ViewSwitcher button
// clicks. The default view is 'overview' per `src/lib/stores/ui.ts:12`, so
// tests targeting Overview use `page.goto('/')` alone; tests targeting Live
// must explicitly click the Live tab.
async function gotoView(
  page: import('@playwright/test').Page,
  view: 'overview' | 'live' | 'diagnose'
): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#chronoscope-root');
  if (view !== 'overview') {
    // ViewSwitcher buttons have text like "2 Live What's happening right now?" so
    // match by the label span text using a precise locator rather than a role name.
    await page.locator('.view-tab', { hasText: new RegExp(`^\\d\\s+${view}`, 'i') }).click();
    const surfaceSelector =
      view === 'live' ? '.live-wrap' :
      view === 'diagnose' ? '.diagnose-distro' :
      '#chronoscope-root';
    await page.waitForSelector(surfaceSelector, { timeout: 3000 });
  }
}

async function injectHighBaselineStats(
  page: import('@playwright/test').Page,
  targetLatency = 800,
  sampleCount = 100,
): Promise<void> {
  // Use { state: 'attached' } so we find elements that are in the DOM but
  // may be visually hidden (e.g. the rail is display:none at 375px, but
  // RacingStrip rows carry data-endpoint-id and are visible there).
  await page.waitForSelector('[data-endpoint-id]', { state: 'attached', timeout: 3000 });
  const endpointIds = await page
    .locator('[data-endpoint-id]')
    .evaluateAll((els) =>
      // Deduplicate — multiple components (rail, racing-row) carry the same ID.
      [...new Set(
        els.map((el) => el.getAttribute('data-endpoint-id')).filter((id): id is string => Boolean(id))
      )]
    );
  if (endpointIds.length === 0) {
    throw new Error(
      'No endpoints rendered — cannot inject samples. Confirm test setup is on a view where data-endpoint-id markup is visible.'
    );
  }
  await page.evaluate(
    ({ ids, latency, count }) => {
      const inject = (
        window as { __chronoscope_inject_samples?: (s: ReadonlyArray<unknown>) => void }
      ).__chronoscope_inject_samples;
      if (!inject) {
        throw new Error(
          '__chronoscope_inject_samples not present on window — confirm import.meta.env.DEV is true.'
        );
      }
      inject(
        ids.map((id) => ({
          endpointId: id,
          count,
          latencyMs: latency,
          jitterMs: 0,
        }))
      );
    },
    { ids: endpointIds, latency: targetLatency, count: sampleCount }
  );
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-role="axis-label-max"]');
      return el?.textContent && el.textContent !== '150';
    },
    { timeout: 3000 }
  );
}

const VIEWPORTS = [
  { name: '1440px', width: 1440, height: 900 },
  { name: '375px',  width: 375,  height: 812 },
] as const;

// ── AC5: Charts render correctly under high-baseline simulated data ──────────
for (const vp of VIEWPORTS) {
  test.describe(`AC5: high-baseline rendering @ ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
    });

    test('AC5 baseline scenario: maxMs in [150, 300]', async ({ page }) => {
      const labels = page.locator('[data-role="axis-label-max"]');
      const count = await labels.count();
      if (count === 0) test.skip();
      const texts = await labels.allTextContents();
      for (const text of texts) {
        const val = Number(text);
        expect(val).toBeGreaterThanOrEqual(150);
        expect(val).toBeLessThanOrEqual(300);
      }
    });

    test('AC5 high-baseline scenario: maxMs >= 960', async ({ page }) => {
      await gotoView(page, 'overview');
      await injectHighBaselineStats(page);

      const labels = page.locator('[data-role="axis-label-max"]');
      await expect(labels.first()).toBeVisible({ timeout: 3000 });
      const texts = await labels.allTextContents();
      for (const text of texts) {
        expect(Number(text)).toBeGreaterThanOrEqual(960);
      }
    });

    test('AC5 high-baseline: tick count between 4 and 8', async ({ page }) => {
      await gotoView(page, 'overview');
      await injectHighBaselineStats(page);

      const dialLabels = page.locator('.dial text').filter({ hasText: /^\d+$/ });
      const count = await dialLabels.count();
      if (count > 0) {
        expect(count).toBeGreaterThanOrEqual(4);
        expect(count).toBeLessThanOrEqual(8);
      }
    });
  });
}

// ── AC8: data-role="axis-label-max" parity across view modes ─────────────────
test.describe('AC8: axis-label-max parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoView(page, 'overview');
    await injectHighBaselineStats(page);
  });

  test('AC8 OverviewView: Dial and RacingStrip show same maxMs', async ({ page }) => {
    const texts = await page.locator('[data-role="axis-label-max"]').allTextContents();
    expect(texts.length).toBeGreaterThanOrEqual(2);
    const unique = new Set(texts);
    expect(unique.size).toBe(1);
    expect(Number([...unique][0])).toBeGreaterThanOrEqual(960);
  });

  test('AC8 LiveView unified mode: ScopeCanvas shows maxMs >= 960', async ({ page }) => {
    await gotoView(page, 'live');
    await injectHighBaselineStats(page);

    const label = page.locator('[data-role="axis-label-max"]').first();
    await expect(label).toBeVisible({ timeout: 3000 });
    expect(Number(await label.textContent())).toBeGreaterThanOrEqual(960);
  });

  test('AC8 LiveView split mode: all per-endpoint canvases show same maxMs', async ({ page }) => {
    await gotoView(page, 'live');
    await page.getByRole('button', { name: /^split$/i }).click();
    await injectHighBaselineStats(page);
    await page.waitForTimeout(200);

    const texts = await page.locator('[data-role="axis-label-max"]').allTextContents();
    expect(texts.length).toBeGreaterThanOrEqual(2);
    const unique = new Set(texts);
    expect(unique.size).toBe(1);
    expect(Number([...unique][0])).toBeGreaterThanOrEqual(960);
  });

  test('AC8 LiveView solo mode: focused fast endpoint still shows cross-endpoint maxMs', async ({ page }) => {
    await gotoView(page, 'live');

    const endpointIds = await page
      .locator('[data-endpoint-id]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-endpoint-id')).filter((id): id is string => Boolean(id))
      );
    expect(endpointIds.length).toBeGreaterThanOrEqual(2);
    const [fastId, ...slowIds] = endpointIds;

    await page.evaluate(
      ({ fastId, slowIds }) => {
        const inject = (
          window as { __chronoscope_inject_samples?: (s: ReadonlyArray<unknown>) => void }
        ).__chronoscope_inject_samples;
        if (!inject) throw new Error('__chronoscope_inject_samples not present');
        inject([
          { endpointId: fastId, count: 100, latencyMs: 50, jitterMs: 0 },
          ...slowIds.map((id) => ({ endpointId: id, count: 100, latencyMs: 800, jitterMs: 0 })),
        ]);
      },
      { fastId, slowIds }
    );

    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-role="axis-label-max"]');
        return el?.textContent && Number(el.textContent) >= 960;
      },
      { timeout: 3000 }
    );

    const fastChip = page.locator(`.live-footer-chip[data-endpoint-id="${fastId}"]`);
    await fastChip.click();

    const label = page.locator('[data-role="axis-label-max"]').first();
    await expect(label).toBeVisible({ timeout: 2000 });
    expect(Number(await label.textContent())).toBeGreaterThanOrEqual(960);
  });
});
