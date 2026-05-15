import { test, expect, type Locator, type Page } from '@playwright/test';
import { encodeSharePayload } from '../../src/lib/share/share-manager';
import type { SharePayload } from '../../src/lib/types';

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

function sharedReportUrl(): string {
  const payload: SharePayload = {
    v: 2,
    mode: 'results',
    endpoints: [
      { url: 'https://api.example.com', enabled: true },
      { url: 'https://www.google.com', enabled: true },
      { url: 'https://www.cloudflare.com', enabled: true },
    ],
    settings: {
      timeout: 5000,
      delay: 0,
      burstRounds: 50,
      monitorDelay: 1000,
      cap: 250,
      corsMode: 'no-cors',
    },
    report: {
      reportKind: 'support',
      createdAt: 1778352000000,
      healthThreshold: 120,
      corsMode: 'no-cors',
      roundCount: 35,
      totalSampleCount: 105,
      keptSampleCount: 105,
      truncated: false,
    },
    results: [240, 45, 38].map((latency) => ({
      samples: Array.from({ length: 35 }, (_, index) => ({
        round: index + 1,
        latency,
        status: 'ok' as const,
      })),
    })),
  };

  return `/?hardening-report=1#s=${encodeSharePayload(payload)}`;
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector<HTMLElement>('main#main-content');
    const overflowing = Array.from(document.querySelectorAll<HTMLElement>('body *'))
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

    return {
      documentScrollWidth: doc.scrollWidth,
      documentClientWidth: doc.clientWidth,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
      overflowing,
    };
  });

  expect(
    overflow.documentScrollWidth,
    `${label}: document overflow ${JSON.stringify(overflow)}`,
  ).toBeLessThanOrEqual(overflow.documentClientWidth);
  expect(
    overflow.mainScrollWidth,
    `${label}: main overflow ${JSON.stringify(overflow)}`,
  ).toBeLessThanOrEqual(overflow.mainClientWidth);
  expect(overflow.overflowing, `${label}: overflowing elements`).toEqual([]);
}

async function expectStrongFocusRing(control: Locator, label: string): Promise<void> {
  await control.focus();
  const focus = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
    };
  });

  expect(focus.outlineStyle, `${label}: outline style`).not.toBe('none');
  expect(focus.outlineWidth, `${label}: outline width`).toBeGreaterThanOrEqual(2);
  expect(focus.outlineColor, `${label}: outline color`).toContain('103, 232, 249');
}

test.describe('Figma redesign hardening', () => {
  for (const viewport of VIEWPORTS) {
    test(`primary surfaces do not create horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
      await expectNoHorizontalOverflow(page, `${viewport.name} Status`);

      await page.getByRole('button', { name: /^Live/ }).click();
      await page.waitForSelector('section[aria-label="Live latency trace"]');
      await expectNoHorizontalOverflow(page, `${viewport.name} Live`);

      await page.getByRole('button', { name: /^Investigate/ }).click();
      await page.waitForSelector('section[aria-label="Investigate"]');
      await expectNoHorizontalOverflow(page, `${viewport.name} Investigate`);

      await page.goto(sharedReportUrl());
      await page.waitForSelector('section[aria-label="Diagnostic report"]');
      await expectNoHorizontalOverflow(page, `${viewport.name} Report`);
    });
  }

  test('primary keyboard focus rings remain strong on the dark interface', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await expectStrongFocusRing(page.getByRole('button', { name: /Run Your Own Test|Stop|Start/i }).first(), 'topbar run control');
    await expectStrongFocusRing(page.getByRole('button', { name: /^Live/ }), 'Live tab');
    await expectStrongFocusRing(page.getByRole('button', { name: /^Investigate/ }), 'Investigate tab');

    await page.goto(sharedReportUrl());
    await page.waitForSelector('section[aria-label="Diagnostic report"]');
    await expectStrongFocusRing(page.getByRole('button', { name: /Copy Support Summary/i }), 'report copy summary');
    await expectStrongFocusRing(page.getByRole('button', { name: /Copy Report Link/i }), 'report copy link');
  });
});
