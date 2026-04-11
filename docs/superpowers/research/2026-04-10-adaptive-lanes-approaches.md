---
date: 2026-04-10
feature: adaptive-lanes
type: approach-memos
---

# Approach Decision Memos — Adaptive Lane Layout

---

## APPROACH: Derived Layout Mode

### CORE IDEA

A single reactive `$derived` computation reads endpoint count and container height to produce a layout mode enum (`full | compact | compact-2col`), which Lane and LanesView consume to switch rendering.

### MECHANISM

LanesView gets a `ResizeObserver` on its container element. A `$derived` computation takes `(endpointCount, containerHeight)` and produces a `layoutMode`:
- `full`: count ≤ 3 (panel side-by-side, single column)
- `compact`: count ≥ 4 AND single column still gives each lane ≥ 120px
- `compact-2col`: count ≥ 4 AND single column would give lanes < 120px

Lane.svelte receives `compact: boolean` as a prop. When true, it renders a slim header row (URL + hero value + mini stats) above a full-width chart instead of the side panel. This reuses the existing mobile breakpoint pattern (Lane already switches to horizontal layout at ≤767px).

LanesView switches its CSS from `flex-direction: column` to `display: grid; grid-template-columns: 1fr 1fr` when in `compact-2col` mode.

CrossLaneHover already queries `.lane-chart` bounding rect for hover mapping (just fixed), so it adapts automatically — no hover code changes needed.

Cap enforcement: `addEndpoint()` in endpoints.ts checks `endpoints.length >= 10` and returns early. UI: the `+ Endpoint` button reads endpoint count and disables at 10.

### FIT ASSESSMENT

- **Scale fit:** Matches — derived layout responds to any count/viewport combo. No hardcoded pixel breakpoints except the 120px minimum.
- **Team fit:** Fits — pure Svelte/CSS, no new dependencies.
- **Operational:** Zero runtime cost — ResizeObserver + $derived are O(1).
- **Stack alignment:** Uses existing Svelte 5 runes, CSS custom properties, ResizeObserver (standard web API).

### TRADEOFFS

**Strong at:** Simple mental model — one derived value drives everything. Easy to test (mock count + height → assert mode). No state to manage.

**Sacrifices:** ResizeObserver adds a small async timing concern (layout mode lags one frame on resize). Not an issue in practice for this use case.

### WHAT WE'D BUILD

1. `layoutMode` derived computation in LanesView
2. Compact header variant in Lane.svelte (conditional on `compact` prop)
3. CSS grid switch in LanesView styles
4. Cap enforcement in endpoints.ts + UI disable in Topbar/EndpointDrawer
5. Token additions: `lane.minHeight`, `lane.compactHeaderHeight`

### THE BET

The 120px minimum lane height is sufficient for a readable compact lane (header + SVG chart with heatmap strip).

### REVERSAL COST

Easy — layout mode is a derived value with no persistence. Changing thresholds or adding modes is a one-line change.

### WHAT WE'RE NOT BUILDING

- Scrollable lanes (defeats comparison purpose)
- Collapsible/expandable individual lanes
- 3+ column layouts
- Drag-to-reorder lanes

### INDUSTRY PRECEDENT

Grafana dashboard panels auto-resize in grid layouts based on viewport, collapsing legends when space is tight. [VERIFIED — docs.grafana.org panel options documentation]

---

## APPROACH: CSS Container Queries

### CORE IDEA

Use CSS `@container` queries on the `.lane` element itself so that the panel-to-header transition is purely CSS — no JavaScript layout computation needed.

### MECHANISM

Lane.svelte wraps its content in a container query context (`container-type: size`). When the lane's own height drops below a threshold (e.g., `@container (max-height: 150px)`), CSS hides the side panel and shows a compact header row via `display: none` / `display: flex` toggles.

LanesView handles the column switch via a similar container query on `.lanes`, or a media query based on `(max-height: ...)` since the lanes container is 100% of available space.

No JavaScript layout mode computation. No ResizeObserver.

### FIT ASSESSMENT

- **Scale fit:** Matches — CSS-native, zero JS overhead.
- **Team fit:** Fits, but container queries are newer; requires verifying Svelte 5 SSR compat (not a concern for this SPA).
- **Operational:** Zero.
- **Stack alignment:** Pure CSS, no new dependencies. But mixes two layout paradigms (flex within container queries) which can be harder to debug.

### TRADEOFFS

**Strong at:** No JavaScript at all for layout decisions. Browser handles everything. Truly responsive to any resize scenario.

**Sacrifices:** Container queries can't easily drive JS-side behavior (like changing hover logic). Lane.svelte would need BOTH the side-panel and compact-header markup always present in the DOM, toggled by CSS. This doubles the DOM nodes for each lane. Also, container query `max-height` support requires `container-type: size` which forces explicit height on the container — conflicts with the current `flex: 1` model.

### WHAT WE'D BUILD

1. Container query CSS in Lane.svelte (dual markup: panel + compact header)
2. Container query CSS in LanesView.svelte (column switch)
3. Cap enforcement in endpoints.ts + UI disable
4. Token additions for thresholds

### THE BET

CSS container queries with height-based conditions work reliably in flex layouts where heights are computed, not explicit.

### REVERSAL COST

Easy to medium — removing container queries means deleting CSS rules and the duplicate markup, but the dual-markup pattern is the messier part to clean up.

### WHAT WE'RE NOT BUILDING

Same as Approach 1.

### INDUSTRY PRECEDENT

Container queries are used in production by Shopify Polaris and GitHub Primer for responsive components. Height-based container queries are less common; most use width-based. [SINGLE — web.dev container queries documentation]

---

## Comparison Matrix

| Criterion | Derived Layout Mode | CSS Container Queries |
|-----------|--------------------|-----------------------|
| AC1: Full panel at 1–3 | STRONG — derived mode = `full`, panel renders normally | STRONG — default CSS, no container query fires |
| AC2: Compact at 4+ | STRONG — `compact` prop switches Lane rendering | PARTIAL — requires dual markup always in DOM; height-based container queries in flex layouts are fragile |
| AC3: 2-col when height low | STRONG — ResizeObserver gives exact height, grid switch is clean | WEAK — container query on height requires explicit container sizing that conflicts with flex: 1 |
| AC4: Cap at 10 | STRONG — store-level enforcement | STRONG — same implementation either way |
| AC5: Hover accuracy all modes | STRONG — hover already uses .lane-chart bounding rect | PARTIAL — dual markup means two .lane-chart elements per lane; hover querySelector returns first, may pick wrong one |
| Scale fit | STRONG — works for any count/viewport | PARTIAL — height queries in flex are unreliable |
| Team fit | STRONG — familiar Svelte patterns | PARTIAL — newer CSS feature, height-based usage is uncommon |
| Operational burden | STRONG — zero | STRONG — zero |
| Stack alignment | STRONG — ResizeObserver + Svelte runes | PARTIAL — mixes flex + container queries, harder to debug |
