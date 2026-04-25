import { test, expect, type Page } from '@playwright/test';

// AC5 — fail-closed sweep: no raw URL string appears as the textContent of
// a primary-identifier element on Overview, Live, or Diagnose views.
//
// "Primary identifier" means the name/label slot for an endpoint — the element
// the user scans to identify which endpoint is being described.  Subtitle
// elements that intentionally display URLs (`.rail-row-url`, `.diagnose-title-url`)
// are excluded.
//
// Class mapping (verified against component source 2026-04-25):
//   EndpointRail   →  .rail-row-label       (primary)  /  .rail-row-url      (subtitle — excluded)
//   DiagnoseView   →  .diagnose-title-name  (primary)  /  .diagnose-title-url (subtitle — excluded)
//   EventFeed      →  .feed-name            (primary)  — no URL subtitle element
//
// The sentinel test injects a synthetic .rail-row-label with a raw URL into
// the live DOM and asserts the sweep catches it, proving fail-closed behaviour.

const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile',  width: 375,  height: 812 },
] as const;

// Selectors for primary identifier elements.  Subtitle / secondary elements
// that intentionally carry URLs are NOT listed here.
const PRIMARY_SELECTORS = [
  '.rail-row-label',
  '.diagnose-title-name',
  '.feed-name',
] as const;

// Patterns that unambiguously identify a raw URL string.
const URL_PATTERNS = [
  /^https?:\/\//i,
  /^\/\//,
  /^www\./i,
];

function looksLikeUrl(text: string): boolean {
  return URL_PATTERNS.some((re) => re.test(text.trim()));
}

interface RawUrlLeak {
  readonly selector: string;
  readonly text: string;
}

/**
 * Walk every visible primary-identifier element in the page and return any
 * whose textContent looks like a raw URL.
 */
const findRawUrlLeaks = async (page: Page): Promise<readonly RawUrlLeak[]> => {
  return await page.evaluate(
    ({ selectors, urlPatternStrings }: { selectors: readonly string[]; urlPatternStrings: readonly string[] }) => {
      const patterns = urlPatternStrings.map((s) => new RegExp(s, 'i'));

      function looksLikeUrl(text: string): boolean {
        return patterns.some((re) => re.test(text.trim()));
      }

      const leaks: RawUrlLeak[] = [];
      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
        for (const el of elements) {
          // Visibility filter: must have non-zero dimensions and not be display:none.
          const rect = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            cs.display !== 'none' &&
            cs.visibility !== 'hidden';
          if (!visible) continue;

          const text = (el.textContent ?? '').trim();
          if (looksLikeUrl(text)) {
            leaks.push({ selector, text });
          }
        }
      }
      return leaks;
    },
    {
      selectors: PRIMARY_SELECTORS as readonly string[],
      // Serialise RegExp sources so they cross the evaluate boundary.
      urlPatternStrings: URL_PATTERNS.map((re) => re.source),
    },
  );
};

// ── Real-view sweeps ──────────────────────────────────────────────────────────

test.describe('AC5 — no raw URL in primary identifiers', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`@ ${vp.name} (${vp.width}×${vp.height})`, () => {
      test('Overview view', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        await page.waitForSelector('#chronoscope-root');
        await page.waitForTimeout(400);

        const leaks = await findRawUrlLeaks(page);
        expect(
          leaks,
          `Raw URL(s) found in primary identifier elements on Overview: ${JSON.stringify(leaks)}`,
        ).toEqual([]);
      });

      test('Live view', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        await page.waitForSelector('#chronoscope-root');
        await page.waitForTimeout(400);

        // Navigate to the Live view via the nav tab.
        const liveTab = page.getByRole('tab', { name: /live/i });
        const liveTabExists = await liveTab.count();
        if (liveTabExists > 0) {
          await liveTab.click();
          await page.waitForTimeout(300);
        }

        const leaks = await findRawUrlLeaks(page);
        expect(
          leaks,
          `Raw URL(s) found in primary identifier elements on Live: ${JSON.stringify(leaks)}`,
        ).toEqual([]);
      });

      test('Diagnose view', async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        await page.waitForSelector('#chronoscope-root');
        await page.waitForTimeout(400);

        // Navigate to Diagnose via the nav tab.
        const diagnoseTab = page.getByRole('tab', { name: /diagnose/i });
        const diagnoseTabExists = await diagnoseTab.count();
        if (diagnoseTabExists > 0) {
          await diagnoseTab.click();
          await page.waitForTimeout(300);
        }

        const leaks = await findRawUrlLeaks(page);
        expect(
          leaks,
          `Raw URL(s) found in primary identifier elements on Diagnose: ${JSON.stringify(leaks)}`,
        ).toEqual([]);
      });
    });
  }
});

// ── Sentinel test — fail-closed verification ──────────────────────────────────
//
// Injects a synthetic .rail-row-label element containing a raw URL into the
// live DOM, then asserts the sweep detects it.  If the sweep returns empty here,
// the detection logic is broken and would silently miss real regressions.

test.describe('AC5 sentinel — sweep is fail-closed', () => {
  test('detects injected raw URL in .rail-row-label', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    // Inject a visible span with the primary-identifier class and a raw URL.
    await page.evaluate(() => {
      const sentinel = document.createElement('span');
      sentinel.className = 'rail-row-label';
      sentinel.textContent = 'https://sentinel.example.com/test';
      sentinel.style.cssText = 'display:inline-block;width:200px;height:20px;position:fixed;top:10px;left:10px;z-index:9999;visibility:visible';
      document.body.appendChild(sentinel);
    });

    const leaks = await findRawUrlLeaks(page);
    expect(
      leaks.length,
      'Sentinel: sweep must detect the injected raw URL — if this fails the sweep logic is broken',
    ).toBeGreaterThan(0);
    expect(leaks[0]?.text).toMatch(/^https:\/\/sentinel\.example\.com/);
  });
});
