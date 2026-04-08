---
date: 2026-04-07
feature: sonde-v2
type: research-brief
---

# Research Brief — Sonde v2

## Critical Technical Findings

### 1. Timing-Allow-Origin Is Rare — Tier 2 Is Bonus, Not Core

**[VERIFIED]** No major CDN (Cloudflare, CloudFront, Fastly, Akamai, Azure CDN, Vercel, Netlify) sends `Timing-Allow-Origin` by default. All require explicit opt-in configuration. Of the ~1.1M third-party requests in HTTP Archive that do include TAO, 95% use the wildcard `*`, but this header is present on a small minority of sites overall.

**[VERIFIED]** For `no-cors` fetches (opaque responses), browsers zero ALL sub-timing fields: `domainLookupStart/End`, `connectStart/End`, `secureConnectionStart`, `requestStart`, `responseStart`, `transferSize`, `encodedBodySize`, `decodedBodySize`. Only `startTime`, `duration`, `fetchStart`, `responseEnd`, and `name` survive. Source: MDN PerformanceResourceTiming, Fetch spec.

**Design implication:** Tier 2 diagnostic breakdown (DNS/TLS/TTFB) is available only for TAO-enabled or same-origin endpoints. The core value proposition must stand on Tier 1 data (total latency, connection reuse delta, jitter, percentiles). Tier 2 is a bonus that enhances the experience when available, not the primary sell. The UI must never show empty/broken panels — graceful two-tier presentation is essential.

### 2. Dedicated Workers Are Correct; Timer Resolution Is Sufficient

**[VERIFIED]** `performance.now()` has identical resolution in all worker types. Resolution is governed by cross-origin isolation status: 5µs with COOP/COEP headers, 100µs without. At 100µs coarsening, latency measurements in 1-500ms range retain 3-4 significant digits — more than sufficient.

**[SINGLE]** Dedicated Workers are preferred: lowest overhead (1:1 ownership), no IPC cost. Service Workers interpose on fetch (contaminating timing). Shared Workers add IPC overhead without benefit for this use case.

**[VERIFIED]** OffscreenCanvas + Dedicated Worker is the canonical pattern for off-main-thread rendering. Available Chrome 99+, Firefox 105+. Must call `transferControlToOffscreen()` before acquiring any context.

### 3. URL Shareability Is Feasible

**[VERIFIED]** Browser URL length limits: Chrome/Firefox ~32K chars, Safari ~80K chars. No fragment-specific cap.

**[VERIFIED]** `lz-string.compressToEncodedURIComponent` outputs ~166% of raw compressed size.

**[UNVERIFIED estimate]** 5 endpoints × 50 rounds × 6 fields ≈ 10.5KB JSON → ~3-5K compressed → ~5-8K URI-encoded. Well within limits. Config-only links (no results) would be under 1K.

### 4. WebGL Effects Layer Is Viable but Must Be Optional

**[VERIFIED]** WebGL 2 at ~92% global browser support. Full support in Chrome 56+, Firefox 51+, Safari 15.1+, iOS Safari 15.6+.

**[VERIFIED]** Mobile context loss is real — browsers reclaim GPU resources when backgrounding. Must handle `webglcontextlost`/`webglcontextrestored`. Use `powerPreference: 'low-power'`.

**Design implication:** WebGL effects layer confirmed as optional enhancement. Canvas 2D must produce a complete, beautiful visualization on its own.

### 5. Canvas 2D Glow Technique

**[VERIFIED]** `globalCompositeOperation: 'screen'` with pre-rendered glow halos outperforms `shadowBlur` for real-time rendering. `shadowBlur` is not GPU-accelerated in all browsers and has measurable cost at values >40. Pre-render the glow halo to an offscreen canvas, reuse via `drawImage`.

### 6. Design Token Reference: DRUIDS (Datadog)

**[VERIFIED]** Datadog's DRUIDS system: primitive tokens → semantic tokens → component tokens. Semantic naming (e.g., `color.warning.main`, `latency.fast`) enables theme-wide changes from a single source file.

