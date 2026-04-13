---
date: 2026-04-08
feature: viz-overhaul
type: design-specification
status: APPROVED
approach: Layered Data Pipeline
parent-spec: 2026-04-07-chronoscope-v2-design.md
---

# Design Specification -- Phase 1 Visualization Overhaul

## 1. Problem

When a user runs Chronoscope against endpoints with typical web latencies (20--150ms), the timeline scatter plot is nearly useless. Data points cluster into a thin band at the bottom of a fixed log-scale axis (1ms--10s), wasting 80%+ of the vertical canvas. Users cannot visually distinguish latency differences between endpoints, detect trends, or identify variance -- the exact insights the tool exists to provide. They fall back to reading raw numbers on summary cards, defeating the purpose of a real-time visualization.

Additionally:
- Sonar ping animations render at incorrect positions on HiDPI displays due to a DPR coordinate bug, making the signature animation invisible or misplaced.
- There is no visual indication of latency trends or variance on the timeline -- users cannot see whether an endpoint is stable or deteriorating without watching every individual point.
- The X-axis has no labels, making it impossible to correlate data points with round numbers or time.
- When no data exists, the canvas is a blank dark rectangle with no affordance indicating that something will happen.

## 2. Success Metrics

| Metric | Target | Measurement method |
|---|---|---|
| Y-axis canvas utilization | >= 60% of `plotHeight` used by data point vertical spread | `(maxPointY - minPointY) / plotHeight` for any dataset where `P98/P2 < 50x` |
| Sonar ping positional accuracy | Ping center within 2px of its scatter point on 1x, 2x, and 3x DPR displays | Automated test: compare `toCanvasCoords()` output against expected CSS-pixel position |
| Trace ribbon visibility | Ribbon renders for any endpoint with >= 20 samples; P25-P75 band and P50 line visually distinct from scatter points | Visual regression test + unit test confirming `RibbonData` output |
| X-axis label readability | No overlapping labels at any canvas width >= 375px | Unit test: all `XTick` positions have >= `minLabelSpacing` between them |
| Empty state presence | Animated sweep visible within 1 frame of mount when `hasData === false` | Playwright screenshot test at t=0 |
| Empty-to-data transition | Sweep stops within 1 render frame of first measurement | Unit test: `prepareFrame()` returns `hasData: true` on first sample |
| Frame budget | `prepareFrame()` execution < 2ms for 10 endpoints x 1000 samples | Benchmark test with `performance.now()` |
| Data render budget | `TimelineRenderer.draw(frameData)` < 8ms (existing RenderScheduler target) | RenderScheduler's built-in frame budget monitor |

## 3. Out of Scope

| Excluded | Rationale |
|---|---|
| Time-domain X-axis (elapsed seconds) | Round numbers are sufficient for Phase 1. `startedAt` and `sample.timestamp` exist in the store for Phase 2 implementation. |
| Animated Y-axis transitions | Y-range snaps per frame. Smooth transitions add complexity with minimal UX gain -- users are watching data points, not gridlines. |
| User-adjustable Y-axis range | Manual zoom already exists via scroll/pinch. Adaptive auto-ranging eliminates the need for explicit scale controls. |
| Incremental/differential pipeline | Full recomputation per store update is < 2ms. Incremental adds complexity for no measurable gain at current data volumes. |
| Web Worker offloading for pipeline | Single-threaded pipeline completes in < 2ms. Worker overhead (structured clone + postMessage) would exceed the computation itself. |
| Heatmap/bucketed display mode | Phase 2 -- the pipeline architecture supports adding new output fields for alternative visualizations. |
| WebGL acceleration | Canvas 2D is sufficient for ribbon fills and adaptive gridlines within the 8ms budget. |
| User-configurable pipeline parameters | Window size, percentile thresholds, and scale breakpoints are hardcoded constants. User configuration is premature. |

## 4. Architecture

### Layered Data Pipeline

A new `TimelineDataPipeline` module sits between stores and renderers. It is a pure-function module (no class, no state) with one entry point:

```
prepareFrame(endpoints: Endpoint[], measureState: MeasurementState) => FrameData
```

```
MeasurementStore (Svelte writable)
    | subscribe
    v
TimelineCanvas.svelte :: recomputePoints()
    | calls
    v
TimelineDataPipeline.prepareFrame(endpoints: Endpoint[], measureState: MeasurementState)
    | returns
    v
FrameData {
    pointsByEndpoint,
    ribbonsByEndpoint,
    yRange,
    xTicks,
    maxRound,
    freezeEvents,
    hasData
}
    | passed to
    v
TimelineRenderer.draw(frameData)   -- draws points, ribbons, gridlines, X-axis
EffectsRenderer.draw() / .drawEmptyState()  -- pings or empty sweep
```

