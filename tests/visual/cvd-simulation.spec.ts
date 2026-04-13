import { test, expect } from '@playwright/test';

// CVD simulation matrices — Machado 2009 standard values
// Source: Machado, Oliveira, Fernandes (2009) "A Physiologically-based Model
//         for Simulation of Color Vision Deficiency"
const CVD_FILTERS = ['protanopia', 'deuteranopia', 'tritanopia'] as const;

type CvdFilter = typeof CVD_FILTERS[number];

const CVD_MATRICES: Record<CvdFilter, string> = {
  protanopia:   '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  tritanopia:   '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
};

test.describe('CVD Color Simulation', () => {
  for (const name of CVD_FILTERS) {
    test(`${name} simulation screenshot`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');

      // Inject SVG filter and apply to body
      // Safety: all values are hardcoded constants, no user input is involved
      await page.evaluate(([filterName, matrixValues]: [CvdFilter, string]) => {
        const filterId = `${filterName}-filter`;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('style', 'position:absolute;width:0;height:0');

        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);

        const feColorMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        feColorMatrix.setAttribute('type', 'matrix');
        feColorMatrix.setAttribute('values', matrixValues);

        filter.appendChild(feColorMatrix);
        svg.appendChild(filter);
        document.body.appendChild(svg);
        document.body.style.filter = `url(#${filterId})`;
      }, [name, CVD_MATRICES[name]] as [CvdFilter, string]);

      await expect(page).toHaveScreenshot(`cvd-${name}.png`, { maxDiffPixelRatio: 0.001 });
    });
  }
});
