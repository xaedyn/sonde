---
date: 2026-04-10
feature: adaptive-lanes
type: codebase-context-brief
---

# Codebase Context Brief — Adaptive Lane Layout

## STACK

Svelte 5.55 (runes-based reactivity) | TypeScript 6.0 | Vite 8 | SVG 2 graphics | CSS Grid/Flexbox. No UI framework dependencies beyond Svelte.

## EXISTING PATTERNS

**Layout Model:** Lane cards are flex containers (flex: 1, min-height: 0) in a vertical flex column (LanesView); each contains a fixed-width left panel (250px, tokens.lane.panelWidth) and flexible chart area. Mobile media query (max-width: 767px) switches Lane to flex-column layout with horizontal panel.

**Styling:** CSS custom properties for theming set at component root and inherited by children; tokens.ts is single source for all visual values; glass morphism pattern uses backdrop-filter blur(20px) + rgba colors.

**Responsiveness:** Only mobile media query implemented in Lane.svelte (max-width: 767px); viewport is height: 100vh with flex: 1 children and min-height: 0.

**Animations:** Timing tokens (hoverLine: 80ms, hoverTip: 100ms, btnHover: 200ms, fadeIn: 200ms); CSS transitions with var(--timing-hover).

## RELEVANT FILES

**Lane.svelte** — Single lane card with panel + chart. Props: endpointId, color, url, p50–p99, jitter, lossPercent, ready, lastLatency. Panel hardcoded to 250px width. Children snippet wraps chart content.

**LanesView.svelte** — Container for all lanes. Flex column, padding 8px 10px, gap 8px. handleMouseMove() maps clientX to round via `.lane-chart` element bounds.

**LaneSvgChart.svelte** — SVG chart. ViewBox 1000×216 (PLOT_H=180, HEATMAP_H=12). toX/toY coordinate transforms. Props: visibleStart, visibleEnd, currentRound, points, ribbon, yRange, xTicks, heatmapCells, timeoutMs.

**Layout.svelte** — Top-level flex column (100vh). Computes sliding window. Passes visibleStart/visibleEnd to LanesView and CrossLaneHover.

**CrossLaneHover.svelte** — Fixed-position hover line (z-index: 5) and tooltip (z-index: 10, top: 74px). Reads uiStore.laneHoverX/laneHoverRound.

**endpoints.ts** — Writable store with addEndpoint(). Color cycling via pickColor(index % 10) using 10-slot palette. No hard cap enforced.

**tokens.ts** — lane.panelWidth: 250, lane.gapPx: 8, lane.paddingX: 10, lane.paddingY: 8, lane.topbarHeight: 54, lane.footerHeight: 38.

## CONSTRAINTS

- SVG ViewBox immutable (VB_W=1000, VB_H=216)
- CrossLaneHover uses fixed positioning + clientX; must stay synced with chart bounds
- Endpoint color palette is 10 slots — cycling beyond 10 causes confusion
- LanesView hover now measures from `.lane-chart` bounding rect (just fixed)
- Lane.svelte mobile breakpoint (767px) switches panel to row layout

## OPEN QUESTIONS

1. Should panel collapse be count-based (4+ endpoints) or height-based (lane < Npx)?
2. In compact mode, does the overlay header auto-hide or stay always-visible?
3. 2-column trigger: count-based or derived from available height?
4. Where to enforce cap — addEndpoint() store level or UI disable?
5. Layout state: derived from endpoint count + window size, or stored in uiStore?
