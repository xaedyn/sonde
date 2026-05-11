import { test, expect, type Page } from '@playwright/test';

// Acceptance: the Status view fits in one viewport without scrolling at the
// desktop floor (1366×768) and mobile floor (360×780), across the measurement
// lifecycle (cold / first round). See
// docs/superpowers/research/2026-04-22-overview-no-scroll-acceptance-criteria.md.

// Viewports the no-scroll invariant must hold at: the original "floor"
// cases (1366×768 desktop, 360/390-wide mobile) plus wide displays added
// for the fluid grid/dial ceiling. 1920×1080 is common laptop;
// 2560×1440 is typical 32" monitor — the case the fluid layout was
// introduced for.
const VIEWPORTS = [
  { name: 'desktop-floor', width: 1366, height: 768 },
  { name: 'mobile-floor',  width: 360,  height: 780 },
  { name: 'mobile-390',    width: 390,  height: 844 },
  { name: 'mobile-short',  width: 390,  height: 700 },
  { name: 'iphone-se',     width: 375,  height: 667 },
  { name: 'desktop-1920',  width: 1920, height: 1080 },
  { name: 'desktop-2560',  width: 2560, height: 1440 },
] as const;

const RUNNING_OR_STARTING_CONTROL = /^(?:Starting\.\.\.|Stop)$/i;

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
      const isSrOnly =
        cs.position === 'absolute' &&
        el.clientWidth <= 1 &&
        el.clientHeight <= 1 &&
        (cs.clipPath !== 'none' || cs.clip !== 'auto');
      if (isSrOnly) continue;
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

test.describe('Status — no scroll on first visit', () => {
  for (const vp of VIEWPORTS) {
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

  // Guards the fluid grid + container-query dial introduced for ultrawide
  // monitors. If someone reverts the grid ceiling or the dial's cqi rule, the
  // dial snaps back to its 520 px design size and this test fires.
  test('dial and grid grow on wide viewports', async ({ page }) => {
    const measure = async (w: number, h: number) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
      await page.waitForTimeout(400);
      return await page.evaluate(() => {
        const dial = document.querySelector<SVGElement>('svg.dial');
        const grid = document.querySelector<HTMLElement>('.overview-grid');
        return {
          dialW: dial ? dial.getBoundingClientRect().width : 0,
          gridW: grid ? grid.getBoundingClientRect().width : 0,
        };
      });
    };

    const at1440 = await measure(1440, 900);
    const at2560 = await measure(2560, 1440);

    // 1440 holds the design size (floor); 2560 hits both ceilings.
    expect(at1440.dialW, 'dial at 1440').toBeGreaterThanOrEqual(515);
    expect(at1440.dialW, 'dial at 1440').toBeLessThanOrEqual(560);
    expect(at2560.dialW, 'dial at 2560').toBeGreaterThanOrEqual(700);
    expect(at2560.dialW, 'dial at 2560').toBeLessThanOrEqual(725);
    expect(at2560.gridW, 'grid at 2560').toBeGreaterThanOrEqual(2150);
    expect(at2560.gridW, 'grid at 2560').toBeLessThanOrEqual(2205);
    // The grid at 2560 must be materially wider than at 1440 — the whole
    // point of the fluid layout.
    expect(at2560.gridW).toBeGreaterThan(at1440.gridW + 600);
  });

  test('lifecycle stability @ mobile-floor (no reflow after engine starts)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    const cold = await scrollState(page);
    expect(cold.overflowingScrollers).toEqual([]);

    // Transition idle → running when auto-start is suppressed. In the default
    // seeded app state this may already be running by first paint; the AC here
    // is layout stability across the running lifecycle, not the click itself.
    const startButton = page.getByRole('button', { name: /^start$/i });
    if (await startButton.isVisible({ timeout: 200 }).catch(() => false)) {
      await startButton.click();
    } else {
      await expect(page.getByRole('button', { name: RUNNING_OR_STARTING_CONTROL })).toBeVisible();
    }
    await page.waitForTimeout(1200);

    const afterStart = await scrollState(page);
    expect(
      afterStart.overflowingScrollers,
      `new overflow after lifecycle change: ${JSON.stringify(afterStart.overflowingScrollers, null, 2)}`,
    ).toEqual([]);
  });

  test('status evidence stays visible without scrolling on short mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
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

    const reachability = await page.evaluate(() => {
      const overview = document.querySelector<HTMLElement>('.overview');
      const subtabStrip = document.querySelector<HTMLElement>('.overview-subtab-strip');
      const panel = document.querySelector<HTMLElement>('#overview-panel-racing');
      const docEl = document.documentElement;
      if (!overview || !subtabStrip || !panel) {
        return {
          hasNodes: false,
          stripFullyVisible: false,
          panelFullyVisible: false,
          horizontalOverflow: true,
        };
      }

      const viewportH = window.innerHeight;
      const stripRect = subtabStrip.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const fullyVisible = (rect: DOMRect): boolean => rect.top >= 0 && rect.bottom <= viewportH;

      return {
        hasNodes: true,
        stripFullyVisible: fullyVisible(stripRect),
        panelFullyVisible: fullyVisible(panelRect),
        horizontalOverflow: docEl.scrollWidth > docEl.clientWidth,
      };
    });

    expect(reachability.hasNodes).toBe(true);
    expect(reachability.horizontalOverflow, 'document should not overflow horizontally').toBe(false);
    expect(reachability.stripFullyVisible, 'Status subtab strip should fit in the first viewport').toBe(true);
    expect(reachability.panelFullyVisible, 'Status evidence panel should fit in the first viewport').toBe(true);
  });
});
