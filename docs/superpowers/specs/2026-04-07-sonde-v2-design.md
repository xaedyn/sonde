---
date: 2026-04-07
feature: sonde-v2
type: design-specification
status: APPROVED
approach: Main-Thread Layered Canvas
---

# Design Specification -- Sonde v2

## 1. Problem

When something on the internet feels slow, users have no zero-friction way to answer the question "is it me or them?" from their actual network position. Cloud-based monitoring tools (Pingdom, UptimeRobot, Datadog) test from data centers -- they reveal whether a service is up from AWS us-east-1, not whether it's degraded from a user's residential Comcast connection in rural Ohio.

The core thesis from the vision memo: **the most valuable network intelligence comes from the edge -- real users on real networks -- not from data center probes.** If true, a zero-friction browser-based latency tool becomes the Speedtest.net of HTTP performance.

No existing tool combines:
- Client-side measurement from the user's actual network path
- Multi-URL synchronized comparison (all endpoints tested simultaneously, producing statistically valid cross-endpoint data)
- Resource Timing diagnostic breakdown when servers permit
- Real-time visualization that makes latency patterns intuitively legible

Sonde v2 is a ground-up rebuild that fills this gap as a static site with zero accounts, zero backend, and zero cost per user.

## 2. Success Metrics

### Acceptance Criteria (verbatim)

**AC1: Instant Comparative Diagnosis.** When a user opens Sonde and enters 2+ endpoint URLs, live latency data for all endpoints appears on a synchronized timeline within 5 seconds of starting the test, with each endpoint visually distinguishable by color and accompanied by real-time p50 latency displayed in the summary area.

**AC2: Diagnostic Depth (Two-Tier).** When a user tests a URL that returns the `Timing-Allow-Origin` header, the detail panel displays DNS resolution time, TLS handshake time, and TTFB as separate labeled values with a stacked waterfall bar. When the header is absent, the detail panel displays total latency, connection reuse delta (first request vs. subsequent), and an explanation of why sub-field breakdown is unavailable -- with no empty or broken UI elements.

**AC3: Statistical Credibility.** When 30+ measurement rounds complete for an endpoint, the summary card displays p50, p95, p99 latency, jitter (standard deviation), and a confidence interval -- all computed from the full sample set with outliers visible but flagged in the visualization. Before 30 rounds, only raw data points and a "collecting data" indicator are shown (no premature summary statistics).

**AC4: Shareable Results.** When a user clicks the share action after a test, a URL is generated that encodes both the test configuration and result snapshot. When that URL is opened in a new browser, it renders the same endpoint list, and the result snapshot is displayed without running a new test. The URL must be under 8,000 characters for a 5-endpoint, 50-round result set.

**AC5: Performance and Accessibility.** When Sonde is loaded on a cold cache over a 3G Fast connection, Lighthouse reports Performance >= 95 and Accessibility >= 90. All interactive elements are reachable and operable via keyboard. Color encoding passes WCAG AA contrast against the background surface, verified across protanopia, deuteranopia, and tritanopia simulations.

### Additional Metrics

| Metric | Target |
|---|---|
| Lighthouse Performance | >= 95 |
| Lighthouse Accessibility | >= 90 |
| First Contentful Paint (3G Fast, cold) | < 1s |
| Total bundle size (gzipped) | < 80KB |
| Animation frame time (p95) | < 16ms (60fps) |
| Data canvas render time (p95) | < 8ms |
| Share URL size (5 endpoints x 50 rounds) | < 8,000 characters |
| Time from page load to first render | < 500ms |
| Time from "Start" to first data point visible | < 5s |

## 3. Out of Scope

| Excluded | Rationale |
|---|---|
| **Anonymous telemetry / crowdsourced data** | Requires backend ingest, storage, aggregation. This is the Layer 4 vision (collective edge intelligence), not v1. The measurement schema will be telemetry-ready; transmitting data is not in scope. |
| **Internet weather map visualization** | Depends on telemetry data that does not exist yet. |
| **Traceroute / hop-level diagnosis** | Not possible from browser JavaScript. Requires CLI companion or WebExtension with native messaging. |
| **User accounts, saved history, dashboards** | Contradicts zero-friction philosophy. Shareable permalinks cover "save and revisit" without auth. |
| **Native mobile app (PWA install, App Store)** | Must be mobile-responsive and fully functional on mobile browsers. Native wrapper is post-v1. |
| **Alerting / continuous monitoring** | Sonde is a diagnostic tool you reach for, not a monitoring platform. Deliberate positioning. |
| **Custom backend probe endpoints** | v1 tests against user-supplied URLs. Edge probe servers require infrastructure spend. |
| **WCAG AAA compliance** | AA is the target. AAA is not a v1 goal. |
| **Server-side rendering** | Single-page static site. No SSR, no serverless functions. |
| **WebGPU renderer** | WebGL is the effects ceiling for v1. WebGPU is a future upgrade path. |
| **SharedArrayBuffer data pipeline** | Structured clone is sufficient at this data rate (<50 points/second). |
| **Cross-origin isolation (COOP/COEP)** | Improves timer resolution from 100us to 5us but requires all cross-origin resources to opt in. 100us resolution provides 3-4 significant digits for latency measurement -- sufficient. May conflict with future third-party resource loading. |
| **Multi-protocol testing (WebSocket, gRPC, DNS)** | HTTP GET latency is the core metric. Other protocols are post-v1. |

## 4. Architecture

### Selected Approach: Main-Thread Layered Canvas

All Canvas 2D rendering runs on the main thread using stacked canvas layers, driven by Svelte store reactivity and `requestAnimationFrame` with frame budget monitoring. This is the simplest architecture that meets all acceptance criteria, with the lowest reversal cost if performance assumptions prove wrong.

**The bet:** Main-thread Canvas 2D rendering for up to 10 endpoints x 2,240 data points each, with sonar ping animations and glow effects, stays under 16ms per frame on a mid-range 2022 mobile device.

**Industry precedent:** Excalidraw renders complex vector scenes on main-thread Canvas 2D with layered canvases (drawing layer, selection layer, interaction layer) at 60fps with thousands of elements.

**Reversal path:** If the bet is wrong, the rendering code is isolated behind `RenderScheduler`. Moving `DataCanvasRenderer` to an OffscreenCanvas worker requires changing data reception (postMessage instead of store subscription) and interaction forwarding. The Svelte components, measurement engine, and share system are unaffected.

### Technology Stack

- **Framework:** Svelte + Vite + TypeScript (not SvelteKit -- no routing or SSR)
- **Rendering:** Canvas 2D primary + optional WebGL effects layer
- **Workers:** Dedicated Workers for measurement (one per endpoint)
- **Compression:** lz-string for URL share encoding
- **Fonts:** Self-hosted subsets (JetBrains Mono, Inter)
- **Dependencies:** Minimal -- lz-string is the only runtime dependency beyond Svelte

### Component Hierarchy

```
App
+-- MeasurementEngine (no UI -- pure logic, Web Workers)
|   +-- WorkerPool (Dedicated Worker lifecycle, one per active endpoint)
|   +-- EpochManager (invalidation counter, stale response rejection)
|   +-- AbortManager (AbortController per endpoint, timeout enforcement)
+-- Layout
|   +-- Header (branding, tagline, minimal)
|   +-- EndpointPanel (URL inputs, add/remove, enable/disable, per-endpoint status)
|   +-- VisualizationArea
|   |   +-- TimelineCanvas (Canvas 2D -- scatter plot, axes, labels, data points)
|   |   +-- HeatmapCanvas (Canvas 2D -- color-encoded temporal heatmap)
|   |   +-- EffectsCanvas (Canvas 2D -- pre-rendered glow halos, sonar pings, screen compositing)
|   |   +-- WebGLEffectsLayer (WebGL -- bloom, optional, context loss handling)
|   |   +-- InteractionCanvas (Canvas 2D -- hover highlight, selection ring, redraws on pointer/keyboard only)
|   |   +-- OverlayUI (HTML/Svelte -- tooltips, ARIA live regions, accessible labels)
|   +-- SummaryCards (headline stats, expandable Tier 2 breakdown)
|   +-- DiagnosticPanel (Tier 2 waterfall when TAO available, fallback display when not)
|   +-- Controls (start/stop, settings drawer, share button)
+-- ShareManager (lz-string encode/decode, URL hash read/write, clipboard API)
+-- SettingsManager (localStorage read/write, schema versioning, migration)
```

### Rendering Pipeline

