import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

interface ReferenceRoute {
  readonly route: 'overview' | 'live' | 'investigate' | 'report';
  readonly viewport: 'desktop' | 'laptop' | 'mobile';
  readonly width: number;
  readonly height: number;
  readonly file: string;
  readonly text: string;
}

interface ReferenceManifest {
  readonly routes: readonly ReferenceRoute[];
}

const REFERENCE_ROOT = path.join(process.cwd(), 'docs/artifacts/figma-alignment-reference');
const REFERENCE_MANIFEST = JSON.parse(
  readFileSync(path.join(REFERENCE_ROOT, 'manifest.json'), 'utf8'),
) as ReferenceManifest;

const ROUTES = ['overview', 'live', 'investigate', 'report'] as const;
const VIEWPORTS = [
  { viewport: 'desktop', width: 2048, height: 1330 },
  { viewport: 'laptop', width: 1440, height: 900 },
  { viewport: 'mobile', width: 390, height: 844 },
] as const;

function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  expect(buffer.toString('ascii', 1, 4), `${file} must be a PNG`).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function referenceFor(
  route: ReferenceRoute['route'],
  viewport: ReferenceRoute['viewport'],
): ReferenceRoute {
  const entry = REFERENCE_MANIFEST.routes.find((candidate) => (
    candidate.route === route && candidate.viewport === viewport
  ));
  if (!entry) throw new Error(`Missing Figma reference for ${route}/${viewport}`);
  return entry;
}

async function seedDegradedFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#chronoscope-root');

  await page.evaluate(async () => {
    const [{ endpointStore }, { measurementStore }, { uiStore }] = await Promise.all([
      import('/src/lib/stores/endpoints.ts'),
      import('/src/lib/stores/measurements.ts'),
      import('/src/lib/stores/ui.ts'),
    ]);

    const endpoints = [
      {
        id: 'app',
        url: 'https://app.chronoscope.dev/health',
        label: 'app.chronoscope.dev',
        enabled: true,
        color: '#2cf5a9',
      },
      {
        id: 'api',
        url: 'https://api.service.net/status',
        label: 'api.service.net',
        enabled: true,
        color: '#fbbf24',
      },
      {
        id: 'cdn',
        url: 'https://cdn.assets.io/ping',
        label: 'cdn.assets.io',
        enabled: true,
        color: '#67e8f9',
      },
      {
        id: 'auth',
        url: 'https://auth.identity.net/ping',
        label: 'auth.identity.net',
        enabled: true,
        color: '#f9a8d4',
      },
    ];
    endpointStore.setEndpoints(endpoints);

    const now = Date.now();
    const count = 48;
    const samplesFor = (endpointId: string) => Array.from({ length: count }, (_, sampleIndex) => {
      const apiSpike = endpointId === 'api' && sampleIndex >= 24 && sampleIndex % 5 === 0;
      const timeout = endpointId === 'api' && sampleIndex === 43;
      const baseLatency = endpointId === 'api' ? 185 : endpointId === 'cdn' ? 28 : endpointId === 'auth' ? 56 : 42;
      return {
        round: sampleIndex + 1,
        latency: timeout ? 5000 : apiSpike ? 450 : baseLatency,
        status: timeout ? 'timeout' : 'ok',
        timestamp: now - (count - sampleIndex) * 1000,
      };
    });

    measurementStore.reset();
    measurementStore.loadSnapshot({
      lifecycle: 'running',
      epoch: 9_000,
      roundCounter: count,
      startedAt: now - count * 1000,
      stoppedAt: null,
      freezeEvents: [],
      errorCount: 0,
      timeoutCount: 1,
      endpoints: Object.fromEntries(endpoints.map((endpoint) => {
        const samples = samplesFor(endpoint.id);
        const lastOk = [...samples].reverse().find((sample) => sample.status === 'ok');
        return [endpoint.id, {
          endpointId: endpoint.id,
          tierLevel: 1,
          lastLatency: lastOk?.latency ?? null,
          lastStatus: lastOk?.status ?? null,
          lastErrorMessage: null,
          samples,
        }];
      })),
    });
    uiStore.setFocusedEndpoint(null);
    uiStore.setActiveView('overview');
  });
}

