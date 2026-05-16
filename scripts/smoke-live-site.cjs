const { chromium } = require('playwright');

const url = process.env.LIVE_SMOKE_URL ?? 'https://chronoscope.dev/';

function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

function count(page, selector) {
  return page.locator(selector).count();
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];

  try {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#chronoscope-root', { timeout: 30_000 });

    const checks = [];

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.waitForSelector('.live-surface', { timeout: 10_000 });
    await page.waitForTimeout(250);
    checks.push({
      name: 'live',
      hero: await count(page, '.live-hero'),
      primaryPanel: await count(page, '.live-scope-panel'),
      noHorizontalOverflow: await noHorizontalOverflow(page),
    });

    await page.getByRole('button', { name: 'Investigate', exact: true }).click();
    await page.waitForSelector('.diagnose-surface', { timeout: 10_000 });
    await page.waitForTimeout(250);
    checks.push({
      name: 'investigate',
      hero: await count(page, '.diagnose-hero'),
      primaryPanel: await count(page, '.diagnose-proof-grid'),
      noHorizontalOverflow: await noHorizontalOverflow(page),
    });

    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.waitForSelector('.report-surface', { timeout: 10_000 });
    await page.waitForTimeout(250);
    checks.push({
      name: 'report',
      hero: await count(page, '.report-hero'),
      primaryPanel: await count(page, '.report-strip'),
      noHorizontalOverflow: await noHorizontalOverflow(page),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.waitForSelector('.live-surface', { timeout: 10_000 });
    await page.waitForTimeout(250);
    checks.push({
      name: 'mobile-live',
      hero: await count(page, '.live-hero'),
      primaryPanel: await count(page, '.live-scope-panel'),
      noHorizontalOverflow: await noHorizontalOverflow(page),
    });

    const failures = checks.filter((check) => (
      check.hero !== 1 || check.primaryPanel !== 1 || !check.noHorizontalOverflow
    ));

    process.stdout.write(`${JSON.stringify({ url, checks, errors }, null, 2)}\n`);

    if (errors.length > 0 || failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
