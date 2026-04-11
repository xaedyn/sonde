# Adaptive Lane Layout — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Chosen approach:** Derived Layout Mode

---

## Problem

When a user monitors 4+ endpoints simultaneously, the current fixed-layout lanes become unusable. Each lane shrinks proportionally in the single flex column, eventually becoming too short to read chart data, stat labels, or heatmap strips. The 250px side panel consumes a disproportionate share of horizontal space in every lane regardless of how many lanes exist. There is no cap on endpoint count, so a user can add endpoints until the palette cycles (causing color confusion) and lanes collapse to single-digit pixel heights.

Users need to compare latency across many endpoints side-by-side. Scrolling defeats this purpose. The layout must adapt to endpoint count and available vertical space while keeping all lanes simultaneously visible and readable.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Lane height with 1-3 endpoints | >= 150px each |
| Lane height with 4-10 endpoints | >= 120px each |
| Chart area visible in compact mode | 100% lane width (no 250px panel) |
| CrossLaneHover accuracy in all 3 modes | Hover line and tooltip align to correct dot within 1px |
| Max endpoint count enforced | Exactly 10 (store rejects 11th, UI disables button) |
| Layout mode transition | < 1 frame (derived computation, no animation delay) |
| Mobile (<=767px) compact threshold | 3+ endpoints (tighter space) |

---

## Out of Scope

| Excluded | Reason |
|----------|--------|
| Scrollable lanes | Defeats the side-by-side comparison purpose of the tool |
| Collapsible/expandable individual lanes | Adds state management complexity for marginal benefit in v1 |
| 3+ column grid layouts | Lanes become too narrow for readable SVG charts below ~400px width |
| Drag-to-reorder lanes | Nice-to-have, not required for the adaptive layout problem |
| Persistent layout preference (localStorage) | Layout is deterministic from count + height; no user choice to persist |
| Animated transitions between layout modes | Mode switches happen when adding/removing endpoints; animation would feel laggy. Instant switch is correct. |

---

## Design

### Layout Mode Derivation

A `$derived` computation in `LanesView.svelte` reads two inputs and produces a `LayoutMode` enum:

```typescript
type LayoutMode = 'full' | 'compact' | 'compact-2col';
```

**Inputs:**
- `endpointCount`: number of enabled endpoints (`endpoints.length`)
- `containerHeight`: pixel height of `.lanes` element via `ResizeObserver`

**Formula:**

```typescript
const COMPACT_THRESHOLD = 4;       // endpoints that trigger panel collapse
const MIN_LANE_HEIGHT = 120;       // px — minimum readable lane height
const MOBILE_COMPACT_THRESHOLD = 3; // tighter on mobile

function deriveLayoutMode(
  endpointCount: number,
  containerHeight: number,
  isMobile: boolean
): LayoutMode {
  const threshold = isMobile ? MOBILE_COMPACT_THRESHOLD : COMPACT_THRESHOLD;

  if (endpointCount < threshold) return 'full';

  // Mobile: never use 2-col (screen too narrow for two chart columns)
  if (isMobile) return 'compact';

  // Available height for lanes after subtracting gaps
  const totalGap = (endpointCount - 1) * tokens.lane.gapPx; // 8px per gap
  const availableHeight = containerHeight - totalGap;
  const laneHeight = availableHeight / endpointCount;

  if (laneHeight >= MIN_LANE_HEIGHT) return 'compact';

  // 2-col: each column holds ceil(count/2) lanes
  const colCount = Math.ceil(endpointCount / 2);
  const colGap = (colCount - 1) * tokens.lane.gapPx;
  const colAvailable = containerHeight - colGap;
  const colLaneHeight = colAvailable / colCount;

  // Only switch to 2-col if it actually helps
  if (colLaneHeight >= MIN_LANE_HEIGHT) return 'compact-2col';

  // Fallback: compact-2col is still the best we can do at 10 endpoints
  return 'compact-2col';
}
```

**Mobile detection:** `window.matchMedia('(max-width: 767px)')`. Stored as a reactive `$state` boolean, updated via the MediaQueryList `change` event. Mobile always uses single column (never `compact-2col`) — the lanes stack vertically in compact mode.

**ResizeObserver setup:**

