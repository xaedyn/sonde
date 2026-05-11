import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

interface AxeNodeSummary {
  readonly target: readonly string[];
  readonly html: string;
}

interface AxeViolationSummary {
  readonly id: string;
  readonly impact: string | null;
  readonly nodes: readonly AxeNodeSummary[];
}

interface SampleSeedSpec {
  readonly endpointId: string;
  readonly count: number;
  readonly latencyMs: number;
  readonly jitterMs: number;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const summary: AxeViolationSummary[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
    })),
  }));

  expect(summary).toEqual([]);
}

async function visibleEndpointIds(page: Page): Promise<string[]> {
  await page.waitForSelector('[data-endpoint-id]', { state: 'attached', timeout: 3000 });
  return await page
    .locator('[data-endpoint-id]')
    .evaluateAll((els) => {
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const el of els) {
        const id = el.getAttribute('data-endpoint-id');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
      return ids;
    });
}

async function injectSampleSpecs(page: Page, specs: readonly SampleSeedSpec[]): Promise<void> {
  await page.waitForFunction(() => typeof window.__chronoscope_inject_samples === 'function');
  await page.evaluate((seedSpecs) => {
    const inject = window.__chronoscope_inject_samples;
    if (!inject) throw new Error('__chronoscope_inject_samples is unavailable');
    inject(seedSpecs);
  }, specs);
}

async function seedVisibleSamples(page: Page): Promise<void> {
  const ids = await visibleEndpointIds(page);
  await injectSampleSpecs(page, ids.map((endpointId, index) => ({
    endpointId,
    count: 24,
    latencyMs: 45 + index * 24,
    jitterMs: 4,
  })));
}

test.describe('Accessibility', () => {
  test('no axe violations on empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    await expectNoAxeViolations(page);
  });

  test('no axe violations on populated primary views', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await seedVisibleSamples(page);

    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: /^Live/ }).click();
    await page.waitForSelector('section[aria-label="Live latency trace"]');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: /^Investigate/ }).click();
    await page.waitForSelector('section[aria-label="Investigate"]');
    await expectNoAxeViolations(page);
  });

  test('remote vantage evidence labels meet text contrast', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await seedVisibleSamples(page);

    await page.getByRole('button', { name: /^Investigate/ }).click();
    await page.waitForSelector('.remote-evidence dt');

    const ratios = await page.locator('.remote-evidence dt').evaluateAll((elements) => {
      type Rgba = [number, number, number, number];

      function parseComputedRgba(value: string): Rgba {
        if (value === 'transparent') return [0, 0, 0, 0];
        const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/);
        if (!match) throw new Error(`Unsupported color value: ${value}`);
        return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
      }

      function composite(top: Rgba, bottom: Rgba): Rgba {
        const alpha = top[3] + bottom[3] * (1 - top[3]);
        if (alpha === 0) return [0, 0, 0, 0];
        return [
          (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
          (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
          (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
          alpha,
        ];
      }

      function luminance(rgb: readonly number[]): number {
        const [r, g, b] = rgb.map((channel) => {
          const value = channel / 255;
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      return elements.map((element) => {
        const style = getComputedStyle(element);
        const ancestors: Element[] = [];
        let backgroundElement: Element | null = element;
        while (backgroundElement) {
          ancestors.unshift(backgroundElement);
          backgroundElement = backgroundElement.parentElement;
        }

        let effectiveBackground: Rgba = [0, 0, 0, 1];
        for (const ancestor of ancestors) {
          effectiveBackground = composite(parseComputedRgba(getComputedStyle(ancestor).backgroundColor), effectiveBackground);
        }
        const effectiveForeground = composite(parseComputedRgba(style.color), effectiveBackground);
        const foreground = luminance(effectiveForeground);
        const backgroundLum = luminance(effectiveBackground);
        const lighter = Math.max(foreground, backgroundLum);
        const darker = Math.min(foreground, backgroundLum);
        return {
          text: element.textContent?.trim(),
          color: style.color,
          background: getComputedStyle(element).backgroundColor,
          effectiveBackground,
          ratio: (lighter + 0.05) / (darker + 0.05),
        };
      });
    });

    for (const ratio of ratios) {
      expect(ratio.ratio, `${ratio.text} contrast: ${JSON.stringify(ratio)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('skip link is keyboard-accessible', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeFocused();
  });

  test('all canvas elements have ARIA attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');

    const canvases = page.locator('canvas[tabindex="0"]');
    const count = await canvases.count();

    for (let i = 0; i < count; i++) {
      const canvas = canvases.nth(i);
      await expect(canvas).toHaveAttribute('role', 'application');
      const desc = await canvas.getAttribute('aria-roledescription');
      expect(desc).toBeTruthy();
    }
  });
});