### What changes

| Component | Before | After |
|---|---|---|
| `TimelineDataPipeline` | Does not exist | New module: `src/lib/renderers/timeline-data-pipeline.ts` |
| `TimelineRenderer.draw()` | Receives `Map<string, ScatterPoint[]>`, computes maxRound, draws gridlines from `Y_GRID_MS` constant | Receives `FrameData`, draws pre-computed geometry: points at pre-normalized positions, ribbons, dynamic gridlines, X-axis ticks |
| `TimelineRenderer.computePoints()` | Static method, called from TimelineCanvas | Removed. Pipeline produces normalized `ScatterPoint[]` |
| `latencyToNorm()` | Module-level function with hardcoded `LOG_MIN`/`LOG_MAX` | Moved into pipeline as `normalizeLatency(ms, yRange)` with dynamic range |
| `Y_GRID_MS` | Fixed constant array | Replaced by `yRange.gridlines` computed dynamically per frame |
| `EffectsRenderer` | No concept of empty state | Gains `drawEmptyState(ctx, width, height, elapsed)` method |
| `TimelineCanvas.svelte` | Calls `computePoints()`, manages maxRound | Calls `prepareFrame()`, passes `FrameData` to renderers, routes empty state |
| `computeLayout()` | Uses `canvas.width`/`canvas.height` (physical pixels, DPR bug) | Uses CSS dimensions via `canvas.clientWidth`/`canvas.clientHeight` |
| `tokens.ts` | No ribbon or empty state tokens | Gains `canvas.ribbon` and `canvas.emptyState` token blocks |
| `types.ts` | No pipeline types | Gains `FrameData`, `RibbonData`, `XTick`, `YRange`, `Gridline` interfaces |

### DPR Fix

**Root cause:** `computeLayout()` reads `this.canvas.width` and `this.canvas.height`, which are physical pixel dimensions (set by `applyDpr()` as `Math.round(cssWidth * dpr)`). But `applyDpr()` also calls `ctx.scale(dpr, dpr)`, which means the context operates in CSS pixel space. Every coordinate computed from `plotWidth`/`plotHeight` is therefore inflated by `dpr`.

**Fix:** `computeLayout()` must use CSS dimensions:

```typescript
// BEFORE (bug):
plotWidth:  this.canvas.width  - paddingLeft - paddingRight,
plotHeight: this.canvas.height - paddingTop  - paddingBottom,

// AFTER (fix):
plotWidth:  this.canvas.clientWidth  - paddingLeft - paddingRight,
plotHeight: this.canvas.clientHeight - paddingTop  - paddingBottom,
```

`canvas.clientWidth` returns the CSS layout width (same as `parseInt(canvas.style.width)`), which matches the coordinate space established by `ctx.scale(dpr, dpr)`. This fix also applies to `ctx.clearRect(0, 0, canvas.width, canvas.height)` in `draw()` -- must become `ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)`. Similarly for `EffectsRenderer.draw()`.

This is a prerequisite -- all subsequent coordinate work depends on correct pixel math.

## 5. Detailed Design

### AC1: Adaptive Y-Axis

#### Algorithm: Percentile-Clamped Auto-Ranging

```
function computeYRange(allLatencies: number[]): YRange
  if allLatencies is empty:
    return { min: 1, max: 1000, isLog: false, gridlines: defaultGridlines }

  sort allLatencies ascending
  p2  = percentile(allLatencies, 2)
  p98 = percentile(allLatencies, 98)

  // Determine scale mode
  ratio = p98 / max(p2, 0.1)
  isLog = ratio > 50

  if isLog:
    // Log scale: clamp to P2-P98 in log space, with headroom
    rawMin = max(p2 * 0.5, 0.5)
    rawMax = p98 * 2.0
    min = rawMin
    max = rawMax
  else:
    // Linear scale: P2-P98 with 20% headroom on each side
    span = p98 - p2
    headroom = max(span * 0.2, 5)  // minimum 5ms headroom
    min = max(p2 - headroom, 0)
    max = p98 + headroom

  // Enforce minimum visible range
  if max - min < 10:
    center = (min + max) / 2
    min = center - 5
    max = center + 5
    if min < 0:
      min = 0
      max = 10

  gridlines = computeGridlines(min, max, isLog)
  return { min, max, isLog, gridlines }
```

