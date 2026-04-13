---
date: 2026-04-08
feature: viz-overhaul
type: research-brief
---

# Research Brief — Phase 1 Visualization Overhaul

## Industry Research Findings

### Adaptive Y-Axis Scaling

Professional tools converge on **percentile-clamped auto-scaling** rather than pure min/max fitting. Datadog [VERIFIED] uses percentage-based threshold bounds that clip outlier series without hiding them. Grafana [VERIFIED] auto-scales to raw min/max (Discussion #38245 is a long-standing request for percentile-based scaling). Honeycomb [VERIFIED] explicitly chose log-scale heatmaps over scatter plots because outliers dominate linear axes — their recommendation: if P99 > 10x P50, switch to log or bucketed display.

**Practical standard [UNVERIFIED]:** Clamp Y-axis to P2–P98 of visible data; render out-of-range points as clipped markers at axis edges. Recalculate per frame/window slide.

### Statistical Bands (Trace Ribbons)

uPlot [VERIFIED] — Canvas 2D library for 60fps streaming — supports fill-between-two-series for P25–P75 ribbons. D3.js [VERIFIED] uses `d3.area()` with y0/y1 bound to quantile series. Observable Plot [VERIFIED] has native `bandY` mark. All approaches: compute band edges as separate series, fill the region between them as a polygon.

### Sonar/Radar Animation

The canonical sonar pattern [VERIFIED — GitHub arduino-radar, dev.to CSS implementations]: rotating sweep line + data points with phosphor persistence (fade via low-opacity black overlay instead of clearRect per frame). Medical ECG displays use the same trailing-fade model. For Chronoscope: partial-clear creates the "living instrument" feel without storing point history.

### Empty State Design

Grafana Saga Design System [VERIFIED]: three empty state types (no data, no results, first-time-use). Pattern: centered message + CTA overlaid on the chart frame. Recommendation: preserve axis chrome but overlay message. Distinguish "no data yet" (transient) from "nothing returned" (misconfiguration).

### X-Axis Labeling for Streaming Data

Grafana and Palantir Quiver [VERIFIED] use rolling-window time-domain X-axes with right-edge anchored to "now" and relative labels (−60s…now). Auto-format collapses granularity (ms→s→min) based on visible range. When wall-clock unavailable [UNVERIFIED]: label by sample count with right-anchored "last N" convention.

## Codebase Deep-Dive Findings

### Critical: DPR Coordinate Bug

`computeLayout()` in timeline-renderer.ts uses `canvas.width`/`canvas.height` (physical pixels) while `applyDpr()` applies `ctx.scale(dpr, dpr)` making the context operate in CSS pixels. On 2x displays, `plotWidth` is doubled, causing all coordinates to render at 2x positions. Sonar pings from `toCanvasCoords()` inherit this inflation and render at wrong positions on the effects canvas. **Must fix as prerequisite.**

### Scale Implementation

Fixed constants: `LOG_MIN = log10(1) = 0`, `LOG_MAX = log10(10000) = 4`. `latencyToNorm()` maps to [0,1]. Used by: `computePoints()` (static method), `drawGridlines()`, and indirectly `pointToCanvas()` via pre-normalized `ScatterPoint.y`. To go adaptive: LOG_MIN/LOG_MAX become instance fields, computePoints must accept scale context, Y_GRID_MS must be dynamically generated.

### Rolling Window Path

`statisticsStore` is a `derived` from `measurementStore` computing all-time stats. `percentile()` copies+sorts on each call (O(n log n)). A parallel `rollingStatisticsStore` can slice `samples.slice(-WINDOW_SIZE)` and call the same `computeEndpointStatistics()`. Only consumers: SummaryCard.svelte and stores/index.ts re-export. Zero breakage risk.

### Store Shape

`MeasurementState` has `startedAt: number | null` (wall-clock timestamp), `lifecycle`, `roundCounter`, `freezeEvents: { round: number }[]`. Per-endpoint: `samples: MeasurementSample[]` with `{ round, latency, status, timestamp }`. `startedAt` enables elapsed-time X-axis labels.

### Token Structure

`tokens.canvas` already contains `sweepLineOpacity: 0.15` and `sweepLineGlowWidth: 4` — sweep concept anticipated. `pointRadius: 4`, `haloRadius: 16`, `haloOpacity: 0.3`. Sonar ping tiers: fast 3→12px, medium 3→20px, slow 3→32px, timeout 3→48px. New ribbon tokens follow same flat-key convention.

### Dependency Surface

Both TimelineRenderer and EffectsRenderer have exactly one consumer: TimelineCanvas.svelte. No other components, stores, or utilities import them. ScatterPoint and SonarPing types are consumed only by renderers + TimelineCanvas. Modification is safe — no external breakage possible.

## Key Design-Influencing Decisions

1. **Y-axis strategy:** Percentile-clamp (P2–P98) with log scale preserved for wide-range data, linear for narrow-range. Minimum visible range needed.
2. **Rolling window:** Fixed N=20 simplest; time-based requires timestamp arithmetic but is semantically richer. `startedAt` exists in store, enabling time-based.
3. **X-axis:** Round numbers are simplest. `startedAt` + `sample.timestamp` enable elapsed time. Industry standard is time-domain.
4. **DPR fix is prerequisite** — all coordinate work builds on correct pixel math.
5. **computePoints() refactor:** Must move from static to instance method (or accept scale params) to support dynamic normalization.
