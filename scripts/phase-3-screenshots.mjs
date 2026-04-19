// Phase 3 Live view screenshots. Four states:
//   1. full scope at rest          — no samples, idle
//   2. scope with trace points     — seeded healthy latencies
//   3. focused-endpoint state      — one endpoint focused, solo mode
//   4. threshold-cross event       — samples crossing the trigger, chevrons
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('screenshots/phase-3');
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

  await page.evaluate(async () => {
    const uiMod = await import('/src/lib/stores/ui.ts');
    uiMod.uiStore.setActiveView('live');
  });
  await page.waitForTimeout(300);

  // Shot 1 — scope at rest, no samples.
  await page.screenshot({ path: path.join(OUT, '1-at-rest.png'), type: 'png' });

  // Materialise the per-endpoint sample arrays up front (array-of-arrays) so we
  // can ship them to the browser as plain data — no function-serialisation.
  async function seedSamplesFromProfiles(profiles) {
    await page.evaluate(async (profiles) => {
      const measMod = await import('/src/lib/stores/measurements.ts');
      const epMod = await import('/src/lib/stores/endpoints.ts');
      const eps = await new Promise((resolve) => {
        let unsub;
        unsub = epMod.endpointStore.subscribe((v) => { resolve(v); queueMicrotask(() => unsub?.()); });
      });
      measMod.measurementStore.reset();
      for (let epIdx = 0; epIdx < eps.length; epIdx++) {
        const ep = eps[epIdx];
        measMod.measurementStore.initEndpoint(ep.id);
        const samples = profiles[epIdx] ?? profiles[profiles.length - 1] ?? [];
        const nowTs = Date.now();
        for (let r = 0; r < samples.length; r++) {
          const s = samples[r];
          measMod.measurementStore.addSample(
            ep.id, r + 1, s.lat, s.status, nowTs - (samples.length - r) * 1000,
          );
        }
      }
    }, profiles);
    await page.waitForTimeout(300);
  }

  // Shot 2 — unified scope with four distinct traces.
  {
    const bases = [40, 70, 110, 155];
    const profiles = bases.map((base, epIdx) => {
      const out = [];
      for (let r = 0; r < 60; r++) {
        out.push({ lat: base + Math.sin(r * 0.4 + epIdx) * 8 + (r % 13), status: 'ok' });
      }
      return out;
    });
    await seedSamplesFromProfiles(profiles);
  }
  await page.screenshot({ path: path.join(OUT, '2-with-traces.png'), type: 'png' });

  // Shot 3 — solo mode after focusing the second endpoint.
  await page.evaluate(async () => {
    const uiMod = await import('/src/lib/stores/ui.ts');
    const epMod = await import('/src/lib/stores/endpoints.ts');
    const eps = await new Promise((resolve) => {
      let unsub;
      unsub = epMod.endpointStore.subscribe((v) => { resolve(v); queueMicrotask(() => unsub?.()); });
    });
    if (eps[1]) uiMod.uiStore.setFocusedEndpoint(eps[1].id);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '3-focused.png'), type: 'png' });

  // Reset focus, then seed threshold-crossing samples for shot 4.
  await page.evaluate(async () => {
    const uiMod = await import('/src/lib/stores/ui.ts');
    uiMod.uiStore.setFocusedEndpoint(null);
  });
  {
    const profiles = [];
    for (let epIdx = 0; epIdx < 4; epIdx++) {
      const out = [];
      for (let r = 0; r < 60; r++) {
        if (epIdx === 0) out.push({ lat: 50 + Math.sin(r * 0.3) * 6, status: 'ok' });
        else if (epIdx === 1) out.push({ lat: r > 35 ? 250 + (r % 7) * 5 : 80 + (r % 5), status: 'ok' });
        else if (epIdx === 2) out.push({ lat: r > 45 ? 320 + (r % 4) * 3 : 100 + (r % 9), status: 'ok' });   // overflow
        else {
          if (r === 40) out.push({ lat: 0, status: 'timeout' });
          else out.push({ lat: 90 + Math.sin(r * 0.25) * 12, status: 'ok' });
        }
      }
      profiles.push(out);
    }
    await seedSamplesFromProfiles(profiles);
  }
  await page.screenshot({ path: path.join(OUT, '4-threshold-cross.png'), type: 'png' });

  console.log('Screenshots written to', OUT);
} finally {
  await browser.close();
}