async function activateRoute(page: Page, route: ReferenceRoute['route']): Promise<void> {
  if (route === 'overview') {
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.waitForSelector('.figma-overview');
    return;
  }
  if (route === 'live') {
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.waitForSelector('.live-surface');
    return;
  }
  if (route === 'investigate') {
    await page.getByRole('button', { name: 'Investigate', exact: true }).click();
    await page.waitForSelector('.diagnose-surface');
    return;
  }
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.waitForSelector('.report-surface');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const hasHorizontalScrollAncestor = (element: HTMLElement): boolean => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        const scrollable = style.overflowX === 'auto' || style.overflowX === 'scroll';
        if (scrollable && parent.scrollWidth > parent.clientWidth) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const overflowing = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => !hasHorizontalScrollAncestor(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: String(element.className),
          text: element.textContent?.trim().slice(0, 40) ?? '',
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((entry) => entry.right > doc.clientWidth + 1)
      .slice(0, 8);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflowing };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.overflowing).toEqual([]);
}

async function expectRouteAnchors(page: Page, route: ReferenceRoute['route']): Promise<void> {
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Investigate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
  await expect(page.locator('.rail')).toHaveCount(0);
  await expect(page.locator('svg.dial')).toHaveCount(0);

  if (route === 'overview') {
    await expect(page.locator('.verdict-card')).toBeVisible();
    await expect(page.locator('.score-ring')).toBeVisible();
    await expect(page.locator('.endpoint-row')).toHaveCount(4);
    await expect(page.locator('.event-timeline')).toBeVisible();
    return;
  }

  if (route === 'live') {
    await expect(page.locator('.live-hero')).toBeVisible();
    await expect(page.locator('.live-scope-panel')).toBeVisible();
    await expect(page.locator('.live-footer-chip')).toHaveCount(4);
    return;
  }

  if (route === 'investigate') {
    await expect(page.locator('.diagnose-hero')).toBeVisible();
    await expect(page.locator('.diagnose-answer-fact')).toContainText('Measured fact:');
    await expect(page.locator('.diagnose-answer-interpretation')).toContainText('Interpretation:');
    await expect(page.locator('.diagnose-proof-stack')).toContainText('Next proof actions');
    await expect(page.locator('.diagnose')).not.toContainText(/prove your local|root cause|definitely/i);
    return;
  }

  await expect(page.locator('.report-hero')).toBeVisible();
  await expect(page.locator('.report-strip')).toBeVisible();
  await expect(page.locator('.evidence-trail')).toBeVisible();
  await expect(page.getByRole('button', { name: /Copy Report Link/i })).toBeVisible();
}

async function captureGateScreenshot(
  page: Page,
  testInfo: TestInfo,
  route: ReferenceRoute['route'],
  viewport: ReferenceRoute['viewport'],
): Promise<void> {
  const outputDir = testInfo.outputPath('figma-fidelity');
  mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `${route}-${viewport}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`${route}-${viewport}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
  expect(pngSize(screenshotPath)).toEqual({
    width: page.viewportSize()?.width,
    height: page.viewportSize()?.height,
  });
}

test.describe('Figma fidelity gate', () => {
  test('frozen reference assets match the manifest dimensions', () => {
    expect(REFERENCE_MANIFEST.routes).toHaveLength(12);
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        const reference = referenceFor(route, viewport.viewport);
        const file = path.join(REFERENCE_ROOT, reference.file);
        expect(existsSync(file), `${reference.file} exists`).toBe(true);
        expect(pngSize(file), `${reference.file} dimensions`).toEqual({
          width: reference.width,
          height: reference.height,
        });
        expect(reference.text).toContain('CHRONOSCOPE');
        expect(reference.text).toContain('OVERVIEW');
        expect(reference.text).toContain('LIVE');
        expect(reference.text).toContain('INVESTIGATE');
        expect(reference.text).toContain('REPORT');
      }
    }
  });

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route} matches the Figma shell contract at ${viewport.viewport}`, async ({ page }, testInfo) => {
        const reference = referenceFor(route, viewport.viewport);
        await page.setViewportSize({ width: reference.width, height: reference.height });
        await seedDegradedFixture(page);
        await activateRoute(page, route);
        await page.waitForTimeout(250);

        await expectRouteAnchors(page, route);
        await expectNoHorizontalOverflow(page);
        await captureGateScreenshot(page, testInfo, route, viewport.viewport);
      });
    }
  }
});
