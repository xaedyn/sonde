// Playwright runner for the Phase 2 PR screenshots. Outputs four PNGs into
// ./screenshots/phase-2/ covering the four dial states:
//   1. at rest      — no data, "Awaiting samples" verdict
//   2. healthy      — all endpoints under threshold
//   3. mixed        — one degraded, others healthy
//   4. critical     — majority over threshold, pulse + pink verdict
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('screenshots/phase-2');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; });

  // Shot 1 — at rest (no data).
  await page.screenshot({ path: path.join(OUT, '1-at-rest.png'), type: 'png' });

  // Helper: get the current endpoint list once (synchronous read pattern).
  async function seedSamples(profiles) {
    await page.evaluate(async (profiles) => {
      const measMod = await import('/src/lib/stores/measurements.ts');
      const epMod = await import('/src/lib/stores/endpoints.ts');
      const eps = await new Promise((resolve) => {
        let unsub;
        unsub = epMod.endpointStore.subscribe((v) => { resolve(v); queueMicrotask(() => unsub?.()); });
      });
      // Reset before reseeding so repeated runs don't compound samples.
      measMod.measurementStore.reset();
      for (let i = 0; i < eps.length; i++) {
        const ep = eps[i];
        const lat = profiles[i] || profiles[profiles.length - 1];
        measMod.measurementStore.initEndpoint(ep.id);
        for (let r = 0; r < lat.length; r++) {
          measMod.measurementStore.addSample(ep.id, r + 1, lat[r], 'ok', Date.now() + r);
        }
      }
    }, profiles);
    await page.waitForTimeout(300);
  }

  const fast = Array.from({ length: 35 }, (_, i) => 25 + (i % 5) * 2);   // ~29ms p50
  const mid  = Array.from({ length: 35 }, (_, i) => 180 + (i % 5) * 10); // ~200ms p50 (over)
  const slow = Array.from({ length: 35 }, (_, i) => 950 + (i % 5) * 50); // ~1000ms p50

  // Shot 2 — healthy (all endpoints under threshold).
  await seedSamples([fast, fast, fast, fast]);
  await page.screenshot({ path: path.join(OUT, '2-healthy.png'), type: 'png' });

  // Shot 3 — mixed (two healthy, two degraded).
  await seedSamples([fast, mid, fast, mid]);
  await page.screenshot({ path: path.join(OUT, '3-mixed.png'), type: 'png' });

  // Shot 4 — critical (three slow + one mid → unhealthy aggregate).
  await seedSamples([slow, mid, slow, slow]);
  await page.screenshot({ path: path.join(OUT, '4-critical.png'), type: 'png' });

  console.log('Screenshots written to', OUT);
} finally {
  await browser.close();
}
