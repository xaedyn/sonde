---
date: 2026-04-07
feature: chronoscope-v2
type: approach-decision-memos
---

# Approach Decision Memos — Chronoscope v2

## APPROACH: "Main-Thread Layered Canvas"

### CORE IDEA
Keep all Canvas 2D rendering on the main thread using stacked canvas layers, driven by Svelte store reactivity and requestAnimationFrame with frame budget monitoring.

### MECHANISM
Three stacked `<canvas>` elements (data layer, effects layer, interaction/highlight layer) plus an HTML overlay for tooltips and accessible labels. Measurement Workers post results to the main thread, where a Svelte writable store accumulates them. Svelte reactive statements derive statistics (p50/p95/p99, jitter, confidence intervals) and trigger a "dirty" flag. A single requestAnimationFrame loop checks the dirty flag, renders the data canvas first (always), then the effects canvas if frame budget permits (target: <8ms for data, <16ms total). The interaction canvas redraws only on pointer/keyboard events. The WebGL optional effects layer composites as a fourth canvas on top using the same stacking approach.

### FIT ASSESSMENT
- **Scale fit:** matches — this is a single-page diagnostic tool, not a dashboard platform
- **Operational:** Static site. No server, no build-time secrets, no runtime services.
- **Stack alignment:** fits existing — Svelte stores are built-in, Canvas 2D is native, no new dependencies beyond lz-string and the design token system.

### TRADEOFFS
**Strong at:**
- Simplest architecture. Fewest abstractions, fewest message-passing boundaries.
- Direct DOM access for interaction handling (hover, click, keyboard focus) — no postMessage round-trip to translate coordinates.
- HTML overlay for tooltips/labels means screen readers work natively.
- Easiest to debug — single thread, standard devtools profiling.
- Fastest path to "looks polished" because all rendering code is colocated.

**Sacrifices:**
- Main thread contention during heavy data updates (5 endpoints × rapid fire). Mitigated by frame budget monitoring — if data render exceeds 8ms, skip effects.
- Cannot fully decouple rendering from Svelte's reactivity cycle — a long render blocks reactive UI updates (controls, stats cards).
- No future path to SharedArrayBuffer zero-copy data sharing.

### WHAT WE'D BUILD
- DesignTokens module (primitive → semantic → component token layers)
- MeasurementEngine (Worker pool manager, AbortController, epoch invalidation)
- MeasurementStore (Svelte writable store, typed sample accumulator)
- StatisticsDeriver (reactive derived store: percentiles, jitter, CI)
- RenderScheduler (rAF loop with frame budget monitor, dirty-flag gating)
- DataCanvasRenderer (Canvas 2D: scatter plot, heatmap bands, axes, labels)
- EffectsCanvasRenderer (Canvas 2D: pre-rendered glow halos, sonar ping, screen compositing)
- InteractionCanvasRenderer (Canvas 2D: hover highlight, selection ring)
- OverlayUI (Svelte component: tooltips, ARIA live regions, Tier 2 waterfall)
- EndpointPanel (Svelte: dynamic add/remove, URL input, enable/disable)
- SummaryCards (Svelte: headline stats, expandable Tier 2 breakdown)
- ShareManager (lz-string encode/decode, URL hash read/write)
- WebGLEffectsLayer (optional fourth canvas, context loss handling)

### THE BET
Main-thread Canvas 2D rendering for up to 10 endpoints × 2240 data points each, with sonar ping animations and glow effects, stays under 16ms per frame on a mid-range 2022 mobile device.

### REVERSAL COST
If wrong at 30 days: **easy** — the rendering code is isolated behind RenderScheduler. Moving DataCanvasRenderer to an OffscreenCanvas worker requires changing how it receives data (postMessage instead of store subscription) and how interactions are forwarded, but the renderer's draw logic is unchanged. The Svelte components, measurement engine, and share system are unaffected.

### WHAT WE'RE NOT BUILDING
- OffscreenCanvas worker rendering
- SharedArrayBuffer data pipeline
- Custom event bus (using Svelte stores instead)
- WebGPU renderer
- Server-side anything

### INDUSTRY PRECEDENT
**Excalidraw** — renders complex vector scenes on main-thread Canvas 2D with layered canvases (drawing layer, selection layer, interaction layer). 60fps with thousands of elements. Open source, verified architecture. `[VERIFIED]`

---

## APPROACH: "Worker-Rendered Pipeline"

### CORE IDEA
Transfer the primary data canvas to a Dedicated Worker via OffscreenCanvas, keeping only interaction overlays and DOM UI on the main thread, with data flowing through a structured message protocol.