#### Normalization

```
function normalizeLatency(ms: number, yRange: YRange): number
  if yRange.isLog:
    logMin = log10(max(yRange.min, 0.1))
    logMax = log10(yRange.max)
    logVal = log10(max(ms, 0.1))
    return clamp((logVal - logMin) / (logMax - logMin), 0, 1)
  else:
    return clamp((ms - yRange.min) / (yRange.max - yRange.min), 0, 1)
```

Points outside [0,1] are clamped to the axis edges -- they remain visible as markers at the boundary rather than being hidden.

#### Dynamic Gridline Generation

```
function computeGridlines(min: number, max: number, isLog: boolean): Gridline[]
  NICE_STEPS_LINEAR = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  NICE_STEPS_LOG = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
  TARGET_GRIDLINE_COUNT = 5

  if isLog:
    candidates = NICE_STEPS_LOG.filter(v => v >= min && v <= max)
    // If too many, thin by taking every Nth
    while candidates.length > TARGET_GRIDLINE_COUNT + 2:
      candidates = candidates.filter((_, i) => i % 2 === 0)
    return candidates.map(ms => ({
      ms,
      normalizedY: normalizeLatency(ms, { min, max, isLog, gridlines: [] }),
      label: ms >= 1000 ? `${ms/1000}s` : `${ms}ms`
    }))
  else:
    range = max - min
    rawStep = range / TARGET_GRIDLINE_COUNT
    // Snap to nearest nice step
    step = NICE_STEPS_LINEAR.find(s => s >= rawStep) ?? rawStep
    gridlines = []
    start = ceil(min / step) * step
    for value = start; value <= max; value += step:
      gridlines.push({
        ms: value,
        normalizedY: normalizeLatency(value, { min, max, isLog: false, gridlines: [] }),
        label: value >= 1000 ? `${value/1000}s` : `${round(value)}ms`
      })
    return gridlines
```

#### Renderer Changes

`TimelineRenderer.drawGridlines()` becomes `drawGridlines(yRange: YRange)`:
- Iterates `yRange.gridlines` instead of `Y_GRID_MS`
- Y position: `paddingTop + (1 - gridline.normalizedY) * plotHeight`
- Label text from `gridline.label`
- Appends scale indicator in bottom-left: "log" or "linear" using `tokens.typography.caption` at `tokens.color.text.muted`

### AC2: Sonar Pings

#### Coordinate Conversion Through Pipeline

The DPR fix (Section 4) resolves the root cause. The remaining change is that ping coordinates must be computed using the pipeline's dynamic Y-range instead of the old fixed log scale.

**Current flow:**
1. `TimelineCanvas.recomputePoints()` calls `TimelineRenderer.computePoints()` (fixed log scale)
2. Result `ScatterPoint.y` is pre-normalized to [0,1] using fixed `LOG_MIN`/`LOG_MAX`
3. `timelineRenderer.toCanvasCoords(point)` maps normalized y to canvas pixels
4. Ping created at those canvas-pixel coordinates

**New flow:**
1. `TimelineCanvas.recomputePoints()` calls `prepareFrame()` which computes adaptive `yRange`
2. `FrameData.pointsByEndpoint` contains points with `y` normalized against the adaptive range
3. `toCanvasCoords(point)` maps the dynamically-normalized y to canvas pixels (same math, correct input)
4. Ping created at those coordinates

The `toCanvasCoords()` method on `TimelineRenderer` remains unchanged -- it operates on pre-normalized `ScatterPoint.y` values. The normalization moves from `computePoints()` (fixed scale) to `prepareFrame()` (adaptive scale).

#### Ring Animation Parameters (unchanged)

Existing `TIER_CONFIG` in `EffectsRenderer` is correct and does not change:

| Tier | Initial radius | Final radius | Duration | Max concurrent |
|---|---|---|---|---|
| fast (< 50ms) | 3px | 12px | 300ms | 5 |
| medium (50--200ms) | 3px | 20px | 500ms | 5 |
| slow (> 200ms) | 3px | 32px | 800ms | 3 |
| timeout | 3px | 48px | 1200ms | 1 |

#### Tier Encoding

Tier classification in `TimelineCanvas.latencyToTier()` is unchanged:
- `status === 'timeout'` -> timeout
- `latency < 50` -> fast
- `latency < 200` -> medium
- else -> slow

