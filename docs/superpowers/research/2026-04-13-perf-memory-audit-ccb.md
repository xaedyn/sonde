STACK
Svelte 5 (runes: $state, $derived, $effect), TypeScript 6, Vite 8, Vitest 4, Playwright 1.59.
One production dependency: lz-string 1.5.0 (URL compression for share payloads).
Deployed to Cloudflare Pages. No server — fully client-side SPA.
Measurement work runs in dedicated Web Workers (one per enabled endpoint), coordinated by MeasurementEngine.

EXISTING PATTERNS
Worker lifecycle: MeasurementEngine spawns one Worker per enabled endpoint on start(), terminates all on stop(), and increments an epoch counter so stale messages from a previous run are silently discarded.
Round buffering: Each round's worker responses are collected in a Map<roundId, messages[]>; the round flushes atomically when expectedResponses are met or a per-round safety timeout (configuredTimeout + 500ms) fires, preventing stale rounds from blocking dispatch forever.
Response-gated cadence: _scheduleNextRound() is only called from _flushRound(), enforcing sequential round ordering with no overlap; burst phase uses 0ms delay for the first N rounds, then monitorDelay (default 1000ms) thereafter.
Sample storage: Samples are pushed mutably into existing EndpointMeasurementState.samples arrays (O(1) amortised), but each addSamples call still spreads the top-level endpoints map to trigger Svelte reactivity, allocating a new object every round per endpoint.
Statistics memoisation: statisticsStore caches per-endpoint stats keyed by sampleCount, skipping full recomputation when no new sample has arrived; computeEndpointStatistics allocates sorted latency arrays (latencies.slice().sort()) on every cache miss.
Ribbon throttling: LanesView throttles computeRibbonsPerLane to once every Math.max(endpoints.length * 2, 1) new samples, avoiding O(n) ribbon path computation on every render tick.
Render scheduler: RenderScheduler uses a continuous requestAnimationFrame loop; effects renderers tick every frame, data renderers only when markDirty() is called; 10 consecutive overload frames (>12ms data cost) permanently disable effects for the session lifetime.
SVG chart: LaneSvgChart renders per-lane scatter, trace path, ribbon, and heatmap strip in SVG using Svelte reactive $derived expressions; no imperative draw loop — the DOM diff handles updates.
Freeze detection: FreezeDetector uses a 100ms setInterval heartbeat; gaps >1000ms emit FreezeEvent objects that are appended (spread) to measurementStore.freezeEvents.
CSS animations: Three orb elements and one background element run infinite CSS keyframe animations (float 15–22s, bgShift 20s) on the main thread unconditionally, with prefers-reduced-motion guard in Layout.svelte.
Worker timing: worker.ts calls performance.clearResourceTimings() on every fetch (success and failure paths), preventing unbounded growth of the PerformanceObserver buffer inside the worker context.