```typescript
let containerHeight = $state(0);
let lanesEl: HTMLDivElement;

$effect(() => {
  const ro = new ResizeObserver(([entry]) => {
    containerHeight = entry.contentRect.height;
  });
  ro.observe(lanesEl);
  return () => ro.disconnect();
});
```

### Compact Header Layout

When `layoutMode` is `compact` or `compact-2col`, `Lane.svelte` receives `compact={true}`.

**What changes:**
- The `.lane-panel` (250px side panel) is replaced by a `.lane-compact-header` overlay
- The chart area expands to fill the full lane width

**Compact header specification:**

```
+---------------------------------------------------------------+
| [dot] api.example.com/health   42ms  P95 68  P99 120  J 12  L 0.5% |
+---------------------------------------------------------------+
```

| Element | Style |
|---------|-------|
| Color dot | 8px circle, `background: var(--ep-color)`, `border-radius: 50%` |
| URL | `font-family: Martian Mono`, `font-size: 10px`, `font-weight: 300`, `color: var(--t3)`, `max-width: 180px`, `text-overflow: ellipsis`, `white-space: nowrap`, `overflow: hidden` |
| Hero ms | `font-family: Sora`, `font-size: 20px`, `font-weight: 200`, `color: var(--ep-color)`, shows P50 value |
| Stat labels (P95, P99, Jitter, Loss) | `font-family: Martian Mono`, `font-size: 8px`, `font-weight: 400`, `color: var(--t4)`, `text-transform: uppercase` |
| Stat values | `font-family: Martian Mono`, `font-size: 11px`, `font-weight: 300`, `color: var(--t2)` |

**Compact header container:**

```css
.lane-compact-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  background: rgba(12, 10, 20, 0.75);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  pointer-events: none;
}
```

The header uses the surface base color (`#0c0a14`) at 75% opacity for the glass effect — semi-transparent so the chart grid lines are faintly visible behind it, but text remains fully readable.

**Lane.svelte prop interface change:**

```typescript
let {
  // ... existing props ...
  compact = false,
}: {
  // ... existing types ...
  compact?: boolean;
} = $props();
```

When `compact` is true:
- `.lane-panel` is visually hidden using the sr-only pattern (`position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)`) — NOT `display: none`, so screen readers still access the stat values
- `.lane-compact-header` renders as the visual replacement (conditionally via `{#if compact}`)
- `.lane-chart` gets `width: 100%` (no panel width subtracted)
- The `::after` gradient glow (left edge) is suppressed (`display: none` on the pseudo-element)
- The `.now-label` position shifts from `top: 8px` to `top: 40px` (below the 32px compact header + 8px gap) via a `.lane.compact .now-label { top: 40px; }` rule

When `compact` is false: no change from current behavior.

### 2-Column Grid CSS

When `layoutMode === 'compact-2col'`, `LanesView.svelte` switches from flex-column to CSS grid:

```css
.lanes.grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-flow: row;
  gap: 8px;
  align-content: start;
}
```

**Flow behavior:** Lanes fill left-to-right, top-to-bottom (standard CSS grid auto-flow). With 5 endpoints: row 1 has lanes 1-2, row 2 has lanes 3-4, row 3 has lane 5 spanning 1 column (natural grid behavior — no forced spanning).

**Odd lane count:** The last lane in an odd-count grid occupies the left cell of the last row. It does NOT span 2 columns — this would make it a different width and break visual consistency.

**Class application:** Conditional class on the `.lanes` container:

```svelte
<div
  class="lanes"
  class:grid-2col={layoutMode === 'compact-2col'}
>
```

**XAxisBar:** The `XAxisBar` component sits below `.lanes` in the DOM (inside `Layout.svelte`). It already has `width: 100%` on its container. In 2-col mode, the XAxisBar continues to span the full viewport width below both columns. No change needed.

**Mobile override:** On mobile (`<=767px`), `grid-2col` is overridden back to single-column:

```css
@media (max-width: 767px) {
  .lanes.grid-2col {
    grid-template-columns: 1fr;
  }
}
```

### Cap Enforcement

**Store level (`endpoints.ts`):**