### AC3: Trace Ribbons

#### Rolling Window Algorithm

```
ROLLING_WINDOW_SIZE = tokens.canvas.yAxis.rollingWindowSize  // 20

function computeRibbons(
  measureState: MeasurementState,
  yRange: YRange,
): Map<string, RibbonData>

  // Extract samples from store shape (Record<string, EndpointMeasurementState>)
  result = new Map()
  for each (endpointId, epState) in Object.entries(measureState.endpoints):
    samples = epState.samples
    if samples.length < ROLLING_WINDOW_SIZE:
      continue

    p25Points: [number, number][] = []
    p50Points: [number, number][] = []
    p75Points: [number, number][] = []

    for i = ROLLING_WINDOW_SIZE - 1; i < samples.length; i++:
      window = samples.slice(i - ROLLING_WINDOW_SIZE + 1, i + 1)
      okSamples = window.filter(s => s.status === 'ok')
      latencies = okSamples.map(s => s.latency)  // exclude timeouts and errors by status

      if latencies.length < 3:
        continue  // not enough valid samples for meaningful percentiles

      p25 = percentile(latencies, 25)
      p50 = percentile(latencies, 50)
      p75 = percentile(latencies, 75)

      x = samples[i].round  // X position is the round of the window's trailing edge
      p25Points.push([x, normalizeLatency(p25, yRange)])
      p50Points.push([x, normalizeLatency(p50, yRange)])
      p75Points.push([x, normalizeLatency(p75, yRange)])

    if p25Points.length > 0:
      result.set(endpointId, { p25Path: p25Points, p50Path: p50Points, p75Path: p75Points })

  return result
```

#### Ribbon Geometry Computation

`TimelineRenderer.drawRibbons(ribbons, layout, maxRound)`:

For each endpoint ribbon:
1. Convert `[round, normalizedY]` pairs to canvas coordinates:
   - `cx = paddingLeft + (round / maxRound) * plotWidth`
   - `cy = paddingTop + (1 - normalizedY) * plotHeight`
2. Draw P25-P75 filled band:
   - Build path: forward along P75 (top of band), then backward along P25 (bottom of band)
   - `ctx.beginPath()`
   - Move to first P75 point
   - `lineTo()` along all P75 points left to right
   - `lineTo()` along all P25 points right to left (reverse order)
   - `ctx.closePath()`
   - Fill with endpoint color at `tokens.canvas.ribbon.fillOpacity`
3. Draw P50 median line:
   - `ctx.beginPath()`
   - Move to first P50 point, `lineTo()` through all P50 points
   - Stroke with endpoint color at `tokens.canvas.ribbon.medianOpacity`
   - Line width: `tokens.canvas.ribbon.medianLineWidth`
   - Dash pattern: `tokens.canvas.ribbon.medianLineDash`

#### Visual Styling

- Ribbon fill: endpoint color at 15% opacity (semi-transparent, data points visible through it)
- P50 line: endpoint color at 60% opacity, 1.5px width, dashed [4, 4]
- Ribbons draw BEFORE scatter points and halos (z-order: background -> gridlines -> freeze markers -> ribbons -> halos -> points)
- Ribbons use normal compositing (`source-over`), not `screen`

### AC4: X-Axis Labels

#### Adaptive Tick Density Algorithm

```
MIN_LABEL_SPACING = 60  // px, minimum gap between label centers

function computeXTicks(maxRound: number, plotWidth: number): XTick[]
  if maxRound <= 0:
    return []

  // How many labels fit
  maxLabels = floor(plotWidth / MIN_LABEL_SPACING)
  maxLabels = max(maxLabels, 2)  // always show at least first and last

  // Compute step: snap to nice round numbers
  NICE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  rawStep = maxRound / maxLabels
  step = NICE_STEPS.find(s => s >= rawStep) ?? ceil(rawStep)

  ticks: XTick[] = []

  // Always include round 1
  ticks.push({ round: 1, normalizedX: 1 / maxRound, label: '1' })

  // Generate interior ticks at step intervals
  start = ceil(1 / step) * step  // first multiple of step >= 1
  if start === 1: start += step  // avoid duplicate of round 1
  for round = start; round < maxRound; round += step:
    ticks.push({
      round,
      normalizedX: round / maxRound,
      label: `${round}`
    })

  // Always include maxRound (unless it would overlap with the last tick)
  lastTick = ticks[ticks.length - 1]
  if !lastTick || (1.0 - lastTick.normalizedX) * plotWidth >= MIN_LABEL_SPACING * 0.6:
    ticks.push({
      round: maxRound,
      normalizedX: 1.0,
      label: `${maxRound}`
    })

  return ticks
```