```
Dedicated Workers (measurement, one per endpoint)
    | postMessage (structured clone)
    v
MeasurementStore (Svelte writable store, typed sample accumulator)
    | Svelte reactive statements
    v
StatisticsDeriver (derived store: p50/p95/p99, jitter, CI, connection reuse delta)
    | dirty flag set
    v
RenderScheduler (requestAnimationFrame loop, frame budget monitor)
    |
    +-- [always] TimelineCanvas.draw() -- target < 8ms
    +-- [always] HeatmapCanvas.draw() -- target < 4ms
    +-- [if budget permits] EffectsCanvas.draw() -- remainder of 16ms budget
    +-- [if WebGL available & budget permits] WebGLEffectsLayer.composite()
    +-- [on pointer/keyboard events only] InteractionCanvas.draw()
    |
    | 100ms throttle
    v
DOMRenderer (Svelte reactive -- SummaryCards, Controls, DiagnosticPanel)
```

**Frame budget enforcement:** The `RenderScheduler` measures actual render time per frame. If data canvas render exceeds 8ms, effects layers are skipped for that frame. If data canvas consistently exceeds 12ms over 10 consecutive frames, effects layers are disabled entirely until the next idle period. Data accuracy is never sacrificed for visual effects.

### Data Flow Diagram

```
User clicks "Start"
    |
    v
MeasurementEngine.start()
    |
    +-- Creates/reuses Dedicated Worker per endpoint
    +-- Sets epoch counter
    +-- Initializes AbortController per endpoint
    |
    v
Worker: fetch(url, { mode, signal }) + performance.getEntriesByName()
    |
    +-- On success: postMessage({ type: 'result', endpointId, epoch, timing })
    +-- On timeout: AbortController.abort(), postMessage({ type: 'timeout', ... })
    +-- On error: postMessage({ type: 'error', endpointId, epoch, error })
    |
    v
Main thread: onmessage handler
    |
    +-- Check epoch (discard stale)
    +-- Update pendingResponses Set (remove this endpoint)
    +-- Push sample to MeasurementStore
    |
    +-- If pendingResponses.size === 0:
    |       Start next round (all endpoints fire simultaneously)
    |
    v
MeasurementStore (Svelte writable)
    |
    +-- StatisticsDeriver (derived store, reactive)
    |   +-- Per-endpoint: p50, p95, p99, stddev, CI, sample count
    |   +-- Per-endpoint: connection reuse delta (round 1 vs subsequent avg)
    |   +-- Cross-endpoint: relative ranking
    |   +-- Tier 2 (when available): DNS, TLS, TTFB breakdown
    |
    +-- RenderScheduler reads dirty flag on rAF
    |   +-- TimelineCanvas: scatter points with per-endpoint color
    |   +-- HeatmapCanvas: color-encoded cells in temporal sequence
    |   +-- EffectsCanvas: sonar pings on new data points
    |
    +-- 100ms throttled flush to DOM
        +-- SummaryCards: headline stats per endpoint
        +-- DiagnosticPanel: Tier 2 waterfall or Tier 1 fallback
        +-- Controls: round counter, elapsed time
```

### Design Token System

All visual constants live in a single `tokens.ts` file. Components never contain raw color values, pixel measurements, or animation durations. Lint rules enforce this -- raw values in component files fail the build.