```typescript
const MAX_ENDPOINTS = 10;

addEndpoint(url: string, label?: string): string {
  let newId = '';
  update(endpoints => {
    if (endpoints.length >= MAX_ENDPOINTS) return endpoints; // no-op
    // ... existing logic ...
  });
  return newId;
}
```

Export the constant for UI consumption:

```typescript
export const MAX_ENDPOINTS = 10;
```

**Cap semantics:** `MAX_ENDPOINTS` caps **total** endpoints (enabled + disabled). The layout mode counts only **enabled** endpoints. A user with 10 endpoints (7 disabled, 3 enabled) sees `full` mode with 3 lanes. Re-enabling all 10 triggers `compact` or `compact-2col`. This is correct — layout responds to what's visible, cap prevents unbounded growth.

**UI level:** The "+ Endpoint" button (in the topbar or endpoint drawer) reads the current endpoint count and disables when `count >= MAX_ENDPOINTS`:

```svelte
<button
  disabled={$endpointStore.length >= MAX_ENDPOINTS}
  title={$endpointStore.length >= MAX_ENDPOINTS
    ? `Maximum ${MAX_ENDPOINTS} endpoints reached`
    : 'Add endpoint'}
>
```

When disabled: `opacity: 0.4`, `cursor: not-allowed`, `pointer-events: none`. The tooltip/title attribute provides the explanation.

### Token Additions

Add to `tokens.lane` in `tokens.ts`:

```typescript
lane: {
  // ... existing tokens ...
  minHeight:            120,   // px — minimum lane height before 2-col triggers
  compactHeaderHeight:   32,   // px — height of compact overlay header
  compactThreshold:       4,   // endpoint count that triggers compact mode
  maxEndpoints:          10,   // hard cap on endpoint count
},
```

These tokens are the single source of truth for the layout derivation formula. The `deriveLayoutMode` function reads from `tokens.lane` rather than hardcoding values.

### LanesView Wiring

The `{#each}` block in `LanesView.svelte` passes the compact flag to each Lane:

```svelte
<Lane
  endpointId={ep.id}
  color={ep.color}
  url={ep.label || ep.url}
  p50={laneProps.p50}
  p95={laneProps.p95}
  p99={laneProps.p99}
  jitter={laneProps.jitter}
  lossPercent={laneProps.lossPercent}
  ready={laneProps.ready}
  {lastLatency}
  compact={layoutMode !== 'full'}
>
```

---

## Security Surface

This feature is entirely client-side layout logic. No new inputs, network requests, or data persistence.

| Vector | Assessment |
|--------|------------|
| Console manipulation to bypass UI cap | Mitigated: store-level enforcement in `addEndpoint()` returns early at 10. Even if the button is re-enabled via devtools, the store rejects the 11th endpoint. |
| ResizeObserver abuse | Not exploitable: ResizeObserver is read-only; it reports element dimensions. No user input flows through it. |
| DOM injection via URL display | Already mitigated: Svelte's template syntax auto-escapes text content. The compact header's URL display uses `{url}` which is escaped by default. |

No new attack surface introduced.

---

## Rollout

**Backward compatibility:** The `compact` prop on `Lane.svelte` defaults to `false`. All existing rendering paths are unchanged when fewer than 4 endpoints are active. The layout mode derivation produces `full` for 1-3 endpoints, which is identical to the current behavior.

