// Playwright runner for the Phase 2.5 PR screenshots. Outputs four PNGs:
//   1. Classic dial (overviewMode='classic')          — Phase 2 visual sanity
//   2. Enriched dial (overviewMode='enriched')        — baseline arc, score
//   3. Causal verdict populated                       — after seeding mixed stats
//   4. Event feed with ≥3 entries                     — after toggling thresholds
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('screenshots/phase-2-5');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; });

  async function seedSamples(profiles) {
    await page.evaluate(async (profiles) => {
      const measMod = await import('/src/lib/stores/measurements.ts');
      const epMod = await import('/src/lib/stores/endpoints.ts');
      const eps = await new Promise((resolve) => {
        let unsub;
        unsub = epMod.endpointStore.subscribe((v) => { resolve(v); queueMicrotask(() => unsub?.()); });
      });
      measMod.measurementStore.reset();
      for (let i = 0; i < eps.length; i++) {
        const ep = eps[i];
        const lat = profiles[i] || profiles[profiles.length - 1];
        measMod.measurementStore.initEndpoint(ep.id);
        for (let r = 0; r < lat.length; r++) {
          measMod.measurementStore.addSample(ep.id, r + 1, lat[r], 'ok', Date.now() - (lat.length - r) * 1000);
        }
      }
    }, profiles);
    await page.waitForTimeout(300);
  }

  async function setOverviewMode(mode) {
    await page.evaluate(async (mode) => {
      const settingsMod = await import('/src/lib/stores/settings.ts');
      settingsMod.settingsStore.update((s) => ({ ...s, overviewMode: mode }));
    }, mode);
    await page.waitForTimeout(200);
  }

  // Shot 1 — Classic dial (mid-load state with healthy samples for visual clarity).
  const fast = Array.from({ length: 35 }, (_, i) => 25 + (i % 5) * 2);
  await setOverviewMode('classic');
  await seedSamples([fast, fast, fast, fast]);
  await page.screenshot({ path: path.join(OUT, '1-classic.png'), type: 'png' });

  // Shot 2 — Enriched dial, healthy: baseline arc + quality trace.
  await setOverviewMode('enriched');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '2-enriched-healthy.png'), type: 'png' });

  // Shot 3 — Enriched, mixed state with a verdict populated.
  const slow = Array.from({ length: 35 }, (_, i) => 180 + (i % 5) * 10);
  await seedSamples([fast, slow, slow, fast]);
  // Nudge baseline recompute.
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '3-enriched-verdict.png'), type: 'png' });

  // Shot 4 — Event feed with ≥3 entries by toggling latencies across rounds.
  await page.evaluate(async () => {
    const measMod = await import('/src/lib/stores/measurements.ts');
    const epMod = await import('/src/lib/stores/endpoints.ts');
    const eps = await new Promise((resolve) => {
      let unsub;
      unsub = epMod.endpointStore.subscribe((v) => { resolve(v); queueMicrotask(() => unsub?.()); });
    });
    // Push a sequence of alternating over/under samples to fabricate several
    // crossings across multiple endpoints. Timestamps must be in the past so
    // relTime() doesn't clamp everything to "0s ago". Per-endpoint offset
    // avoids key collisions on `${t}-${epId}-${kind}` when all five cycles
    // emit the same transition millisecond.
    let round = 40;
    const now = Date.now();
    for (let cycle = 0; cycle < 5; cycle++) {
      const over = cycle % 2 === 0;
      const cycleTime = now - (5 - cycle) * 1000;
      for (let epIdx = 0; epIdx < eps.length; epIdx++) {
        const ep = eps[epIdx];
        const lat = over ? 300 : 25;
        measMod.measurementStore.addSample(ep.id, round, lat, 'ok', cycleTime - epIdx * 10);
      }
      round++;
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '4-enriched-events.png'), type: 'png' });

  console.log('Screenshots written to', OUT);
} finally {
  await browser.close();
}