**Token architecture** (adapted from Datadog's DRUIDS, three-tier):

```
Primitive tokens (raw values, never used directly in components)
    -> Semantic tokens (meaning-based aliases)
        -> Component tokens (component-specific overrides, used sparingly)
```

**Token categories and naming convention:**

| Category | Pattern | Example |
|---|---|---|
| Latency colors | `color.latency.{level}` | `color.latency.fast`, `color.latency.slow` |
| Surface colors | `color.surface.{elevation}` | `color.surface.base`, `color.surface.raised` |
| Text colors | `color.text.{hierarchy}` | `color.text.primary`, `color.text.muted` |
| Status colors | `color.status.{state}` | `color.status.error`, `color.status.timeout` |
| Spacing | `spacing.{scale}` | `spacing.xs`, `spacing.md`, `spacing.xl` |
| Typography | `typography.{context}.{property}` | `typography.data.fontFamily` |
| Timing | `timing.{name}` | `timing.sonarPing`, `timing.fadeIn` |
| Easing | `easing.{name}` | `easing.sonarExpand`, `easing.standard` |
| Shadow | `shadow.{elevation}` | `shadow.low`, `shadow.high` |
| Radius | `radius.{size}` | `radius.sm`, `radius.md` |

**Enforcement:** An ESLint rule (custom or via `eslint-plugin-no-raw-values`) scans `.svelte` and `.ts` files for raw hex colors, pixel values outside token references, and hardcoded durations. Violations fail CI.

### State Management

**Svelte stores (all typed with TypeScript interfaces):**

| Store | Type | Contains |
|---|---|---|
| `endpointStore` | `writable<Endpoint[]>` | Array of endpoint configs: `{ id, url, enabled, label, color }` |
| `measurementStore` | `writable<MeasurementState>` | Per-endpoint sample arrays, round counter, epoch, running/stopped state |
| `settingsStore` | `writable<Settings>` | Timeout (ms), delay (ms), request cap, CORS mode, theme overrides |
| `shareStore` | `writable<ShareState>` | Current share URL, encoding status, last snapshot timestamp |
| `uiStore` | `writable<UIState>` | Active tab (timeline/heatmap), expanded panels, hover target, selected point |

**Derived stores:**

| Store | Derives From | Contains |
|---|---|---|
| `statisticsStore` | `measurementStore` | Per-endpoint: p50, p95, p99, stddev, CI, sample count, connection reuse delta. Only populated when sample count >= 30. |
| `tierStatusStore` | `measurementStore` | Per-endpoint: tier level (1 or 2), available sub-fields, TAO header status |
| `renderDataStore` | `measurementStore`, `settingsStore`, `uiStore` | Pre-computed render data: scaled coordinates, color-mapped values, visible range |
| `validationStore` | `endpointStore` | Per-endpoint URL validation results, duplicate detection |

### Worker Architecture

**Dedicated Workers:** One Dedicated Worker per active endpoint. Preferred over Shared/Service Workers for lowest overhead (1:1 ownership), no IPC cost, and no fetch interposition.

**Worker lifecycle:**
1. `MeasurementEngine.start()` creates a Worker per enabled endpoint (or reuses from pool)
2. Each Worker receives: `{ url, timeout, delay, mode, epoch }`
3. Worker executes `fetch()` with the provided `AbortController.signal`
4. Worker reads `performance.getEntriesByName(url)` for Resource Timing data
5. Worker posts result back to main thread
6. Main thread validates epoch, updates store
7. When all endpoints in a round have responded (or timed out), next round begins
8. `MeasurementEngine.stop()` sends abort signal, increments epoch, terminates workers

**Epoch invalidation:** A module-level integer incremented on abort/reset. Worker closures capture epoch at creation. When a result arrives with a stale epoch, it is silently discarded. This prevents race conditions from interleaved start/stop cycles.

**AbortController:** Each endpoint's fetch has its own AbortController. On timeout, `controller.abort()` is called, terminating the actual network request (fixing the v1 bug where timed-out fetches continued consuming the connection pool). On stop, all controllers abort.

**Synchronized rounds:** A `pendingResponses: Set<string>` is populated with all active endpoint IDs before requests fire. Each response (success, timeout, or error) removes its endpoint from the set. Next round starts when the set is empty. This guarantees statistically valid cross-endpoint comparison -- all measurements in a round occur under identical network conditions.

### Interface Contracts

All cross-boundary data interfaces are defined as TypeScript discriminated unions or strict interfaces. These are the load-bearing contracts between layers.

**Endpoint ID generation:**
- IDs are generated as `crypto.randomUUID()` (or `Math.random().toString(36).slice(2)` as fallback).
- IDs are stable for the lifetime of an endpoint in the session. They do not change when endpoints are reordered, and are not based on URL (since duplicate URLs are permitted) or array index (since endpoints can be removed mid-session).
- When deserializing a share URL, endpoint IDs are regenerated — the share payload maps results to endpoints by array position (index 0 in `endpoints[]` corresponds to index 0 in `results[]`), not by ID string.

**Main-to-Worker messages:**
```typescript
type MainToWorkerMessage =
  | { type: 'measure'; url: string; timeout: number; corsMode: 'no-cors' | 'cors'; epoch: number; roundId: number }
  | { type: 'stop' };
```

**Worker-to-Main messages:**
```typescript
interface TimingPayload {
  total: number;              // Total round-trip latency (ms), always available
  // Tier 2 fields — 0 when TAO absent (cross-origin without Timing-Allow-Origin)
  dnsLookup: number;          // domainLookupEnd - domainLookupStart
  tcpConnect: number;         // connectEnd - connectStart
  tlsHandshake: number;       // connectEnd - secureConnectionStart (0 if HTTP)
  ttfb: number;               // responseStart - requestStart
  contentTransfer: number;    // responseEnd - responseStart
}

type WorkerToMainMessage =
  | { type: 'result'; endpointId: string; epoch: number; roundId: number; timing: TimingPayload }
  | { type: 'timeout'; endpointId: string; epoch: number; roundId: number; timeoutValue: number }
  | { type: 'error'; endpointId: string; epoch: number; roundId: number; errorType: string; message: string };
```

**Deduplication guarantee:** The worker implements timeout internally via `AbortController` + `setTimeout`. When the timeout fires, the worker aborts the fetch and posts a single `timeout` message. If the fetch resolves before the timeout, the worker clears the timeout and posts a single `result` message. The `done` guard (shared boolean, single-threaded worker) ensures exactly one message per endpoint per round. The main thread never receives both a `result` and a `timeout` for the same `(endpointId, roundId)` pair.

**Share payload deserialization mapping:**
```typescript
interface SharePayload {
  v: 1;
  mode: 'config' | 'results';
  endpoints: { url: string; enabled: boolean }[];  // Order is the mapping key
  settings: { timeout: number; delay: number; cap: number; corsMode: 'no-cors' | 'cors' };
  results?: {
    samples: { round: number; latency: number; status: 'ok' | 'timeout' | 'error'; tier2?: TimingPayload }[];
  }[];  // Array parallel to endpoints[] — index is the join key, not endpointId
}
```

On deserialization: new endpoint IDs are generated. `results[0]` maps to `endpoints[0]`, `results[1]` to `endpoints[1]`, etc. No ID string crosses the share boundary.

### State Machine

**Test lifecycle states:**

| State | Button Text | Button Action | Settings Editable | Visualization | Transitions To |
|---|---|---|---|---|---|
| `idle` | "Start Test" | Validate URLs → create workers → transition to `starting` | Yes (all) | Empty/loading animation | `starting` |
| `starting` | "Starting..." (disabled) | None (button disabled during transition) | No | Loading animation with endpoint status dots appearing | `running` (when all workers initialized and first round dispatched) or `idle` (if validation fails) |
| `running` | "Stop" | Abort all → increment epoch → transition to `stopping` | Partial (see below) | Active data visualization | `stopping`, `completed` |
| `stopping` | "Stopping..." (disabled) | None (button disabled during wind-down) | No | Data freezes, effects fade out | `stopped` (when all workers terminated and no pending responses) |
| `stopped` | "Start Test" | Same as idle → `starting` | Yes (all) | Frozen data, no animations | `starting` |
| `completed` | "Start Test" | Same as idle → `starting` | Yes (all) | Frozen data with "Test complete" banner | `starting` |

**Double-click protection:** The button is disabled during `starting` and `stopping` states. State transitions are guarded — calling `start()` while in any state other than `idle`, `stopped`, or `completed` is a no-op. Calling `stop()` while in any state other than `running` is a no-op.

**Settings mutability during running test:**

| Setting | Mutable While Running? | When Change Takes Effect |
|---|---|---|
| Timeout | Yes | Next round (current in-flight round uses previous value) |
| Delay | Yes | Next inter-round delay (current delay timer is not cancelled) |
| Request cap | Yes | Next round boundary (checked after each round completes) |
| CORS mode | No | Requires stop + restart (changes fetch mode, which changes worker behavior) |
| Add endpoint | Yes | New endpoint joins the next round (not the current in-flight round) |
| Remove endpoint | Yes | Immediate — see Concurrency section |
| URL change | No | Input is read-only while test is running (prevents mid-test URL changes that would invalidate comparative data) |

### Concurrency Guarantees

**Endpoint removal during a round:**
When an endpoint is removed while a round is in flight:
1. The endpoint's AbortController fires `abort()`, terminating its in-flight fetch.
2. The endpoint's ID is removed from `pendingResponses` immediately (not waiting for the abort message from the worker).
3. If `pendingResponses` is now empty, the next round starts.
4. The worker is terminated. Any subsequent message from that worker is discarded by epoch check (epoch was incremented when the endpoint was removed) or by endpoint ID check (ID no longer exists in the endpoint store).
5. The endpoint's data is removed from the measurement store. Its canvas elements are cleared on the next render frame.

**Rapid start/stop cycles:**
Workers are never reused across epochs. Each `start()` creates fresh workers; each `stop()` terminates all workers. There is no worker pool — the "reuses from pool" phrasing in the approach memo is superseded. The cost of Worker instantiation (~1-5ms per worker) is negligible for up to 10 endpoints. This eliminates all worker reuse race conditions.

- `start()` increments epoch, creates N new workers, dispatches first round.
- `stop()` increments epoch, calls `terminate()` on all workers (synchronous — `Worker.terminate()` is immediate), clears `pendingResponses`.
- Any stale messages from terminated workers that arrive after `stop()` are discarded by epoch check.
- Rapid Start→Stop→Start: first Start creates workers (epoch 1), Stop terminates them (epoch 2), second Start creates new workers (epoch 3). Workers from epoch 1 are terminated and their messages (if any arrive) are discarded. No overlap.

**Worker `terminate()` guarantee:** Per the Web Workers spec, `Worker.terminate()` is synchronous from the caller's perspective — after the call returns, no further messages will be received from that worker. This eliminates the "messages from terminated workers" concern entirely.

## 5. Visual Design Specification

### Color Palette -- Meteorological Instrument Aesthetic

The name "Sonde" (radiosonde -- a meteorological probe) drives the visual language. Colors derive from weather radar, not startup gradients. The palette is perceptually uniform and CVD-safe (colorblind-safe), based on Viridis principles rather than HSL rotation.

#### Background Surfaces

| Token | Hex | Usage |
|---|---|---|
| `color.surface.base` | `#080c16` | Page background, deepest layer |
| `color.surface.raised` | `#0d1425` | Card backgrounds, panels |
| `color.surface.overlay` | `#131b33` | Modal backgrounds, dropdown menus |
| `color.surface.elevated` | `#1a2340` | Tooltip backgrounds, hover states |
| `color.surface.canvas` | `#0a0e1a` | Canvas background (visualization area) |

#### Latency Scale (Weather Radar)

Perceptually uniform, CVD-safe. Values transition smoothly -- no hard boundaries in canvas rendering.

| Token | Hex | Latency Range | Weather Analog |
|---|---|---|---|
| `color.latency.excellent` | `#00b4d8` | 0--25ms | Clear sky |
| `color.latency.fast` | `#0096c7` | 25--50ms | Light precipitation |
| `color.latency.good` | `#0077b6` | 50--100ms | Moderate |
| `color.latency.moderate` | `#90be6d` | 100--200ms | Approaching |
| `color.latency.elevated` | `#f9c74f` | 200--500ms | Heavy |
| `color.latency.slow` | `#f8961e` | 500--1000ms | Severe |
| `color.latency.critical` | `#f3722c` | 1000--3000ms | Extreme |
| `color.latency.failing` | `#f94144` | 3000ms+ | Dangerous |

Implementation: A pre-computed 1,501-entry lookup array mapping 0--1500ms (and clamped above) to interpolated RGB values. Uses logarithmic mapping so the perceptually important 0--200ms range occupies more of the color space. Avoids per-render `Math.log()` calls.

#### Status Colors

| Token | Hex | Usage |
|---|---|---|
| `color.status.timeout` | `#9b5de5` | Timeout indicator (distinct from heat scale) |
| `color.status.error` | `#c77dff` | Network error, DNS failure |
| `color.status.offline` | `#7b2cbf` | All endpoints unreachable |
| `color.status.success` | `#06d6a0` | Connection established, test running |
| `color.status.idle` | `#4a5568` | Not yet started |

#### UI Chrome

| Token | Hex | Usage |
|---|---|---|
| `color.chrome.border` | `#1e2a4a` | Panel borders, dividers |
| `color.chrome.borderHover` | `#2d3f6e` | Border on hover |
| `color.chrome.borderFocus` | `#4a90d9` | Focus ring (keyboard navigation) |
| `color.chrome.accent` | `#4a90d9` | Primary action buttons, links |
| `color.chrome.accentHover` | `#5ba0e9` | Accent on hover |

#### Text Hierarchy

| Token | Hex | Usage |
|---|---|---|
| `color.text.primary` | `#e2e8f0` | Headings, primary content |
| `color.text.secondary` | `#94a3b8` | Labels, secondary information |
| `color.text.muted` | `#738496` | Hints, placeholders, disabled text |
| `color.text.inverse` | `#0a0e1a` | Text on light backgrounds (rare) |
| `color.text.data` | `#f1f5f9` | Data values (highest contrast for readability) |

All text colors meet WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text) against their respective background surfaces.