### MECHANISM
At Svelte component mount, `transferControlToOffscreen()` transfers the data canvas to a RenderWorker. Measurement Workers post results directly to the RenderWorker (via MessageChannel port forwarding), bypassing the main thread for the hot path entirely. The RenderWorker maintains its own data accumulator, computes statistics internally, and runs its own requestAnimationFrame loop. It posts summary statistics back to the main thread on a 100ms throttle for the Svelte-rendered stats cards and share state. Interactions (hover, click) are forwarded from the main thread to the RenderWorker via postMessage with canvas-relative coordinates; the worker responds with hit-test results. A separate main-thread canvas handles the interaction highlight layer. The optional WebGL effects layer remains on the main thread.

### FIT ASSESSMENT
- **Scale fit:** overengineered — this architecture pays off at sustained high-frequency rendering (games, real-time dashboards with 60fps requirements). Chronoscope's data arrival rate is ~5-50 points/second, well within main-thread Canvas capacity.
- **Operational:** Same static site deployment. No additional runtime requirements.
- **Stack alignment:** requires awareness of OffscreenCanvas browser support (Chrome 99+, Firefox 105+, Safari 17+). Safari 16 and below get a main-thread fallback, adding a code path to maintain.

### TRADEOFFS
**Strong at:**
- Main thread is completely free for DOM interactions, Svelte reactivity, and animations. Zero jank guarantee regardless of data volume.
- Measurement-to-pixel path has no main-thread hop — lowest possible latency from data arrival to rendered frame.
- Natural architecture for future SharedArrayBuffer upgrade.
- Scales to higher endpoint counts or faster measurement rates without architectural change.

**Sacrifices:**
- Interaction handling requires coordinate translation via postMessage. Hover tooltips have 1-2 frame latency.
- Two copies of the data model: one in RenderWorker, one summarized in main thread. Must keep in sync.
- Safari fallback means two rendering code paths — doubled testing surface.
- Debugging is harder: worker devtools are less ergonomic.
- More code, more abstractions, longer time to first polish.

### WHAT WE'D BUILD
- DesignTokens module
- MeasurementEngine (Worker pool, AbortController, epoch invalidation)
- RenderWorker (Dedicated Worker: OffscreenCanvas rendering, internal data store, statistics computation, rAF loop, hit-testing)
- WorkerMessageProtocol (typed message schemas: data samples, interaction events, summary stats, render commands)
- MainThreadFallbackRenderer (Canvas 2D on main thread for Safari <17)
- InteractionBridge (main thread: forwards pointer/keyboard events to worker, receives hit-test results, positions DOM tooltips)
- MeasurementStore (Svelte store: receives throttled summaries from RenderWorker)
- StatisticsDeriver (computed in RenderWorker, mirrored to main thread)
- OverlayUI, EndpointPanel, SummaryCards, ShareManager (same as Approach 1)
- WebGLEffectsLayer (main thread, optional)

### THE BET
The complexity cost of OffscreenCanvas message passing, Safari fallback, and split data ownership is justified by rendering performance gains — meaning main-thread Canvas 2D would actually produce visible jank for this workload.

### REVERSAL COST
If wrong at 30 days: **hard** — the RenderWorker, MessageProtocol, InteractionBridge, and fallback renderer are ~40% of the rendering codebase. Reverting to main-thread means deleting the worker, collapsing the message protocol, and rewriting interaction handling. The measurement engine and Svelte components survive, but the rendering layer is a near-complete rewrite.

### WHAT WE'RE NOT BUILDING
- SharedArrayBuffer data sharing (structured clone is sufficient at this scale)
- WebGPU renderer
- Service Worker caching layer
- Server-side rendering

### INDUSTRY PRECEDENT
**Google Sheets** — uses OffscreenCanvas in a Dedicated Worker for the cell grid renderer, with main thread handling only DOM chrome and interactions. Documented in Chrome Dev Summit 2019 talk. `[SINGLE]`

---

## APPROACH: "Reactive Canvas Hybrid"

### CORE IDEA
Main-thread Canvas 2D rendering driven by a custom lightweight observable data pipeline (not Svelte stores) for the hot rendering path, with Svelte stores only for UI-layer reactivity, and a single canvas with composite region management instead of stacked layers.

### MECHANISM
Measurement Workers post to the main thread. A custom RingBuffer accumulator (plain TypeScript class, no framework dependency) collects samples and incrementally updates running statistics (online algorithm for percentiles via P-square or t-digest). The RingBuffer emits change notifications via a minimal publish-subscribe interface. The RenderScheduler subscribes and runs a single rAF loop that draws everything to one canvas using save/restore regions: data first, then effects composited with `globalCompositeOperation: 'screen'`, then interaction highlights. A separate throttled callback (100ms) pushes summary snapshots from the RingBuffer into Svelte writable stores for the DOM UI (stats cards, endpoint panel, share state). This decouples the rendering hot path from Svelte's reactivity batching.