#### Label Formatting

- Font: `tokens.typography.caption` (10px Inter)
- Color: `tokens.color.text.muted`
- Alignment: `textAlign = 'center'`, `textBaseline = 'top'`
- Position: `y = paddingTop + plotHeight + tokens.spacing.xs` (4px below plot area)
- X: `paddingLeft + tick.normalizedX * plotWidth`

#### Collision Avoidance

The `MIN_LABEL_SPACING` of 60px ensures no overlap for labels up to ~5 characters wide at 10px font. The algorithm only generates ticks at nice-step intervals, guaranteeing uniform spacing. The final tick (maxRound) has a 0.6x relaxed spacing check to allow it closer to the penultimate tick -- it is the most informative label (total rounds).

#### X-Axis Line

Draw a 1px line along the bottom of the plot area:
- From `(paddingLeft, paddingTop + plotHeight)` to `(paddingLeft + plotWidth, paddingTop + plotHeight)`
- Color: `tokens.color.chrome.border`
- Opacity: `tokens.canvas.axisLineOpacity`

Axis label "Round" at `(paddingLeft + plotWidth / 2, paddingTop + plotHeight + tokens.spacing.lg)` -- centered, `tokens.typography.caption`, `tokens.color.text.muted`. Only shown when `plotWidth >= 200` to avoid clutter on narrow canvases.

#### Layout Change: paddingBottom

The current `paddingBottom` is `tokens.spacing.xl` (24px). X-axis labels require: tick labels at `plotHeight + 4px` (10px font = bottom at +14px), "Round" label at `plotHeight + 16px` (bottom at +26px). `paddingBottom` must increase to `tokens.spacing.xxl` (32px) to accommodate both label rows. This change goes in `computeLayout()` and the `tokens.canvas.xAxis` block:

```typescript
xAxis: {
  minLabelSpacing: 60,
  labelOffsetY: 4,
  paddingBottom: 32,  // replaces tokens.spacing.xl (24px) for timeline canvas
},
```

### AC5: Empty State

#### Detection

`FrameData.hasData` is `false` when no endpoint has any samples:

```
hasData = Object.values(measureState.endpoints).some(
  ep => ep.samples.length > 0
)
```

#### Sweep Animation

When `hasData === false`, `TimelineCanvas` calls `effectsRenderer.drawEmptyState()` instead of the normal effects draw.