**Rollback plan:** If the adaptive layout causes issues:
1. Remove the `$derived` layout mode computation in `LanesView.svelte`
2. Stop passing `compact` prop to `Lane.svelte`
3. Remove the `grid-2col` class and its CSS
4. The store-level cap can remain (it's independently valuable)

Total rollback is ~4 file reverts with no data migration.

**Feature flag:** Not needed. The feature activates automatically based on endpoint count. Users with 1-3 endpoints see zero change. The activation threshold is a token value (`compactThreshold: 4`) that can be changed in a single line.

---

## Edge Cases

### Empty state (0 endpoints)
`layoutMode` returns `full` (the default). The existing "Add an endpoint to begin" empty state renders unchanged. No grid layout, no compact header.

### Window resize mid-test
The `ResizeObserver` fires on every container height change. The `$derived` layout mode recomputes immediately. Lanes reflow from 1-col to 2-col (or vice versa) without interrupting the measurement engine. SVG charts re-render because their container dimensions change — the viewBox (1000x216) is fixed, so the SVG scales naturally.

### Mobile behavior
- `<=767px`: `MOBILE_COMPACT_THRESHOLD` of 3 applies (compact triggers one endpoint sooner due to reduced vertical space)
- 2-col grid is forced to single column via media query override
- Compact header uses the same layout but the URL `max-width` shrinks to `120px` to prevent overflow
- The existing mobile media query in `Lane.svelte` (which flips to `flex-direction: column`) is superseded by the compact header when `compact={true}` — the side panel is hidden entirely, so the column-flip is irrelevant

### Enabling/disabling endpoints changing count
Toggling an endpoint's `enabled` flag changes the filtered `endpoints` array length. The `$derived` layout mode reacts immediately. Example flow:
- User has 4 enabled endpoints (compact mode)
- User disables 1 endpoint -> 3 enabled -> mode switches to `full`
- Side panels reappear on the remaining 3 lanes

This transition is instant (no animation). The `compact` prop flips from `true` to `false`, and Svelte's reactivity handles the DOM update in a single tick.

### 1-to-4 transition (adding the 4th endpoint)
When the user adds a 4th endpoint:
1. `endpointStore` updates -> `endpoints` array grows to 4
2. `$derived` layout mode switches from `full` to `compact`
3. All 4 lanes receive `compact={true}`
4. Side panels hide, compact headers appear, charts expand to full width
5. No animation — this is a structural layout change, not a cosmetic one. Animating panel collapse would cause layout thrashing and feel sluggish.

### 10th endpoint added (cap boundary)
The 10th endpoint adds normally. The "+ Endpoint" button immediately disables. The layout is either `compact` or `compact-2col` depending on container height. With 10 endpoints in a 900px container: `(900 - 9*8) / 10 = 82.8px` per lane in single column (below 120px), so 2-col activates: `(900 - 4*8) / 5 = 173.6px` per lane per column.

### Rapid add/remove
Adding 5 endpoints in quick succession (e.g., importing a config): each add triggers a store update -> derived recompute -> DOM update. Svelte batches these within the same microtask if they occur synchronously. If async (e.g., from a loop with awaits), each update is independent and the layout mode may flicker between modes. This is acceptable — the final state is always correct.

### CrossLaneHover in 2-col grid
`CrossLaneHover` uses `position: fixed` with `clientX` from the mouse event. The hover line spans the full viewport width. In 2-col mode, the hover line crosses both columns.

**Critical:** The `handleMouseMove` hover handler must NOT use the first `.lane-chart` element for coordinate mapping in 2-col mode — the left column's chart has a different `left` offset than the right column's. Instead, the handler must find the specific lane the mouse is over:

```typescript
function handleMouseMove(e: MouseEvent): void {
  const lane = (e.target as HTMLElement).closest('.lane');
  const chartEl = lane?.querySelector('.lane-chart') as HTMLElement | null;
  if (!chartEl) {
    uiStore.clearLaneHover();
    return;
  }
  const chartRect = chartEl.getBoundingClientRect();
  // ... rest of mapping logic using chartRect ...
}
```

This replaces the current `lanesEl.querySelector('.lane-chart')` approach. It works in all three layout modes because it always measures from the chart element the mouse is actually over.

---

## Acceptance Criteria

**AC1:** When a user has 1-3 enabled endpoints, each lane renders with the full 250px left stats panel and a flexible-width chart area, with each lane height >= 150px.

**AC2:** When a user has 4+ enabled endpoints, each lane's stats panel collapses into a compact horizontal header overlaying the top-left of the chart area, and the chart expands to fill the full lane width.

**AC3:** When lane height would drop below 120px in single-column layout, lanes reflow into a 2-column CSS grid so that each lane height >= 120px.

**AC4:** When a user attempts to add an 11th endpoint, the "+ Endpoint" button is disabled and a tooltip or label indicates the 10-endpoint maximum has been reached.

**AC5:** When hovering over any lane in any layout mode (1-col full panel, 1-col compact, 2-col compact), the CrossLaneHover vertical line and tooltip display the correct round and latency values aligned to the dot positions in the chart.