**Contrast verification (worst-case pairings):**
- `color.text.muted` (#738496) on `color.surface.raised` (#0d1425): ~4.6:1 — PASSES AA normal text
- `color.text.muted` (#738496) on `color.surface.base` (#080c16): ~4.8:1 — PASSES AA normal text
- `color.text.secondary` (#94a3b8) on `color.surface.raised` (#0d1425): ~7.1:1 — PASSES AA
- `color.text.primary` (#e2e8f0) on `color.surface.base` (#080c16): ~15.2:1 — PASSES AA
- `color.text.data` (#f1f5f9) on `color.surface.canvas` (#0a0e1a): ~16.1:1 — PASSES AA

Note: `typography.caption` (10px, weight 400) uses `color.text.muted` and appears only on `color.surface.raised` or higher — verified at 4.6:1 minimum, meeting the 4.5:1 AA threshold for normal text.

### Typography

| Context | Token | Family | Size | Weight | Line Height | Notes |
|---|---|---|---|---|---|---|
| Data values | `typography.data.*` | JetBrains Mono | 13px | 500 (medium) | 1.4 | Tabular figures, monospace for alignment. Self-hosted subset (digits, period, units). |
| Data labels | `typography.label.*` | Inter | 11px | 500 | 1.3 | Axis labels, field names |
| Body text | `typography.body.*` | Inter | 14px | 400 | 1.5 | Descriptions, explanations, Tier 2 fallback text |
| Headings | `typography.heading.*` | Inter | 18px (h2), 16px (h3) | 600 | 1.3 | Section headings, card titles |
| Page title | `typography.title.*` | Inter | 24px | 700 | 1.2 | "Sonde" branding in header |
| Stat values | `typography.stat.*` | JetBrains Mono | 28px (hero), 18px (card) | 600 | 1.1 | Large stat display (p50 in summary card) |
| Caption | `typography.caption.*` | Inter | 10px | 400 | 1.4 | Timestamp labels, footnotes |

Font loading: Self-hosted WOFF2 subsets. JetBrains Mono subset: digits 0-9, period, comma, slash, "ms", "s", "p", "%", space, minus (~3KB). Inter subset: Latin (~15KB). `font-display: swap` to prevent FOIT.

### Spacing System

Base unit: 4px.

| Token | Value | Usage |
|---|---|---|
| `spacing.xxs` | 2px | Tight internal padding (icon-to-text) |
| `spacing.xs` | 4px | Minimum gap between related elements |
| `spacing.sm` | 8px | Internal card padding, input padding |
| `spacing.md` | 12px | Space between related sections |
| `spacing.lg` | 16px | Card padding, section gaps |
| `spacing.xl` | 24px | Major section separation |
| `spacing.xxl` | 32px | Page-level margins |
| `spacing.xxxl` | 48px | Hero spacing, visualization area margins |

### Animation Specification

#### Sonar Ping (Signature Animation)

The defining motion of Sonde. When a measurement completes, a concentric ring emanates from the data point on the effects canvas.

| Parameter | Fast (<50ms) | Medium (50--200ms) | Slow (200--1000ms) | Timeout |
|---|---|---|---|---|
| Initial radius | 3px | 3px | 3px | 3px |
| Final radius | 12px | 20px | 32px | 48px |
| Duration | 300ms | 500ms | 800ms | 1200ms |
| Easing | `cubic-bezier(0.0, 0.0, 0.2, 1)` (decelerate) | `cubic-bezier(0.0, 0.0, 0.2, 1)` | `cubic-bezier(0.0, 0.0, 0.4, 1)` (slower decel) | `cubic-bezier(0.0, 0.0, 0.6, 1)` (very slow decel) |
| Ring stroke width | 2px -> 0.5px | 2px -> 0.5px | 2.5px -> 0.5px | 3px -> 0px |
| Ring opacity | 0.8 -> 0 | 0.7 -> 0 | 0.6 -> 0 | 0.5 -> 0 (fades before completing) |
| Ring color | Endpoint's assigned color | Endpoint's assigned color | Endpoint's assigned color | `color.status.timeout` |
| Max concurrent pings | 5 per endpoint | 5 per endpoint | 3 per endpoint | 1 per endpoint |

**Timeout behavior:** The ring expands but fades to zero opacity at 80% of its final radius -- it never completes. This visually communicates "didn't finish."

**Performance:** Pings are drawn on the effects canvas (separate from data). If frame budget is exceeded, pending pings are dropped (newest first). Active pings always complete their animation -- no mid-animation cancellation (causes visual jarring).

#### Data Point Entry

When a new measurement arrives, its scatter plot dot enters with:
- Scale: 0 -> 1.2 -> 1.0 (overshoot spring)
- Duration: 200ms
- Easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring overshoot)
- Opacity: 0 -> 1 over first 100ms

#### Sweep Line (Radar Motif)

A vertical semi-transparent line sweeps across the timeline canvas indicating the current measurement position:
- Color: `color.chrome.accent` at 15% opacity
- Width: 1px with a 4px soft glow (pre-rendered gradient)
- Movement: Snaps to current round's x-position, no tweening (data accuracy over aesthetics)
- Visible only while test is running

#### Loading State

Before a test starts, the visualization area shows:
- Three concentric rings pulsing outward from center
- Ring color: `color.chrome.accent` at 20% opacity
- Pulse interval: 2s
- Duration per ring: 1.5s
- Easing: `cubic-bezier(0.0, 0.0, 0.2, 1)`
- Text below: "Configure endpoints to begin" (empty state) or "Ready" (endpoints configured, not started)

#### Progressive Disclosure Transitions

When expanding a summary card to show Tier 2 details:
- Height transition: 250ms, `cubic-bezier(0.4, 0.0, 0.2, 1)` (standard material easing)
- Content opacity: 0 -> 1 over 150ms, delayed 100ms (content fades in after container expands)
- Waterfall bars: stagger-animate from left, 50ms delay between each bar, 200ms per bar

#### Heatmap Cell Entry

New heatmap cells appear with:
- Opacity: 0 -> 1 over 100ms
- No scale animation (cells are fixed-size in the grid)

### Canvas Rendering Details

#### Data Layer (TimelineCanvas)

**Scatter plot points:**
- Shape: Filled circle, 4px radius (6px radius for selected/hovered point)
- Color: Endpoint's assigned color from `color.latency.*` scale mapped to the latency value
- Outline: None in normal state; 1.5px white outline on hover/selection
- Glow: Pre-rendered halo (16px radius, same color at 30% opacity) drawn beneath each point using `drawImage` from an offscreen canvas. The halo is rendered once per color and cached. Composited with `globalCompositeOperation: 'screen'`
- Overlapping points: Later points draw on top. Dense clusters show aggregate glow from compositing.

**Axes:**
- Y-axis: Latency in ms. Logarithmic scale (base 10). Gridlines at 1, 10, 100, 1000, 10000ms. Labels in `typography.label`.
- X-axis: Round number (0, 10, 20...). Labels in `typography.label`.
- Gridlines: `color.chrome.border` at 30% opacity, 1px, dashed (4px dash, 8px gap).
- Axis lines: `color.chrome.border` at 60% opacity, 1px solid.

**Timeout points:**
- Plotted at the configured timeout value on the y-axis
- Shape: Hollow circle (2px stroke, no fill) with an "X" through it
- Color: `color.status.timeout`
- Sonar ping uses timeout behavior (incomplete ring)

**Error points:**
- Plotted at y-axis maximum
- Shape: Small triangle (warning icon)
- Color: `color.status.error`

#### Effects Layer (EffectsCanvas)

Composites on top of the data layer. Cleared and redrawn each frame (only active animations).

- Sonar pings: Arc strokes with decreasing opacity and increasing radius
- Glow halos: Pre-rendered to offscreen canvases (one per endpoint color), drawn via `drawImage`
- Compositing: `globalCompositeOperation: 'screen'` for additive blending -- glows brighten but never obscure data
- No `shadowBlur` at runtime (not GPU-accelerated in all browsers, expensive above values of 40)

#### Interaction Layer (InteractionCanvas)

Redraws only on pointer or keyboard events, not on `rAF`. Kept separate to avoid redrawing data/effects on every mouse move.

- Hover highlight: Ring around nearest data point (6px radius, 2px stroke, white at 80% opacity)
- Selection: Same ring but persistent until deselected
- Crosshairs: Optional (toggled in settings) -- thin lines from point to both axes, `color.chrome.accent` at 20% opacity
- Hit detection: Spatial grid (not quadtree -- simpler, sufficient for <50K points). Grid cells sized to 16px. On pointer move, check the cell and its 8 neighbors.

#### Heatmap Canvas (HeatmapCanvas)

A temporal color-encoded grid showing latency over time. Evolution of the v1 character canvas.

- Cell size: 8px x 8px (adjustable by zoom level)
- Layout: Left to right, top to bottom. Each cell is one measurement for one endpoint.
- Color: Mapped from the latency scale (same pre-computed lookup as scatter points)
- Gradient: Cells use a subtle radial gradient (center at full color, edges blended 10% toward adjacent cells) to avoid harsh grid lines -- mimicking weather radar precipitation bands
- Capacity: 2,240 cells visible (28 columns x 80 rows at default zoom). When full, oldest column scrolls off left.
- Endpoint separation: Thin horizontal line (`color.chrome.border` at 40%) between endpoint rows
- Timeout cells: Use `color.status.timeout` with a diagonal line pattern (canvas pattern fill)
- Error cells: Use `color.status.error` with a cross pattern

### Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|---|---|---|
| **Mobile** | 375px -- 767px | Single column layout. EndpointPanel stacks above VisualizationArea. Summary cards horizontal scroll. Controls at bottom (fixed position). Canvas height: 200px. Heatmap hidden (toggle to show, replacing timeline). Settings in full-screen modal. Font sizes reduced by 2px for `data` and `label` contexts. Touch targets minimum 44x44px. |
| **Tablet** | 768px -- 1023px | EndpointPanel as collapsible sidebar (240px). VisualizationArea takes remaining width. Summary cards in 2-column grid. Canvas height: 300px. Both timeline and heatmap visible (stacked vertically, 60%/40% split). |
| **Desktop** | 1024px -- 1439px | EndpointPanel as persistent sidebar (280px). VisualizationArea expands. Summary cards in 3-column grid. Canvas height: 400px. Timeline and heatmap side by side (60%/40% split). |
| **Wide** | 1440px+ | EndpointPanel sidebar (320px). Max content width: 1600px, centered. Canvas height: 500px. Summary cards in single row. Timeline and heatmap side by side (65%/35% split). |

Canvas elements resize via `ResizeObserver`. Device pixel ratio is accounted for (canvas internal resolution = CSS size x `devicePixelRatio`, scaled back via CSS `width`/`height`). This ensures crisp rendering on Retina/HiDPI displays.

### Dark Theme Details

Sonde is dark-only in v1. There is no light theme. The dark theme is not "inverted light" -- it is the primary design.

**Surface elevation:**
- Each level adds lightness: `base` (#080c16) -> `raised` (#0d1425) -> `overlay` (#131b33) -> `elevated` (#1a2340)
- Elevation is communicated through background lightness, not shadows (shadows are invisible on dark backgrounds)
- Exception: `shadow.low` (`0 2px 8px rgba(0,0,0,0.4)`) is used on floating elements (tooltips, dropdowns) for depth cue

**Border treatments:**
- Borders are visible structural elements, not subtle dividers
- `color.chrome.border` (#1e2a4a) -- light enough to be visible against `surface.raised`, subtle enough to not compete with data
- 1px solid borders on cards, panels, inputs
- No border-radius on canvas containers (sharp edges for instrument aesthetic)
- `radius.sm` (4px) on cards, buttons
- `radius.md` (8px) on inputs, modals

**Focus indicators:**
- 2px solid `color.chrome.borderFocus` (#4a90d9) with 2px offset
- High contrast against all surface levels
- Never removed -- keyboard users always see focus position

## 6. Feature Specification

### 6.1 Endpoint Management

**Add endpoint:**
- "Add endpoint" button at the bottom of the EndpointPanel
- New row appears with an empty URL input, focused for immediate typing
- Default endpoints (pre-populated on first visit): `https://www.google.com`, `https://1.1.1.1` (Cloudflare DNS)
- Maximum endpoints: 10. Beyond 10, the "Add" button is disabled with tooltip: "Maximum 10 endpoints." Rationale: browser connection pool limits (6 per host) and canvas readability degrade beyond 10.
- Minimum endpoints: 1. The last endpoint cannot be removed -- the remove button is hidden when only one endpoint exists.

**Remove endpoint:**
- "X" button on each endpoint row (except when only one exists)
- If a test is running, removing an endpoint stops measurement for that endpoint immediately (AbortController.abort), removes its data from the store, and clears its canvas elements on the next render frame
- Confirmation: none (action is undoable by re-adding the URL, data is not recoverable)

**URL validation:**
- Validated on blur and on test start
- Must start with `http://` or `https://`
- Must parse as a valid URL (`new URL()` does not throw)
- Duplicate URLs are permitted (useful for testing the same endpoint under different conditions) but flagged with a subtle "duplicate" indicator
- Invalid URL: input border turns `color.status.error`, inline error message below: "Enter a valid HTTP or HTTPS URL"
- Empty URL: silently ignored on test start (not counted as an endpoint)

**Endpoint colors:**
- Assigned from a fixed palette of 10 visually distinct colors, chosen for CVD-safety against the dark background
- Colors are assigned in order: endpoint 1 gets color 1, endpoint 2 gets color 2, etc.
- If an endpoint is removed, its color is not recycled until all 10 are used
- Palette: `#4a90d9`, `#e06c75`, `#98c379`, `#e5c07b`, `#c678dd`, `#56b6c2`, `#d19a66`, `#61afef`, `#be5046`, `#7ec699`

**Per-endpoint status indicators:**
- Dot indicator next to each URL: colored by last measurement's latency color, or `color.status.idle` if not started
- When running: dot pulses (opacity 0.6 -> 1.0, 1s period)
- Small inline text: last latency value (e.g., "42ms") or "timeout" or "error"

**"Requests are sent from your browser" note:**
- Subtle one-line text at the bottom of the EndpointPanel, `color.text.muted`, `typography.caption`
- Communicates: no server proxy, private addresses are accessed from the user's network

### 6.2 Measurement Controls

**Start/Stop button:**
- Single toggle button in the Controls area
- Start state: "Start Test" with play icon, `color.chrome.accent` background
- Running state: "Stop" with stop icon, `color.status.error` background
- Starting a test validates all endpoint URLs first; invalid endpoints are highlighted, test does not start until at least one valid endpoint exists
- Stopping a test: all AbortControllers fire, epoch increments, workers receive stop signal, data is preserved (not cleared)

**Timeout configuration:**
- Input field in settings drawer
- Default: 5000ms
- Range: 1000ms -- 30000ms
- Step: 500ms
- Validation: integer, within range. Out-of-range values clamped to nearest bound with toast notification.

**Delay configuration:**
- Input field in settings drawer
- Default: 1000ms (delay between rounds)
- Range: 0ms -- 10000ms
- Step: 100ms
- Rationale: prevents overwhelming target servers, gives the browser connection pool time to recycle

**Request cap:**
- Input field in settings drawer
- Default: unlimited (0 = no cap)
- Range: 0 -- 10000
- When cap is reached, test stops automatically. Summary cards display "Test complete (N rounds)"
- Setting a cap retroactively (while test is running) takes effect at the next round boundary

**CORS mode toggle:**
- Toggle in settings drawer: "no-cors" (default) / "cors"
- `no-cors`: Works with any URL. Opaque response. Tier 1 data only.
- `cors`: Requires server to respond with appropriate CORS headers. Tier 2 data available if TAO is also set. Fails with explicit error if CORS is rejected.
- Tooltip: "Use 'cors' mode for same-origin or CORS-enabled endpoints to unlock detailed timing breakdown."
- Per-endpoint override: future (out of scope for v1, but the data model supports it)

**Clear data:**
- Button in settings drawer: "Clear Results"
- Clears all measurement data from stores. Canvas clears on next render frame. Settings and endpoints preserved.
- Confirmation dialog: "Clear all measurement data? This cannot be undone."

### 6.3 Timeline Visualization (Scatter Plot)

**What it shows:**
- X-axis: measurement round number (sequential integer, starting at 0)
- Y-axis: latency in milliseconds, logarithmic scale (base 10)
- One data point per measurement per endpoint per round
- Points colored by endpoint's assigned color
- Timeouts plotted at the timeout boundary value with distinct timeout marker
- Errors plotted at y-axis maximum with error marker

**Y-axis scale:**
- Logarithmic (base 10) by default
- Gridlines at: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s
- Axis auto-ranges to fit data with 10% padding above highest point
- Minimum y-axis range: 1ms -- 1000ms (even if all data is within a narrower band)

**X-axis:**
- Linear, one unit per round
- Labels at regular intervals (every 10 rounds at default zoom)
- Scrolls right as new data arrives, keeping the last 50 rounds visible by default

**Zoom/Pan:**
- Mousewheel/pinch: zoom both axes (shift + wheel for y-only, ctrl/cmd + wheel for x-only)
- Click-drag on canvas: pan
- Double-click: reset to auto-fit view
- Touch: two-finger pinch to zoom, one-finger drag to pan
- Zoom range: 10 rounds -- all data (x), one decade -- full range (y)

**Data point interaction:**
- Hover: nearest point highlights (interaction canvas), tooltip appears (HTML overlay) showing: endpoint URL (truncated), round number, latency value, timestamp
- Click: selects point, tooltip persists until click elsewhere or Escape
- Keyboard: Tab moves focus between canvases. When timeline is focused, arrow keys move selection (left/right = rounds, up/down = endpoints within a round). Enter activates tooltip. Escape dismisses.

**Legend:**
- Positioned below the timeline canvas (or inside, top-right, at wide breakpoints)
- Shows endpoint URL (truncated to 30 chars) with color swatch
- Click legend item: toggles endpoint visibility (data still collected, just not rendered)
- Keyboard accessible: Tab to legend, Enter to toggle

### 6.4 Heatmap Visualization

Evolution of the v1 character canvas into a proper color-encoded heatmap.

**How it encodes latency:**
- Each cell represents one measurement (one endpoint, one round)
- Cell color is mapped from the latency value using the pre-computed Viridis-based lookup array
- Color interpolation is smooth (not stepped) -- the lookup array has 1,501 entries for 0-1500ms

**Layout:**
- Columns: rounds (time progresses left to right)
- Rows: endpoints (one row per endpoint, top to bottom in the order they appear in EndpointPanel)
- Row labels: endpoint URL (truncated), positioned to the left of the heatmap
- Column labels: round numbers at regular intervals

**How it wraps:**
- Fixed visible width (determined by container width and cell size)
- When the rightmost column is reached, the heatmap scrolls left (oldest column exits left edge)
- The heatmap never wraps to a new line -- it is a continuous horizontal strip per endpoint

**Capacity:**
- At 8px cell size and a 400px-wide container: 50 columns visible
- Total capacity: limited only by memory. All data is retained in the store; only the visible window is rendered.
- Performance: only visible cells are drawn each frame (viewport culling)

**Interaction:**
- Hover: cell highlights with a 1px white border, tooltip shows endpoint, round, latency
- Click: same as hover but persistent
- Touch: tap to select (no hover state on touch devices)

### 6.5 Statistics Display

**Summary cards:**
- One card per endpoint, arranged in a responsive grid (see breakpoints)
- Card header: endpoint URL (truncated to 40 chars), colored left border matching endpoint color

**Before 30 samples:**
- Card shows: "Collecting data..." with a progress indicator (N/30 rounds)
- Last latency value displayed in large stat text
- No summary statistics (p50, p95, etc.) -- these are statistically meaningless below 30 samples

**After 30 samples:**
- Hero stat: p50 latency in large `typography.stat` text
- Secondary stats row: p95, p99, jitter (stddev) -- each labeled, in `typography.data`
- Confidence interval: displayed as "+/- Xms" next to p50
- Sample count: "N rounds" in `typography.caption`
- Connection reuse delta: "First request: Xms, subsequent avg: Yms" -- only shown if delta > 20%

**Expandable detail:**
- Chevron icon on card header
- Expanded view shows: full URL, all percentiles (p25, p50, p75, p90, p95, p99), min, max, stddev, sample count, first/last measurement timestamps
- If Tier 2 data is available: shows inline Tier 2 breakdown (see DiagnosticPanel)
- Expand/collapse uses progressive disclosure transition (Section 5, Animation)

### 6.6 Tier 2 Diagnostic Panel

**When TAO is available (Tier 2):**
- Displayed in expanded summary card or as a separate panel below summary cards
- Stacked waterfall bar showing: DNS resolution, TCP connection, TLS handshake, TTFB, content transfer
- Each segment labeled with its duration in ms
- Segment colors: distinct from latency scale (blues/cyans for network phases, avoiding confusion with latency heat)
  - DNS: `#4ecdc4`
  - TCP: `#45b7d1`
  - TLS: `#96ceb4`
  - TTFB: `#ffeaa7`
  - Transfer: `#dfe6e9`
- Waterfall shows the latest measurement. "Average" toggle switches to averaged values across all rounds.
- Values update in real-time during test (latest measurement replaces previous)

**TAO detection:**
- After first response, check if `PerformanceResourceTiming` sub-fields (domainLookupStart, connectStart, etc.) are non-zero
- If all sub-fields are zero: TAO is absent, show Tier 1 fallback
- TAO status is determined per endpoint (some endpoints may have TAO, others may not)
- Re-check on each response (TAO status can theoretically change between requests due to server-side configuration changes)

**When TAO is absent (Tier 1 fallback):**
- Instead of the waterfall, show:
  - Total latency (the one metric always available)
  - Connection reuse delta (first request vs. subsequent average)
  - Explanatory text: "This server does not send the Timing-Allow-Origin header, so detailed timing breakdown is unavailable. Total latency and connection patterns are still tracked." -- in `color.text.muted`, `typography.body`
- No empty panels, no broken UI, no placeholder bars. The Tier 1 display is a complete, designed experience.

**Mixed Tier 1/Tier 2 endpoints:**
- Each endpoint independently shows its tier. The UI does not attempt to normalize the display.
- A subtle badge on each card: "Tier 1" or "Tier 2" in `typography.caption`, with a "?" tooltip explaining the difference.

### 6.7 Share Functionality

**URL encoding format:**
- Uses URL hash fragment: `#s=<compressed-data>`
- Data compressed with `lz-string.compressToEncodedURIComponent()`
- No backend required

**What is included:**

| Share mode | Contents | Triggered by |
|---|---|---|
| Config-only | Endpoint URLs, settings (timeout, delay, cap, CORS mode) | "Share Config" button -- available always |
| Full results | Config + per-endpoint measurement arrays (round, latency, tier2 fields if available, status) | "Share Results" button -- available after test has data |

**Encoding schema (JSON before compression):**
```typescript
// Authoritative definition in Interface Contracts section (Section 4).
// Results use positional indexing: results[i] corresponds to endpoints[i].
interface SharePayload {
  v: 1;
  mode: 'config' | 'results';
  endpoints: { url: string; enabled: boolean }[];
  settings: { timeout: number; delay: number; cap: number; corsMode: 'no-cors' | 'cors' };
  results?: {
    samples: { round: number; latency: number; status: 'ok' | 'timeout' | 'error'; tier2?: TimingPayload }[];
  }[];  // Parallel array — index is the join key, not endpointId
}
```

**Config-only links:**
- Estimated size: <1,000 characters for 10 endpoints
- When opened: populates endpoint list and settings, does not auto-start test
- Use case: "Test these endpoints from YOUR location"

**Full-result links:**
- Estimated size: 5 endpoints x 50 rounds x 6 fields = ~5-8K characters after compression
- When opened: renders the result snapshot immediately (scatter plot, heatmap, summary cards) without running a new test. A banner at top: "Viewing shared results from [timestamp]. Start a new test to measure from your location."
- "Run Again" button: starts a new test with the same configuration

**Copy-to-clipboard UX:**
- Click "Share" opens a small popover with two options: "Copy Config Link" and "Copy Results Link" (if results exist)
- On click: URL is generated, copied to clipboard via `navigator.clipboard.writeText()`
- Visual feedback: button text changes to "Copied!" with checkmark icon for 2 seconds, then reverts
- Fallback: if Clipboard API unavailable, show the URL in a selectable text input with "Select All" instruction

**URL length safety:**
- Before generating: estimate compressed size. If > 8,000 characters, truncate oldest rounds to fit, and append a warning to the popover: "Results truncated to fit URL limit. Showing last N rounds."
- If even config-only exceeds 8,000 characters (extremely unlikely with 10 endpoints), show error: "Too many endpoints to share via URL."

### 6.8 Settings Persistence

**Storage:** `localStorage`

**Key:** `sonde_v2_settings`

**Schema:**
```typescript
interface PersistedSettings {
  version: 2;
  endpoints: { url: string; enabled: boolean }[];
  settings: {
    timeout: number;
    delay: number;
    cap: number;
    corsMode: 'no-cors' | 'cors';
  };
  ui: {
    expandedCards: string[];  // endpoint IDs with expanded summary cards
    activeView: 'timeline' | 'heatmap' | 'split';
  };
}
```

**Versioning:**
- `version` field in the stored object
- On load: check version. If missing or < current, run migration function.
- Migration is forward-only: v1 -> v2, v2 -> v3, etc.
- If migration fails (corrupt data): reset to defaults, log warning to console.

**Migration from v1 cookies:**
- v1 stored settings in a cookie named `s80_settings`
- v2 reads `s80_settings` on first load. If found: extract endpoint URLs, map to v2 schema, save to localStorage, delete the cookie.
- If cookie parsing fails: ignore silently, use defaults.

**Write frequency:** Debounced -- settings are persisted 500ms after the last change, not on every keystroke.

**Defaults (used when no persisted settings exist):**
- Endpoints: `https://www.google.com`, `https://1.1.1.1`
- Timeout: 5000ms
- Delay: 1000ms
- Cap: 0 (unlimited)
- CORS mode: `no-cors`
- Active view: `timeline`

### 6.9 Keyboard Navigation

**Tab order:**
1. Header (skip link target)
2. EndpointPanel URL inputs (each input is a tab stop)
3. EndpointPanel "Add endpoint" button
4. Start/Stop button
5. Settings button (opens drawer)
6. Share button
7. Timeline canvas (when focused, arrow keys navigate data points)
8. Heatmap canvas (when focused, arrow keys navigate cells)
9. Summary cards (each card is a tab stop, Enter expands/collapses)

**Shortcuts:**
| Key | Action |
|---|---|
| `Space` or `Enter` on Start/Stop | Toggle test |
| `Escape` | Close settings drawer, close share popover, dismiss selected data point |
| `?` | Show keyboard shortcut overlay |
| `1` -- `0` | Toggle visibility of endpoint 1-10 |

**Focus management for canvas:**
- Canvas elements are not natively focusable. Each canvas has `tabindex="0"` and `role="application"` with `aria-roledescription="interactive latency chart"` (timeline) or `aria-roledescription="interactive latency heatmap"` (heatmap). `role="application"` is correct because these elements support custom keyboard navigation (arrow keys, Enter, Escape) that overrides default screen reader behavior.
- Each canvas has an `aria-label` that provides context: "Timeline scatter plot showing latency over time for N endpoints" / "Heatmap showing latency patterns for N endpoints."
- When a canvas is focused, an ARIA live region announces navigation instructions on first focus: "Use arrow keys to navigate data points. Enter to show details. Escape to dismiss."
- Subsequent navigation updates the ARIA live region with the selected data point: "Endpoint: [URL], Round [N], Latency: [X]ms"
- Arrow key navigation updates the selection and the ARIA live region
- The interaction canvas draws a visible focus ring around the selected point

**Heatmap text alternative:**
- A visually hidden (`sr-only`) summary paragraph is positioned adjacent to the heatmap canvas, updated every 5 seconds (or on test completion).
- Summary format: "Heatmap summary: [N] endpoints tested over [M] rounds. [Endpoint A] averages [X]ms (fastest). [Endpoint B] averages [Y]ms (slowest). [Trend description: 'latency is stable' / 'latency is increasing' / 'latency is variable']."
- Trend detection: compare the average of the last 10 rounds to the average of the first 10 rounds. If delta > 20%, report "increasing" or "decreasing." Otherwise "stable." If stddev > 50% of mean, report "variable."
- This provides screen reader users with the aggregate pattern recognition that sighted users get from the color heatmap.

**Skip link:** First element in the DOM, visible on focus: "Skip to results" -- jumps focus to the first summary card.

### 6.10 Error States

**Per-endpoint errors:**
- Network error (DNS failure, connection refused): Error marker on timeline, `color.status.error` indicator on endpoint row, inline text: "Network error"
- CORS error (in cors mode): Distinct error message: "CORS rejected -- try no-cors mode"
- HTTP error status (if detectable in cors mode): Shows status code
- Error points are plotted on the timeline (at y-max) and heatmap (error pattern cell) -- errors are data, not blank spots

**All-offline state (all endpoints unreachable):**
- Detected when: all endpoints in a round return errors (not timeouts -- timeouts are different)
- Visualization area shows: dimmed canvas with centered message: "All endpoints unreachable. Check your network connection."
- Icon: Three concentric rings in `color.status.offline`, static (not pulsing)
- Test continues running (auto-recovery when network returns)
- ARIA live region announces: "All endpoints unreachable"

**Invalid URL (on test start):**
- Inline error on the specific endpoint input
- Test does not start until at least one valid, enabled endpoint exists
- Focus moves to the first invalid input

**Share URL too long:**
- Handled in Section 6.7 -- truncation with warning, or error for config-only

**Mixed success/failure:**
- Endpoints that succeed render normally. Endpoints that fail show error state individually. The visualization is never "all or nothing" -- each endpoint is independent.

## 7. Security Surface

### No Authentication

Sonde has no accounts, sessions, tokens, or API keys. There is nothing to authenticate and nothing to misconfigure. This is by design -- zero-friction access is a core value proposition.

### Attack Surface Analysis

**DDoS via Sonde:**
- Risk: Using Sonde to flood a target with requests.
- Mitigation: Sequential rounds (not parallel floods), configurable delay between rounds (default 1000ms), per-endpoint request cap. At maximum speed with 0ms delay, Sonde sends one GET request per round per endpoint -- less traffic than loading a typical webpage. Not a meaningful DDoS vector.

**Malicious share URLs:**
- Risk: Crafted share URL pre-loads target URLs that the recipient's browser fetches on test start.
- Mitigation: Share links with config-only mode do NOT auto-start tests. The recipient sees the endpoint list and must explicitly click "Start." Share links with results mode display a static snapshot -- no requests are made. The banner "Viewing shared results" makes it clear this is historical data.
- Residual risk: Equivalent to embedding a cross-origin image -- GET request with no credentials (no-cors mode), opaque response body is never read.

**Internal network probing:**
- Risk: Users can enter private URLs (e.g., `192.168.1.1`, `http://localhost:8080`). Response is opaque (no data leaked to the page), but latency confirms host reachability.
- Mitigation: This is standard browser behavior, not unique to Sonde. The `no-cors` fetch mode means the browser controls access, not the tool. The EndpointPanel includes a subtle note: "Requests are sent from your browser" -- communicating that private addresses are accessed from the user's local network.
- Decision: No URL blocklist. Blocking private ranges would be security theater (users can trivially bypass by running fetch in devtools). The note is sufficient.

**`no-cors` mode implications:**
- Opaque responses: body, headers, and status code are inaccessible to JavaScript. Only timing data is available.
- No credential leakage: `no-cors` requests do not send cookies or auth headers by default.
- Tier 2 data requires `cors` mode (and TAO header). Switching to `cors` mode is explicit and documented.

**Share URL data:**
- Share URLs encode test configuration and results in the URL hash fragment.
- Hash fragments are never sent to the server in HTTP requests -- they stay client-side.
- Compressed data contains only: endpoint URLs, settings, and latency numbers. No PII, no credentials, no cookies.
- A malicious actor cannot inject executable code via the share URL -- the decoder expects a strict JSON schema and rejects anything that does not conform. `JSON.parse` is used, not `eval`.

**XSS via endpoint URLs:**
- Endpoint URLs are rendered in the DOM (EndpointPanel, tooltips, summary cards).
- All URL rendering uses Svelte's default text interpolation (`{url}`), which escapes HTML entities. No `{@html}` is used for user-provided data.
- Canvas rendering of URLs uses `fillText`, which does not interpret HTML.

### No Server-Side Component

There is no backend, no API, no database, no server-side processing. The entire application is static HTML/JS/CSS served from a CDN. The attack surface is limited to client-side JavaScript running in the user's own browser, with the same permissions as any other webpage.

## 8. Rollout

### Deployment Context

- **Greenfield on fork:** Sonde v2 is a ground-up rebuild on a forked repo. No existing Sonde v2 users. The original s80 users are unaffected (different repo/URL).
- **No data migration:** v1 uses cookie `s80_settings`. v2 uses `localStorage` with different keys. v2 reads the old cookie on first load for endpoint URL migration, then ignores it (Section 6.8).
- **No integrations:** Standalone single-page tool with no API, no consumers, no embeds.

### Deployment Strategy

- Static site deployment: `npm run build` produces a `dist/` directory containing `index.html`, one JS bundle, one CSS file, and font files.
- Hosting: GitHub Pages, Cloudflare Pages, or equivalent. No runtime server.
- Single atomic deployment: upload all files. Partial upload shows blank page -- recoverable by completing the upload.
- No environment variables, secrets, or runtime configuration.

### Rollback Plan

- Rollback = deploy previous git commit's build output.
- No database state to roll back. No server processes to restart.
- Recovery time: <5 minutes (rebuild + deploy).

### Backward Compatibility

- None required. No existing API consumers, no existing data format to preserve.
- v1 cookie is read once for migration, then ignored. If migration code has bugs, worst case is users get default endpoints instead of their v1 endpoints. No data loss (the cookie is not deleted on failure).

## 9. Edge Cases

### Empty State (No Endpoints Configured)

- Impossible by design: minimum 1 endpoint is always present. Default endpoints populate on first visit.
- If localStorage is corrupt and returns zero endpoints: fallback to defaults (`https://www.google.com`, `https://1.1.1.1`).

### Single Endpoint (Comparison Not Possible)

- The tool works normally with a single endpoint. All visualizations render with one data series.
- No "comparison not possible" warning -- the tool is useful for single-endpoint latency testing too.
- Summary cards show a subtle prompt: "Add another endpoint to compare" -- only visible when exactly one endpoint exists and the test is running.

### All Timeouts

- Timeline shows timeout markers at the timeout boundary, connected by the endpoint's color line.
- Heatmap shows all cells in `color.status.timeout` with diagonal line pattern.
- Summary card displays: "All requests timed out. Consider increasing timeout or checking the endpoint." below the collecting/stats area.
- Sonar pings use timeout animation (incomplete rings) for every data point.
- Statistics still compute after 30 rounds: p50/p95/p99 will all equal the timeout value, stddev will be 0 or near-0. This is displayed accurately -- it is valid data showing consistent timeout behavior.

### All Errors (Offline)

- Handled as first-class error state (Section 6.10).
- Visualization area shows offline message. Test continues (auto-recovery on network restoration).
- When network restores mid-test: new data points appear normally, offline message clears on next successful response.

### Mixed Tier 1/Tier 2 Endpoints

- Each endpoint independently shows its tier. Summary cards display the appropriate panel (waterfall or fallback) per endpoint.
- No normalization. No attempt to upgrade Tier 1 endpoints or downgrade Tier 2 for consistency.
- Tier badges ("Tier 1" / "Tier 2") on each card make the difference explicit.

### Very Fast Responses (<1ms)

- Logged accurately. The logarithmic y-axis renders sub-1ms points near the bottom.
- Values displayed with one decimal: "0.3ms", "0.8ms".
- At 100us timer resolution (without cross-origin isolation), the minimum meaningful measurement is ~0.1ms. Values of exactly 0ms are flagged as "below timer resolution" in the tooltip.

### Very Slow Responses (>10s)

- Plotted at their actual position on the logarithmic y-axis (which extends to accommodate).
- Y-axis auto-ranges: if a 15s response arrives, the axis extends to 20s with a new gridline at 10s.
- These points are valid data, not outliers to be hidden. They are visually prominent (high on the chart, colored red/critical on the latency scale).
- If the response exceeds the configured timeout, it is recorded as a timeout, not a slow response.

### Browser Tab Backgrounded During Test

- **Detection:** Freeze detection via heartbeat (100ms update interval). If the gap between two consecutive `requestAnimationFrame` callbacks exceeds 1,000ms, a "freeze" event is recorded.
- **Behavior:** Browsers throttle or pause timers/rAF in background tabs. Fetch requests in Dedicated Workers continue but responses may queue.
- **Handling:** When tab returns to foreground:
  - Queued worker messages are processed in order.
  - A "gap" marker is drawn on the timeline at the freeze boundary (vertical dashed line, `color.text.muted`).
  - Tooltip on the gap marker: "Browser tab was backgrounded. Measurements during this period may be inaccurate."
  - Data during the backgrounded period is kept but visually distinguished (reduced opacity on scatter points).
- **iOS specific:** Visibility API is unreliable on iOS Safari. The heartbeat-based freeze detection works universally.

### Share URL Exceeds Length Limit

- Before generating: estimated compressed size is checked against 8,000-character limit.
- If exceeded: oldest rounds are trimmed until the URL fits. The share popover shows: "Results truncated to last N rounds to fit URL limit."
- If config-only exceeds limit (>10 very long URLs): error message: "URL list too long to share. Try removing some endpoints."
- The 8,000-character limit is conservative. Chrome and Firefox support ~32K. The limit is chosen for safe sharing across platforms (email clients, Slack, Twitter may truncate long URLs).

### localStorage Unavailable (Private Browsing)

- **Detection:** Wrap `localStorage.setItem` in try/catch on initial load.
- **Behavior:** Settings are not persisted between sessions. The tool works normally using in-memory defaults.
- **User feedback:** None -- the tool silently degrades. There is no benefit to telling the user "settings won't be saved" when they're in private browsing mode (they expect this).
- **Share URLs still work:** They encode all configuration, so a shared link is self-contained regardless of localStorage availability.

### WebGL Context Lost During Test

- **Detection:** Listen for `webglcontextlost` event on the WebGL canvas.
- **Handling:** Call `event.preventDefault()` (allows restoration). Set a flag to skip WebGL rendering. Canvas 2D layers continue rendering normally -- the tool looks complete without the effects layer.
- **Restoration:** Listen for `webglcontextrestored`. Re-initialize WebGL context, rebuild shaders and textures. Resume effects rendering.
- **User feedback:** None. The transition is invisible -- effects silently disappear and reappear. Canvas 2D glow halos (screen compositing) provide adequate visual quality during the gap.

### Endpoint Returns Different TAO Status Across Requests

- **Behavior:** TAO status is re-evaluated on every response. If a previously Tier 2 endpoint stops sending TAO, the diagnostic panel transitions to Tier 1 fallback display for subsequent data points.
- **Historical data:** Previously collected Tier 2 data is retained and still visible in expanded card history. New data points show Tier 1 only.
- **UI:** Tier badge changes from "Tier 2" to "Tier 1". If the user has the diagnostic panel expanded, the waterfall transitions to the Tier 1 fallback with a brief note: "Detailed timing became unavailable."
- **Statistics:** Tier 2 statistics (DNS avg, TLS avg, etc.) are computed only from rounds where Tier 2 data was available. The sample count for Tier 2 stats may be less than the total round count.

## 10. Quality Infrastructure

### Visual Regression Testing

- **Tool:** Playwright screenshot comparison
- **Coverage:** Every component state (empty, loading, active, error, disabled) at every breakpoint (375px, 768px, 1024px, 1440px)
- **States captured per component:**
  - EndpointPanel: empty default, multiple endpoints, validation error, max endpoints reached
  - VisualizationArea: empty (no data), loading (collecting), active (data flowing), offline (all unreachable), shared results (static view)
  - SummaryCards: collecting (<30 rounds), active (>30 rounds), expanded with Tier 2, expanded with Tier 1 fallback
  - Controls: idle, running, settings drawer open
  - Share: popover open, "Copied!" state, truncation warning
- **Threshold:** Pixel diff tolerance of 0.1% (accounts for subpixel anti-aliasing differences across OS versions)
- **Execution:** On every PR. Screenshot diffs reviewed before merge.

### Animation Performance Budget

- **Frame budget monitor:** Development-only overlay showing per-frame render time. Warns (yellow) at >12ms. Errors (red) at >16ms.
- **Automated measurement:** Playwright test that starts a test with 5 endpoints, runs for 30 rounds, and asserts that p95 frame time (measured via `PerformanceObserver` long task API or manual `performance.now()` bracketing) is under 16ms.
- **CI integration:** Performance regression test runs on every PR. Failure blocks merge.
- **Degradation path:** If frame time consistently exceeds thresholds, the `RenderScheduler` automatically:
  1. Disables sonar ping animations (>12ms p95)
  2. Disables glow halos (>14ms p95)
  3. Reduces heatmap gradient to flat fills (>15ms p95)
  4. Skips every other frame for non-data layers (>16ms p95)

### Accessibility Enforcement

- **Tool:** axe-core integration in Playwright tests
- **Standard:** WCAG 2.1 AA
- **Automated checks:**
  - Color contrast ratios for all text against background surfaces
  - ARIA roles and labels on all interactive elements
  - Focus order matches visual order
  - All images/canvas have alt text or aria-label
  - No ARIA roles used on elements where native HTML semantics suffice
- **CVD simulation testing:** Playwright tests capture screenshots through simulated protanopia, deuteranopia, and tritanopia filters. Latency scale colors must remain distinguishable under all three simulations.
- **Keyboard navigation test:** Playwright test that navigates the entire tab order, activates every interactive element, and verifies focus indicators are visible.
- **CI integration:** axe-core violations fail the build. Zero tolerance.

### Design Token Lint Rules

- **Custom ESLint rule:** `no-raw-visual-values`
  - Flags raw hex colors (`#xxx`, `#xxxxxx`, `#xxxxxxxx`)
  - Flags raw pixel values in style contexts (`12px`, `1rem`) that are not token references
  - Flags raw duration values (`200ms`, `0.3s`) in animation/transition contexts
  - Flags `rgb()`, `rgba()`, `hsl()`, `hsla()` in component files
  - Allowed in `tokens.ts` only
- **CI integration:** Lint violations fail the build

### Lighthouse CI

- **Tool:** Lighthouse CI (`@lhci/cli`)
- **Thresholds:**
  - Performance: >= 95
  - Accessibility: >= 90
  - Best Practices: >= 90
  - SEO: >= 90
- **Execution:** On every PR against the built artifact (served locally via `http-server`)
- **Failure:** Score below threshold blocks merge
- **Budget assertions:**
  - Total JS bundle: < 80KB gzipped
  - Total CSS: < 10KB gzipped
  - Font files: < 20KB total (subsets)
  - FCP: < 1s on simulated 3G Fast
  - TTI: < 2s on simulated 3G Fast

---

*This specification covers the complete Sonde v2 design. Implementation proceeds via the Main-Thread Layered Canvas approach with the component hierarchy, rendering pipeline, and quality infrastructure described above. The measurement schema is designed to be telemetry-ready for the Layer 4 vision (collective edge intelligence) without building telemetry transmission in v1.*
