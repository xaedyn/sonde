// One-shot Playwright runner for the Phase 1 PR screenshots. Outputs four
// PNGs into ./screenshots/phase-1/ at the project root. Not part of the build;
// run manually with `node scripts/phase-1-screenshots.mjs`.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('screenshots/phase-1');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();

await page.goto('http://127.0.0.1:5173/');
// Clear any persisted state so the friendly default endpoint labels render.
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForLoadState('networkidle');

// Shot 1 — at rest (no data).
await page.screenshot({ path: path.join(OUT, '1-at-rest.png'), type: 'png' });

// Shot 2 — hover on the second rail row.
const rows = page.locator('nav[aria-label="Endpoints"] [role="tab"]');
await rows.nth(1).hover();
await page.waitForTimeout(180);
await page.screenshot({ path: path.join(OUT, '2-hover.png'), type: 'png' });

// Shot 3 — click to focus the third rail row.
await rows.nth(2).click();
// Move pointer off the row + blur to remove hover styling so only the focused
// state shows in the screenshot.
await page.mouse.move(800, 500);
await page.evaluate(() => { document.activeElement instanceof HTMLElement && document.activeElement.blur(); });
await page.waitForTimeout(180);
await page.screenshot({ path: path.join(OUT, '3-focused.png'), type: 'png' });

// Shot 4 — degraded network state (force stats by injecting samples).
await page.evaluate(async () => {
  const measMod = await import('/src/lib/stores/measurements.ts');
  const epMod   = await import('/src/lib/stores/endpoints.ts');
  // Use the store's own subscribe to grab the current value — avoids needing
  // to resolve the bare 'svelte/store' specifier from the browser.
  const eps = await new Promise((resolve) => {
    const unsub = epMod.endpointStore.subscribe((v) => { resolve(v); setTimeout(unsub, 0); });
  });
  const slow = Array.from({ length: 33 }, (_, i) => 950 + (i % 5) * 50);
  const med  = Array.from({ length: 33 }, (_, i) => 180 + (i % 5) * 10);
  const profiles = [slow, med, slow, slow];
  for (let i = 0; i < eps.length; i++) {
    const ep = eps[i];
    measMod.measurementStore.initEndpoint(ep.id);
    const lat = profiles[i] || slow;
    for (let r = 0; r < lat.length; r++) {
      measMod.measurementStore.addSample(ep.id, r + 1, lat[r], 'ok', Date.now() + r);
    }
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, '4-degraded.png'), type: 'png' });

await browser.close();
console.log('Screenshots written to', OUT);