```
EffectsRenderer.drawEmptyState(now: number):
  elapsed = now - this.sweepStartTime   // sweepStartTime set on first call
  width = this.canvas.clientWidth    // CSS pixels (post-DPR-fix)
  height = this.canvas.clientHeight  // CSS pixels (post-DPR-fix)

  ctx.clearRect(0, 0, width, height)

  // Rotating sweep line (radar motif)
  angle = (elapsed / tokens.canvas.emptyState.sweepPeriod) * 2 * PI
  centerX = width / 2
  centerY = height / 2
  radius = max(width, height) * 0.6

  // Sweep trail (fading arc)
  trailAngle = PI / 3  // 60-degree trail
  gradient = ctx.createConicGradient(angle - trailAngle, centerX, centerY)
  gradient.addColorStop(0, 'transparent')
  gradient.addColorStop(0.8, tokens.color.chrome.accent + '15')  // 8% opacity
  gradient.addColorStop(1, tokens.color.chrome.accent + '40')    // 25% opacity

  ctx.save()
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(centerX, centerY)
  ctx.arc(centerX, centerY, radius, angle - trailAngle, angle)
  ctx.closePath()
  ctx.fill()

  // Sweep line
  endX = centerX + cos(angle) * radius
  endY = centerY + sin(angle) * radius
  ctx.strokeStyle = tokens.color.chrome.accent
  ctx.globalAlpha = tokens.canvas.emptyState.sweepLineOpacity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(centerX, centerY)
  ctx.lineTo(endX, endY)
  ctx.stroke()

  // Concentric rings (subtle)
  ctx.globalAlpha = tokens.canvas.emptyState.ringOpacity
  ctx.strokeStyle = tokens.color.chrome.border
  ctx.lineWidth = 0.5
  for i = 1 to 3:
    r = radius * (i / 3)
    ctx.beginPath()
    ctx.arc(centerX, centerY, r, 0, 2 * PI)
    ctx.stroke()

  // Instructional text
  ctx.globalAlpha = tokens.canvas.emptyState.textOpacity
  ctx.fillStyle = tokens.color.text.secondary
  ctx.font = `${tokens.typography.body.fontSize}px ${tokens.typography.body.fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Add endpoints and start a test', centerX, centerY + radius * 0.15)

  ctx.font = `${tokens.typography.caption.fontSize}px ${tokens.typography.caption.fontFamily}`
  ctx.fillStyle = tokens.color.text.muted
  ctx.fillText('Latency data will appear here', centerX, centerY + radius * 0.15 + 24)
  ctx.restore()
```

#### Empty State Routing in RenderScheduler

The `hasData` state must be accessible in the RenderScheduler's effects callback, which runs every frame (not just on dirty). `TimelineCanvas` maintains a component-level `let hasData = false` variable, updated in `recomputePoints()` from `FrameData.hasData`. The effects callback closure reads this variable:

```
// In TimelineCanvas.svelte onMount:
scheduler.registerEffectsRenderer(() => {
  if (hasData) {
    effectsRenderer.draw([], performance.now());
  } else {
    effectsRenderer.drawEmptyState(performance.now());
  }
});
```

This works because the closure captures the `hasData` variable reference (not its value), so it always reads the latest state when the callback executes.

#### Transition to Data State

On the next `recomputePoints()` call after the first sample arrives:
1. `prepareFrame()` returns `hasData: true`
2. `recomputePoints()` updates the component-level `hasData` variable
3. On the next effects frame, the RenderScheduler callback reads `hasData === true` and calls `effectsRenderer.draw()` instead of `drawEmptyState()`
4. No animation transition -- clean cut. The sweep disappears and data renders on the next frame.

The `EffectsRenderer` tracks `sweepStartTime` as a nullable field. Set to `performance.now()` on first `drawEmptyState()` call. Reset to `null` when data arrives (or can simply be ignored -- the method is no longer called).

### DPR Fix (detailed)

**Files affected:**

1. `TimelineRenderer.computeLayout()`:
```typescript
// BEFORE:
plotWidth:  this.canvas.width  - paddingLeft - paddingRight,
plotHeight: this.canvas.height - paddingTop  - paddingBottom,

// AFTER:
plotWidth:  this.canvas.clientWidth  - paddingLeft - paddingRight,
plotHeight: this.canvas.clientHeight - paddingTop  - paddingBottom,
```

2. `TimelineRenderer.draw()`:
```typescript
// BEFORE:
ctx.clearRect(0, 0, canvas.width, canvas.height);

// AFTER:
ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
```

3. `TimelineRenderer.drawBackground()`:
```typescript
// BEFORE:
ctx.fillRect(0, 0, canvas.width, canvas.height);

// AFTER:
ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
```

4. `EffectsRenderer.draw()`:
```typescript
// BEFORE:
ctx.clearRect(0, 0, canvas.width, canvas.height);

// AFTER:
ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
```

5. `InteractionRenderer` -- same pattern for any `canvas.width`/`canvas.height` references used as coordinate bounds.

**Why `clientWidth` not `parseInt(style.width)`:** `clientWidth` is a native property that returns the CSS layout width as an integer (no parsing needed, no edge cases with missing `style.width`). It accounts for CSS box-sizing. It is always in sync with the visual layout.

## 6. Type Definitions

All new types go in `src/lib/types.ts`.

```typescript
// ── Pipeline output ──────────────────────────────────────────────────────

export interface Gridline {
  readonly ms: number;
  readonly normalizedY: number;
  readonly label: string;
}

export interface YRange {
  readonly min: number;
  readonly max: number;
  readonly isLog: boolean;
  readonly gridlines: readonly Gridline[];
}

export interface XTick {
  readonly round: number;
  readonly normalizedX: number;
  readonly label: string;
}

export interface RibbonData {
  /** P25 path: [round, normalizedY][] -- bottom edge of ribbon band */
  readonly p25Path: readonly (readonly [number, number])[];
  /** P50 path: [round, normalizedY][] -- median line */
  readonly p50Path: readonly (readonly [number, number])[];
  /** P75 path: [round, normalizedY][] -- top edge of ribbon band */
  readonly p75Path: readonly (readonly [number, number])[];
}

export interface FrameData {
  readonly pointsByEndpoint: ReadonlyMap<string, readonly ScatterPoint[]>;
  readonly ribbonsByEndpoint: ReadonlyMap<string, RibbonData>;
  readonly yRange: YRange;
  readonly xTicks: readonly XTick[];
  readonly maxRound: number;
  readonly freezeEvents: readonly FreezeEvent[];
  readonly hasData: boolean;
}
```

## 7. Token Additions

Added to `tokens.canvas` in `src/lib/tokens.ts`:

```typescript
canvas: {
  // ... existing tokens ...

  ribbon: {
    fillOpacity: 0.15,
    medianOpacity: 0.6,
    medianLineWidth: 1.5,
    medianLineDash: [4, 4] as readonly number[],
  },

  emptyState: {
    sweepPeriod: 4000,          // ms for one full rotation
    sweepLineOpacity: 0.25,
    ringOpacity: 0.08,
    textOpacity: 0.5,
    trailAngleDeg: 60,         // sweep trail arc width in degrees
  },

  xAxis: {
    minLabelSpacing: 60,        // px between label centers
    labelOffsetY: 4,            // px below plot area bottom edge
    paddingBottom: 32,          // replaces tokens.spacing.xl (24px) to fit X-axis labels
  },

  yAxis: {
    rollingWindowSize: 20,      // samples for ribbon percentile window
    percentileClampLow: 2,      // P2 for range clamping
    percentileClampHigh: 98,    // P98 for range clamping
    logScaleThreshold: 50,      // P98/P2 ratio above which log scale engages
    linearHeadroomPct: 0.2,     // 20% headroom on each side in linear mode
    minHeadroomMs: 5,           // minimum headroom in ms
    minVisibleRangeMs: 10,      // minimum Y-axis span
    targetGridlineCount: 5,     // target number of gridlines
  },
},
```

These follow the existing flat-key convention in `tokens.canvas`. All raw values are confined to `tokens.ts` -- renderers and pipeline reference these tokens, never hardcoded numbers.

## 8. Security Surface

Minimal. The entire pipeline is client-side JavaScript operating on data the user's own browser collected.

- **No new network requests.** The pipeline transforms in-memory store data.
- **No new storage.** No localStorage, IndexedDB, or cookie writes.
- **No new user input processing.** The pipeline reads from `MeasurementState` which is populated by the existing worker pipeline (which already validates epoch and discards stale data).
- **No new eval or dynamic code.** Pure arithmetic and Canvas 2D drawing calls.
- **No new dependencies.** Zero new npm packages.
- **Canvas fingerprinting.** The existing canvas rendering already constitutes a fingerprinting vector. This change does not increase the surface -- same Canvas 2D API, same context operations.

## 9. Rollout

### Backward Compatibility

- **Store shape:** `MeasurementState`, `EndpointMeasurementState`, `MeasurementSample` interfaces are unchanged. The pipeline reads them; it does not modify them.
- **Share URLs:** Share payload encodes raw samples, not render geometry. Existing share URLs decode to the same `MeasurementState`, and the pipeline produces correct `FrameData` from it.
- **TimelineRenderer.draw() signature changes** from `(pointsByEndpoint: Map<string, ScatterPoint[]>, freezeEvents?: FreezeEvent[])` to `(frameData: FrameData)`. This is a breaking API change, but the renderer has exactly one consumer (`TimelineCanvas.svelte`), and both are modified in the same changeset.
- **ScatterPoint interface:** Unchanged. The `y` field still represents a [0,1] normalized value -- the normalization source changes from fixed log scale to adaptive range, but the interface is identical.
- **InteractionRenderer / hover / click:** `toCanvasCoords()` continues to work because it reads `ScatterPoint.y` (normalized) and `this.layout` (DPR-fixed).
- **`findNearest()` fix (pre-existing bug):** The current `findNearest()` in `TimelineCanvas.svelte` compares CSS pixel pointer coordinates against raw `ScatterPoint.x` (round number) and `ScatterPoint.y` (normalized 0-1). This is dimensionally wrong — it only appeared to work by accident. Fix: `findNearest()` must convert each ScatterPoint to canvas coordinates via `timelineRenderer.toCanvasCoords(pt)` before computing distance to the pointer position. This fix is included in this changeset because the refactor touches `recomputePoints()` and the coordinate pipeline.

### Rollback Plan

The pipeline is a single new module (`timeline-data-pipeline.ts`) with a single entry point. To roll back:
1. Revert `TimelineCanvas.svelte` to call `TimelineRenderer.computePoints()` directly
2. Revert `TimelineRenderer.draw()` to accept `Map<string, ScatterPoint[]>`
3. Delete `timeline-data-pipeline.ts`
4. Revert token additions (or leave them -- unused tokens are harmless)

Reversal cost: low. The renderer's simplified `draw(frameData)` signature is the only structural change, and it has one consumer.

### Deployment

Static site, atomic deploys. Users get new code on page load. No migration, no feature flag, no A/B testing infrastructure.

## 10. Edge Cases

### Empty State (zero samples)

- `prepareFrame()` returns `{ hasData: false, pointsByEndpoint: empty, ribbonsByEndpoint: empty, yRange: default, xTicks: [], maxRound: 0 }`
- Default `yRange`: `{ min: 1, max: 1000, isLog: false, gridlines: [...] }` -- provides meaningful gridlines behind the sweep animation
- `TimelineCanvas` routes to `effectsRenderer.drawEmptyState()`
- Sweep animation runs continuously until first sample

### Single Sample

- `hasData: true`, one point on canvas
- Y-range: point latency +/- minimum range (10ms). E.g., if sample is 45ms, range is [35, 55]
- No ribbon (requires 20 samples)
- X-axis: single tick at round 1
- Sonar ping fires normally

### Single Endpoint

- Same behavior as multi-endpoint, minus color differentiation concerns
- Ribbon renders for the sole endpoint after 20 samples
- Y-range computed from single endpoint's data

### All Timeouts

- All samples have `status: 'timeout'`, `latency: 0` (or the timeout value -- depends on engine)
- If latency is 0: Y-range defaults to `{ min: 0, max: 10, isLog: false }`. Timeout markers render at y-max boundary.
- If latency equals timeout value (e.g., 5000ms): Y-range adapts to center around that value. All points cluster at the same height -- expected and informative.
- Ribbon: if all latencies are identical, P25 === P50 === P75. Ribbon collapses to a horizontal line (zero-height fill, P50 line visible). This correctly represents zero variance.
- Sonar pings: all use timeout tier (incomplete ring animation)

### Extreme Latency Range (1ms to 30s)

- P98/P2 ratio: 30000x, well above `logScaleThreshold` of 50x
- `isLog: true`, log-scale normalization engages
- Y-range: `min = 0.5` (P2 * 0.5, floored), `max = 60000` (P98 * 2.0) -- but practically clamped by P2/P98
- Gridlines generated at log-spaced nice values: 1ms, 10ms, 100ms, 1s, 10s
- Points spread across full canvas height in log space
- Scale indicator shows "log" in bottom-left corner

### DPR 1x / 2x / 3x

- **1x:** `canvas.clientWidth === canvas.width`. No behavioral change. Fix is a no-op at 1x.
- **2x:** `canvas.width = clientWidth * 2`. Before fix: all coordinates doubled (points at 2x position). After fix: coordinates correct, canvas renders at retina resolution.
- **3x:** Same as 2x but with 3x multiplier. `canvas.clientWidth` returns the correct CSS dimension regardless of DPR.
- Sonar ping coordinates are computed from `toCanvasCoords()` which uses `this.layout` (now in CSS pixels), so pings align correctly at any DPR.
- Ribbon paths are computed from normalized values and converted to canvas coordinates using the same DPR-fixed layout.

### Rapid Data Arrival (burst of samples)

- Each store update triggers `recomputePoints()` which calls `prepareFrame()`
- Pipeline recomputes full `FrameData` each time -- no stale caching
- `RenderScheduler` coalesces rapid dirty-flags into single frames via rAF
- Y-range may shift significantly between frames during initial data burst -- this is correct behavior (range adapts to incoming data). No smoothing to avoid masking real distribution changes.

### Window Resize

- `ResizeObserver` fires -> `resizeCanvases()` -> `applyDpr()` resets canvas dimensions -> `timelineRenderer.resize()` recomputes layout -> `scheduler.markDirty()` triggers redraw
- `FrameData` is recomputed on next store update. Between resize and next store update, the existing `FrameData` is redrawn with the new layout -- points reposition correctly because they are stored as normalized [0,1] values.

### Browser Tab Backgrounded

- Existing freeze detection sets `freezeEvents` in store
- Pipeline passes freeze events through `FrameData.freezeEvents` (copied from `measureState.freezeEvents`)
- Freeze markers render at correct X positions using the adaptive X-axis normalization
- Ribbons include samples from the backgrounded period (they are valid data with reduced accuracy, not invalid data)
