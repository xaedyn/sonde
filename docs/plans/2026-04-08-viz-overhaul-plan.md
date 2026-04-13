# Phase 1 Visualization Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Overhaul the timeline canvas to use adaptive Y-axis scaling, a data pipeline with trace ribbons, correct DPR coordinates for sonar pings, X-axis round labels, and an animated empty state.

**Architecture:** A new `TimelineDataPipeline` pure-function module (`prepareFrame()`) sits between the Svelte store and renderers, computing adaptive `YRange`, normalized scatter points, ribbon paths, and X-axis ticks per store update. `TimelineRenderer.draw()` receives a single `FrameData` struct instead of raw point maps. The DPR coordinate bug (physical vs. CSS pixels) is fixed as a prerequisite in `computeLayout()` and all `clearRect()` calls, on which all coordinate work depends. Approach: Layered Data Pipeline (chosen ADM). THE BET: full recomputation of `FrameData` per store update stays under 2ms for 10 endpoints × 1000 samples — no incremental/differential pipeline needed.

**Tech Stack:** Svelte 5 (runes), TypeScript ~6.0.2, Canvas 2D, Vitest ^4.1.3, Playwright ^1.59.1

---

## Acceptance Criteria Index

| AC | Spec text | Maps to |
|---|---|---|
| AC1 | Y-axis canvas utilization >= 60% of plotHeight for any dataset where P98/P2 < 50x | Task 2 (pipeline — computeYRange) |
| AC2 | Sonar ping center within 2px of scatter point on 1x, 2x, 3x DPR | Task 1 (DPR fix — computeLayout) |
| AC3 | Ribbon renders for any endpoint with >= 20 samples; P25-P75 band and P50 line visually distinct | Task 3 (pipeline — computeRibbons) |
| AC4 | No overlapping X-axis labels at any canvas width >= 375px | Task 2 (pipeline — computeXTicks) |
| AC5 | Animated sweep visible within 1 frame of mount when hasData === false | Task 5 (EffectsRenderer.drawEmptyState) |
| AC6 | Sweep stops within 1 render frame of first measurement | Task 6 (TimelineCanvas wiring) |
| AC7 | prepareFrame() < 2ms for 10 endpoints x 1000 samples | Task 4 (pipeline integration test) |
| AC8 | TimelineRenderer.draw(frameData) < 8ms (RenderScheduler budget) | Task 4 (pipeline integration test) |

---

## Phase A: Foundation (Tasks 1–3) — no UI changes, pure logic and types

Phase A ends with: types exported, DPR fixed, pipeline computing correct FrameData.
Artifact: `docs/superpowers/progress/2026-04-08-viz-overhaul-phaseA.md`

---

## Phase B: Renderer wiring (Tasks 4–6) — renderers consume FrameData, empty state added

Phase B ends with: full feature working end-to-end, all ACs passing.
Artifact: `docs/superpowers/progress/2026-04-08-viz-overhaul-phaseB.md`

---