RELEVANT FILES
src/lib/engine/measurement-engine.ts — Round orchestrator; manages flushTimers, roundBuffer, expectedResponses; _dispatchRound(), _flushRound(), _scheduleNextRound().
src/lib/engine/worker.ts — Fetch + ResourceTiming per round; waitForResourceEntry() with PerformanceObserver + 100ms safety timeout; clearResourceTimings() cleanup.
src/lib/stores/measurements.ts — Unbounded sample arrays; addSamples() spread-allocates endpoints map every round; freezeEvents array grows indefinitely via spread.
src/lib/stores/statistics.ts — computeEndpointStatistics() called on every cache miss; allocates sorted copy of full latencies array; connectionReuseDelta compares tier2Samples[0] against all subsequent warm samples O(n).
src/lib/components/LanesView.svelte — sampleTimestamps $derived iterates all samples every round (O(total_samples)); heatmapCellsByEndpoint $derived iterates all samples every round; getLaneProps() filters all samples per lane per render to compute lossPercent.
src/lib/components/LaneSvgChart.svelte — SVG {#each} over all windowed dots (up to 60); inline <animate> SVG elements on nowDot create persistent animation objects per lane; cellRects $derived recomputes heatmap cell rects on every heatmapCells change.
src/lib/renderers/render-scheduler.ts — effectsDisabled is permanently latched once triggered (no recovery); runFrame() allocates performance.now() on every rAF tick even when not dirty.
src/lib/components/Layout.svelte — Three orb divs + bgShift background animate unconditionally; sampleTimestamps derived value rewalks all endpoint samples every round.
src/lib/utils/statistics.ts — percentile() and computeEndpointStatistics() allocate new sorted arrays on each invocation (no persistent sorted buffer).
src/lib/utils/freeze-detector.ts — setInterval at 100ms fires continuously while running; getRound() calls get(measurementStore) (a store read) inside every heartbeat tick.

CONSTRAINTS
WorkerToMainMessage / MainToWorkerMessage wire format in src/lib/types.ts must remain stable — any change breaks the epoch/roundId handshake.
measurementStore public API (addSamples, initEndpoint, removeEndpoint, loadSnapshot) is called from MeasurementEngine, persistence, and share restore — signatures must remain compatible.
statisticsStore is a derived store consumed read-only by LanesView and Lane; EndpointStatistics shape is part of the share/persistence contract (StatisticsState type).
tokens.ts is the sole source of visual constants; no raw values are allowed in component files (ESLint enforces no-raw-visual-values).
MAX_ENDPOINTS = 10 cap is both a UI constraint and a memory safety bound — do not raise without auditing max sample growth.

OPEN QUESTIONS
Unbounded sample growth: samples arrays grow without a cap for the lifetime of a session. At default monitorDelay=1000ms with 10 endpoints, 1 hour = 3600 samples × 10 endpoints = 36,000 MeasurementSample objects, each potentially carrying a TimingPayload. No eviction or ring-buffer mechanism exists — memory will grow monotonically.
sampleTimestamps O(n) scan: Layout.svelte rewalks every sample of every endpoint on every store update to build the timestamps array; at 36k total samples this becomes noticeable on low-end hardware.
getLaneProps filter: LanesView.getLaneProps() calls samples.filter(s => s.status !== 'ok') per lane per render — O(samples) per lane — with no memoisation at the component level despite statisticsStore's per-endpoint cache being available for loss calculation.
freeze-detector store read: FreezeDetector._tick() calls getRound() which reads from measurementStore via Svelte's get() on every 100ms interval tick, causing a synchronous store traversal at 10Hz outside the reactive graph.
freezeEvents spread allocation: Every freeze event appends via [...s.freezeEvents, event], allocating a new array; over a long session with many freezes this creates GC pressure, though freeze events are expected to be rare.
Permanent effects latch: RenderScheduler.effectsDisabled has no reset path — a temporary CPU spike during initial data load will permanently disable sonar effects for the session; no user-recoverable path exists.
SVG <animate> elements: Each active lane creates two persistent SVG SMIL animation elements (ring radius + opacity) on the nowDot; SMIL animations are not disabled by prefers-reduced-motion handling in the component, unlike the CSS orb animations in Layout.svelte.
backdrop-filter on all lanes: Every Lane card applies backdrop-filter: blur(20px) saturate(1.2) which triggers GPU compositing layer promotion per lane; with 10 lanes this is 10 compositor layers running continuously even when the tab is idle.
Worker Resource Timing buffer: The fallback polling path in waitForResourceEntry (no PerformanceObserver) calls performance.getEntriesByType('resource') which returns the entire buffer snapshot — if for any reason clearResourceTimings() fails silently, the buffer can grow across rounds.
heatmapCellsByEndpoint recomputation: computeHeatmapCells is called for all endpoints on every measurementStore update, even though heatmap cells only change when new samples arrive — there is no sampleCount gate equivalent to the statisticsStore cache.
