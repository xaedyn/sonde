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

const MIN_TOUCH_TARGET_PX = 24;
const RUNNING_OR_STARTING_CONTROL = /^(?:Starting\.\.\.|Stop)$/i;

interface VisibleEndpointTarget {
  readonly id: string;
}

interface LayoutBox {
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly bottom: number;
}

interface StatusLayoutMeasurement {
  readonly main: LayoutBox | null;
  readonly verdict: LayoutBox | null;
  readonly grid: LayoutBox | null;
  readonly dial: LayoutBox | null;
  readonly racing: LayoutBox | null;
  readonly timeline: LayoutBox | null;
  readonly detail: LayoutBox | null;
}

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

const visibleEndpointTargets = async (page: Page): Promise<VisibleEndpointTarget[]> => {
  await page.waitForSelector('[data-endpoint-id]', { state: 'attached', timeout: 3000 });
  return await page.locator('[data-endpoint-id]').evaluateAll((els) => {
    const seen = new Set<string>();
    const targets: VisibleEndpointTarget[] = [];
    for (const el of els) {
      const id = el.getAttribute('data-endpoint-id');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      targets.push({ id });
    }
    return targets;
  });
};

const injectWarningSamples = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => typeof window.__chronoscope_inject_samples === 'function');
  const targets = await visibleEndpointTargets(page);
  expect(targets.length).toBeGreaterThan(1);
  const slowIndex = Math.min(2, targets.length - 1);
  await page.evaluate(
    ({ seedTargets, targetIndex }) => {
      const inject = window.__chronoscope_inject_samples;
      if (!inject) throw new Error('__chronoscope_inject_samples is unavailable');
      const originalRandom = Math.random;
      let randomStep = 0;
      Math.random = () => ((randomStep++ % 36) + 0.5) / 36;
      try {
        inject(seedTargets.map((target, index) => ({
          endpointId: target.id,
          count: 36,
          latencyMs: index === targetIndex ? 360 : 42 + index * 8,
          jitterMs: 3,
        })));
      } finally {
        Math.random = originalRandom;
      }
    },
    { seedTargets: targets, targetIndex: slowIndex },
  );
  await page.waitForTimeout(150);
};

const measureStatusLayout = async (page: Page): Promise<StatusLayoutMeasurement> => {
  return await page.evaluate<StatusLayoutMeasurement>(() => {
    const box = (selector: string): LayoutBox | null => {
      const element = document.querySelector<HTMLElement | SVGElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
      };
    };
    return {
      main: box('main#main-content'),
      verdict: box('.verdict.hero'),
      grid: box('.overview-grid'),
      dial: box('svg.dial'),
      racing: box('#overview-panel-racing'),
      timeline: box('#overview-panel-events'),
      detail: box('.overview-right'),
    };
  });
};