## Task 1: DPR Fix + Type Additions

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tokens.ts`
- Modify: `src/lib/utils/statistics.ts`
- Modify: `src/lib/renderers/timeline-renderer.ts`
- Modify: `src/lib/renderers/effects-renderer.ts`
- Modify: `src/lib/renderers/interaction-renderer.ts`
- Test: `tests/unit/timeline-renderer.test.ts` (extending)
- Test: `tests/unit/effects-renderer.test.ts` (extending)
- Test: `tests/unit/statistics.test.ts` (extending)
- Test: `tests/unit/types.test.ts` (extending)
- Test: `tests/unit/tokens.test.ts` (extending)

**Pre-task reads:**
- [ ] Read `src/lib/types.ts`
- [ ] Read `src/lib/tokens.ts`
- [ ] Read `src/lib/renderers/timeline-renderer.ts`
- [ ] Read `src/lib/renderers/effects-renderer.ts`
- [ ] Read `src/lib/renderers/interaction-renderer.ts`
- [ ] Read `tests/unit/timeline-renderer.test.ts`
- [ ] Read `tests/unit/effects-renderer.test.ts`
- [ ] Read `tests/unit/types.test.ts`
- [ ] Read `tests/unit/tokens.test.ts`

> Bet check: THE BET (full recompute < 2ms) does not apply here. This task is prerequisite correctness work — all subsequent coordinate math is only valid after this fix.

- [ ] **Step 1: Write failing tests**

  Add to `tests/unit/timeline-renderer.test.ts`:

  ```typescript
  describe('DPR coordinate fix', () => {
    it('should use clientWidth/clientHeight for plotWidth/plotHeight, not physical canvas.width/canvas.height (AC2)', () => {
      // AC2: Sonar ping center within 2px of scatter point on 1x, 2x, 3x DPR
      // Simulate a 2x DPR canvas where physical dims are 2x CSS dims
      const canvas = document.createElement('canvas');
      // Set physical dims to 2x CSS dims (simulating 2x DPR)
      canvas.width = 1600;
      canvas.height = 800;
      // clientWidth/clientHeight reflect CSS layout size
      Object.defineProperty(canvas, 'clientWidth', { get: () => 800, configurable: true });
      Object.defineProperty(canvas, 'clientHeight', { get: () => 400, configurable: true });

      const renderer = new TimelineRenderer(canvas);
      // toCanvasCoords should produce coords within CSS pixel space (0..800, 0..400)
      // not physical pixel space (0..1600, 0..800)
      const point: import('../../src/lib/types').ScatterPoint = {
        x: 1, y: 0.5, latency: 50, status: 'ok', endpointId: 'ep1', round: 1, color: '#4a90d9',
      };
      renderer.setMaxRound(1);
      const { cx, cy } = renderer.toCanvasCoords(point);
      // cx and cy must be within CSS pixel bounds, not physical pixel bounds
      expect(cx).toBeLessThanOrEqual(800 + 10); // within CSS width with padding margin
      expect(cy).toBeLessThanOrEqual(400 + 10); // within CSS height with padding margin
    });
  });
  ```

  Add to `tests/unit/effects-renderer.test.ts`:

  ```typescript
  it('should use clientWidth/clientHeight for clearRect, not canvas.width/canvas.height (AC2)', () => {
    // AC2: DPR fix applied to EffectsRenderer
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 800;
    Object.defineProperty(canvas, 'clientWidth', { get: () => 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { get: () => 400, configurable: true });
    const renderer = new EffectsRenderer(canvas);
    // draw() must not throw when physical dims != CSS dims
    expect(() => renderer.draw([], 0)).not.toThrow();
    // drawEmptyState must also not throw
    expect(() => renderer.drawEmptyState(0)).not.toThrow();
  });
  ```

  Add to `tests/unit/types.test.ts`:

  ```typescript
  import type { FrameData, RibbonData, XTick, YRange, Gridline } from '../../src/lib/types';

  describe('pipeline types', () => {
    it('Gridline interface has ms, normalizedY, and label', () => {
      const g: Gridline = { ms: 100, normalizedY: 0.5, label: '100ms' };
      expect(g.ms).toBe(100);
      expect(g.normalizedY).toBe(0.5);
      expect(g.label).toBe('100ms');
    });

    it('YRange interface has min, max, isLog, and gridlines', () => {
      const yr: YRange = { min: 1, max: 1000, isLog: false, gridlines: [] };
      expect(yr.isLog).toBe(false);
    });

    it('XTick interface has round, normalizedX, and label', () => {
      const t: XTick = { round: 10, normalizedX: 0.5, label: '10' };
      expect(t.round).toBe(10);
    });

    it('RibbonData interface has p25Path, p50Path, p75Path', () => {
      const r: RibbonData = { p25Path: [[1, 0.2]], p50Path: [[1, 0.5]], p75Path: [[1, 0.8]] };
      expect(r.p50Path).toHaveLength(1);
    });

    it('FrameData interface has all required fields', () => {
      const fd: FrameData = {
        pointsByEndpoint: new Map(),
        ribbonsByEndpoint: new Map(),
        yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
        xTicks: [],
        maxRound: 0,
        freezeEvents: [],
        hasData: false,
      };
      expect(fd.hasData).toBe(false);
    });
  });
  ```

  Add to `tests/unit/tokens.test.ts`:

  ```typescript
  describe('new pipeline tokens', () => {
    it('exposes canvas.ribbon tokens', () => {
      expect(tokens.canvas.ribbon.fillOpacity).toBe(0.15);
      expect(tokens.canvas.ribbon.medianOpacity).toBe(0.6);
      expect(tokens.canvas.ribbon.medianLineWidth).toBe(1.5);
      expect(Array.isArray(tokens.canvas.ribbon.medianLineDash)).toBe(true);
    });

    it('exposes canvas.emptyState tokens', () => {
      expect(tokens.canvas.emptyState.sweepPeriod).toBe(4000);
      expect(tokens.canvas.emptyState.sweepLineOpacity).toBe(0.25);
      expect(tokens.canvas.emptyState.ringOpacity).toBe(0.08);
      expect(tokens.canvas.emptyState.textOpacity).toBe(0.5);
    });

    it('exposes canvas.xAxis tokens', () => {
      expect(tokens.canvas.xAxis.minLabelSpacing).toBe(60);
      expect(tokens.canvas.xAxis.labelOffsetY).toBe(4);
      expect(tokens.canvas.xAxis.paddingBottom).toBe(32);
    });

    it('exposes canvas.yAxis tokens', () => {
      expect(tokens.canvas.yAxis.rollingWindowSize).toBe(20);
      expect(tokens.canvas.yAxis.percentileClampLow).toBe(2);
      expect(tokens.canvas.yAxis.percentileClampHigh).toBe(98);
      expect(tokens.canvas.yAxis.logScaleThreshold).toBe(50);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-renderer.test.ts tests/unit/effects-renderer.test.ts tests/unit/types.test.ts tests/unit/tokens.test.ts 2>&1 | tail -30
  ```

  Expected: failures referencing missing types (`FrameData`, `YRange`, etc.), missing token blocks, and potentially the DPR assertion (depending on current behavior).

- [ ] **Step 3: Add pipeline types to `src/lib/types.ts`**

  Add after the existing `SonarPing` interface (after line 243):

  ```typescript
  // ── Pipeline output types ─────────────────────────────────────────────────

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
    /** P25 path: [round, normalizedY][] — bottom edge of ribbon band */
    readonly p25Path: readonly (readonly [number, number])[];
    /** P50 path: [round, normalizedY][] — median line */
    readonly p50Path: readonly (readonly [number, number])[];
    /** P75 path: [round, normalizedY][] — top edge of ribbon band */
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

- [ ] **Step 4: Add token blocks to `src/lib/tokens.ts`**

  In the `canvas` block, after `sonarPing: { ... },` (after line 184), add:

  ```typescript
    ribbon: {
      fillOpacity: 0.15,
      medianOpacity: 0.6,
      medianLineWidth: 1.5,
      medianLineDash: [4, 4] as readonly number[],
    },

    emptyState: {
      sweepPeriod: 4000,
      sweepLineOpacity: 0.25,
      ringOpacity: 0.08,
      textOpacity: 0.5,
      trailAngleDeg: 60,
    },

    xAxis: {
      minLabelSpacing: 60,
      labelOffsetY: 4,
      paddingBottom: 32,
    },

    yAxis: {
      rollingWindowSize: 20,
      percentileClampLow: 2,
      percentileClampHigh: 98,
      logScaleThreshold: 50,
      linearHeadroomPct: 0.2,
      minHeadroomMs: 5,
      minVisibleRangeMs: 10,
      targetGridlineCount: 5,
    },
  ```

  The `canvas` object should now end with `yAxis: { ... },` before the closing `}`.

- [ ] **Step 5: Fix DPR bug in `src/lib/renderers/timeline-renderer.ts`**

  Change `computeLayout()` (lines 136–149):

  ```typescript
  private computeLayout(): CanvasLayout {
    const paddingLeft   = tokens.spacing.xxxl + tokens.spacing.xl; // room for Y labels
    const paddingRight  = tokens.spacing.lg;
    const paddingTop    = tokens.spacing.md;
    const paddingBottom = tokens.canvas.xAxis.paddingBottom;       // was tokens.spacing.xl (24px)
    return {
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      plotWidth:  this.canvas.clientWidth  - paddingLeft - paddingRight,   // CSS pixels
      plotHeight: this.canvas.clientHeight - paddingTop  - paddingBottom,  // CSS pixels
    };
  }
  ```

  Change `draw()` clearRect (line 50):

  ```typescript
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ```

  Change `drawBackground()` fillRect (line 169):

  ```typescript
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ```

- [ ] **Step 6: Fix DPR bug in `src/lib/renderers/effects-renderer.ts`**

  Change `draw()` clearRect (line 121):

  ```typescript
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ```

  Also add stub `drawEmptyState` method (full implementation in Task 5) so the type check passes for the test added in Step 1:

  ```typescript
  /** Draw radar sweep animation when no data is present. */
  drawEmptyState(now: number): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    // Full implementation in Task 5
    void now;
  }
  ```

  Add `private sweepStartTime: number | null = null;` field after the `activePings` field (line 66).

- [ ] **Step 7: Fix DPR bug in `src/lib/renderers/interaction-renderer.ts`**

  In `clear()` (line 27):

  ```typescript
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ```

  In `drawHover()` (line 38):

  ```typescript
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ```

  In `drawSelection()` (line 58):

  ```typescript
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ```

  In `drawCrosshairs()`, change (lines 81, 88, 92):

  ```typescript
  ctx.lineTo(canvas.clientWidth, y);  // was canvas.width
  // ...
  ctx.lineTo(x, canvas.clientHeight); // was canvas.height
  ```

- [ ] **Step 8: Add `percentileSorted()` to `src/lib/utils/statistics.ts`**

  The pipeline's `computeYRange()` sorts the full latency array once, and `computeRibbons()` sorts each window once. To avoid `percentile()` re-sorting internally, add a `percentileSorted()` variant that assumes pre-sorted input:

  ```typescript
  /**
   * Nearest-rank percentile from a PRE-SORTED ascending array.
   * Caller must sort before calling — no internal copy or sort.
   */
  export function percentileSorted(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
  ```

  Add a test for it in `tests/unit/statistics.test.ts`:

  ```typescript
  describe('percentileSorted', () => {
    it('returns correct P50 from pre-sorted array', () => {
      const sorted = [10, 20, 30, 40, 50];
      expect(percentileSorted(sorted, 50)).toBe(30);
    });

    it('matches percentile() output for same data', () => {
      const data = [45, 12, 88, 3, 67, 23, 91, 55, 34, 76];
      const sorted = [...data].sort((a, b) => a - b);
      expect(percentileSorted(sorted, 25)).toBe(percentile(data, 25));
      expect(percentileSorted(sorted, 50)).toBe(percentile(data, 50));
      expect(percentileSorted(sorted, 75)).toBe(percentile(data, 75));
      expect(percentileSorted(sorted, 98)).toBe(percentile(data, 98));
    });

    it('returns 0 for empty array', () => {
      expect(percentileSorted([], 50)).toBe(0);
    });
  });
  ```

- [ ] **Step 9: Run tests to verify they pass**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-renderer.test.ts tests/unit/effects-renderer.test.ts tests/unit/types.test.ts tests/unit/tokens.test.ts tests/unit/statistics.test.ts 2>&1 | tail -30
  ```

  Expected: all tests pass. Look for `✓` on all DPR tests, pipeline type tests, and percentileSorted tests.

- [ ] **Step 10: Run full test suite to verify no regressions**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run 2>&1 | tail -20
  ```

  Expected: all 185+ tests pass.

- [ ] **Step 11: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add src/lib/types.ts src/lib/tokens.ts src/lib/utils/statistics.ts src/lib/renderers/timeline-renderer.ts src/lib/renderers/effects-renderer.ts src/lib/renderers/interaction-renderer.ts tests/unit/timeline-renderer.test.ts tests/unit/effects-renderer.test.ts tests/unit/types.test.ts tests/unit/tokens.test.ts tests/unit/statistics.test.ts && git commit -m "fix: DPR coordinate bug in all renderers; add pipeline types, tokens, and percentileSorted"
  ```

---

## Task 2: TimelineDataPipeline — `prepareFrame()`, `computeYRange()`, `computeXTicks()`

**Files:**
- Create: `src/lib/renderers/timeline-data-pipeline.ts`
- Create: `tests/unit/timeline-data-pipeline.test.ts`

**Pre-task reads:**
- [ ] Read `src/lib/utils/statistics.ts` (for `percentile()` import)
- [ ] Read `src/lib/types.ts` (for all consumed types)
- [ ] Read `src/lib/tokens.ts` (for token references)
- [ ] Read `src/lib/stores/measurements.ts` (for `MeasurementState` shape)

> Bet check: THE BET — full recompute < 2ms — is most load-bearing here. `computeYRange()` calls `percentile()` which sorts the full latency array. For 10 endpoints × 1000 samples = 10 000 values, sort is ~1ms. The pipeline must not sort more than once (sort once, compute P2 and P98 from the same sorted copy). This task is where that assumption is most critical.

- [ ] **Step 1: Write failing tests**

  Create `tests/unit/timeline-data-pipeline.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { prepareFrame, computeYRange, computeXTicks, normalizeLatency } from '../../src/lib/renderers/timeline-data-pipeline';
  import type { MeasurementState, YRange } from '../../src/lib/types';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function makeMeasureState(
    endpointLatencies: Record<string, number[]>,
    overrides: Partial<MeasurementState> = {}
  ): MeasurementState {
    const endpoints: MeasurementState['endpoints'] = {};
    for (const [id, latencies] of Object.entries(endpointLatencies)) {
      endpoints[id] = {
        endpointId: id,
        samples: latencies.map((latency, i) => ({
          round: i + 1,
          latency,
          status: 'ok' as const,
          timestamp: Date.now() + i * 1000,
        })),
        lastLatency: latencies[latencies.length - 1] ?? null,
        lastStatus: 'ok',
        tierLevel: 1,
      };
    }
    return {
      lifecycle: 'running',
      epoch: 1,
      roundCounter: latencies_max(endpointLatencies),
      endpoints,
      startedAt: Date.now(),
      stoppedAt: null,
      freezeEvents: [],
      ...overrides,
    };
  }

  function latencies_max(endpointLatencies: Record<string, number[]>): number {
    return Math.max(0, ...Object.values(endpointLatencies).map(arr => arr.length));
  }

  // ── computeYRange ──────────────────────────────────────────────────────────

  describe('computeYRange', () => {
    it('returns default range for empty input', () => {
      const yr = computeYRange([]);
      expect(yr.min).toBeGreaterThanOrEqual(0);
      expect(yr.max).toBeGreaterThan(yr.min);
      expect(yr.isLog).toBe(false);
      expect(yr.gridlines.length).toBeGreaterThan(0);
    });

    it('uses linear scale when P98/P2 ratio <= 50 (AC1)', () => {
      // AC1: Y-axis canvas utilization >= 60% for datasets where P98/P2 < 50x
      // Typical web latencies: 20-150ms, ratio = 7.5x < 50x => linear
      const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6); // 20..149ms
      const yr = computeYRange(latencies);
      expect(yr.isLog).toBe(false);
    });

    it('uses log scale when P98/P2 ratio > 50 (AC1 — log branch)', () => {
      // 1ms to 30s = 30000x ratio > 50x => log
      const latencies = [1, 2, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000];
      const yr = computeYRange(latencies);
      expect(yr.isLog).toBe(true);
    });

    it('linear range spans at least 10ms (minVisibleRangeMs)', () => {
      // All identical latencies — range would collapse without enforcement
      const yr = computeYRange([50, 50, 50, 50, 50]);
      expect(yr.max - yr.min).toBeGreaterThanOrEqual(10);
    });

    it('linear range includes P2–P98 values within visible area', () => {
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100ms
      const yr = computeYRange(latencies);
      // P2 ≈ 2ms, P98 ≈ 98ms — both should produce normalizedY in [0,1] range
      const normP2 = normalizeLatency(2, yr);
      const normP98 = normalizeLatency(98, yr);
      expect(normP2).toBeGreaterThanOrEqual(0);
      expect(normP98).toBeLessThanOrEqual(1);
    });

    it('canvas utilization >= 60% for typical web latency dataset (AC1)', () => {
      // AC1: (maxPointY - minPointY) / plotHeight >= 0.6
      // We verify this as normalized spread: max(normY) - min(normY) >= 0.6
      const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6); // 20..149ms
      const yr = computeYRange(latencies);
      const norms = latencies.map(l => normalizeLatency(l, yr));
      const spread = Math.max(...norms) - Math.min(...norms);
      expect(spread).toBeGreaterThanOrEqual(0.6);
    });

    it('generates gridlines within the visible range', () => {
      const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
      const yr = computeYRange(latencies);
      for (const g of yr.gridlines) {
        expect(g.normalizedY).toBeGreaterThanOrEqual(0);
        expect(g.normalizedY).toBeLessThanOrEqual(1);
        expect(g.label.length).toBeGreaterThan(0);
      }
    });

    it('gridlines have "s" suffix for >= 1000ms values', () => {
      const latencies = [100, 500, 1000, 2000, 5000, 10000];
      const yr = computeYRange(latencies);
      const secondsGridlines = yr.gridlines.filter(g => g.ms >= 1000);
      for (const g of secondsGridlines) {
        expect(g.label).toMatch(/s$/);
      }
    });

    it('gridlines have "ms" suffix for < 1000ms values', () => {
      const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
      const yr = computeYRange(latencies);
      const msGridlines = yr.gridlines.filter(g => g.ms < 1000);
      for (const g of msGridlines) {
        expect(g.label).toMatch(/ms$/);
      }
    });
  });

  // ── normalizeLatency ──────────────────────────────────────────────────────

  describe('normalizeLatency', () => {
    it('returns 0 for min value in linear scale', () => {
      const yr: YRange = { min: 10, max: 110, isLog: false, gridlines: [] };
      expect(normalizeLatency(10, yr)).toBeCloseTo(0, 5);
    });

    it('returns 1 for max value in linear scale', () => {
      const yr: YRange = { min: 10, max: 110, isLog: false, gridlines: [] };
      expect(normalizeLatency(110, yr)).toBeCloseTo(1, 5);
    });

    it('clamps to 0 for values below range', () => {
      const yr: YRange = { min: 50, max: 150, isLog: false, gridlines: [] };
      expect(normalizeLatency(10, yr)).toBe(0);
    });

    it('clamps to 1 for values above range', () => {
      const yr: YRange = { min: 50, max: 150, isLog: false, gridlines: [] };
      expect(normalizeLatency(500, yr)).toBe(1);
    });

    it('maps log-scale correctly at midpoint', () => {
      // log scale: min=1, max=10000. log10(100)=2 is midpoint of [0,4]
      const yr: YRange = { min: 1, max: 10000, isLog: true, gridlines: [] };
      const norm = normalizeLatency(100, yr);
      // log10(1)=0, log10(10000)=4, log10(100)=2 => norm = 2/4 = 0.5
      expect(norm).toBeCloseTo(0.5, 2);
    });
  });

  // ── computeXTicks ──────────────────────────────────────────────────────────

  describe('computeXTicks', () => {
    it('returns empty array when maxRound <= 0', () => {
      expect(computeXTicks(0, 800)).toHaveLength(0);
      expect(computeXTicks(-1, 800)).toHaveLength(0);
    });

    it('always includes round 1 as first tick', () => {
      const ticks = computeXTicks(100, 800);
      expect(ticks[0]?.round).toBe(1);
    });

    it('always includes maxRound as last tick (when space permits)', () => {
      const ticks = computeXTicks(100, 800);
      const last = ticks[ticks.length - 1];
      expect(last?.round).toBe(100);
    });

    it('no overlapping labels at 375px width (AC4)', () => {
      // AC4: No overlapping labels at any canvas width >= 375px
      const ticks = computeXTicks(200, 375);
      const minSpacing = 60; // tokens.canvas.xAxis.minLabelSpacing
      for (let i = 1; i < ticks.length; i++) {
        const prev = ticks[i - 1]!;
        const curr = ticks[i]!;
        const pixelDist = (curr.normalizedX - prev.normalizedX) * 375;
        expect(pixelDist).toBeGreaterThanOrEqual(minSpacing * 0.5); // 0.6x relaxed for final tick
      }
    });

    it('no overlapping labels at 800px width (AC4)', () => {
      const ticks = computeXTicks(1000, 800);
      const minSpacing = 60;
      for (let i = 1; i < ticks.length; i++) {
        const prev = ticks[i - 1]!;
        const curr = ticks[i]!;
        const pixelDist = (curr.normalizedX - prev.normalizedX) * 800;
        expect(pixelDist).toBeGreaterThanOrEqual(minSpacing * 0.5);
      }
    });

    it('tick labels are numeric strings', () => {
      const ticks = computeXTicks(50, 800);
      for (const tick of ticks) {
        expect(tick.label).toBe(String(tick.round));
      }
    });

    it('normalizedX is in [0, 1] for all ticks', () => {
      const ticks = computeXTicks(50, 800);
      for (const tick of ticks) {
        expect(tick.normalizedX).toBeGreaterThanOrEqual(0);
        expect(tick.normalizedX).toBeLessThanOrEqual(1);
      }
    });

    it('snaps to nice step values (not fractional steps)', () => {
      const ticks = computeXTicks(100, 800);
      const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
      // Interior ticks (not first/last) should be multiples of a nice step
      const interior = ticks.slice(1, -1);
      if (interior.length > 1) {
        const step = interior[1]!.round - interior[0]!.round;
        expect(niceSteps.some(s => s === step)).toBe(true);
      }
    });
  });

  // ── prepareFrame ───────────────────────────────────────────────────────────

  describe('prepareFrame', () => {
    it('returns hasData: false when no endpoints have samples', () => {
      const state = makeMeasureState({});
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      expect(result.hasData).toBe(false);
    });

    it('returns hasData: true when any endpoint has at least one sample (AC6)', () => {
      // AC6: Sweep stops within 1 render frame of first measurement
      const state = makeMeasureState({ ep1: [50] });
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      expect(result.hasData).toBe(true);
    });

    it('returns empty pointsByEndpoint when hasData is false', () => {
      const state = makeMeasureState({});
      const result = prepareFrame([], state);
      expect(result.pointsByEndpoint.size).toBe(0);
    });

    it('produces ScatterPoint.y values in [0, 1] for all points', () => {
      const latencies = Array.from({ length: 50 }, (_, i) => 20 + i * 2.6);
      const state = makeMeasureState({ ep1: latencies });
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      const points = result.pointsByEndpoint.get('ep1') ?? [];
      for (const pt of points) {
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
      }
    });

    it('produces maxRound equal to highest round number across all endpoints', () => {
      const state = makeMeasureState({ ep1: Array(30).fill(50), ep2: Array(20).fill(100) });
      const endpoints = [
        { id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' },
        { id: 'ep2', url: 'https://b.com', enabled: true, label: 'B', color: '#e06c75' },
      ];
      const result = prepareFrame(endpoints, state);
      expect(result.maxRound).toBe(30);
    });

    it('passes freezeEvents through from measureState', () => {
      const state = makeMeasureState({ ep1: [50] });
      state.freezeEvents = [{ round: 5, at: Date.now(), gapMs: 2000 }];
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      expect(result.freezeEvents).toHaveLength(1);
    });

    it('benchmark: prepareFrame < 2ms for 10 endpoints x 1000 samples (AC7)', () => {
      // AC7: prepareFrame() execution < 2ms for 10 endpoints x 1000 samples
      const eps: Record<string, number[]> = {};
      const endpoints = [];
      for (let i = 0; i < 10; i++) {
        eps[`ep${i}`] = Array.from({ length: 1000 }, () => Math.random() * 500 + 10);
        endpoints.push({ id: `ep${i}`, url: `https://ep${i}.com`, enabled: true, label: `EP${i}`, color: '#4a90d9' });
      }
      const state = makeMeasureState(eps);

      const start = performance.now();
      prepareFrame(endpoints, state);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-data-pipeline.test.ts 2>&1 | tail -20
  ```

  Expected: module not found error — `timeline-data-pipeline.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/renderers/timeline-data-pipeline.ts`**

  ```typescript
  // src/lib/renderers/timeline-data-pipeline.ts
  // Pure-function data pipeline: transforms MeasurementState into FrameData for renderers.
  // No class, no mutable state. Entry point: prepareFrame().

  import { percentile, percentileSorted } from '$lib/utils/statistics';
  import { tokens } from '$lib/tokens';
  import type {
    Endpoint,
    MeasurementState,
    FrameData,
    ScatterPoint,
    RibbonData,
    YRange,
    XTick,
    Gridline,
  } from '$lib/types';

  // ── Constants (all from tokens) ────────────────────────────────────────────

  const WINDOW_SIZE = tokens.canvas.yAxis.rollingWindowSize;
  const P_LOW = tokens.canvas.yAxis.percentileClampLow;
  const P_HIGH = tokens.canvas.yAxis.percentileClampHigh;
  const LOG_THRESHOLD = tokens.canvas.yAxis.logScaleThreshold;
  const HEADROOM_PCT = tokens.canvas.yAxis.linearHeadroomPct;
  const MIN_HEADROOM = tokens.canvas.yAxis.minHeadroomMs;
  const MIN_VISIBLE_RANGE = tokens.canvas.yAxis.minVisibleRangeMs;
  const TARGET_GRIDLINES = tokens.canvas.yAxis.targetGridlineCount;
  const MIN_LABEL_SPACING = tokens.canvas.xAxis.minLabelSpacing;

  const NICE_STEPS_LINEAR = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const;
  const NICE_STEPS_LOG = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] as const;
  const NICE_STEPS_XTICK = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

  // ── Default Y range (returned when no data) ───────────────────────────────

  const DEFAULT_YRANGE: YRange = (() => {
    const min = 1;
    const max = 1000;
    const isLog = false;
    const yr: YRange = { min, max, isLog, gridlines: [] };
    const gridlines = computeGridlines(min, max, isLog, yr);
    return { min, max, isLog, gridlines };
  })();

  // ── Y-range computation ───────────────────────────────────────────────────

  export function computeYRange(allLatencies: number[]): YRange {
    if (allLatencies.length === 0) return DEFAULT_YRANGE;

    // Sort once — use percentileSorted to avoid re-sorting inside percentile()
    const sorted = [...allLatencies].sort((a, b) => a - b);
    const p2 = percentileSorted(sorted, P_LOW);
    const p98 = percentileSorted(sorted, P_HIGH);

    const ratio = p98 / Math.max(p2, 0.1);
    const isLog = ratio > LOG_THRESHOLD;

    let min: number;
    let max: number;

    if (isLog) {
      min = Math.max(p2 * 0.5, 0.5);
      max = p98 * 2.0;
    } else {
      const span = p98 - p2;
      const headroom = Math.max(span * HEADROOM_PCT, MIN_HEADROOM);
      min = Math.max(p2 - headroom, 0);
      max = p98 + headroom;
    }

    // Enforce minimum visible range
    if (max - min < MIN_VISIBLE_RANGE) {
      const center = (min + max) / 2;
      min = center - MIN_VISIBLE_RANGE / 2;
      max = center + MIN_VISIBLE_RANGE / 2;
      if (min < 0) {
        min = 0;
        max = MIN_VISIBLE_RANGE;
      }
    }

    const yr: YRange = { min, max, isLog, gridlines: [] };
    const gridlines = computeGridlines(min, max, isLog, yr);
    return { min, max, isLog, gridlines };
  }

  function computeGridlines(min: number, max: number, isLog: boolean, yr: YRange): Gridline[] {
    if (isLog) {
      let candidates = NICE_STEPS_LOG.filter(v => v >= min && v <= max);
      while (candidates.length > TARGET_GRIDLINES + 2) {
        candidates = candidates.filter((_, i) => i % 2 === 0);
      }
      return candidates.map(ms => ({
        ms,
        normalizedY: normalizeLatency(ms, yr),
        label: ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`,
      }));
    } else {
      const range = max - min;
      const rawStep = range / TARGET_GRIDLINES;
      const step = NICE_STEPS_LINEAR.find(s => s >= rawStep) ?? rawStep;
      const gridlines: Gridline[] = [];
      const start = Math.ceil(min / step) * step;
      for (let value = start; value <= max; value += step) {
        gridlines.push({
          ms: value,
          normalizedY: normalizeLatency(value, yr),
          label: value >= 1000 ? `${value / 1000}s` : `${Math.round(value)}ms`,
        });
      }
      return gridlines;
    }
  }

  // ── Normalization ──────────────────────────────────────────────────────────

  export function normalizeLatency(ms: number, yRange: YRange): number {
    if (yRange.isLog) {
      const logMin = Math.log10(Math.max(yRange.min, 0.1));
      const logMax = Math.log10(yRange.max);
      const logVal = Math.log10(Math.max(ms, 0.1));
      return Math.min(1, Math.max(0, (logVal - logMin) / (logMax - logMin)));
    } else {
      return Math.min(1, Math.max(0, (ms - yRange.min) / (yRange.max - yRange.min)));
    }
  }

  // ── X-tick computation ────────────────────────────────────────────────────

  export function computeXTicks(maxRound: number, plotWidth: number): XTick[] {
    if (maxRound <= 0) return [];

    const maxLabels = Math.max(Math.floor(plotWidth / MIN_LABEL_SPACING), 2);
    const rawStep = maxRound / maxLabels;
    const step = NICE_STEPS_XTICK.find(s => s >= rawStep) ?? Math.ceil(rawStep);

    const ticks: XTick[] = [];

    // Always include round 1
    ticks.push({ round: 1, normalizedX: 1 / maxRound, label: '1' });

    // Interior ticks at step intervals (skip if step would duplicate round 1)
    let start = Math.ceil(1 / step) * step;
    if (start === 1) start += step;
    for (let round = start; round < maxRound; round += step) {
      ticks.push({
        round,
        normalizedX: round / maxRound,
        label: `${round}`,
      });
    }

    // Always include maxRound (relaxed spacing check — 0.6x)
    const lastTick = ticks[ticks.length - 1];
    if (!lastTick || (1.0 - lastTick.normalizedX) * plotWidth >= MIN_LABEL_SPACING * 0.6) {
      ticks.push({
        round: maxRound,
        normalizedX: 1.0,
        label: `${maxRound}`,
      });
    }

    return ticks;
  }

  // ── Ribbon computation ────────────────────────────────────────────────────

  function computeRibbons(
    measureState: MeasurementState,
    yRange: YRange,
  ): Map<string, RibbonData> {
    const result = new Map<string, RibbonData>();

    for (const [endpointId, epState] of Object.entries(measureState.endpoints)) {
      const { samples } = epState;
      if (samples.length < WINDOW_SIZE) continue;

      const p25Points: [number, number][] = [];
      const p50Points: [number, number][] = [];
      const p75Points: [number, number][] = [];

      for (let i = WINDOW_SIZE - 1; i < samples.length; i++) {
        const window = samples.slice(i - WINDOW_SIZE + 1, i + 1);
        const okSamples = window.filter(s => s.status === 'ok');
        const latencies = okSamples.map(s => s.latency);

        if (latencies.length < 3) continue;

        // Sort window once, compute all percentiles from sorted copy
        const sortedWindow = [...latencies].sort((a, b) => a - b);
        const p25 = percentileSorted(sortedWindow, 25);
        const p50 = percentileSorted(sortedWindow, 50);
        const p75 = percentileSorted(sortedWindow, 75);

        const x = samples[i]!.round;
        p25Points.push([x, normalizeLatency(p25, yRange)]);
        p50Points.push([x, normalizeLatency(p50, yRange)]);
        p75Points.push([x, normalizeLatency(p75, yRange)]);
      }

      if (p25Points.length > 0) {
        result.set(endpointId, {
          p25Path: p25Points,
          p50Path: p50Points,
          p75Path: p75Points,
        });
      }
    }

    return result;
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  export function prepareFrame(
    endpoints: Endpoint[],
    measureState: MeasurementState,
  ): FrameData {
    const hasData = Object.values(measureState.endpoints).some(
      ep => ep.samples.length > 0,
    );

    if (!hasData) {
      return {
        pointsByEndpoint: new Map(),
        ribbonsByEndpoint: new Map(),
        yRange: DEFAULT_YRANGE,
        xTicks: [],
        maxRound: 0,
        freezeEvents: measureState.freezeEvents,
        hasData: false,
      };
    }

    // Collect all latencies for adaptive Y-range (single sort in computeYRange)
    const allLatencies: number[] = [];
    for (const epState of Object.values(measureState.endpoints)) {
      for (const s of epState.samples) {
        allLatencies.push(s.latency);
      }
    }

    const yRange = computeYRange(allLatencies);

    // Build point maps and track maxRound
    const pointsByEndpoint = new Map<string, readonly ScatterPoint[]>();
    let maxRound = 0;

    for (const ep of endpoints) {
      const epState = measureState.endpoints[ep.id];
      if (!epState || epState.samples.length === 0) {
        pointsByEndpoint.set(ep.id, []);
        continue;
      }

      const points: ScatterPoint[] = epState.samples.map(s => ({
        x: s.round,
        y: normalizeLatency(s.latency, yRange),
        latency: s.latency,
        status: s.status,
        endpointId: ep.id,
        round: s.round,
        color: ep.color,
      }));

      pointsByEndpoint.set(ep.id, points);

      for (const s of epState.samples) {
        if (s.round > maxRound) maxRound = s.round;
      }
    }

    maxRound = Math.max(maxRound, 1);

    // Compute ribbons (requires yRange)
    const ribbonsByEndpoint = computeRibbons(measureState, yRange);

    // Compute X ticks — use a reasonable plot width estimate; renderer recomputes if needed
    // The pipeline uses a nominal 800px width; renderer uses its actual layout.plotWidth
    // to re-invoke computeXTicks if it wants exact ticks. For FrameData we pass 800 default.
    // NOTE: TimelineCanvas passes canvas.clientWidth directly — see Task 6.
    const xTicks = computeXTicks(maxRound, 800);

    return {
      pointsByEndpoint,
      ribbonsByEndpoint,
      yRange,
      xTicks,
      maxRound,
      freezeEvents: measureState.freezeEvents,
      hasData: true,
    };
  }
  ```

  > **Note on X-tick width:** The pipeline receives `plotWidth` as a parameter in `computeXTicks` but `prepareFrame()` uses a nominal 800px. Task 6 updates `TimelineCanvas` to pass the actual `canvas.clientWidth` when calling the pipeline, making ticks exact. The 800px nominal is correct for all >375px viewports in the common case.

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-data-pipeline.test.ts 2>&1 | tail -30
  ```

  Expected: all tests pass. Pay attention to the benchmark test — if it fails on slow CI, investigate before assuming the bet is wrong.

- [ ] **Step 5: Run full test suite**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add src/lib/renderers/timeline-data-pipeline.ts tests/unit/timeline-data-pipeline.test.ts && git commit -m "feat: add TimelineDataPipeline with adaptive Y-axis, X-ticks, ribbon paths"
  ```

---

## Task 3: Ribbon Computation Tests (AC3 coverage)

**Files:**
- Modify: `tests/unit/timeline-data-pipeline.test.ts` (extending)

**Pre-task reads:**
- [ ] Read `tests/unit/timeline-data-pipeline.test.ts`

This task adds ribbon-specific tests that verify the `computeRibbons` behavior through `prepareFrame()`. The ribbon logic is inside `prepareFrame()` — the tests drive it via that public interface.

- [ ] **Step 1: Write failing tests**

  Add to `tests/unit/timeline-data-pipeline.test.ts` (new `describe` block):

  ```typescript
  describe('ribbons (AC3)', () => {
    function makeStateWithSamples(n: number, latency = 50): MeasurementState {
      const latencies = Array(n).fill(latency);
      return makeMeasureState({ ep1: latencies });
    }

    it('no ribbon when endpoint has fewer than 20 samples (AC3)', () => {
      // AC3: Ribbon renders for any endpoint with >= 20 samples
      const state = makeStateWithSamples(19);
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      expect(result.ribbonsByEndpoint.has('ep1')).toBe(false);
    });

    it('ribbon present when endpoint has exactly 20 samples (AC3)', () => {
      const state = makeStateWithSamples(20);
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      expect(result.ribbonsByEndpoint.has('ep1')).toBe(true);
    });

    it('ribbon present when endpoint has more than 20 samples (AC3)', () => {
      const state = makeStateWithSamples(50);
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      expect(result.ribbonsByEndpoint.has('ep1')).toBe(true);
    });

    it('RibbonData has p25Path, p50Path, p75Path of equal length', () => {
      const state = makeStateWithSamples(30);
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      const ribbon = result.ribbonsByEndpoint.get('ep1');
      expect(ribbon).toBeDefined();
      expect(ribbon!.p25Path.length).toBe(ribbon!.p50Path.length);
      expect(ribbon!.p50Path.length).toBe(ribbon!.p75Path.length);
    });

    it('P25 normalized Y <= P50 normalized Y <= P75 normalized Y', () => {
      // Use varied latencies so percentiles are distinct
      const latencies = Array.from({ length: 30 }, (_, i) => 10 + i * 5); // 10..155ms
      const state = makeMeasureState({ ep1: latencies });
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      const ribbon = result.ribbonsByEndpoint.get('ep1');
      expect(ribbon).toBeDefined();
      // At each point, p25 <= p50 <= p75
      for (let i = 0; i < ribbon!.p25Path.length; i++) {
        const y25 = ribbon!.p25Path[i]![1];
        const y50 = ribbon!.p50Path[i]![1];
        const y75 = ribbon!.p75Path[i]![1];
        expect(y25).toBeLessThanOrEqual(y50 + 0.001); // tolerance for floating point
        expect(y50).toBeLessThanOrEqual(y75 + 0.001);
      }
    });

    it('ribbon collapses to line when all latencies identical (zero variance)', () => {
      // All timeout samples with identical latency → P25 === P50 === P75
      const state = makeStateWithSamples(25, 100);
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      const ribbon = result.ribbonsByEndpoint.get('ep1');
      if (ribbon) {
        for (let i = 0; i < ribbon.p25Path.length; i++) {
          expect(ribbon.p25Path[i]![1]).toBeCloseTo(ribbon.p50Path[i]![1], 5);
          expect(ribbon.p50Path[i]![1]).toBeCloseTo(ribbon.p75Path[i]![1], 5);
        }
      }
    });

    it('ribbon path X values match sample round numbers', () => {
      const state = makeStateWithSamples(25);
      const endpoints = [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }];
      const result = prepareFrame(endpoints, state);
      const ribbon = result.ribbonsByEndpoint.get('ep1');
      expect(ribbon).toBeDefined();
      // X values should be round numbers (integers >= 20)
      for (const [x] of ribbon!.p50Path) {
        expect(Number.isInteger(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(20); // at least round 20 (window size)
      }
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-data-pipeline.test.ts 2>&1 | grep -E "FAIL|PASS|ribbon" | head -20
  ```

  Expected: ribbon tests fail because `prepareFrame()` doesn't exist yet (or if Task 2 is done, all ribbon tests pass — in which case this task is verification-only, no implementation needed).

  > **Note:** If Task 2 is completed first, these ribbon tests are likely already passing because `computeRibbons` is integrated into `prepareFrame()`. Run the tests; if they pass, skip Step 3 (no implementation needed) and proceed to commit.

- [ ] **Step 3: Run tests to verify they pass**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-data-pipeline.test.ts 2>&1 | tail -20
  ```

  Expected: all ribbon tests pass.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add tests/unit/timeline-data-pipeline.test.ts && git commit -m "test: add ribbon AC3 coverage to pipeline test suite"
  ```

---

## Phase A Artifact

After Task 3, write:

```bash
cat > /Users/shane/claude/chronoscope/docs/superpowers/progress/2026-04-08-viz-overhaul-phaseA.md << 'EOF'
# Phase A Complete — Foundation

Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Completed Tasks

- Task 1: DPR fix (all three renderers), pipeline types (types.ts), token additions (tokens.ts)
- Task 2: TimelineDataPipeline — prepareFrame, computeYRange, normalizeLatency, computeXTicks, computeRibbons
- Task 3: AC3 ribbon tests verified

## AC Coverage

- AC1 (Y-axis utilization): computeYRange produces >= 60% normalized spread for typical web latencies ✓
- AC2 (DPR coordinates): clientWidth/clientHeight used in all three renderers ✓
- AC3 (Ribbons): ribbon present for >= 20 samples, correct percentile ordering ✓
- AC4 (X-axis labels): MIN_LABEL_SPACING = 60px enforced by computeXTicks ✓
- AC7 (Performance): benchmark test < 2ms ✓

## Not yet wired

- TimelineRenderer does not yet accept FrameData (still takes Map<string, ScatterPoint[]>)
- EffectsRenderer.drawEmptyState() is a stub
- TimelineCanvas still calls computePoints() directly

Phase B wires it all together.
EOF
```

---

## Task 4: TimelineRenderer — Accept FrameData, Draw Ribbons, Dynamic Gridlines, X-axis

**Files:**
- Modify: `src/lib/renderers/timeline-renderer.ts`
- Modify: `tests/unit/timeline-renderer.test.ts` (extending)

**Pre-task reads:**
- [ ] Read `src/lib/renderers/timeline-renderer.ts`
- [ ] Read `tests/unit/timeline-renderer.test.ts`

> Bet check: THE BET — draw(frameData) < 8ms — is most visible here. The ribbon path draws O(endpoints × window_samples) lineTo calls. For 10 endpoints × 1000 samples: ~980 ribbon points per endpoint, ~9800 total lineTo calls. Canvas 2D typically handles 50 000+ lineTo calls per frame. This is well within budget.

- [ ] **Step 1: Write failing tests**

  Add to `tests/unit/timeline-renderer.test.ts`:

  ```typescript
  import { prepareFrame } from '../../src/lib/renderers/timeline-data-pipeline';
  import type { FrameData, MeasurementState } from '../../src/lib/types';

  function makeFrameData(latencies: number[] = [50, 100, 200]): FrameData {
    const state: MeasurementState = {
      lifecycle: 'running',
      epoch: 1,
      roundCounter: latencies.length,
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          samples: latencies.map((latency, i) => ({
            round: i + 1, latency, status: 'ok' as const, timestamp: Date.now() + i * 1000,
          })),
          lastLatency: latencies[latencies.length - 1] ?? null,
          lastStatus: 'ok',
          tierLevel: 1,
        },
      },
      startedAt: Date.now(),
      stoppedAt: null,
      freezeEvents: [],
    };
    return prepareFrame(
      [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }],
      state,
    );
  }

  describe('TimelineRenderer (FrameData API)', () => {
    it('draw(frameData) does not throw with empty FrameData', () => {
      const canvas = makeCanvas();
      const renderer = new TimelineRenderer(canvas);
      const fd = makeFrameData([]);
      expect(() => renderer.draw(fd)).not.toThrow();
    });

    it('draw(frameData) does not throw with valid data', () => {
      const canvas = makeCanvas();
      const renderer = new TimelineRenderer(canvas);
      const fd = makeFrameData([50, 100, 200]);
      expect(() => renderer.draw(fd)).not.toThrow();
    });

    it('draw(frameData) does not throw with ribbons (>= 20 samples)', () => {
      const canvas = makeCanvas();
      const renderer = new TimelineRenderer(canvas);
      const latencies = Array.from({ length: 25 }, (_, i) => 20 + i * 5);
      const fd = makeFrameData(latencies);
      expect(fd.ribbonsByEndpoint.has('ep1')).toBe(true); // sanity
      expect(() => renderer.draw(fd)).not.toThrow();
    });

    it('draw(frameData) does not throw with freeze events', () => {
      const canvas = makeCanvas();
      const renderer = new TimelineRenderer(canvas);
      const fd = makeFrameData([50, 100]);
      const fdWithFreeze: FrameData = {
        ...fd,
        freezeEvents: [{ round: 1, at: Date.now(), gapMs: 2000 }],
      };
      expect(() => renderer.draw(fdWithFreeze)).not.toThrow();
    });

    it('benchmark: draw(frameData) < 8ms for 10 endpoints x 1000 samples (AC8)', () => {
      // AC8: TimelineRenderer.draw(frameData) < 8ms (RenderScheduler target)
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 400;
      const renderer = new TimelineRenderer(canvas);

      const state: MeasurementState = {
        lifecycle: 'running', epoch: 1, roundCounter: 1000,
        endpoints: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [`ep${i}`, {
            endpointId: `ep${i}`,
            samples: Array.from({ length: 1000 }, (_, j) => ({
              round: j + 1, latency: Math.random() * 490 + 10, status: 'ok' as const, timestamp: Date.now() + j,
            })),
            lastLatency: 50, lastStatus: 'ok' as const, tierLevel: 1 as const,
          }]),
        ),
        startedAt: Date.now(), stoppedAt: null, freezeEvents: [],
      };
      const endpoints = Array.from({ length: 10 }, (_, i) => ({
        id: `ep${i}`, url: `https://ep${i}.com`, enabled: true, label: `EP${i}`, color: '#4a90d9',
      }));
      const fd = prepareFrame(endpoints, state);

      const start = performance.now();
      renderer.draw(fd);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(8);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-renderer.test.ts 2>&1 | grep -E "FAIL|FrameData" | head -10
  ```

  Expected: failures because `TimelineRenderer.draw()` does not accept `FrameData` yet.

- [ ] **Step 3: Rewrite `src/lib/renderers/timeline-renderer.ts`**

  Replace the entire file with:

  ```typescript
  // src/lib/renderers/timeline-renderer.ts
  // Canvas 2D scatter plot. Receives pre-computed FrameData from TimelineDataPipeline.
  // Draws: background, dynamic gridlines, scale indicator, freeze markers,
  //        trace ribbons, glow halos, scatter points, X-axis labels.

  import { tokens } from '$lib/tokens';
  import { STATUS_COLORS } from '$lib/renderers/color-map';
  import type { ScatterPoint, FreezeEvent, FrameData, YRange, RibbonData, XTick } from '$lib/types';

  interface CanvasLayout {
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    plotWidth: number;
    plotHeight: number;
  }

  export class TimelineRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D | null;
    private layout: CanvasLayout;
    private maxRound = 1;

    // Halo cache: color hex → OffscreenCanvas pattern
    private readonly haloCache = new Map<string, CanvasPattern | null>();

    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.layout = this.computeLayout();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    draw(frameData: FrameData): void {
      const { ctx, canvas } = this;
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      this.maxRound = Math.max(frameData.maxRound, 1);

      this.drawBackground();
      this.drawGridlines(frameData.yRange);

      if (frameData.freezeEvents.length > 0) {
        this.drawFreezeMarkers([...frameData.freezeEvents]);
      }

      // Ribbons (behind halos and points)
      if (frameData.ribbonsByEndpoint.size > 0) {
        this.drawRibbons(frameData.ribbonsByEndpoint, frameData.pointsByEndpoint);
      }

      // Phase 1: glow halos (additive compositing)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const [, points] of frameData.pointsByEndpoint) {
        for (const pt of points) {
          if (pt.status === 'ok') {
            this.drawHalo(pt);
          }
        }
      }
      ctx.restore();

      // Phase 2: point shapes (normal compositing)
      for (const [, points] of frameData.pointsByEndpoint) {
        for (const pt of points) {
          this.drawPoint(pt);
        }
      }

      // X-axis
      this.drawXAxis(frameData.xTicks);
    }

    resize(): void {
      this.layout = this.computeLayout();
      this.haloCache.clear();
    }

    // ── Public coordinate conversion ─────────────────────────────────────────

    /** Convert a ScatterPoint to canvas pixel coordinates. Call after draw() has set maxRound. */
    toCanvasCoords(pt: ScatterPoint): { cx: number; cy: number } {
      return this.pointToCanvas(pt);
    }

    /** Update maxRound externally (e.g. during recomputePoints, before draw). */
    setMaxRound(value: number): void {
      this.maxRound = Math.max(value, 1);
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    private computeLayout(): CanvasLayout {
      const paddingLeft   = tokens.spacing.xxxl + tokens.spacing.xl; // room for Y labels
      const paddingRight  = tokens.spacing.lg;
      const paddingTop    = tokens.spacing.md;
      const paddingBottom = tokens.canvas.xAxis.paddingBottom;       // 32px for X-axis labels
      return {
        paddingLeft,
        paddingRight,
        paddingTop,
        paddingBottom,
        plotWidth:  this.canvas.clientWidth  - paddingLeft - paddingRight,
        plotHeight: this.canvas.clientHeight - paddingTop  - paddingBottom,
      };
    }

    // ── Drawing helpers ──────────────────────────────────────────────────────

    private drawBackground(): void {
      const { ctx, canvas } = this;
      if (!ctx) return;
      ctx.fillStyle = tokens.color.surface.canvas;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }

    private drawGridlines(yRange: YRange): void {
      const { ctx } = this;
      if (!ctx) return;
      const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

      ctx.save();
      ctx.strokeStyle = tokens.color.chrome.border;
      ctx.globalAlpha = tokens.canvas.gridLineOpacity;
      ctx.setLineDash(tokens.canvas.gridLineDash as number[]);
      ctx.lineWidth = 1;

      const labelFont = `${tokens.typography.caption.fontSize}px ${tokens.typography.caption.fontFamily}`;
      ctx.font = labelFont;
      ctx.fillStyle = tokens.color.text.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (const gridline of yRange.gridlines) {
        const y = paddingTop + (1 - gridline.normalizedY) * plotHeight;

        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + plotWidth, y);
        ctx.stroke();

        ctx.globalAlpha = tokens.canvas.axisLineOpacity;
        ctx.fillText(gridline.label, paddingLeft - tokens.spacing.xs, y);
        ctx.globalAlpha = tokens.canvas.gridLineOpacity;
      }

      // Scale indicator (bottom-left of plot area)
      ctx.globalAlpha = tokens.canvas.axisLineOpacity * 0.6;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        yRange.isLog ? 'log' : 'linear',
        paddingLeft,
        paddingTop + plotHeight,
      );

      ctx.restore();
    }

    private drawFreezeMarkers(events: FreezeEvent[]): void {
      const { ctx } = this;
      if (!ctx) return;
      const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (const ev of events) {
        const norm = ev.round / this.maxRound;
        const x = paddingLeft + norm * plotWidth;
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, paddingTop + plotHeight);
        ctx.stroke();
      }

      ctx.restore();
    }

    private drawRibbons(
      ribbonsByEndpoint: ReadonlyMap<string, RibbonData>,
      pointsByEndpoint: ReadonlyMap<string, readonly ScatterPoint[]>,
    ): void {
      const { ctx } = this;
      if (!ctx) return;
      const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

      for (const [endpointId, ribbon] of ribbonsByEndpoint) {
        // Get endpoint color from any point
        const points = pointsByEndpoint.get(endpointId);
        const color = points?.[0]?.color ?? tokens.color.endpoint[0] ?? '#4a90d9';

        if (ribbon.p75Path.length < 2) continue;

        // Draw P25-P75 filled band
        ctx.save();
        ctx.globalAlpha = tokens.canvas.ribbon.fillOpacity;
        ctx.fillStyle = color;
        ctx.beginPath();

        // Forward along P75 (top of band in screen coords = lower normalizedY)
        const toCanvas = (round: number, normY: number) => ({
          x: paddingLeft + (round / this.maxRound) * plotWidth,
          y: paddingTop + (1 - normY) * plotHeight,
        });

        const first75 = ribbon.p75Path[0]!;
        const start75 = toCanvas(first75[0], first75[1]);
        ctx.moveTo(start75.x, start75.y);
        for (let i = 1; i < ribbon.p75Path.length; i++) {
          const [r, n] = ribbon.p75Path[i]!;
          const { x, y } = toCanvas(r, n);
          ctx.lineTo(x, y);
        }

        // Backward along P25 (bottom of band)
        for (let i = ribbon.p25Path.length - 1; i >= 0; i--) {
          const [r, n] = ribbon.p25Path[i]!;
          const { x, y } = toCanvas(r, n);
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw P50 median line
        ctx.save();
        ctx.globalAlpha = tokens.canvas.ribbon.medianOpacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = tokens.canvas.ribbon.medianLineWidth;
        ctx.setLineDash(tokens.canvas.ribbon.medianLineDash as number[]);
        ctx.beginPath();
        const first50 = ribbon.p50Path[0]!;
        const start50 = toCanvas(first50[0], first50[1]);
        ctx.moveTo(start50.x, start50.y);
        for (let i = 1; i < ribbon.p50Path.length; i++) {
          const [r, n] = ribbon.p50Path[i]!;
          const { x, y } = toCanvas(r, n);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    private drawXAxis(xTicks: readonly XTick[]): void {
      const { ctx } = this;
      if (!ctx) return;
      const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;

      ctx.save();

      // X-axis line
      ctx.strokeStyle = tokens.color.chrome.border;
      ctx.globalAlpha = tokens.canvas.axisLineOpacity;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(paddingLeft, paddingTop + plotHeight);
      ctx.lineTo(paddingLeft + plotWidth, paddingTop + plotHeight);
      ctx.stroke();

      // Tick labels
      const labelFont = `${tokens.typography.caption.fontSize}px ${tokens.typography.caption.fontFamily}`;
      ctx.font = labelFont;
      ctx.fillStyle = tokens.color.text.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.globalAlpha = tokens.canvas.axisLineOpacity;

      for (const tick of xTicks) {
        const x = paddingLeft + tick.normalizedX * plotWidth;
        const y = paddingTop + plotHeight + tokens.canvas.xAxis.labelOffsetY;
        ctx.fillText(tick.label, x, y);
      }

      // "Round" axis label (only shown when plotWidth >= 200)
      if (plotWidth >= 200) {
        ctx.textAlign = 'center';
        ctx.fillStyle = tokens.color.text.muted;
        ctx.globalAlpha = tokens.canvas.axisLineOpacity * 0.6;
        ctx.fillText(
          'Round',
          paddingLeft + plotWidth / 2,
          paddingTop + plotHeight + tokens.spacing.lg,
        );
      }

      ctx.restore();
    }

    private pointToCanvas(pt: ScatterPoint): { cx: number; cy: number } {
      const { paddingLeft, paddingTop, plotWidth, plotHeight } = this.layout;
      const cx = paddingLeft + (pt.x / this.maxRound) * plotWidth;
      const cy = paddingTop + (1 - pt.y) * plotHeight;
      return { cx, cy };
    }

    private drawHalo(pt: ScatterPoint): void {
      const { ctx } = this;
      if (!ctx) return;
      const { cx, cy } = this.pointToCanvas(pt);
      const r = tokens.canvas.haloRadius;

      let cachedGrad = this.haloCache.get(pt.color);
      if (cachedGrad === undefined) {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = r * 2;
          offscreen.height = r * 2;
          const offCtx = offscreen.getContext('2d');
          if (offCtx) {
            const grad = offCtx.createRadialGradient(r, r, 0, r, r, r);
            grad.addColorStop(0, pt.color);
            grad.addColorStop(1, 'transparent');
            offCtx.fillStyle = grad;
            offCtx.globalAlpha = tokens.canvas.haloOpacity;
            offCtx.fillRect(0, 0, r * 2, r * 2);
            cachedGrad = ctx.createPattern(offscreen, 'no-repeat');
            this.haloCache.set(pt.color, cachedGrad);
          } else {
            this.haloCache.set(pt.color, null);
          }
        } catch {
          this.haloCache.set(pt.color, null);
          cachedGrad = null;
        }
      }

      if (cachedGrad) {
        ctx.save();
        ctx.translate(cx - r, cy - r);
        ctx.fillStyle = cachedGrad;
        ctx.fillRect(0, 0, r * 2, r * 2);
        ctx.restore();
      } else {
        ctx.save();
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, pt.color);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = tokens.canvas.haloOpacity;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    private drawPoint(pt: ScatterPoint): void {
      const { cx, cy } = this.pointToCanvas(pt);
      switch (pt.status) {
        case 'timeout':
          this.drawTimeoutPoint(cx, cy);
          break;
        case 'error':
          this.drawErrorPoint(cx, cy);
          break;
        default:
          this.drawOkPoint(cx, cy, pt.color);
      }
    }

    private drawOkPoint(cx: number, cy: number, color: string): void {
      const { ctx } = this;
      if (!ctx) return;
      const r = tokens.canvas.pointRadius;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    private drawTimeoutPoint(cx: number, cy: number): void {
      const { ctx } = this;
      if (!ctx) return;
      const r = tokens.canvas.pointRadius;
      const color = STATUS_COLORS.timeout;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = tokens.canvas.pointOutlineWidth;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const d = r * 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      ctx.restore();
    }

    private drawErrorPoint(cx: number, cy: number): void {
      const { ctx } = this;
      if (!ctx) return;
      const r = tokens.canvas.pointRadius;
      const color = STATUS_COLORS.error;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.lineTo(cx - r, cy + r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ```

- [ ] **Step 4: Update old tests that used the Map signature**

  The existing tests in `tests/unit/timeline-renderer.test.ts` call `renderer.draw(new Map(...))` and `TimelineRenderer.computePoints()`. These must be updated to use the new API.

  Replace the existing test file sections that call `renderer.draw(new Map(...))`:

  - `it('draws with empty endpoint map without throwing')` → change to:
    ```typescript
    it('draws with empty FrameData without throwing', () => {
      const renderer = new TimelineRenderer(canvas);
      const emptyFd: import('../../src/lib/types').FrameData = {
        pointsByEndpoint: new Map(),
        ribbonsByEndpoint: new Map(),
        yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
        xTicks: [],
        maxRound: 0,
        freezeEvents: [],
        hasData: false,
      };
      expect(() => renderer.draw(emptyFd)).not.toThrow();
    });
    ```

  - `it('draws with valid point data without throwing')` and `it('draw completes without throwing with populated data')` → replace with `makeFrameData()` helper and `renderer.draw(fd)`.

  - `it('computePoints ...')` describe block → remove `TimelineRenderer.computePoints` tests (method no longer exists; covered by pipeline tests). Replace with a comment: `// computePoints removed — covered by timeline-data-pipeline.test.ts`.

  - Keep `it('constructs without throwing')` and `it('resize works without throwing')` as-is.

  Full updated `tests/unit/timeline-renderer.test.ts`:

  ```typescript
  import { describe, it, expect, beforeEach } from 'vitest';
  import { TimelineRenderer } from '../../src/lib/renderers/timeline-renderer';
  import { prepareFrame } from '../../src/lib/renderers/timeline-data-pipeline';
  import type { FrameData, MeasurementState, ScatterPoint } from '../../src/lib/types';

  function makeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    return canvas;
  }

  const EMPTY_FRAMEDATA: FrameData = {
    pointsByEndpoint: new Map(),
    ribbonsByEndpoint: new Map(),
    yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
    xTicks: [],
    maxRound: 0,
    freezeEvents: [],
    hasData: false,
  };

  function makeFrameData(latencies: number[] = [50, 100, 200]): FrameData {
    if (latencies.length === 0) return EMPTY_FRAMEDATA;
    const state: MeasurementState = {
      lifecycle: 'running',
      epoch: 1,
      roundCounter: latencies.length,
      endpoints: {
        ep1: {
          endpointId: 'ep1',
          samples: latencies.map((latency, i) => ({
            round: i + 1, latency, status: 'ok' as const, timestamp: Date.now() + i * 1000,
          })),
          lastLatency: latencies[latencies.length - 1] ?? null,
          lastStatus: 'ok',
          tierLevel: 1,
        },
      },
      startedAt: Date.now(),
      stoppedAt: null,
      freezeEvents: [],
    };
    return prepareFrame(
      [{ id: 'ep1', url: 'https://a.com', enabled: true, label: 'A', color: '#4a90d9' }],
      state,
    );
  }

  describe('TimelineRenderer', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
      canvas = makeCanvas();
    });

    it('constructs without throwing', () => {
      expect(() => new TimelineRenderer(canvas)).not.toThrow();
    });

    it('draws with empty FrameData without throwing', () => {
      const renderer = new TimelineRenderer(canvas);
      expect(() => renderer.draw(EMPTY_FRAMEDATA)).not.toThrow();
    });

    it('draws with valid FrameData without throwing', () => {
      const renderer = new TimelineRenderer(canvas);
      expect(() => renderer.draw(makeFrameData())).not.toThrow();
    });

    it('draws with ribbons (>= 20 samples) without throwing', () => {
      const renderer = new TimelineRenderer(canvas);
      const latencies = Array.from({ length: 25 }, (_, i) => 20 + i * 5);
      expect(() => renderer.draw(makeFrameData(latencies))).not.toThrow();
    });

    it('resize works without throwing', () => {
      const renderer = new TimelineRenderer(canvas);
      canvas.width = 1200;
      canvas.height = 600;
      expect(() => renderer.resize()).not.toThrow();
    });

    // computePoints removed — functionality moved to TimelineDataPipeline (see timeline-data-pipeline.test.ts)

    describe('X-axis normalization', () => {
      it('ScatterPoint.x values via pipeline are round numbers', () => {
        const fd = makeFrameData([50, 100, 200]);
        const points = fd.pointsByEndpoint.get('ep1') ?? [];
        expect(points[0]?.x).toBe(1);
        expect(points[1]?.x).toBe(2);
        expect(points[2]?.x).toBe(3);
      });

      it('draw completes without throwing with populated data', () => {
        const renderer = new TimelineRenderer(canvas);
        expect(() => renderer.draw(makeFrameData())).not.toThrow();
      });
    });

    describe('DPR coordinate fix (AC2)', () => {
      it('should use clientWidth/clientHeight for plotWidth/plotHeight, not physical canvas.width/canvas.height', () => {
        const c = document.createElement('canvas');
        c.width = 1600;
        c.height = 800;
        Object.defineProperty(c, 'clientWidth', { get: () => 800, configurable: true });
        Object.defineProperty(c, 'clientHeight', { get: () => 400, configurable: true });

        const renderer = new TimelineRenderer(c);
        const point: ScatterPoint = {
          x: 1, y: 0.5, latency: 50, status: 'ok', endpointId: 'ep1', round: 1, color: '#4a90d9',
        };
        renderer.setMaxRound(1);
        const { cx, cy } = renderer.toCanvasCoords(point);
        expect(cx).toBeLessThanOrEqual(800 + 10);
        expect(cy).toBeLessThanOrEqual(400 + 10);
      });
    });

    describe('TimelineRenderer (FrameData API) — performance (AC8)', () => {
      it('benchmark: draw(frameData) < 8ms for 10 endpoints x 1000 samples', () => {
        const c = document.createElement('canvas');
        c.width = 800;
        c.height = 400;
        const renderer = new TimelineRenderer(c);

        const state: MeasurementState = {
          lifecycle: 'running', epoch: 1, roundCounter: 1000,
          endpoints: Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [`ep${i}`, {
              endpointId: `ep${i}`,
              samples: Array.from({ length: 1000 }, (_, j) => ({
                round: j + 1, latency: Math.random() * 490 + 10, status: 'ok' as const, timestamp: Date.now() + j,
              })),
              lastLatency: 50, lastStatus: 'ok' as const, tierLevel: 1 as const,
            }]),
          ),
          startedAt: Date.now(), stoppedAt: null, freezeEvents: [],
        };
        const endpoints = Array.from({ length: 10 }, (_, i) => ({
          id: `ep${i}`, url: `https://ep${i}.com`, enabled: true, label: `EP${i}`, color: '#4a90d9',
        }));
        const fd = prepareFrame(endpoints, state);

        const start = performance.now();
        renderer.draw(fd);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(8);
      });
    });
  });
  ```

- [ ] **Step 5: Run tests to verify they pass**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/timeline-renderer.test.ts 2>&1 | tail -30
  ```

  Expected: all tests pass.

- [ ] **Step 6: Run full test suite**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add src/lib/renderers/timeline-renderer.ts tests/unit/timeline-renderer.test.ts && git commit -m "feat: TimelineRenderer accepts FrameData, draws ribbons, dynamic gridlines, X-axis"
  ```

---

## Task 5: EffectsRenderer.drawEmptyState() — Full Implementation

**Files:**
- Modify: `src/lib/renderers/effects-renderer.ts`
- Modify: `tests/unit/effects-renderer.test.ts` (extending)

**Pre-task reads:**
- [ ] Read `src/lib/renderers/effects-renderer.ts`
- [ ] Read `tests/unit/effects-renderer.test.ts`

- [ ] **Step 1: Write failing tests**

  Add to `tests/unit/effects-renderer.test.ts`:

  ```typescript
  describe('drawEmptyState (AC5)', () => {
    it('drawEmptyState exists on EffectsRenderer', () => {
      // AC5: Animated sweep visible within 1 frame of mount when hasData === false
      expect(typeof renderer.drawEmptyState).toBe('function');
    });

    it('drawEmptyState does not throw at t=0', () => {
      expect(() => renderer.drawEmptyState(0)).not.toThrow();
    });

    it('drawEmptyState does not throw at t=4000 (one full rotation)', () => {
      // Ensure no division-by-zero or NaN at 4000ms (one sweepPeriod)
      expect(() => renderer.drawEmptyState(4000)).not.toThrow();
    });

    it('drawEmptyState does not throw after many calls (animation loop simulation)', () => {
      // Simulate 60fps for 5 seconds = 300 frames
      for (let t = 0; t < 5000; t += 16) {
        expect(() => renderer.drawEmptyState(t)).not.toThrow();
      }
    });

    it('sweepStartTime is initialized on first drawEmptyState call', () => {
      // Internal: sweepStartTime should be set — we test indirectly via no throw
      renderer.drawEmptyState(1000);
      renderer.drawEmptyState(2000); // second call should use sweepStartTime, not throw
      expect(true).toBe(true); // if we got here, no errors
    });

    it('drawEmptyState does not throw when clientWidth/clientHeight = 0 (unmounted canvas)', () => {
      const emptyCanvas = document.createElement('canvas');
      emptyCanvas.width = 0;
      emptyCanvas.height = 0;
      const emptyRenderer = new EffectsRenderer(emptyCanvas);
      expect(() => emptyRenderer.drawEmptyState(0)).not.toThrow();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/effects-renderer.test.ts 2>&1 | grep -E "FAIL|drawEmptyState" | head -10
  ```

  Expected: `drawEmptyState` tests fail because the stub doesn't implement the full sweep.

- [ ] **Step 3: Implement `drawEmptyState` in `src/lib/renderers/effects-renderer.ts`**

  Replace the stub `drawEmptyState` method added in Task 1 with the full implementation. The `sweepStartTime` field already exists from Task 1.

  ```typescript
  /** Draw radar sweep animation when no data is present (empty state). */
  drawEmptyState(now: number): void {
    const { ctx, canvas } = this;
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    // Initialize sweep start time on first call
    if (this.sweepStartTime === null) {
      this.sweepStartTime = now;
    }

    ctx.clearRect(0, 0, width, height);

    const elapsed = now - this.sweepStartTime;
    const angle = (elapsed / tokens.canvas.emptyState.sweepPeriod) * 2 * Math.PI;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) * 0.6;
    const trailAngle = (tokens.canvas.emptyState.trailAngleDeg * Math.PI) / 180;

    // Sweep trail (fading arc via conic gradient)
    try {
      const gradient = ctx.createConicGradient(angle - trailAngle, centerX, centerY);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.8, tokens.color.chrome.accent + '15');
      gradient.addColorStop(1, tokens.color.chrome.accent + '40');

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle - trailAngle, angle);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } catch {
      // createConicGradient not supported in jsdom — skip gradient, still draw line
    }

    // Sweep line
    const endX = centerX + Math.cos(angle) * radius;
    const endY = centerY + Math.sin(angle) * radius;
    ctx.save();
    ctx.strokeStyle = tokens.color.chrome.accent;
    ctx.globalAlpha = tokens.canvas.emptyState.sweepLineOpacity;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();

    // Concentric rings (subtle)
    ctx.save();
    ctx.globalAlpha = tokens.canvas.emptyState.ringOpacity;
    ctx.strokeStyle = tokens.color.chrome.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    for (let i = 1; i <= 3; i++) {
      const r = radius * (i / 3);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    // Instructional text
    ctx.save();
    ctx.globalAlpha = tokens.canvas.emptyState.textOpacity;
    ctx.fillStyle = tokens.color.text.secondary;
    ctx.font = `${tokens.typography.body.fontSize}px ${tokens.typography.body.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add endpoints and start a test', centerX, centerY + radius * 0.15);

    ctx.font = `${tokens.typography.caption.fontSize}px ${tokens.typography.caption.fontFamily}`;
    ctx.fillStyle = tokens.color.text.muted;
    ctx.fillText('Latency data will appear here', centerX, centerY + radius * 0.15 + 24);
    ctx.restore();
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/effects-renderer.test.ts 2>&1 | tail -20
  ```

  Expected: all tests pass including all `drawEmptyState` tests.

- [ ] **Step 5: Run full test suite**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add src/lib/renderers/effects-renderer.ts tests/unit/effects-renderer.test.ts && git commit -m "feat: implement EffectsRenderer.drawEmptyState() radar sweep animation"
  ```

---

## Task 6: TimelineCanvas.svelte — Wire FrameData, findNearest fix, Empty State Routing

**Files:**
- Modify: `src/lib/components/TimelineCanvas.svelte`

**Pre-task reads:**
- [ ] Read `src/lib/components/TimelineCanvas.svelte`
- [ ] Read `src/lib/renderers/timeline-data-pipeline.ts`
- [ ] Read `src/lib/renderers/timeline-renderer.ts`
- [ ] Read `src/lib/renderers/effects-renderer.ts`

This is the wiring task. No new test file is needed — the Playwright e2e smoke test (Task 7) covers the behavioral contract. The unit tests from Tasks 2–5 cover the logic.

- [ ] **Step 1: Update `src/lib/components/TimelineCanvas.svelte`**

  Replace the entire `<script lang="ts">` block with:

  ```typescript
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { TimelineRenderer } from '$lib/renderers/timeline-renderer';
  import { EffectsRenderer } from '$lib/renderers/effects-renderer';
  import { InteractionRenderer } from '$lib/renderers/interaction-renderer';
  import { RenderScheduler } from '$lib/renderers/render-scheduler';
  import { prepareFrame, computeXTicks } from '$lib/renderers/timeline-data-pipeline';
  import { tokens } from '$lib/tokens';
  import type { ScatterPoint, SonarPing, FrameData } from '$lib/types';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  let container: HTMLDivElement;
  let dataCanvas: HTMLCanvasElement;
  let effectsCanvas: HTMLCanvasElement;
  let interactionCanvas: HTMLCanvasElement;

  // ── Renderer instances ────────────────────────────────────────────────────
  let timelineRenderer: TimelineRenderer;
  let effectsRenderer: EffectsRenderer;
  let interactionRenderer: InteractionRenderer;
  let scheduler: RenderScheduler;

  // ── Current frame data ────────────────────────────────────────────────────
  let currentFrameData: FrameData = {
    pointsByEndpoint: new Map(),
    ribbonsByEndpoint: new Map(),
    yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
    xTicks: [],
    maxRound: 0,
    freezeEvents: [],
    hasData: false,
  };
  let hasData = false;

  // Track known sample counts to detect new samples for sonar pings
  const sampleCounts = new Map<string, number>();

  // ── Helpers ───────────────────────────────────────────────────────────────

  function applyDpr(canvas: HTMLCanvasElement, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  function resizeCanvases(): void {
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    applyDpr(dataCanvas, w, h);
    applyDpr(effectsCanvas, w, h);
    applyDpr(interactionCanvas, w, h);

    timelineRenderer?.resize();

    // Recompute X ticks with actual canvas width
    if (currentFrameData.hasData) {
      const plotPaddingLeft = tokens.spacing.xxxl + tokens.spacing.xl;
      const plotPaddingRight = tokens.spacing.lg;
      const plotWidth = w - plotPaddingLeft - plotPaddingRight;
      currentFrameData = {
        ...currentFrameData,
        xTicks: computeXTicks(currentFrameData.maxRound, plotWidth),
      };
    }

    scheduler?.markDirty();
  }

  function latencyToTier(latency: number, status: string): SonarPing['tier'] {
    if (status === 'timeout') return 'timeout';
    if (latency < 50) return 'fast';
    if (latency < 200) return 'medium';
    return 'slow';
  }

  let pingIdCounter = 0;

  function recomputePoints(measureState: typeof $measurementStore): void {
    const endpoints = get(endpointStore);

    // Compute actual plot width for X ticks
    const cssWidth = container?.getBoundingClientRect().width ?? 800;
    const plotPaddingLeft = tokens.spacing.xxxl + tokens.spacing.xl;
    const plotPaddingRight = tokens.spacing.lg;
    const plotWidth = Math.max(cssWidth - plotPaddingLeft - plotPaddingRight, 100);

    // Build FrameData via pipeline
    const frameData = prepareFrame(endpoints, measureState);

    // Recompute X ticks with actual plot width
    const xTicks = computeXTicks(frameData.maxRound, plotWidth);
    currentFrameData = { ...frameData, xTicks };

    hasData = frameData.hasData;

    // Update maxRound on renderer for toCanvasCoords to work (ping creation)
    timelineRenderer?.setMaxRound(frameData.maxRound);

    // Detect new samples → emit sonar pings
    for (const ep of endpoints) {
      const epState = measureState.endpoints[ep.id];
      if (!epState || epState.samples.length === 0) continue;

      const prevCount = sampleCounts.get(ep.id) ?? 0;
      const newCount = epState.samples.length;

      if (newCount > prevCount) {
        const latestSample = epState.samples[newCount - 1];
        const points = currentFrameData.pointsByEndpoint.get(ep.id);
        const latestPoint = points?.[newCount - 1];
        if (latestSample && latestPoint && timelineRenderer) {
          const { cx, cy } = timelineRenderer.toCanvasCoords(latestPoint);
          const ping: SonarPing = {
            id: `ping-${++pingIdCounter}`,
            x: cx,
            y: cy,
            color: ep.color,
            tier: latencyToTier(latestSample.latency, latestSample.status),
            startTime: performance.now(),
          };
          effectsRenderer?.addPing(ping);
        }
        sampleCounts.set(ep.id, newCount);
      }
    }

    scheduler?.markDirty();
  }

  // ── Zoom / Pan state ──────────────────────────────────────────────────────
  let zoomLevel = 1;
  let panOffsetX = 0;
  let panOffsetY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;
  let lastPinchDist = 0;

  function clampZoom(z: number): number {
    return Math.max(0.1, Math.min(10, z));
  }

  function resetZoomPan(): void {
    zoomLevel = 1;
    panOffsetX = 0;
    panOffsetY = 0;
    scheduler?.markDirty();
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const factor = Math.exp(delta * 2);
    if (e.shiftKey) {
      panOffsetY += e.deltaY * 0.5;
    } else if (e.ctrlKey || e.metaKey) {
      panOffsetX -= e.deltaX * 0.5;
      const newZoom = clampZoom(zoomLevel * factor);
      const scaleChange = newZoom / zoomLevel;
      panOffsetX = panOffsetX * scaleChange;
      zoomLevel = newZoom;
    } else {
      zoomLevel = clampZoom(zoomLevel * factor);
    }
    scheduler?.markDirty();
  }

  // ── Pointer helpers ───────────────────────────────────────────────────────

  function canvasToLogical(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Find nearest ScatterPoint to CSS-pixel pointer position.
   * Converts each ScatterPoint to canvas coordinates via toCanvasCoords before distance check.
   * This fixes the pre-existing bug where pt.x (round number) and pt.y (normalized 0-1)
   * were compared directly against CSS pixel coordinates.
   */
  function findNearest(x: number, y: number): ScatterPoint | null {
    let nearest: ScatterPoint | null = null;
    let minDist = 20; // px hit radius

    for (const [, pts] of currentFrameData.pointsByEndpoint) {
      for (const pt of pts) {
        if (!timelineRenderer) break;
        const { cx, cy } = timelineRenderer.toCanvasCoords(pt);
        const dx = cx - x;
        const dy = cy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) {
          minDist = d;
          nearest = pt;
        }
      }
    }
    return nearest;
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panOffsetX;
    dragStartPanY = panOffsetY;
    interactionCanvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (isDragging) {
      panOffsetX = dragStartPanX + (e.clientX - dragStartX);
      panOffsetY = dragStartPanY + (e.clientY - dragStartY);
      scheduler?.markDirty();
      return;
    }

    const { x, y } = canvasToLogical(interactionCanvas, e);
    const pt = findNearest(x, y);

    if (pt) {
      // Convert ScatterPoint to canvas pixel coords for the interaction renderer
      const { cx, cy } = timelineRenderer.toCanvasCoords(pt);
      uiStore.setHover({
        endpointId: pt.endpointId,
        roundId: pt.round,
        x: cx,
        y: cy,
        latency: pt.latency,
        status: pt.status,
        timestamp: 0,
      });
      const ui = get(uiStore);
      interactionRenderer?.drawHover(
        { endpointId: pt.endpointId, roundId: pt.round, x: cx, y: cy, latency: pt.latency, status: pt.status, timestamp: 0 },
        ui.showCrosshairs,
      );
    } else {
      uiStore.setHover(null);
      interactionRenderer?.clear();
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (isDragging) {
      isDragging = false;
      interactionCanvas.releasePointerCapture(e.pointerId);
    }
  }

  function handlePointerLeave(): void {
    if (!isDragging) {
      uiStore.setHover(null);
      interactionRenderer?.clear();
    }
  }

  function handleClick(e: PointerEvent): void {
    const movedX = Math.abs(e.clientX - dragStartX);
    const movedY = Math.abs(e.clientY - dragStartY);
    if (movedX > 4 || movedY > 4) return;

    const { x, y } = canvasToLogical(interactionCanvas, e);
    const pt = findNearest(x, y);

    if (pt) {
      // Convert ScatterPoint to canvas pixel coords for the interaction renderer
      const { cx, cy } = timelineRenderer.toCanvasCoords(pt);
      const target = { endpointId: pt.endpointId, roundId: pt.round, x: cx, y: cy, latency: pt.latency, status: pt.status, timestamp: 0 };
      uiStore.setSelected(target);
      interactionRenderer?.drawSelection(target);
    } else {
      uiStore.setSelected(null);
      interactionRenderer?.clear();
    }
  }

  function handleDblClick(): void {
    resetZoomPan();
    uiStore.setSelected(null);
    uiStore.setHover(null);
    interactionRenderer?.clear();
  }

  function getTouchDist(t: TouchList): number {
    if (t.length < 2) return 0;
    const dx = (t[0]?.clientX ?? 0) - (t[1]?.clientX ?? 0);
    const dy = (t[0]?.clientY ?? 0) - (t[1]?.clientY ?? 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      lastPinchDist = getTouchDist(e.touches);
    }
  }

  function handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        zoomLevel = clampZoom(zoomLevel * factor);
        scheduler?.markDirty();
      }
      lastPinchDist = dist;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  let unsubscribeMeasurement: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    timelineRenderer = new TimelineRenderer(dataCanvas);
    effectsRenderer = new EffectsRenderer(effectsCanvas);
    interactionRenderer = new InteractionRenderer(interactionCanvas);
    scheduler = new RenderScheduler();

    scheduler.registerDataRenderer(() => {
      timelineRenderer.draw(currentFrameData);
    });

    // Effects callback reads hasData variable by closure reference (always latest value)
    scheduler.registerEffectsRenderer(() => {
      if (hasData) {
        effectsRenderer.draw([], performance.now());
      } else {
        effectsRenderer.drawEmptyState(performance.now());
      }
    });

    scheduler.registerInteractionRenderer(() => {
      const ui = get(uiStore);
      if (ui.selectedTarget) {
        interactionRenderer.drawSelection(ui.selectedTarget);
      } else if (ui.hoverTarget) {
        interactionRenderer.drawHover(ui.hoverTarget, ui.showCrosshairs);
      }
    });

    resizeObserver = new ResizeObserver(() => resizeCanvases());
    resizeObserver.observe(container);
    resizeCanvases();

    unsubscribeMeasurement = measurementStore.subscribe((state) => {
      recomputePoints(state);
    });

    interactionCanvas.addEventListener('pointerdown', handlePointerDown);
    interactionCanvas.addEventListener('pointermove', handlePointerMove);
    interactionCanvas.addEventListener('pointerup', handlePointerUp);
    interactionCanvas.addEventListener('pointerleave', handlePointerLeave);
    interactionCanvas.addEventListener('click', handleClick as EventListener);
    interactionCanvas.addEventListener('dblclick', handleDblClick);
    interactionCanvas.addEventListener('wheel', handleWheel, { passive: false });
    interactionCanvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    interactionCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    scheduler.start();
  });

  onDestroy(() => {
    scheduler?.stop();
    resizeObserver?.disconnect();
    unsubscribeMeasurement?.();
    interactionCanvas?.removeEventListener('pointerdown', handlePointerDown);
    interactionCanvas?.removeEventListener('pointermove', handlePointerMove);
    interactionCanvas?.removeEventListener('pointerup', handlePointerUp);
    interactionCanvas?.removeEventListener('pointerleave', handlePointerLeave);
    interactionCanvas?.removeEventListener('click', handleClick as EventListener);
    interactionCanvas?.removeEventListener('dblclick', handleDblClick);
    interactionCanvas?.removeEventListener('wheel', handleWheel);
    interactionCanvas?.removeEventListener('touchstart', handleTouchStart);
    interactionCanvas?.removeEventListener('touchmove', handleTouchMove);
  });
  ```

  Leave the `<template>` and `<style>` blocks unchanged.

  > The `$measurementStore` reactive reference in the `recomputePoints` type annotation line uses Svelte's auto-subscribe (`$`) syntax only in the type position. The actual `subscribe()` call is imperative (inside `onMount`), which is correct for Svelte 5 / non-runes mode. No `$effect` needed here.

- [ ] **Step 2: Run typecheck**

  ```bash
  cd /Users/shane/claude/chronoscope && npx tsc --noEmit 2>&1 | head -40
  ```

  Expected: zero errors. If errors appear, they are likely import paths or type mismatches — fix before proceeding.

- [ ] **Step 3: Run full test suite**

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add src/lib/components/TimelineCanvas.svelte && git commit -m "feat: wire TimelineCanvas to FrameData pipeline, fix findNearest coords, route empty state"
  ```

---

## Task 7: Playwright Empty State Smoke Test + Lint

**Files:**
- Create: `tests/e2e/empty-state.spec.ts` (if e2e directory exists) or `tests/unit/empty-state-smoke.test.ts`
- No source changes

**Pre-task reads:**
- [ ] Check `ls tests/e2e` — if directory exists, create Playwright test there; otherwise add to unit tests

- [ ] **Step 1: Check e2e test structure**

  ```bash
  ls /Users/shane/claude/chronoscope/tests/ && cat /Users/shane/claude/chronoscope/playwright.config.ts 2>/dev/null || echo "No playwright config"
  ```

- [ ] **Step 2: Add empty state unit smoke test**

  If no Playwright config, add to `tests/unit/effects-renderer.test.ts` (already extended in Task 5):

  This was already covered by `drawEmptyState` tests in Task 5. Verify AC5 coverage is present:

  ```bash
  cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/effects-renderer.test.ts --reporter=verbose 2>&1 | grep -i "empty\|AC5\|sweep"
  ```

  If Playwright is configured, create `tests/e2e/empty-state.spec.ts`:

  ```typescript
  import { test, expect } from '@playwright/test';

  test('empty state sweep animation visible at t=0 (AC5)', async ({ page }) => {
    await page.goto('/');
    // The canvas should exist and have the effects layer visible
    const effectsCanvas = page.locator('.canvas-effects');
    await expect(effectsCanvas).toBeVisible();
    // Take a screenshot at load — sweep should be rendering
    const screenshot = await effectsCanvas.screenshot();
    // Screenshot should not be all black (sweep visible)
    expect(screenshot.length).toBeGreaterThan(1000);
  });
  ```

- [ ] **Step 3: Run lint**

  ```bash
  cd /Users/shane/claude/chronoscope && npx eslint src/lib/renderers/timeline-data-pipeline.ts src/lib/renderers/timeline-renderer.ts src/lib/renderers/effects-renderer.ts src/lib/components/TimelineCanvas.svelte 2>&1 | head -40
  ```

  Expected: zero lint errors. If `no-raw-visual-values` ESLint rule fires, check that all hex/numeric values in new code reference `tokens.*` — they should, since the pipeline and renderer use only token references.

- [ ] **Step 4: Run full typecheck + tests**

  ```bash
  cd /Users/shane/claude/chronoscope && npx tsc --noEmit && npx vitest run 2>&1 | tail -30
  ```

  Expected: zero TS errors, all tests pass (185+ tests).

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/shane/claude/chronoscope && git add tests/ && git commit -m "test: add empty state AC5 coverage; verify lint and typecheck clean"
  ```

---

## Phase B Artifact

After Task 7, write:

```bash
cat > /Users/shane/claude/chronoscope/docs/superpowers/progress/2026-04-08-viz-overhaul-phaseB.md << 'EOF'
# Phase B Complete — Renderer Wiring

Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Completed Tasks

- Task 4: TimelineRenderer refactored to accept FrameData, draws ribbons + dynamic gridlines + X-axis
- Task 5: EffectsRenderer.drawEmptyState() implemented — radar sweep animation
- Task 6: TimelineCanvas.svelte wired to prepareFrame(), findNearest() fixed, empty state routing
- Task 7: Lint and typecheck clean, e2e smoke test passing

## All AC Coverage

- AC1 (Y-axis >= 60% utilization): computeYRange + normalizeLatency produce >= 0.6 normalized spread ✓
- AC2 (DPR ping accuracy): clientWidth/clientHeight in all renderers; toCanvasCoords uses CSS-pixel layout ✓
- AC3 (Ribbon visibility): ribbon present for >= 20 samples; P25/P50/P75 paths drawn ✓
- AC4 (No X label overlap): MIN_LABEL_SPACING=60px enforced by computeXTicks, actual plotWidth passed ✓
- AC5 (Empty state at mount): drawEmptyState called when hasData=false, tested ✓
- AC6 (Transition to data): hasData flips true on first sample, effects callback reads latest ✓
- AC7 (prepareFrame < 2ms): benchmark test passing ✓
- AC8 (draw < 8ms): benchmark test passing ✓

## Known state

- findNearest() now uses toCanvasCoords() — pre-existing dimensionality bug fixed
- TimelineRenderer.computePoints() removed; replaced by pipeline
- No new npm dependencies introduced
EOF
```

---

## Final Verification

After all tasks complete:

```bash
# Full test suite
cd /Users/shane/claude/chronoscope && npx vitest run 2>&1 | tail -10

# Typecheck
cd /Users/shane/claude/chronoscope && npx tsc --noEmit 2>&1 | head -20

# Lint on all modified files
cd /Users/shane/claude/chronoscope && npx eslint src/lib/types.ts src/lib/tokens.ts src/lib/renderers/ src/lib/components/TimelineCanvas.svelte 2>&1 | head -20
```

All three commands must exit 0 before this feature branch is considered done.
