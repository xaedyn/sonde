import { test, expect } from '@playwright/test';

// CVD simulation matrices (injected via CSS filter)
const CVD_FILTERS = ['protanopia', 'deuteranopia', 'tritanopia'] as const;

type CvdFilter = typeof CVD_FILTERS[number];

test.describe('CVD Color Simulation', () => {
  for (const name of CVD_FILTERS) {
    test(`${name} simulation screenshot`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForSelector('#sonde-root');

      // Inject SVG filter and apply to body
      // Safety: all values are hardcoded constants, no user input is involved
      await page.evaluate((filterName: CvdFilter) => {
        const filterId = `${filterName}-filter`;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('style', 'position:absolute;width:0;height:0');

        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);

        const feColorMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        feColorMatrix.setAttribute('type', 'matrix');
        feColorMatrix.setAttribute('values', '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0');

        filter.appendChild(feColorMatrix);
        svg.appendChild(filter);
        document.body.appendChild(svg);
        document.body.style.filter = `url(#${filterId})`;
      }, name);

      await expect(page).toHaveScreenshot(`cvd-${name}.png`, { maxDiffPixelRatio: 0.001 });
    });
  }
});