### FIT ASSESSMENT
- **Scale fit:** matches — appropriate complexity for a tool that needs both high-frequency canvas updates and reactive DOM UI.
- **Operational:** Static site. No runtime dependencies.
- **Stack alignment:** fits existing — ~50 lines of custom observable, no dependencies.

### TRADEOFFS
**Strong at:**
- Rendering is never gated on Svelte's microtask flush cycle.
- Single canvas avoids stacking context issues and reduces GPU memory.
- RingBuffer with online statistics is more memory-efficient than accumulating all raw samples.
- The observable layer is framework-agnostic.
- Cleaner separation: Svelte owns DOM, TypeScript owns Canvas.

**Sacrifices:**
- Single canvas means effects and data share a drawing surface — harder to independently clear/redraw the effects layer without redrawing data.
- Two reactivity systems (custom observable + Svelte stores) — cognitive cost.
- P-square algorithm for streaming percentiles is more complex to implement correctly than sorting an array.
- Interaction hit-testing on a single canvas requires a spatial index.

### WHAT WE'D BUILD
- DesignTokens module
- MeasurementEngine (Worker pool, AbortController, epoch invalidation)
- RingBuffer (typed circular buffer with online statistics)
- DataPipeline (pub-sub observable)
- StoreBridge (throttled sync from RingBuffer to Svelte stores)
- RenderScheduler (rAF loop, frame budget, single-canvas region management)
- UnifiedCanvasRenderer (Canvas 2D: data, effects, interaction — all on one surface)
- SpatialIndex (lightweight quadtree or grid for hit-testing)
- OverlayUI, EndpointPanel, SummaryCards, ShareManager (same as Approach 1)
- WebGLEffectsLayer (optional separate canvas for GPU effects)

### THE BET
The performance difference between rAF-driven canvas rendering and Svelte-store-driven canvas rendering is meaningful enough to justify two reactivity systems, and single-canvas region management is maintainable enough to not become a source of visual bugs.

### REVERSAL COST
If wrong at 30 days: **easy** — the RingBuffer and DataPipeline are pure TypeScript with no Svelte coupling. If dual-reactivity proves confusing, collapse the observable into Svelte derived stores. If single-canvas is buggy, split into stacked canvases by extracting draw calls.

### WHAT WE'RE NOT BUILDING
- OffscreenCanvas worker rendering
- SharedArrayBuffer data pipeline
- Full ECS architecture
- WebGPU renderer
- Framework-agnostic component layer

### INDUSTRY PRECEDENT
**Observable Plot / D3** — uses a single canvas with region-based drawing and custom data pipelines decoupled from any framework's reactivity system. `[VERIFIED]`

---

## Comparison Matrix

| Criterion | Main-Thread Layered Canvas | Worker-Rendered Pipeline | Reactive Canvas Hybrid |
|---|---|---|---|
| **AC1: Instant comparative diagnosis** | STRONG — direct store subscription, data visible within one rAF of worker post | STRONG — bypasses main thread entirely, marginally faster but imperceptible at human timescales | STRONG — rAF-driven, decoupled from Svelte batching, same perceptual latency |
| **AC2: Two-tier diagnostic depth** | STRONG — HTML overlay for Tier 2 waterfall is native DOM, trivially accessible | PARTIAL — Tier 2 waterfall in DOM but data path from Resource Timing through worker adds complexity | STRONG — Tier 2 waterfall is pure Svelte/DOM via StoreBridge |
| **AC3: Statistical credibility** | STRONG — derived stores compute stats reactively, simple array-based percentiles | STRONG — stats computed in worker, zero main-thread cost, but structured clone adds display latency | STRONG — online P-square gives streaming percentiles, most memory-efficient |
| **AC4: Shareable results** | STRONG — store contains all data, serialize directly | PARTIAL — data in worker, must request snapshot via async postMessage | STRONG — RingBuffer snapshot is a clean serialization boundary |
| **AC5: Performance/accessibility** | STRONG — HTML overlay for all text, native a11y, frame budget drops effects before data | PARTIAL — canvas text in worker not accessible, must mirror to ARIA live regions | STRONG — all accessible content in Svelte DOM, single canvas reduces GPU memory |
| **Scale fit** | matches | overengineered | matches |
| **Operational burden** | lowest — one rendering path, one thread, standard debugging | highest — Safari fallback, worker devtools, message protocol debugging | low — two reactivity systems but both on main thread |
| **Stack alignment** | fits existing — zero new dependencies | requires fallback — OffscreenCanvas support gaps | fits existing — ~50 lines custom observable |
| **Polish sustainability** | high — colocation makes visual iteration fast, easy to tweak effects | medium — visual changes touch worker message protocol, coordinating main/worker for effects | high — rendering colocated, but single-canvas region management has higher bug surface |
