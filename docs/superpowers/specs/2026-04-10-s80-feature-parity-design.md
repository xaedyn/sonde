# S80 Feature Parity — Design Spec

> **Goal:** Incorporate s80's four strongest diagnostic features into Chronoscope's Glass Lanes UI, executed better than the original.

**Date:** 2026-04-10
**Status:** Draft

---

## Context

Chronoscope is a ground-up rebuild of s80 with a Glass Lanes visual language. The Glass Lanes redesign (PR #4, #5) replaced the old sidebar+chart layout with per-endpoint lane cards, SVG scatter charts, and a frosted glass aesthetic. Four features from s80 are missing that provide genuine diagnostic value:

1. **Full-history heatmap** — s80's per-endpoint character grid showing every measurement color-coded
2. **Timeout threshold line** — red dashed line at the timeout value on the chart
3. **Real-time last-latency display** — instantaneous measurement value, not just P50 median
4. **Time-based axis** — elapsed time instead of round numbers

These features are not cosmetic — they answer questions the current UI cannot:
- "What happened 20 minutes ago?" (heatmap)
- "How close am I to timing out?" (threshold line)
- "What's happening RIGHT NOW?" (live latency)
- "When did that spike happen?" (elapsed time)

---

## Design Principles

All decisions follow a subtractive-design philosophy applied to the Glass Lanes aesthetic:

- **Remove until it breaks, then add back one thing.** No feature exists for completeness — each must earn its space.
- **Information appears when relevant, hides when not.** No always-on indicators for rare events.
- **One element, one job.** Left panel = aggregates. Chart = live action. Heatmap = history.
- **Motion has meaning.** The now-dot pulses because it's alive. The heatmap grows because history accumulates.
- **Glass palette, not generic.** Colors come from the token system, not traffic-light defaults.

---

## Feature 1: Heatmap History Strip

### What it is

A 12px-tall color-coded bar at the bottom edge of each lane's SVG chart area. Each cell represents one or more measurements, colored by latency severity. The strip shows the FULL history of the run — when the scatter chart's 60-round sliding window scrolls past, the heatmap preserves the visual record.

### Placement

Inside the lane's chart area, below the scatter dots, above the lane card's bottom edge. It is part of the chart component (`LaneSvgChart.svelte`), not a separate element. No new components are created for layout purposes.

### Cell rendering

- Fixed cell count: **200 cells** maximum width, matching the chart width proportionally
- Resolution adapts to run length:
  - Rounds 1–200: 1 cell = 1 round (full resolution)
  - Rounds 201–1000: 1 cell = 5 rounds
  - Rounds 1001+: 1 cell = `Math.ceil(totalRounds / 200)` rounds
- Aggregation rule: **worst value wins.** If any measurement in a bucket is a timeout, the cell is timeout-colored. Otherwise, the highest latency in the bucket determines the color.
- Cells render left-to-right. Empty future cells are not rendered — the strip grows as data arrives.

### Color scale

Uses Glass palette tokens, not raw green/yellow/red:

| Condition | Color | Token source |
|-----------|-------|-------------|
| Fast (< P25 of endpoint) | Muted green | `accent.green` at 50% opacity |
| Normal (P25–P75) | Endpoint color dimmed | endpoint `color` at 40% opacity |
| Elevated (P75–P95) | Amber | New `color.heatmap.elevated`: `#fbbf24` |
| Slow (> P95) | Pink | `accent.pink` at 70% opacity |
| Timeout | Pink bright | `accent.pinkBright` |
| Error | Pink bright | `accent.pinkBright` |

Percentile thresholds (P25/P75/P95) are computed from the endpoint's own statistics — the same stats already in `statisticsStore`. This means the color scale is relative to each endpoint's own performance, not absolute.

### Hover interaction

On hover over a heatmap cell:
- Show a tooltip with: round range, elapsed time range, and value (or worst value for aggregated cells)
- Single-round cell: `"Round 34 · 26ms · 0:34 elapsed"`
- Aggregated cell: `"Rounds 801–850 · worst: 142ms · 13:21–14:10 elapsed"`
- Tooltip uses the same frosted glass style as the cross-lane hover tooltip

### Implementation notes

- Rendered as SVG `<rect>` elements inside the existing `LaneSvgChart.svelte` viewBox
- The viewBox height increases slightly to accommodate the strip (200 → 216)
- The strip's y-position is fixed at the bottom of the viewBox
- The scatter chart's plot area (`PLOT_H`) shrinks by 16px to make room
- Cell data is computed in `LanesView.svelte` and passed as a prop to `LaneSvgChart`
- The aggregation logic lives in a new pure function `computeHeatmapCells()` in `timeline-data-pipeline.ts`

---

## Feature 2: Timeout Threshold Line

### What it is

A horizontal dashed line across the chart at the configured timeout value, with a "timeout" label.

### Visibility rule

**Only visible when the timeout value falls within the lane's current y-range.** If the lane's y-axis scales from 15–50ms and timeout is 5000ms, no line is drawn — it would be off-screen and meaningless. The line appears exactly when the data is approaching or crossing the threshold.

### Rendering

- Dashed line: stroke color `accent.pink` at 40% opacity, stroke-dasharray `6 4`, stroke-width `0.8`
- Label: "timeout" text anchored to the right edge of the chart, positioned 4px above the line, mono font 5px, `accent.pink` at 50% opacity
- Rendered as SVG elements inside `LaneSvgChart.svelte`, between the gridlines layer and the data layers

### Data flow

- `LaneSvgChart` receives the timeout value as a new prop `timeoutMs`
- `LanesView` reads `$settingsStore.timeout` and passes it down
- The component converts `timeoutMs` to a y-coordinate using the existing `toY(normalizeLatency(timeoutMs, yRange))` path
- If the normalized value is < 0 or > 1 (outside visible range), the line is not rendered

---

## Feature 3: Live Latency on Now-Dot

### What it is

A floating label above the glowing now-dot showing the instantaneous last measurement value (e.g., "31ms"), updating every tick.

### Placement

Positioned above the now-dot in the chart area. Rendered as an **HTML element** overlaying the SVG, not as SVG `<text>`, because the SVG uses `preserveAspectRatio="none"` which would stretch text.

### Rendering

- Font: Martian Mono, 11px, weight 500
- Color: endpoint color (same as the now-dot)
- Position: centered horizontally above the now-dot, offset 6px up
- Subtle text-shadow glow matching endpoint color at low opacity
- When the test is not running or no data exists, the label is hidden

### Implementation notes

- A new `<span>` element in `LaneSvgChart.svelte` (or its parent `Lane.svelte`), positioned absolutely over the chart area
- The x-position is derived from the now-dot's round mapped through `toX()`, converted from SVG viewBox coordinates to CSS pixels using the chart element's `getBoundingClientRect()` and viewBox ratio
- The y-position is derived similarly from the now-dot's y-coordinate
- Updates reactively when `points` prop changes (the last point determines position and value)

---

## Feature 4: Elapsed Time X-Axis

### What it is

The x-axis labels show elapsed time since test start instead of round numbers.

### Format

Smart formatting based on elapsed duration:
- Under 10 seconds: `S.Xs` (e.g., "1.2s", "3.8s")
- 10 seconds to 59:59: `M:SS` (e.g., "0:42", "12:05")
- 1 hour and above: `H:MM:SS` (e.g., "1:23:45")

### Label changes

- The "ROUND" label on the left side of `XAxisBar` becomes **"ELAPSED"**
- Tick labels show formatted elapsed time instead of round numbers
- Ticks are spaced at human-readable intervals (every 10s, 30s, 1m, 5m, etc.) rather than every N rounds

### Elapsed time source

- `measurementStore` already tracks `startedAt: number | null` (timestamp when test started)
- Each `MeasurementSample` has a `timestamp` field
- Elapsed time for a round = `sample.timestamp - startedAt`
- For the x-axis ticks, compute elapsed time at the visible window boundaries (`visibleStart`, `visibleEnd`) using the samples' timestamps
- When test is idle (no `startedAt`), show `0:00` labels

### Footer update

The footer progress text changes from:
> "42 of ∞ complete"

To:
> "42 of ∞ complete · 0:42 elapsed"

This is a simple addition to `FooterBar.svelte` — derive elapsed from `$measurementStore.startedAt` and current time.

---

## New Types

Add to `types.ts`:

```typescript
export interface HeatmapCellData {
  readonly startRound: number;
  readonly endRound: number;
  readonly worstLatency: number;
  readonly worstStatus: SampleStatus;
  readonly startElapsed: number;  // ms since test start
  readonly endElapsed: number;
}
```

This is the per-cell data passed from `LanesView` to `LaneSvgChart` as a `readonly HeatmapCellData[]` prop.

---

## New Tokens

Add to `tokens.ts` under `color`:

```typescript
heatmap: {
  fast:     'rgba(134,239,172,.5)',   // accent.green at 50%
  normal:   'rgba(255,255,255,.15)',  // neutral (endpoint color applied per-lane)
  elevated: '#fbbf24',                // amber
  slow:     'rgba(249,168,212,.7)',   // accent.pink at 70%
  timeout:  '#fbcfe8',                // accent.pinkBright
},
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/lib/tokens.ts` | Add `color.heatmap` group |
| `src/lib/types.ts` | Add `HeatmapCell` type for strip data |
| `src/lib/renderers/timeline-data-pipeline.ts` | Add `computeHeatmapCells()` function |
| `src/lib/components/LaneSvgChart.svelte` | Add heatmap strip, timeout line, now-dot label positioning |
| `src/lib/components/Lane.svelte` | Add HTML overlay for now-dot label |
| `src/lib/components/LanesView.svelte` | Compute heatmap cells, pass timeout and elapsed time props |
| `src/lib/components/XAxisBar.svelte` | Switch from round numbers to elapsed time formatting |
| `src/lib/components/FooterBar.svelte` | Add elapsed time to progress text |
| `src/lib/components/Layout.svelte` | Pass startedAt/timestamps for elapsed time computation |

## New Files

| File | Purpose |
|------|---------|
| `tests/unit/heatmap-cells.test.ts` | Tests for `computeHeatmapCells()` aggregation logic |

---

## What This Does NOT Include

- Logarithmic y-axis toggle (s80 uses log by default; Chronoscope's per-lane linear scaling handles this better)
- Per-endpoint request count display (round counter in footer is sufficient)
- Auto-stop at N measurements (round cap already handles this)
- Freeze detection auto-abort (existing freeze event tracking is sufficient; auto-abort is disruptive)
- s80's character-grid rendering style (replaced by the cleaner cell-strip approach)

---

## Acceptance Criteria

1. Heatmap strip renders inside each lane's chart area, 12px tall, growing left-to-right as data arrives
2. Heatmap cells aggregate to ~200 max cells regardless of run length, using worst-value-wins
3. Heatmap hover tooltip shows round range, elapsed time, and latency value
4. Heatmap uses Glass palette colors relative to each endpoint's own percentile distribution
5. Timeout threshold line appears only when the configured timeout is within the lane's visible y-range
6. Live latency label floats above the now-dot, updates every tick, uses endpoint color
7. X-axis labels show elapsed time in smart format (S.Xs / M:SS / H:MM:SS)
8. X-axis "ROUND" label becomes "ELAPSED"
9. Footer shows elapsed time alongside round counter
10. All new visual elements use CSS custom properties from tokens — no raw hex/rgba in component styles
11. All existing tests continue to pass
12. TypeScript strict mode — no `any` types
