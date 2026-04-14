---
date: 2026-04-07
feature: chronoscope-v2
type: problem-statement-artifact
status: APPROVED
---

# Problem Statement Artifact — Chronoscope v2

## 1. PROBLEM STATEMENT

When something on the internet feels slow, there is no zero-friction, browser-based tool that lets a user — whether a frustrated end-user or a network engineer — instantly test HTTP latency to multiple endpoints simultaneously from their actual network position, compare results side-by-side, and share findings. Cloud-based monitoring tools test from data centers (not the user's vantage point), require accounts and configuration, and cost money at scale — meaning they answer "is this endpoint up from AWS us-east-1?" rather than "why does this feel slow from where I'm sitting right now?" The gap widens for comparative diagnosis: no existing tool performs synchronized, multi-URL latency measurement from the client, which is the only architecture that produces statistically valid cross-endpoint comparisons under identical network conditions.

## 2. SUCCESS DEFINITION

**30-day "solved" criteria:**

- A user can open a URL, paste 2+ endpoints, and within 5 seconds see live comparative latency data visualized in a way that is immediately legible to a non-technical user and simultaneously information-dense enough for a network engineer.
- Results are shareable via permalink (URL-encoded config + result snapshot) without any backend.
- The tool surfaces at least 3 diagnostic signals beyond raw latency (DNS timing, TLS handshake, TTFB breakdown, connection reuse delta) via the Resource Timing API.
- Lighthouse Performance score >= 95, accessibility score >= 90. First Contentful Paint < 1s on a cold load over 3G Fast.
- At least 5 network-engineer-adjacent users (sourced from Hacker News, Reddit r/networking, or direct outreach) independently describe the UI as "beautiful" or "polished" in unsolicited feedback.

**Rollback trigger:**

- If after 30 days, fewer than 20% of sessions that start a test complete a full measurement round (10+ pings per endpoint), the UX has failed and needs fundamental rethinking — not iteration.

## 3. CONSTRAINTS

| Constraint | Value |
|---|---|
| Budget (infra) | $0 — static site hosting only (GitHub Pages, Cloudflare Pages, or equivalent) |
| Budget (services) | $0 for v1 — no paid APIs, no backend, no database |
| Architecture | 100% client-side. All computation, measurement, and visualization in the browser. No server-side proxy, no telemetry ingest endpoint in v1 |
| Deployment | Static site. Single `npm run build` producing a deployable artifact. No SSR, no serverless functions |
| Browser support | Chromium (Chrome, Edge, Arc) + Firefox + Safari. Resource Timing API (L2) is the floor — graceful degradation where Safari lags on sub-field availability |
| Timeline | Milestone-based, no hard deadline. Quality gates per milestone, not calendar dates |
| Compliance | None. No PII collection. No accounts |
| Licensing | MIT |

## 4. NON-GOALS

| Excluded from v1 | Rationale |
|---|---|
| **Anonymous telemetry / crowdsourced data** | Requires a backend ingest service, storage, and aggregation pipeline. This is the Layer 4 vision, not v1. Designing the measurement schema to be telemetry-ready is in scope; transmitting data is not. |
| **"Internet weather map" visualization** | Depends on telemetry data that won't exist yet. |
| **Traceroute / hop-level diagnosis** | Not possible from browser JavaScript. Requires a CLI companion or WebExtension with native messaging — out of scope for a static site. |
| **User accounts, saved history, or dashboards** | Contradicts the zero-friction philosophy. Shareable permalinks cover the "save and revisit" use case without auth. |
| **Mobile-native app** | The tool must be mobile-responsive and fully functional on mobile browsers, but a native app wrapper (PWA install, App Store) is post-v1. |
| **Alerting / continuous monitoring** | Chronoscope is a diagnostic tool you reach for, not a monitoring platform. Deliberate positioning decision, not a deferral. |
| **Custom backend probe endpoints** | v1 tests against user-supplied URLs. Edge probe servers are a future moat but require infrastructure spend. |
| **Accessibility beyond WCAG AA** | AA is the target. AAA compliance is not a v1 goal. |

## 5. ANALOGOUS PRODUCTS

| Product | What it does | What it gets right | What it gets wrong (for Chronoscope's purpose) |
|---|---|---|---|
| **Speedtest.net (Ookla)** | One-click bandwidth/latency test from browser | Zero-friction UX, universally recognized, beautiful real-time visualization, shareable results | Tests to Ookla's own servers only. Measures bandwidth, not HTTP endpoint latency. No multi-URL comparison. |
| **ping.pe** | Browser-based ping from 30+ global locations | Multi-location, instant results, no account | Tests FROM cloud, not from user's browser. Single URL only. Minimal visualization. |
| **Uptrends / Pingdom / UptimeRobot** | Uptime + latency monitoring from cloud probes | Mature products, historical data, alerting | Require accounts, test from data centers, pricing bait-and-switch at scale, not diagnostic tools. |
| **WebPageTest** | Full page load waterfall analysis | Deep Resource Timing data, filmstrip view, Lighthouse integration | Tests one URL at a time, results take 30-60s, UI is functional but dated. |
| **Grafana + Prometheus** | Self-hosted metrics dashboards | Infinitely flexible visualization, open source | Requires infrastructure, configuration expertise, not instant, not client-side. |
| **Waze (cross-domain)** | Crowdsourced real-time traffic data | Every user is a probe, data gets better with scale | Architectural analog for Chronoscope's telemetry vision. |
| **Bloomberg Terminal (cross-domain)** | Multi-stream real-time financial data visualization | Information density without visual chaos, synchronized time-series display | Visualization paradigm is the design target for Chronoscope's multi-endpoint view. |

**The gap:** No tool combines (a) client-side measurement from user's actual network, (b) multi-URL synchronized comparison, (c) Resource Timing diagnostic breakdown, and (d) world-class real-time visualization — in a zero-friction, no-account, static-site package.

## 6. RESOLVED DECISIONS

### 6.1 Technology Stack

**Svelte + Vite + TypeScript.** Not SvelteKit — no routing or SSR needed. Raw Svelte + Vite produces the leanest possible static build: one HTML file, one JS bundle, one CSS file.

- Svelte compiles to vanilla JS with no runtime — smallest bundle of any framework
- Compile-time reactivity produces surgical DOM mutations — critical for real-time data updates
- Built-in transition system compiles to optimized CSS/JS — essential for progressive disclosure animations
- Vite HMR provides the fastest development feedback loop

### 6.2 Rendering Architecture

**Canvas 2D primary renderer + optional WebGL effects layer.**

- All data visualization (points, lines, labels, axes, heatmap) renders to Canvas 2D — accurate text rendering, fast, universally supported
- WebGL composites on top for effects only: bloom on data points, sonar ping glow, smooth gradient overlays
- If WebGL is unavailable or device is low-power (detected via frame budget monitoring), effects layer is skipped — the tool still looks good, just without cinematic glow
- Renderer-agnostic data pipeline: measurement engine outputs data, renderer interface consumes it — swap renderers without touching measurement or UI code

### 6.3 Visual Identity — Meteorological Instrument Aesthetic

The name "Chronoscope" means "probe" — a radiochronoscope is a meteorological instrument that probes atmospheric conditions from a specific vantage point. This parallel is exact and gives us a coherent visual language:

**Color palette (weather radar, not startup gradients):**
- Background: deep navy-black (`#0a0e1a` range, night sky)
- Fast latency: cool blues and teals (`#00b4d8` → `#0077b6`)
- Medium latency: greens and yellows (`#90be6d` → `#f9c74f`)
- High latency: oranges and reds (`#f8961e` → `#f94144`)
- Timeout/error: deep magenta or violet (distinct from heat scale)
- UI chrome: muted blue-grays, not pure white text

**Typography (instrument panel):**
- Data values: JetBrains Mono or IBM Plex Mono — tabular figures, designed for screen legibility at small sizes
- UI text: Instrument Sans or Plus Jakarta Sans — clean, modern, not overexposed
- One heading font, one body font, one mono font. No more.

**Signature animation — the sonar ping:**
- When a measurement completes, a concentric ring emanates from the data point
- Fast responses: tight, quick pulse. Slow responses: wider, lazier pulse. Timeouts: ring expands and fades without completing
- This single animation conveys latency intuitively — you "feel" the speed without reading a number

**Visual motifs:**
- Concentric ring elements (sonar/radar echoes) — background texture, loading states, empty state
- Sweep line on the main timeline (radar sweep showing current measurement position)
- Gradient bands in the heatmap (weather radar precipitation bands, not discrete blocks)

**What this is NOT:**
- Not skeuomorphic — no fake CRT glow, no rotating sweep arms
- Not retro — modern, clean, spacious
- Not generic dark mode — every color traces back to the weather radar vocabulary

### 6.4 Two-Tier Measurement

**Tier 1 — Always available (any URL):**
- Total round-trip latency
- Connection reuse detection (first vs. subsequent requests)
- Timeout and error classification
- Jitter and variance patterns
- Statistical aggregates (p50/p95/p99, standard deviation, confidence intervals)

**Tier 2 — Available when server permits (Timing-Allow-Origin):**
- DNS resolution time
- TCP connection time
- TLS handshake time
- TTFB (server processing time)
- Full waterfall breakdown

UI shows both tiers clearly — Tier 2 panels expand when data exists, show explanation when they don't.

### 6.5 Shareability

lz-string compressed URL hash fragments. Encodes both config (which URLs to test) and result snapshots. Also supports config-only links ("test these endpoints from YOUR location"). No backend required.

### 6.6 Statistical Methodology

- Percentiles (p50, p95, p99), not averages
- Jitter as a first-class metric (standard deviation, visualized)
- Minimum 30 samples before showing summary statistics
- Outliers displayed and flagged, never trimmed
- Confidence intervals on summary stats after sufficient samples

## 7. ARCHITECTURE FOR SUSTAINED POLISH

The level of visual and interaction quality this project demands cannot be achieved and then maintained through discipline alone. It must be structural — the architecture must make polish the path of least resistance and regression physically difficult.

### 7.1 Design Token System

All visual constants — colors, spacing, typography, timing curves, shadows — live in a single `tokens.ts` file that is the sole source of truth. Components never contain raw color values, pixel measurements, or animation durations. This means:

- Palette changes propagate everywhere instantly
- Color blindness testing is one file change, not a grep-and-replace
- New components automatically look correct because they pull from the same vocabulary
- Visual consistency is enforced by architecture, not code review

Token categories:
- `color.latency.*` — the weather radar scale
- `color.surface.*` — background layers and elevation
- `color.text.*` — content hierarchy
- `spacing.*` — 4px base unit scale
- `timing.*` — animation durations and easing curves
- `typography.*` — font families, sizes, weights, line heights
- `shadow.*` — elevation layers
- `radius.*` — corner rounding scale

### 7.2 Component Architecture

Every UI element is a Svelte component with:
- **Props typed with TypeScript** — no ambiguous inputs
- **Scoped styles pulling from tokens** — no raw values
- **Explicit states** — every component defines its empty, loading, active, error, and disabled states at creation time, not as afterthoughts
- **Transition declarations** — enter/exit animations declared in the component, not bolted on later

Component hierarchy:
```
App
├── MeasurementEngine (no UI — pure logic, Web Workers)
├── Layout
│   ├── Header (branding, minimal)
│   ├── EndpointPanel (URL inputs, enable/disable, per-endpoint stats)
│   ├── VisualizationArea
│   │   ├── TimelineRenderer (Canvas 2D — main scatter/heatmap)
│   │   ├── EffectsLayer (WebGL — bloom, ping pulses, optional)
│   │   └── OverlayUI (HTML — tooltips, hover details, accessible)
│   ├── SummaryCards (headline findings, expandable detail)
│   └── Controls (start/stop, settings, share)
└── ShareManager (URL encoding/decoding, permalink generation)
```

### 7.3 Rendering Pipeline

The measurement-to-pixel pipeline is explicitly layered to prevent coupling:

```
Web Workers (measurement)
    → MeasurementStore (Svelte store, typed data)
        → DataTransform (statistics, percentiles, bucketing)
            → RenderScheduler (requestAnimationFrame, frame budget)
                → Canvas2DRenderer (data viz)
                → WebGLEffectsRenderer (bloom, glow — optional)
                → DOMRenderer (summary cards, controls — Svelte reactive)
```

Each layer has a single responsibility. The RenderScheduler monitors frame budget and drops the WebGL effects layer before dropping data visualization fidelity — the data is always accurate, the effects are always optional.

### 7.4 Quality Infrastructure

**Visual regression testing:**
- Playwright captures screenshots of every component state (empty, loading, active, error) at every breakpoint (375px, 768px, 1024px, 1440px)
- Screenshot diffs on every change — visual regressions are caught before merge, not in production

**Animation performance budget:**
- Frame budget monitor in development: warns if any frame exceeds 16ms (60fps target)
- Automated Lighthouse CI on build — Performance score < 95 fails the build

**Accessibility enforcement:**
- axe-core integration in tests — WCAG AA violations fail the build
- Keyboard navigation tested in Playwright — every interactive element must be reachable and operable

**Design token validation:**
- Lint rule: no raw color values, pixel measurements, or animation durations in component files
- All visual constants must reference the token system
- Violations fail the build

### 7.5 Maintainability Principles

1. **The token system is the design.** To change how Chronoscope looks, you change tokens. To add a new component, you compose from tokens. The visual language is a dependency, not a suggestion.

2. **Every component has all its states.** Adding a new feature means designing its empty, loading, active, error, and disabled states upfront — because the component template requires them. This prevents the "happy path only" problem where edge cases look broken.

3. **The renderer is replaceable.** Canvas 2D today, WebGL tomorrow, WebGPU someday. The data pipeline doesn't know or care. This means the visualization can be upgraded without touching the measurement engine or UI shell.

4. **Polish is tested, not remembered.** Visual regression screenshots, animation frame budgets, accessibility audits, and token lint rules run automatically. The build fails before quality degrades. No human has to remember to check.

5. **The measurement engine is isolated.** Web Workers run pure TypeScript with zero UI dependencies. The measurement methodology (percentiles, jitter, confidence intervals) is testable in isolation with deterministic inputs. Visualization bugs never affect measurement accuracy; measurement changes never break the UI.

## 8. REMAINING KEY UNKNOWNS (for research phase)

1. **Resource Timing API coverage across browsers.** What percentage of real-world URLs return Timing-Allow-Origin? This determines how prominently Tier 2 diagnostic data is positioned in the UX vs. treated as a bonus.

2. **CORS and opaque response timing fields.** Can Resource Timing L2 sub-fields be read for no-cors fetch responses, or does the browser zero them? Determines whether Tier 2 is achievable for arbitrary URLs.

3. **Web Worker vs Service Worker vs Shared Worker.** Which worker architecture produces the most accurate timing under main-thread contention? Affects measurement engine design.

4. **URL-encoded result set size limits.** Can lz-string compress 5 endpoints × 50 rounds × timing data within URL fragment limits? Determines shareability architecture.

5. **WebGL availability and performance on target devices.** What percentage of the target browser matrix supports WebGL 2? What's the battery impact on mobile? Determines how aggressively the effects layer is used.

---

**Status:** APPROVED — proceed to acceptance criteria and research phase.
