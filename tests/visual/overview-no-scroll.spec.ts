import { test, expect, type Page } from '@playwright/test';

// Acceptance: the Overview view fits in one viewport without scrolling at the
// desktop floor (1366×768) and mobile floor (360×780), across the measurement
// lifecycle (cold / first round). See
// docs/superpowers/research/2026-04-22-overview-no-scroll-acceptance-criteria.md.

const FLOORS = [
  { name: 'desktop-floor', width: 1366, height: 768 },
  { name: 'mobile-floor',  width: 360,  height: 780 },
  { name: 'mobile-390',    width: 390,  height: 844 },
] as const;

interface ScrollerReport {
  readonly tag: string;
  readonly className: string;
  readonly id: string;
  readonly scrollH: number;
  readonly clientH: number;
  readonly overflow: number;
}

interface ScrollCheck {
  readonly docScrollH: number;
  readonly docClientH: number;
  readonly overflowingScrollers: readonly ScrollerReport[];
}

const scrollState = async (page: Page): Promise<ScrollCheck> => {
  return await page.evaluate<ScrollCheck>(() => {
    const docEl = document.documentElement;
    const main = document.querySelector<HTMLElement>('main#main-content');
    const scope = main ?? docEl;
    // Include `scope` itself — `querySelectorAll('*')` only returns
    // descendants, so without this the root scroller (e.g. `.shell-main`'s
    // `overflow-y: auto`) is excluded from the check and can overflow
    // silently.
    const candidates = [scope as HTMLElement, ...Array.from(scope.querySelectorAll<HTMLElement>('*'))];
    const reports: ScrollerReport[] = [];
    // Include `hidden` — a container that clips content is hiding information
    // just as much as a scroller that lets the user reach it.
    const CLIPPING = new Set(['auto', 'scroll', 'hidden']);
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      if (!CLIPPING.has(cs.overflowY)) continue;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow <= 0) continue;
      reports.push({
        tag: el.tagName,
        className: el.className,
        id: el.id,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        overflow,
      });
    }
    return {
      docScrollH: docEl.scrollHeight,
      docClientH: docEl.clientHeight,
      overflowingScrollers: reports,
    };
  });
};

test.describe('Overview — no scroll on first visit', () => {
  for (const vp of FLOORS) {
    test(`cold state @ ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
      // Let first paint settle — fonts + entrance transitions.
      await page.waitForTimeout(400);

      const state = await scrollState(page);
      expect(
        state.docScrollH,
        `document scrollHeight (${state.docScrollH}) > clientHeight (${state.docClientH})`,
      ).toBeLessThanOrEqual(state.docClientH);
      expect(
        state.overflowingScrollers,
        `internal scrollers with hidden content: ${JSON.stringify(state.overflowingScrollers, null, 2)}`,
      ).toEqual([]);
    });
  }

  test('lifecycle stability @ mobile-floor (no reflow after engine starts)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    const cold = await scrollState(page);
    expect(cold.overflowingScrollers).toEqual([]);

    // Transition idle → running. The AC here is layout stability across the
    // state change, not actual measurements landing (headless network may
    // block probes). Waiting ~1.2 s is enough for the engine lifecycle
    // transition plus any entrance transitions on the dial / verdict cards.
    await page.getByRole('button', { name: /^start$/i }).click();
    await page.waitForTimeout(1200);

    const afterStart = await scrollState(page);
    expect(
      afterStart.overflowingScrollers,
      `new overflow after lifecycle change: ${JSON.stringify(afterStart.overflowingScrollers, null, 2)}`,
    ).toEqual([]);
  });
});
