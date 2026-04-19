// Phase 4 Atlas view screenshots. Four states:
//   1. Waterfall with P50 (balanced phases)
//   2. Waterfall with P95 (same data, p95 mode)
//   3. Anomaly callout — TTFB dominant
//   4. Empty state — no focused endpoint
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('screenshots/phase-4');
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
    uiMod.uiStore.setActiveView('atlas');
  });
  await page.waitForTimeout(300);

  // Shot 4 first (empty state — no focus)
  await page.screenshot({ path: path.join(OUT, '4-empty.png'), type: 'png' });

  // Seed samples with tier2 breakdowns. Focus the second endpoint for shots 1-3.
  async function seedTier2(profiles) {
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
        const samples = profiles[epIdx] ?? profiles[profiles.length - 1];
        const nowTs = Date.now();
        for (let r = 0; r < samples.length; r++) {
          const s = samples[r];
          measMod.measurementStore.addSample(
            ep.id, r + 1, s.total, 'ok', nowTs - (samples.length - r) * 1000,
            s.tier2,
          );
        }
      }
    }, profiles);
    await page.waitForTimeout(400);
  }

  async function focusSecond() {
    await page.evaluate(async () => {
      const uiMod = await import('/src/lib/stores/ui.ts');
      const epMod = await import('/src/lib/stores/endpoints.ts');
      const eps = await new Promise((resolve) => {
        let unsub;
        unsub = epMod.endpointStore.subscribe((v) => { resolve(v); queueMicrotask(() => unsub?.()); });
      });
      if (eps[1]) uiMod.uiStore.setFocusedEndpoint(eps[1].id);
    });
    await page.waitForTimeout(200);
  }

  // Shots 1 & 2 — balanced phase mix (DNS 8ms, TCP 22ms, TLS 34ms, TTFB 90ms, Transfer 45ms).
  // Total 199ms. TTFB is largest at ~45% → falls into the "no dominant" branch by default.
  {
    const balanced = Array.from({ length: 40 }, () => ({
      total: 199,
      tier2: {
        total: 199,
        dnsLookup: 8, tcpConnect: 22, tlsHandshake: 34, ttfb: 90, contentTransfer: 45,
      },
    }));
    // Other endpoints get a neutral placeholder so the Rail shows them alive.
    const neutral = Array.from({ length: 20 }, () => ({
      total: 60,
      tier2: {
        total: 60, dnsLookup: 5, tcpConnect: 10, tlsHandshake: 10, ttfb: 30, contentTransfer: 5,
      },
    }));
    await seedTier2([neutral, balanced, neutral, neutral]);
  }
  await focusSecond();

  // P50 is the default; shot 1.
  await page.screenshot({ path: path.join(OUT, '1-waterfall-p50.png'), type: 'png' });

  // Flip to P95.
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const p95 = buttons.find((b) => b.textContent?.trim() === 'P95');
    p95?.click();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '2-waterfall-p95.png'), type: 'png' });

  // Shot 3 — TTFB-dominant anomaly.
  {
    // TTFB at 260ms of 310ms total ≈ 84% — triggers the "Slow TTFB" branch.
    const ttfbHeavy = Array.from({ length: 40 }, () => ({
      total: 310,
      tier2: {
        total: 310,
        dnsLookup: 10, tcpConnect: 15, tlsHandshake: 20, ttfb: 260, contentTransfer: 5,
      },
    }));
    const neutral = Array.from({ length: 20 }, () => ({
      total: 60,
      tier2: { total: 60, dnsLookup: 5, tcpConnect: 10, tlsHandshake: 10, ttfb: 30, contentTransfer: 5 },
    }));
    await seedTier2([neutral, ttfbHeavy, neutral, neutral]);
  }
  await focusSecond();
  // Reset back to P50 for a clean shot.
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const p50 = buttons.find((b) => b.textContent?.trim() === 'P50');
    p50?.click();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '3-anomaly-ttfb.png'), type: 'png' });

  console.log('Screenshots written to', OUT);
} finally {
  await browser.close();
}