**[VERIFIED]** For colorblind-safe latency encoding: avoid rainbow scales. Use perceptually uniform colormaps (Viridis, Cividis) or blue→red diverging scales. AMS 2024 paper confirms CVD-safe radar palettes follow this principle.

**Design implication:** Replace the current HSL rotation color map with a Viridis-based perceptually uniform scale. Define semantic tokens: `latency.fast`, `latency.moderate`, `latency.slow`, `latency.timeout`.

## Codebase Patterns to Preserve

1. **Epoch invalidation** — Module-level integer incremented on abort/reset. Worker closures capture epoch at creation. Stale responses silently dropped. Clean, cheap, correct.

2. **Synchronized rounds via Set** — `pendingResponses` Set populated with all active endpoint IDs before requests fire. Cleared one-by-one as responses arrive. Next round starts when set is empty. Ensures statistically valid cross-endpoint comparison.

3. **Timeout as data point** — Timeouts plotted at the timeout boundary value rather than dropped. Preserves degradation event shape in visualization.

4. **Pre-computed color map** — 1501-entry array avoiding per-render log() computation. Carry the pattern forward with the new Viridis-based palette.

5. **Batched chart updates** — 100ms interval for visual updates, not per-data-point. Prevents render starvation under fast response rates.

6. **Freeze detection** — 1-second gap check on the update interval detects tab backgrounding without relying on the flaky Visibility API (especially on iOS).

## Anti-Patterns to Fix in Rebuild

1. **No AbortController on timeout** — Timed-out fetches continue running silently, exhausting the browser's connection pool (6 connections per host). The rebuild MUST `abort()` on timeout.

2. **Hardcoded 3-endpoint limit** — IDs 1/2/3, hardcoded DOM IDs, fixed layout. Rebuild needs dynamic endpoint management (add/remove, minimum 1, flexible maximum).

3. **Canvas overflow** — Text renders off-canvas when `textY` exceeds 244px. No scroll, no wrap, no feedback. Needs a ring buffer, scrolling viewport, or clear-and-restart.

4. **Cookie storage** — Path-dependent, no versioning, silent parse failures. Use `localStorage` with versioned schema and migration logic.

5. **No `cors` mode option** — Always uses `no-cors`. Should offer a toggle: `no-cors` for arbitrary URLs (Tier 1 data), `cors` for same-origin/TAO endpoints (Tier 2 data).

6. **Direct DOM manipulation** — Stats updates via `innerHTML`, canvas via immediate draw calls. Works but unmaintainable at scale. Svelte's reactive system replaces this entirely.

## Industry Patterns

**[VERIFIED]** Datadog's DRUIDS design system is the closest structural reference for a token-driven visualization tool. Adapt the three-tier token architecture (primitive → semantic → component) for Sonde's design system.

**[VERIFIED]** The Svelte + Canvas + Worker integration pattern is well-documented: OffscreenCanvas transferred to a Dedicated Worker at mount time, `requestAnimationFrame` in the worker, data passed via structured clone or SharedArrayBuffer. Key pitfall: never acquire a context before `transferControlToOffscreen()`.

**[SINGLE]** Cross-origin isolation (COOP/COEP headers) improves timer resolution from 100µs to 5µs but requires all cross-origin resources to opt in via CORP headers. For a static site loading only its own assets, this is achievable — but may cause issues if future versions load third-party resources (fonts, analytics).

## Open Questions Resolved

| Question | Resolution |
|---|---|
| Tier 2 diagnostic data viability | Bonus feature, not core. Most arbitrary URLs will be Tier 1 only. |
| Worker architecture | Dedicated Workers. One per endpoint, same as current design. |
| Timer resolution | 100µs without cross-origin isolation. Sufficient for latency measurement. |
| URL shareability | Feasible. lz-string compression keeps results under URL limits. |
| WebGL availability | 92% support. Use as optional effects layer with context loss handling. |
| Canvas 2D glow | `screen` compositing + pre-rendered halos. No shadowBlur at runtime. |
| Color palette | Viridis-based, CVD-safe, perceptually uniform. Not HSL rotation. |