const measureMinTimelineRowHeight = async (page: Page): Promise<number> => {
  const timelineRows = page.locator('#overview-panel-events .story-row');
  await expect(
    timelineRows,
    'Timeline should render endpoint rows before checking touch targets',
  ).not.toHaveCount(0);
  return await timelineRows.evaluateAll((rows) => (
    Math.min(...rows.map((row) => row.getBoundingClientRect().height))
  ));
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

  test('desktop warning copy does not resize or push the Status dial', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    const cold = await measureStatusLayout(page);
    expect(cold.main).not.toBeNull();
    expect(cold.verdict).not.toBeNull();
    expect(cold.dial).not.toBeNull();

    await injectWarningSamples(page);
    const warning = await measureStatusLayout(page);
    expect(warning.main).not.toBeNull();
    expect(warning.verdict).not.toBeNull();
    expect(warning.dial).not.toBeNull();

    expect(
      Math.abs(warning.verdict!.height - cold.verdict!.height),
      `verdict height changed from ${cold.verdict!.height}px to ${warning.verdict!.height}px`,
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(warning.dial!.height - cold.dial!.height),
      `dial height changed from ${cold.dial!.height}px to ${warning.dial!.height}px`,
    ).toBeLessThanOrEqual(2);
    expect(
      warning.dial!.bottom,
      `dial bottom (${warning.dial!.bottom}) should stay within main bottom (${warning.main!.bottom})`,
    ).toBeLessThanOrEqual(warning.main!.bottom - 4);
  });

  test('recent timeline remains reachable on short desktop viewport (1366x768)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    const state = await scrollState(page);
    expect(
      state.overflowingScrollers,
      `internal scrollers with hidden content: ${JSON.stringify(state.overflowingScrollers, null, 2)}`,
    ).toEqual([]);

    const reachability = await page.evaluate(async () => {
      const findTimelineHeading = () =>
        Array.from(document.querySelectorAll<HTMLElement>('h3')).find(
          (heading) => heading.textContent?.trim() === 'What happened',
        );
      const timelineTab = Array.from(document.querySelectorAll<HTMLElement>('button[role="tab"]')).find(
        (tab) => tab.textContent?.trim() === 'Timeline',
      );
      const visible = (element: HTMLElement | undefined): boolean => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.bottom <= viewportH
        );
      };
      const intersectsViewport = (element: HTMLElement | undefined): boolean => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < viewportH
        );
      };
      let headingVisible = visible(findTimelineHeading());
      const tabVisible = intersectsViewport(timelineTab);

      if (!headingVisible && tabVisible && timelineTab) {
        timelineTab.click();
        const deadline = performance.now() + 800;
        while (performance.now() < deadline) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          headingVisible = visible(findTimelineHeading());
          if (headingVisible) break;
        }
      }

      return {
        headingVisible,
        tabVisible,
      };
    });

    expect(
      reachability.headingVisible || reachability.tabVisible,
      `timeline should be visible or reachable via visible tab: ${JSON.stringify(reachability)}`,
    ).toBe(true);
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

  test('warning state keeps the Status dial and evidence visible on iPhone SE', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    await injectWarningSamples(page);
    const warning = await measureStatusLayout(page);
    expect(warning.main).not.toBeNull();
    expect(warning.dial).not.toBeNull();
    expect(warning.racing).not.toBeNull();

    expect(
      warning.dial!.bottom,
      `dial bottom (${warning.dial!.bottom}) should stay within main bottom (${warning.main!.bottom})`,
    ).toBeLessThanOrEqual(warning.main!.bottom);
    expect(
      warning.racing!.bottom,
      `evidence bottom (${warning.racing!.bottom}) should stay within viewport (${page.viewportSize()?.height})`,
    ).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test('warning timeline fits the mobile Status detail slot', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    await injectWarningSamples(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(page.getByRole('heading', { name: 'What happened' })).toBeVisible();

    const activeTabVisual = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
      const timeline = tabs.find((tab) => tab.textContent?.trim() === 'Timeline');
      const perEndpoint = tabs.find((tab) => tab.textContent?.trim() === 'Per-endpoint');
      const bg = (tab: HTMLButtonElement | undefined): string | null => (
        tab ? getComputedStyle(tab).backgroundColor : null
      );
      return {
        timelineSelected: timeline?.getAttribute('aria-selected') === 'true',
        perEndpointSelected: perEndpoint?.getAttribute('aria-selected') === 'true',
        timelineBackground: bg(timeline),
        perEndpointBackground: bg(perEndpoint),
      };
    });
    expect(activeTabVisual.timelineSelected, 'Timeline tab should own the visible timeline panel').toBe(true);
    expect(activeTabVisual.perEndpointSelected, 'Per-endpoint tab should not be selected while Timeline is visible').toBe(false);
    expect(activeTabVisual.timelineBackground, 'Timeline tab should have a visible selected background').not.toBe('rgba(0, 0, 0, 0)');
    expect(activeTabVisual.perEndpointBackground, 'Per-endpoint tab should remain visually inactive').toBe('rgba(0, 0, 0, 0)');

    const minTimelineRowHeight = await measureMinTimelineRowHeight(page);
    expect(
      minTimelineRowHeight,
      `Timeline endpoint rows should preserve the ${MIN_TOUCH_TARGET_PX}px touch-target floor`,
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

    const warning = await measureStatusLayout(page);
    expect(warning.detail).not.toBeNull();
    expect(warning.timeline).not.toBeNull();

    expect(
      warning.timeline!.bottom,
      `timeline bottom (${warning.timeline!.bottom}) should stay inside detail slot (${warning.detail!.bottom})`,
    ).toBeLessThanOrEqual(warning.detail!.bottom);

    const state = await scrollState(page);
    expect(
      state.overflowingScrollers,
      `internal scrollers with hidden content: ${JSON.stringify(state.overflowingScrollers, null, 2)}`,
    ).toEqual([]);
  });

  test('warning timeline preserves touch targets on iPhone SE', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.waitForTimeout(400);

    await injectWarningSamples(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(page.getByRole('heading', { name: 'What happened' })).toBeVisible();

    const minTimelineRowHeight = await measureMinTimelineRowHeight(page);
    expect(
      minTimelineRowHeight,
      `Timeline endpoint rows should preserve the ${MIN_TOUCH_TARGET_PX}px touch-target floor`,
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

    const warning = await measureStatusLayout(page);
    expect(warning.detail).not.toBeNull();
    expect(warning.timeline).not.toBeNull();
    expect(
      warning.timeline!.bottom,
      `timeline bottom (${warning.timeline!.bottom}) should stay inside detail slot (${warning.detail!.bottom})`,
    ).toBeLessThanOrEqual(warning.detail!.bottom);

    const state = await scrollState(page);
    expect(
      state.overflowingScrollers,
      `internal scrollers with hidden content: ${JSON.stringify(state.overflowingScrollers, null, 2)}`,
    ).toEqual([]);
  });
});
