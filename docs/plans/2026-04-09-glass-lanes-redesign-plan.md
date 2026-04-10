# Glass Lanes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Replace the sidebar+chart+heatmap layout with a full-width lanes UI — one glass card per endpoint, each with an SVG scatter chart, a cross-lane hover system, and the complete Glass visual language (Sora + Martian Mono, deep purple-navy background, animated orbs, frosted glass cards).

**Architecture:** Each enabled endpoint renders as an independent lane row. The lane holds a 250 px left panel (hero P50, stats grid) and a flex-1 SVG chart area. A single global `mousemove` handler on the lanes container drives a positioned hover line + frosted tooltip. The Canvas 2D renderer, EffectsRenderer, and RenderScheduler are retired; the SVG per lane subscribes to the same `timeline-data-pipeline` FrameData.

**Tech Stack:** Svelte 5 (runes), TypeScript ~6.0.2, SVG (inline, scoped), Vitest ^4.1.3, Vite 8. Google Fonts (Sora, Martian Mono) loaded via `<link>` in `index.html`.

> **Convention — Block #5/#6 (enforced):** Every raw color/opacity value in component `<style>` blocks MUST use CSS custom properties set from `tokens.ts`. No raw hex, rgba, or numeric opacity values in scoped styles. The only file permitted to contain raw `#rrggbb`, `rgba()`, or `opacity: 0.N` values is `src/lib/tokens.ts`. Components reference `var(--glass-bg)`, `var(--glass-border)`, etc. The ESLint `no-raw-visual-values` rule enforces this.

---

## CRITICAL READS BEFORE YOU START

Read EVERY file listed below before writing any code. These are the files this plan modifies or depends on. Read them to understand current structure, imports, exports, and patterns.

Key files to read:
- `src/lib/tokens.ts` — current design token system; Glass tokens are ADDED alongside existing tokens (additive, not a rewrite)
- `src/lib/components/Layout.svelte` — sidebar+viz layout being restructured to topbar+lanes+footer
- `src/lib/components/TimelineCanvas.svelte` — three-canvas renderer being retired
- `src/lib/components/App.svelte` — root component; bridgeTokensToCss() must be updated
- `src/lib/components/VisualizationArea.svelte` — wrapper being removed
- `src/lib/components/SummaryCards.svelte` + `SummaryCard.svelte` — stats absorbed into lane panels
- `src/lib/components/HeatmapCanvas.svelte` — removed from primary view
- `src/lib/components/Header.svelte` — replaced by Topbar
- `src/lib/components/Controls.svelte` — absorbed into Topbar
- `src/lib/renderers/timeline-data-pipeline.ts` — stays, output consumed by SVG lane
- `src/lib/renderers/timeline-renderer.ts` — Canvas renderer being retired
- `src/lib/renderers/effects-renderer.ts` — sonar ping effects being removed
- `src/lib/renderers/render-scheduler.ts` — rAF scheduler being retired
- `src/lib/stores/measurements.ts` — stays unchanged
- `src/lib/stores/endpoints.ts` — stays unchanged
- `src/lib/stores/ui.ts` — hover shape changes; needs new cross-lane hover state
- `src/app.css` — global styles being overhauled
- `src/lib/types.ts` — needs new lane-specific types
- `tests/unit/timeline-renderer.test.ts` — must be updated after renderer is retired
- `tests/unit/render-scheduler.test.ts` — must be updated after scheduler is retired

---

## PHASE 0 — Acceptance Criteria (extracted from v3-glass.html + research brief)

These ACs drive the test suite written in Phase 4.

| AC # | Criterion | Maps to |
|------|-----------|---------|
| AC-1 | Background is deep purple-navy `#0c0a14` with animated gradient and 3 floating blurred orbs | Task 2 |
| AC-2 | Fonts are Sora (display) and Martian Mono (data); no Inter or JetBrains Mono remain in the Glass UI | Task 1 |
| AC-3 | Topbar is 54 px tall, frosted glass, shows "Sonde" with cyan→pink gradient text, a green pulse dot, round counter, and frosted-glass buttons | Task 4 |
| AC-4 | Each enabled endpoint renders exactly one full-width lane card, border-radius 18 px, glass background, top-edge highlight | Task 5 |
| AC-5 | Lane left panel is 250 px wide, shows URL in mono 11 px, hero P50 in 54 px weight-200 in the endpoint color, "P50 Median Latency" label, and a 4-column stats grid (P95, P99, Jitter, Loss) | Task 5 |
| AC-6 | SVG chart area renders horizontal gridlines, scatter dots at radius 3 px, P25–P75 ribbon fill, dashed P50 median line, trace line, "now" pulse with expanding ring | Task 6 |
| AC-7 | Empty state (no data) shows subtle grid lines and "Waiting for data" text centered in the chart area | Task 11 |
| AC-8 | Cross-lane hover: global mousemove on the lanes container shows a vertical gradient line spanning all lanes at the mouse X position | Task 7 |
| AC-9 | Hover tooltip shows round number, per-endpoint dots + values in endpoint color, and a comparative insight ("X is 2.4× faster") | Task 7 |
| AC-10 | X-axis bar below lanes shows round numbers; future rounds are dimmed with `color: var(--t4)` | Task 8 |
| AC-11 | Footer bar shows "Measuring from your browser", interval + timeout config, and progress ("N of M complete · K errors") | Task 9 |
| AC-12 | HeatmapCanvas, EffectsRenderer (sonar pings), glow halos, radar sweep, SummaryCards panel are not rendered in the primary view | Task 10 |
| AC-13 | Hover line does not activate when mouse is over the left panel (x < 260 px from lane left edge) | Task 7 |
| AC-14 | `tokens.ts` exports `glass` color group and all Glass-palette primitives; old legacy token groups are preserved alongside new ones (additive); no `ink*` tokens needed by new Glass components | Task 1 |
| AC-15 | Svelte scoped styles reference CSS custom properties from tokens; no raw hex/rgba appear outside `tokens.ts` | All tasks |

---

## PHASE 1 — Research Brief Alignment

**Chosen direction:** Glass aesthetic with Lanes layout (locked 2026-04-09).
**Design source of truth:** `design-concepts/v3-glass.html`

**THE BET:** SVG per lane replaces the single shared Canvas 2D. The assumption is that SVG performs adequately for up to 1 000 data points per lane with real-time updates at 1 Hz. Each lane owns one `<svg>` that is fully re-rendered on every store update. If this bet proves wrong at scale, the migration path is to replace the SVG `<g>` elements with a single `<canvas>` per lane, keeping the lane card structure intact.

**What is removed:**
- `TimelineRenderer` (Canvas 2D)
- `EffectsRenderer` (sonar pings, glow halos)
- `InteractionRenderer` (crosshair canvas)
- `RenderScheduler` (rAF loop)
- `HeatmapCanvas` (primary view)
- `SummaryCards` / `SummaryCard` (absorbed into lane panel)
- `VisualizationArea` (replaced by `LanesView`)
- `Header` / `Controls` (replaced by `Topbar`)

**What is kept:**
- `timeline-data-pipeline.ts` — `prepareFrame()` + `computeXTicks()` still used; output now feeds SVG lane
- All stores (`measurements`, `endpoints`, `ui`, `settings`, `statistics`)
- `MeasurementEngine` — unchanged
- Persistence, share, shortcuts utilities — unchanged

---

## PHASE 2 — File Map

### New files created
```
src/lib/components/Topbar.svelte
src/lib/components/LanesView.svelte
src/lib/components/Lane.svelte
src/lib/components/LaneSvgChart.svelte
src/lib/components/XAxisBar.svelte
src/lib/components/FooterBar.svelte
src/lib/components/CrossLaneHover.svelte
tests/unit/lane-svg-chart.test.ts
tests/unit/cross-lane-hover.test.ts
```

### Files modified in place
```
src/lib/tokens.ts              — additive: new Glass token groups added alongside existing; no groups removed
src/app.css                    — Glass CSS overhaul
src/lib/types.ts               — add LaneHoverState, LaneSvgPoint
src/lib/stores/ui.ts           — add laneHoverRound + laneHoverX state
src/lib/components/App.svelte  — update bridgeTokensToCss(), swap Layout imports
src/lib/components/Layout.svelte — replace with topbar+lanes+xaxis+footer grid
```

### Files retired (kept in repo but no longer imported)
```
src/lib/components/TimelineCanvas.svelte
src/lib/components/VisualizationArea.svelte
src/lib/components/SummaryCards.svelte
src/lib/components/SummaryCard.svelte
src/lib/components/Header.svelte
src/lib/components/Controls.svelte
src/lib/components/HeatmapCanvas.svelte
src/lib/components/Legend.svelte
src/lib/renderers/effects-renderer.ts
src/lib/renderers/render-scheduler.ts
src/lib/renderers/timeline-renderer.ts
src/lib/renderers/interaction-renderer.ts
```

### Test files modified
```
tests/unit/timeline-renderer.test.ts  — updated to "renderer retired" smoke test
tests/unit/render-scheduler.test.ts   — updated to "scheduler retired" smoke test
```

---

## PHASE 3 — Phase Segmentation

**Phase A — Foundation** (Tasks 1–3): Tokens, global CSS, types/store additions. No component changes; app still runs on old layout.

**Phase B — Shell** (Tasks 4–5): Topbar + Lane card (static, no SVG chart yet). Old layout still wired; new components exist in parallel.

**Phase C — Chart** (Tasks 6–8): SVG chart, X-axis bar. SVG rendering live. At this point lanes render real data.

**Phase D — Interaction + Chrome** (Tasks 7, 9): Cross-lane hover + footer. Full interactive experience.

**Phase E — Layout Wiring** (Task 10): Swap Layout.svelte to use new components. Old components retired. App renders Glass Lanes end-to-end.

**Phase F — Cleanup + Tests** (Tasks 11–12): Empty state, test updates, verification.

Phases A–B are safe to run without any visible regression (old layout is unchanged). Phase E is the cutover boundary.

---

## PHASE 4 — Plan Document

---

## Task 1 — Extend tokens.ts with Glass palette (ADDITIVE)

> **IMPORTANT — Block #1/#2/#10 fix:** This task ADDS new token groups alongside the existing ones. Do NOT remove any existing groups (`color.surface`, `color.latency`, `color.text`, `color.chrome`, `color.status`, `color.tier2`, `color.util`, `color.endpoint`, `typography.*`, `canvas.*`, `spacing.*`, `timing.*`, `easing.*`). Existing tests must continue to pass. New components reference the new token paths; old components (Settings, Share, engine) continue to use the old ones unchanged.

**Why first:** Every subsequent task derives CSS custom properties from tokens. All glass-surface, font, and accent values must be defined before any component references them.

Pre-task reads:
- [ ] Read `src/lib/tokens.ts`

### Step 1.1 — Write failing test

Create `tests/unit/tokens.test.ts` addition (add at the end of the existing file — read it first to see current tests):

```typescript
// Append to tests/unit/tokens.test.ts

import { describe, it, expect } from 'vitest';
import { tokens } from '../../src/lib/tokens';

describe('Glass token additions', () => {
  it('exports glass color group', () => {
    expect(tokens.color.glass).toBeDefined();
    expect(tokens.color.glass.bg).toBe('rgba(255,255,255,.03)');
    expect(tokens.color.glass.border).toBe('rgba(255,255,255,.07)');
    expect(tokens.color.glass.highlight).toBe('rgba(255,255,255,.12)');
  });

  it('exports glass typography fonts', () => {
    expect(tokens.typography.sans.fontFamily).toContain('Sora');
    expect(tokens.typography.mono.fontFamily).toContain('Martian Mono');
  });

  it('exports glass background base color', () => {
    expect(tokens.color.surface.base).toBe('#0c0a14');
  });

  it('exports glass accent colors', () => {
    expect(tokens.color.accent.cyan).toBe('#67e8f9');
    expect(tokens.color.accent.pink).toBe('#f9a8d4');
    expect(tokens.color.accent.green).toBe('#86efac');
  });

  it('exports text opacity tokens (t1–t5)', () => {
    expect(tokens.color.text.t1).toBe('rgba(255,255,255,.94)');
    expect(tokens.color.text.t2).toBe('rgba(255,255,255,.58)');
    expect(tokens.color.text.t3).toBe('rgba(255,255,255,.3)');
    expect(tokens.color.text.t4).toBe('rgba(255,255,255,.14)');
    expect(tokens.color.text.t5).toBe('rgba(255,255,255,.07)');
  });
});
```

Run — confirm it fails:
```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/tokens.test.ts
```
Expected: `tokens.color.glass is not defined`.

### Step 1.2 — Add Glass token groups to tokens.ts

**Read `src/lib/tokens.ts` first.** Then ADD the following new top-level groups and primitives to the existing `tokens` export object. Do not remove or rename any existing property. Insert each new group after the last existing group in its section:

- Add `color.glass` (frosted surface values)
- Add `color.lane`, `color.topbar`, `color.footer`, `color.tooltip`, `color.svg`, `color.orb` groups
- Add `color.accent` (cyan/pink/green variants)
- Update `color.surface.base` to `'#0c0a14'` if it differs (the deep purple-navy base)
- Update `typography.sans.fontFamily` to include `'Sora'` and `typography.mono.fontFamily` to include `'Martian Mono'`
- Add Glass-specific `lane` layout constants under a new `tokens.lane` group
- Keep all existing groups intact; add a `// Legacy tokens below — kept for non-Glass consumers; remove in Phase F cleanup` comment above the first preserved legacy group

The following new Glass surface tokens must be added to `color.glass` (these exact values are required by AC-15 and Block #5/#6 — all component `<style>` blocks must reference CSS custom properties set from these, not raw hex/rgba):

```typescript
glass: {
  bg:          'rgba(255,255,255,.03)',
  bgStrong:    'rgba(255,255,255,.045)',
  bgHover:     'rgba(255,255,255,.07)',
  border:      'rgba(255,255,255,.07)',
  borderHover: 'rgba(255,255,255,.12)',
  highlight:   'rgba(255,255,255,.12)',
  shadow:      'rgba(0,0,0,.15)',
  shadowStrong: 'rgba(0,0,0,.5)',
},
```

The full set of new token groups to add is shown below for reference. These replace the `glass`, `lane`, `topbar`, `footer`, `tooltip`, `svg`, `orb`, and `accent` entries shown in the code block that follows — but the existing `color.status`, `color.chrome`, `color.text.*` (primary/secondary/muted aliases), and all `canvas.*` entries must be preserved.

The code block below shows only the NEW additions to merge in:

```typescript
// src/lib/tokens.ts
// Design token system: primitive → semantic → component
// This is the ONLY file permitted to contain raw hex/rgba/px/duration values.
// ESLint enforces this via no-restricted-syntax (no-raw-visual-values rule).
// Glass Lanes visual language — locked 2026-04-09.

// ── Primitive tokens ───────────────────────────────────────────────────────
const primitive = {
  // Background
  bgBase: '#0c0a14',
  bgMid:  '#100e1e',
  bgDeep: '#0e0c18',

  // Text opacity layers (rgba white)
  t1: 'rgba(255,255,255,.94)',
  t2: 'rgba(255,255,255,.58)',
  t3: 'rgba(255,255,255,.3)',
  t4: 'rgba(255,255,255,.14)',
  t5: 'rgba(255,255,255,.07)',

  // Accent
  cyan:       '#67e8f9',
  cyanBright: '#a5f3fc',
  cyan40:     'rgba(103,232,249,.4)',
  cyan20:     'rgba(103,232,249,.2)',
  cyan12:     'rgba(103,232,249,.12)',
  cyan06:     'rgba(103,232,249,.06)',

  pink:       '#f9a8d4',
  pinkBright: '#fbcfe8',
  pink40:     'rgba(249,168,212,.4)',
  pink20:     'rgba(249,168,212,.2)',
  pink12:     'rgba(249,168,212,.12)',
  pink06:     'rgba(249,168,212,.06)',

  green:     '#86efac',
  greenGlow: 'rgba(134,239,172,.5)',

  // Glass surfaces
  glassBg:        'rgba(255,255,255,.025)',
  glassBorder:    'rgba(255,255,255,.06)',
  glassHighlight: 'rgba(255,255,255,.12)',

  // Lane surface (slightly darker glass)
  laneBg:     'rgba(255,255,255,.025)',
  laneBorder: 'rgba(255,255,255,.06)',

  // Topbar
  topbarBg:     'rgba(255,255,255,.025)',
  topbarBorder: 'rgba(255,255,255,.07)',

  // Footer
  footerBg: 'rgba(255,255,255,.02)',

  // Tooltip
  tooltipBg: 'rgba(20,16,32,.85)',

  // Endpoint color palette (10 slots; cyan/pink are assigned in order then cycle)
  ep0: '#67e8f9',   // cyan
  ep1: '#f9a8d4',   // pink
  ep2: '#86efac',   // green
  ep3: '#fcd34d',   // amber
  ep4: '#c4b5fd',   // violet
  ep5: '#6ee7b7',   // emerald
  ep6: '#fda4af',   // rose
  ep7: '#7dd3fc',   // sky
  ep8: '#d9f99d',   // lime
  ep9: '#e9d5ff',   // purple

  // Data viz
  gridLine: 'rgba(255,255,255,.03)',
  futureZone: 'rgba(255,255,255,.018)',
  nowDotCyan: '#a5f3fc',
  nowDotPink: '#fbcfe8',
  thresholdStroke: '#f9a8d4',

  // Orb layers (for App.svelte CSS)
  orbCyan:   'rgba(103,232,249,.045)',
  orbPink:   'rgba(249,168,212,.04)',
  orbViolet: 'rgba(139,92,246,.03)',
} as const;

// ── Semantic tokens ────────────────────────────────────────────────────────
export const tokens = {
  color: {
    surface: {
      base:    primitive.bgBase,
      mid:     primitive.bgMid,
      deep:    primitive.bgDeep,
    },

    text: {
      t1: primitive.t1,
      t2: primitive.t2,
      t3: primitive.t3,
      t4: primitive.t4,
      t5: primitive.t5,
      // Legacy aliases used by non-Glass components (persistence layer, share, engine)
      primary:   primitive.t1,
      secondary: primitive.t2,
      muted:     primitive.t3,
    },

    accent: {
      cyan:       primitive.cyan,
      cyanBright: primitive.cyanBright,
      cyan40:     primitive.cyan40,
      cyan20:     primitive.cyan20,
      cyan12:     primitive.cyan12,
      cyan06:     primitive.cyan06,
      pink:       primitive.pink,
      pinkBright: primitive.pinkBright,
      pink40:     primitive.pink40,
      pink20:     primitive.pink20,
      pink12:     primitive.pink12,
      pink06:     primitive.pink06,
      green:      primitive.green,
      greenGlow:  primitive.greenGlow,
    },

    glass: {
      bg:        primitive.glassBg,
      border:    primitive.glassBorder,
      highlight: primitive.glassHighlight,
    },

    lane: {
      bg:     primitive.laneBg,
      border: primitive.laneBorder,
    },

    topbar: {
      bg:     primitive.topbarBg,
      border: primitive.topbarBorder,
    },

    footer: {
      bg: primitive.footerBg,
    },

    tooltip: {
      bg: primitive.tooltipBg,
    },

    svg: {
      gridLine:        primitive.gridLine,
      futureZone:      primitive.futureZone,
      nowDotCyan:      primitive.nowDotCyan,
      nowDotPink:      primitive.nowDotPink,
      thresholdStroke: primitive.thresholdStroke,
    },

    orb: {
      cyan:   primitive.orbCyan,
      pink:   primitive.orbPink,
      violet: primitive.orbViolet,
    },

    endpoint: [
      primitive.ep0, primitive.ep1, primitive.ep2, primitive.ep3, primitive.ep4,
      primitive.ep5, primitive.ep6, primitive.ep7, primitive.ep8, primitive.ep9,
    ] as readonly string[],

    // Legacy chrome group — referenced by Settings/Share drawers which are not redesigned in this phase
    chrome: {
      border:      'rgba(255,255,255,.07)',
      borderHover: 'rgba(255,255,255,.12)',
      borderFocus: primitive.cyan,
      accent:      primitive.cyan,
      accentHover: primitive.cyanBright,
    },

    // Legacy status colors — referenced by measurement engine and worker
    status: {
      timeout: '#9b5de5',
      error:   '#c77dff',
      offline: '#7b2cbf',
      success: primitive.green,
      idle:    '#4a5568',
    },
  },

  typography: {
    sans: {
      fontFamily: "'Sora', system-ui, sans-serif",
      weights: { thin: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
    },
    mono: {
      fontFamily: "'Martian Mono', monospace",
      weights: { thin: 200, light: 300, regular: 400, medium: 500 },
    },
    // Scale
    heroSize:   54,
    heroWeight: 200,
    statSize:   14,
    statWeight: 300,
    labelSize:  9,
    labelWeight: 300,
    urlSize:    11,
    urlWeight:  300,
    bodySize:   14,
    bodyWeight: 400,
  },

  spacing: {
    xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
  },

  radius: {
    sm:   8,
    md:  12,
    lg:  18,   // lane cards
    btn: 10,   // buttons
  },

  timing: {
    // Glass animations
    bgShift:       20000,
    orbFloat:      15000,
    pulse:          2000,
    nowRing:        2000,
    hoverLine:        80,
    hoverTip:        100,
    // Generic
    fadeIn:          200,
    btnHover:        200,
    domThrottle:     100,
    copiedFeedback: 2000,
    // Legacy — timeline-data-pipeline.ts and statistics store still reference these
    progressiveDisclosure: 250,
    sonarPingFast: 300,
    sonarPingMedium: 500,
    sonarPingSlow: 800,
    sonarPingTimeout: 1200,
  },

  easing: {
    decelerate:         'cubic-bezier(0.0, 0.0, 0.2, 1)',
    decelerateSlow:     'cubic-bezier(0.0, 0.0, 0.4, 1)',
    decelerateVerySlow: 'cubic-bezier(0.0, 0.0, 0.6, 1)',
    standard:           'cubic-bezier(0.4, 0.0, 0.2, 1)',
    spring:             'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  easingFn: {
    decelerate: (t: number): number => 1 - Math.pow(1 - t, 3),
    standard:   (t: number): number => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  },

  shadow: {
    low:  '0 2px 8px rgba(0,0,0,.4)',
    high: '0 8px 32px rgba(0,0,0,.6)',
    lane: '0 4px 30px rgba(0,0,0,.15)',
  },

  // Lane layout constants
  lane: {
    panelWidth:    250,   // px — left panel fixed width
    gapPx:           8,   // gap between lane cards
    paddingX:       10,   // horizontal padding of lanes container
    paddingY:        8,   // top padding of lanes container
    chartPaddingX:  18,   // left/right padding inside SVG chart area
    chartPaddingY:  12,   // top/bottom
    dotRadius:       3,
    dotRadiusHover:  5.5,
    nowDotRadius:    4,
    ringInitialR:    7,
    ringFinalR:     14,
    topbarHeight:   54,
    xAxisHeight:    30,
    footerHeight:   38,
  },

  // Kept for timeline-data-pipeline.ts (still used by LaneSvgChart)
  canvas: {
    yAxis: {
      rollingWindowSize:   20,
      percentileClampLow:   2,
      percentileClampHigh: 98,
      logScaleThreshold:   50,
      linearHeadroomPct:  0.2,
      minHeadroomMs:        5,
      minVisibleRangeMs:   10,
      targetGridlineCount:  5,
    },
    xAxis: {
      minLabelSpacing: 60,
      labelOffsetY:     4,
      paddingBottom:   32,
    },
    ribbon: {
      fillOpacity:     0.15,
      medianOpacity:   0.6,
      medianLineWidth: 1.5,
      medianLineDash:  [4, 4] as readonly number[],
    },
    // Legacy — retained so effects-renderer.ts compiles without errors
    sonarPing: {
      fast:    { initialRadius: 3, finalRadius: 12, maxConcurrent: 5 },
      medium:  { initialRadius: 3, finalRadius: 20, maxConcurrent: 5 },
      slow:    { initialRadius: 3, finalRadius: 32, maxConcurrent: 3 },
      timeout: { initialRadius: 3, finalRadius: 48, maxConcurrent: 1 },
    },
    pointRadius:      4,
    pointRadiusHover: 6,
    pointOutlineWidth: 1.5,
    gridLineDash:     [4, 8] as readonly number[],
    gridLineOpacity:  0.3,
    axisLineOpacity:  0.6,
    sweepLineOpacity: 0.15,
    sweepLineGlowWidth: 4,
    heatmapCellSize:  8,
    haloRadius:      16,
    haloOpacity:     0.3,
    emptyState: {
      sweepPeriod:     4000,
      sweepLineOpacity: 0.25,
      ringOpacity:     0.08,
      textOpacity:     0.5,
      trailAngleDeg:   60,
    },
  },

  breakpoints: { mobile: 375, tablet: 768, desktop: 1024, wide: 1440 },
} as const;

export type Tokens = typeof tokens;
```

### Step 1.3 — Verify tests pass

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/tokens.test.ts
```
Expected: all tests green (including the new Glass additions AND all pre-existing token tests — nothing removed means no regressions). Also verify the full unit suite:
```bash
npx vitest run tests/unit/
```
No regressions in `no-raw-visual-values.test.ts`, `types.test.ts`, or any other existing token test.

---

## Task 2 — Overhaul app.css and index.html

**Why before components:** Components reference CSS custom properties and font families set here.

> **Advisory A1 fix — `prefers-reduced-motion`:** After all animation blocks in `app.css`, add a `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` on `.bg`, `.orb`, and `.pulse-dot`. Users who have requested reduced motion must not see the orb floats or the background `hue-rotate` animation. Example:
>
> ```css
> @media (prefers-reduced-motion: reduce) {
>   .bg { animation: none; }
>   .orb { animation: none; }
>   .pulse-dot { animation: none; }
> }
> ```
>
> This block should be added to `app.css` (global) and also in `Layout.svelte`'s `<style>` block since `.bg`, `.orb`, and `.orb-1/2/3` are defined there.

Pre-task reads:
- [ ] Read `src/app.css`
- [ ] Read `index.html`

### Step 2.1 — Update index.html to load Google Fonts

```html
<!-- Add inside <head> of index.html, before any other <link> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;500;600;700&family=Martian+Mono:wght@200;300;400;500&display=swap" rel="stylesheet">
```

### Step 2.2 — Replace src/app.css

```css
/* src/app.css — Glass Lanes global styles */

/* ── Reset ── */
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Root variables (bridged from tokens in App.svelte) ── */
:root {
  --sans: 'Sora', system-ui, sans-serif;
  --mono: 'Martian Mono', monospace;
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: var(--sans);
  color: var(--t1, rgba(255,255,255,.94));
  -webkit-font-smoothing: antialiased;
  background: var(--bg-base, #0c0a14);
}

#app {
  height: 100%;
}

/* ── Focus ring ── */
:focus-visible {
  outline: 2px solid var(--accent-cyan, #67e8f9);
  outline-offset: 2px;
}

/* ── Screen-reader only ── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Glass utility classes (used by multiple components) ── */
.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}

.glass-strong {
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.09);
  backdrop-filter: blur(40px) saturate(1.3);
  -webkit-backdrop-filter: blur(40px) saturate(1.3);
}
```

---

## Task 3 — Add Glass types and update ui.ts

**Why before components:** `LaneSvgChart` and `CrossLaneHover` depend on the `LaneHoverState` type and the `laneHoverRound` / `laneHoverX` store fields.

Pre-task reads:
- [ ] Read `src/lib/types.ts`
- [ ] Read `src/lib/stores/ui.ts`

### Step 3.1 — Write failing test

```typescript
// tests/unit/ui-lane-hover.test.ts (new file)
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { uiStore } from '../../src/lib/stores/ui';

describe('uiStore lane hover', () => {
  beforeEach(() => { uiStore.reset(); });

  it('setLaneHover stores round and x', () => {
    uiStore.setLaneHover(12, 480);
    const state = get(uiStore);
    expect(state.laneHoverRound).toBe(12);
    expect(state.laneHoverX).toBe(480);
  });

  it('clearLaneHover nullifies both fields', () => {
    uiStore.setLaneHover(5, 200);
    uiStore.clearLaneHover();
    const state = get(uiStore);
    expect(state.laneHoverRound).toBeNull();
    expect(state.laneHoverX).toBeNull();
  });

  it('reset clears lane hover', () => {
    uiStore.setLaneHover(7, 300);
    uiStore.reset();
    const state = get(uiStore);
    expect(state.laneHoverRound).toBeNull();
  });
});
```

Run — confirm fails:
```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/ui-lane-hover.test.ts
```

### Step 3.2 — Add types to src/lib/types.ts

Append after the existing `UIState` interface:

```typescript
// ── Lane hover ─────────────────────────────────────────────────────────────
export interface LaneHoverState {
  readonly round: number;
  readonly x: number;  // clientX position of hover line
}
```

Also add `laneHoverRound` and `laneHoverX` to `UIState`:

```typescript
// Inside UIState interface, add:
  laneHoverRound: number | null;
  laneHoverX: number | null;
```

### Step 3.3 — Update src/lib/stores/ui.ts

Add to `initialState()`:
```typescript
  laneHoverRound: null,
  laneHoverX: null,
```

Add to `createUiStore()` return object:
```typescript
    setLaneHover(round: number, x: number): void {
      update((s) => ({ ...s, laneHoverRound: round, laneHoverX: x }));
    },
    clearLaneHover(): void {
      update((s) => ({ ...s, laneHoverRound: null, laneHoverX: null }));
    },
```

### Step 3.4 — Verify

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/ui-lane-hover.test.ts
```
Expected: all 3 tests green.

---

## Task 4 — Create Topbar.svelte

Replaces `Header.svelte` + `Controls.svelte`. Contains logo, run status, round counter, and action buttons.

> **Block #3 fix — Endpoint management:** The Topbar must include an "+ Endpoint" button. This button toggles the existing `EndpointPanel` (already wired in the app) in a slide-out drawer, identical to how `SettingsDrawer` is shown. In `Layout.svelte` (Task 10), import `EndpointPanel` and show it in a `<div class="endpoint-drawer">` that slides in when `$uiStore.showEndpoints` is `true`. Add `toggleEndpoints()` to `uiStore` (Task 3). The user MUST be able to add and remove endpoints from the Glass Lanes UI — do not remove this capability.

Pre-task reads:
- [ ] Read `src/lib/components/Header.svelte`
- [ ] Read `src/lib/components/Controls.svelte`
- [ ] Read `src/lib/stores/measurements.ts`

### Step 4.1 — Write failing test

```typescript
// tests/unit/components/topbar.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Topbar from '../../../src/lib/components/Topbar.svelte';

describe('Topbar', () => {
  it('renders Sonde logo text', () => {
    const { getByText } = render(Topbar, { props: {} });
    expect(getByText('Sonde')).toBeTruthy();
  });

  it('renders Start Test button when lifecycle is idle', () => {
    const { getByRole } = render(Topbar, { props: {} });
    expect(getByRole('button', { name: /start test/i })).toBeTruthy();
  });
});
```

Run — confirm fails (component does not exist yet).

### Step 4.2 — Create Topbar.svelte

```svelte
<!-- src/lib/components/Topbar.svelte -->
<!-- Replaces Header + Controls. Frosted glass bar: logo, run status, buttons. -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import type { TestLifecycleState } from '$lib/types';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  let lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  let roundCounter: number = $derived($measurementStore.roundCounter);

  // Cap from settings store is not imported here — footer shows "of N" separately.
  // Round counter display: "Round 24" while running, "Idle" otherwise.
  let runLabel: string = $derived.by(() => {
    if (lifecycle === 'running') return `Running · Round ${roundCounter}`;
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    if (lifecycle === 'completed') return 'Complete';
    return 'Ready';
  });

  let isRunning: boolean = $derived(lifecycle === 'running');
  let isTransitioning: boolean = $derived(lifecycle === 'starting' || lifecycle === 'stopping');

  let startStopLabel: string = $derived.by(() => {
    if (lifecycle === 'running') return 'Stop';
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return 'Start Test';
  });

  function handleStartStop(): void {
    if (lifecycle === 'running') {
      onStop?.();
    } else if (lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed') {
      onStart?.();
    }
  }

  function handleSettings(): void {
    uiStore.toggleSettings();
  }

  function handleShare(): void {
    uiStore.toggleShare();
  }

  function handleEndpoints(): void {
    uiStore.toggleEndpoints();
  }
</script>

<header
  class="topbar"
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--topbar-border={tokens.color.topbar.border}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--accent-green={tokens.color.accent.green}
  style:--green-glow={tokens.color.accent.greenGlow}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--topbar-height="{tokens.lane.topbarHeight}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--timing-btn="{tokens.timing.btnHover}ms"
>
  <!-- Logo -->
  <div class="logo" aria-label="Sonde">
    <span class="logo-text">Sonde</span>
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- Run status -->
  <div class="run-status" aria-live="polite" aria-atomic="true">
    {#if isRunning}
      <div class="pulse-dot" aria-hidden="true"></div>
    {/if}
    <span class="run-label">{runLabel}</span>
  </div>

  <div class="spacer"></div>

  <!-- Action buttons -->
  <nav class="actions" aria-label="Test controls">
    <button
      type="button"
      class="btn"
      aria-label="Add or remove endpoints"
      aria-expanded={$uiStore.showEndpoints}
      aria-controls="endpoint-drawer"
      onclick={handleEndpoints}
    >
      + Endpoint
    </button>

    <button
      type="button"
      class="btn"
      aria-label="Open settings"
      aria-expanded={$uiStore.showSettings}
      aria-controls="settings-drawer"
      onclick={handleSettings}
    >
      Settings
    </button>

    <button
      type="button"
      class="btn"
      aria-label="Share results"
      aria-expanded={$uiStore.showShare}
      aria-controls="share-popover"
      onclick={handleShare}
    >
      Share
    </button>

    <button
      type="button"
      class="btn btn-accent"
      class:btn-stop={isRunning}
      disabled={isTransitioning}
      aria-disabled={isTransitioning}
      aria-label={startStopLabel}
      onclick={handleStartStop}
    >
      {startStopLabel}
    </button>
  </nav>
</header>

<style>
  .topbar {
    height: var(--topbar-height);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 14px;
    flex-shrink: 0;
    background: var(--topbar-bg);
    border-bottom: 1px solid var(--topbar-border);
    backdrop-filter: blur(30px) saturate(1.3);
    -webkit-backdrop-filter: blur(30px) saturate(1.3);
    position: relative;
  }

  /* Subtle top highlight */
  .topbar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 20%;
    right: 20%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  /* ── Logo ── */
  .logo { display: flex; align-items: center; }

  .logo-text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #7af0ff, #ffb3e0);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Separator ── */
  .sep {
    width: 1px;
    height: 16px;
    background: linear-gradient(180deg, transparent, var(--glass-highlight), transparent);
    flex-shrink: 0;
  }

  /* ── Run status ── */
  .run-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 300;
    color: var(--t2);
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--green-glow), 0 0 20px rgba(134,239,172,.2);
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .4; transform: scale(.85); }
  }

  .run-label { color: var(--t2); }

  /* ── Spacer ── */
  .spacer { flex: 1; }

  /* ── Action buttons ── */
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.01em;
    padding: 7px 16px;
    border-radius: var(--btn-radius);
    border: 1px solid var(--glass-border);
    background: rgba(255,255,255,.03);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--t2);
    cursor: pointer;
    transition: all var(--timing-btn) ease;
    white-space: nowrap;
    min-height: 32px;
  }

  .btn:hover:not(:disabled) {
    background: rgba(255,255,255,.07);
    border-color: var(--glass-highlight);
    color: var(--t1);
    box-shadow: 0 2px 12px rgba(0,0,0,.2);
    transform: translateY(-1px);
  }

  .btn-accent {
    border-color: rgba(249,168,212,.2);
    color: var(--accent-pink);
    background: rgba(249,168,212,.04);
  }

  .btn-accent:hover:not(:disabled) {
    background: rgba(249,168,212,.08);
    border-color: rgba(249,168,212,.35);
    box-shadow: 0 2px 16px rgba(249,168,212,.1);
  }

  .btn-stop {
    border-color: rgba(249,168,212,.2);
    color: var(--accent-pink);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* ── Mobile: hide Share/Settings labels, keep Stop ── */
  @media (max-width: 767px) {
    .topbar { padding: 0 12px; gap: 8px; }
  }
</style>
```

### Step 4.3 — Verify test

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/components/topbar.test.ts
```
Expected: both tests green.

---

## Task 5 — Create Lane.svelte (glass card shell + left panel)

The lane renders the left stats panel. The SVG chart is slotted in Task 6 via `LaneSvgChart`.

Pre-task reads:
- [ ] Read `src/lib/components/SummaryCard.svelte` (stats being absorbed)
- [ ] Read `src/lib/stores/statistics.ts`

### Step 5.1 — Write failing test

```typescript
// tests/unit/components/lane.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Lane from '../../../src/lib/components/Lane.svelte';

describe('Lane', () => {
  const props = {
    endpointId: 'ep-test-1',
    color: '#67e8f9',
    url: 'www.google.com',
    p50: 38,
    p95: 52,
    p99: 98,
    jitter: 4.2,
    lossPercent: 0,
    ready: true,
  };

  it('renders endpoint URL', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('www.google.com')).toBeTruthy();
  });

  it('renders hero P50 value', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText('38')).toBeTruthy();
  });

  it('renders P50 Median Latency label', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText(/P50 Median Latency/i)).toBeTruthy();
  });
});
```

Run — confirm fails.

### Step 5.2 — Create Lane.svelte

```svelte
<!-- src/lib/components/Lane.svelte -->
<!-- One glass card per endpoint. Left panel (hero stats) + slotted SVG chart area. -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  let {
    endpointId,
    color,
    url,
    p50,
    p95,
    p99,
    jitter,
    lossPercent,
    ready,
    children,
  }: {
    endpointId: string;
    color: string;
    url: string;
    p50: number;
    p95: number;
    p99: number;
    jitter: number;
    lossPercent: number;
    ready: boolean;
    children?: import('svelte').Snippet;
  } = $props();

  function fmt(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  function fmtLoss(pct: number): string {
    return pct === 0 ? '0%' : `${pct.toFixed(1)}%`;
  }
</script>

<article
  class="lane"
  aria-label="Endpoint {url}"
  style:--ep-color={color}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--lane-bg={tokens.color.lane.bg}
  style:--lane-border={tokens.color.lane.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--radius-lg="{tokens.radius.lg}px"
  style:--timing-hover="{tokens.timing.btnHover}ms"
>
  <!-- Top-edge highlight pseudo-element via class -->

  <!-- Left panel -->
  <div class="lane-panel">
    <div class="lane-url">{url}</div>

    <div class="lane-hero" aria-label="P50 latency {fmt(p50)}">
      <span class="hero-value">{Math.round(p50)}</span>
      <span class="hero-unit">ms</span>
    </div>

    <div class="lane-label">P50 Median Latency</div>

    {#if ready}
      <div class="lane-stats" aria-label="Statistics">
        <div class="ls">
          <div class="ls-label">P95</div>
          <div class="ls-val">{fmt(p95)}</div>
        </div>
        <div class="ls">
          <div class="ls-label">P99</div>
          <div class="ls-val">{fmt(p99)}</div>
        </div>
        <div class="ls">
          <div class="ls-label">Jitter</div>
          <div class="ls-val">{fmt(jitter)}</div>
        </div>
        <div class="ls">
          <div class="ls-label">Loss</div>
          <div class="ls-val">{fmtLoss(lossPercent)}</div>
        </div>
      </div>
    {:else}
      <div class="collecting-note">Collecting data…</div>
    {/if}
  </div>

  <!-- Chart slot -->
  <div class="lane-chart" aria-label="Latency chart for {url}">
    {#if children}
      {@render children()}
    {/if}
  </div>
</article>

<style>
  .lane {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--lane-bg);
    border: 1px solid var(--lane-border);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    transition: border-color var(--timing-hover) ease, box-shadow var(--timing-hover) ease;
  }

  .lane:hover {
    border-color: rgba(255,255,255,.10);
    box-shadow: 0 4px 30px rgba(0,0,0,.15);
  }

  /* Top-edge highlight */
  .lane::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  /* Left inner glow — color-keyed to endpoint */
  .lane::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 80px;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(90deg, color-mix(in srgb, var(--ep-color) 3%, transparent), transparent);
  }

  /* ── Left panel ── */
  .lane-panel {
    width: var(--panel-width);
    flex-shrink: 0;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid rgba(255,255,255,.05);
    position: relative;
    z-index: 2;
  }

  .lane-url {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 300;
    color: var(--t3);
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lane-hero {
    display: flex;
    align-items: baseline;
    margin-top: 6px;
    line-height: 1;
    color: var(--ep-color);
  }

  .hero-value {
    font-family: var(--sans);
    font-size: 54px;
    font-weight: 200;
    letter-spacing: -0.06em;
  }

  .hero-unit {
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 300;
    color: var(--t3);
    margin-left: 2px;
  }

  .lane-label {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 300;
    color: var(--t4);
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* ── Stats grid ── */
  .lane-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,.04);
  }

  .ls-label {
    font-family: var(--mono);
    font-size: 8px;
    font-weight: 400;
    color: var(--t4);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .ls-val {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 300;
    color: var(--t2);
    margin-top: 3px;
  }

  .collecting-note {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 300;
    color: var(--t4);
    margin-top: 12px;
  }

  /* ── Chart area ── */
  .lane-chart {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-width: 0;
  }

  /* ── Mobile: stack panel above chart ── */
  @media (max-width: 767px) {
    .lane { flex-direction: column; }

    .lane-panel {
      width: 100%;
      padding: 16px 20px 12px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,.05);
      flex-direction: row;
      align-items: center;
      gap: 20px;
    }

    .lane-stats { margin-top: 0; padding-top: 0; border-top: none; }
  }
</style>
```

### Step 5.3 — Verify test

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/components/lane.test.ts
```
Expected: all 3 tests green.

---

## Task 6 — Create LaneSvgChart.svelte

The SVG renderer for one lane. Receives pre-computed data as props from `LanesView` (parent calls `prepareFrame()` once for all endpoints, then passes per-lane data down). Renders gridlines, ribbon, median, trace, dots, "now" pulse, future zone.

> **Block #7 fix — Reactivity / Advisory A5 fix:** `LaneSvgChart` does NOT call `prepareFrame()` internally and does NOT import or call `get(endpointStore)`. The parent `LanesView` calls `prepareFrame()` **once** per reactive update for all enabled endpoints, then passes the per-endpoint results as props. This avoids N redundant `prepareFrame()` calls (one per lane) and prevents `get()` inside `$derived`, which would miss reactive updates.

> **Bet check:** SVG per lane with up to 1000 data points performs adequately at 1Hz update rate — this task is where that assumption is most load-bearing. The SVG is fully re-rendered on every store update. If profiling shows jank above ~200 points, consider moving to a canvas-in-SVG `<foreignObject>` or a per-lane `<canvas>`.

**Prop interface for LaneSvgChart (replace the self-fetching approach):**

```typescript
// Props received from LanesView — all computed by parent's single prepareFrame() call
let {
  color,
  colorRgba06,
  totalRounds,
  currentRound,
  points,       // readonly ScatterPoint[]
  ribbon,       // RibbonData | undefined
  yRange,       // YRange
  maxRound,     // number
  xTicks,       // readonly XTick[]
}: {
  color: string;
  colorRgba06: string;
  totalRounds: number;
  currentRound: number;
  points: readonly ScatterPoint[];
  ribbon: RibbonData | undefined;
  yRange: YRange;
  maxRound: number;
  xTicks: readonly XTick[];
} = $props();
```

Remove the `endpointId` prop, `get(endpointStore)` import, `import { prepareFrame }`, and the `$derived.by(() => { ... prepareFrame([thisEp], measureState); })` block entirely. Use `points`, `ribbon`, `yRange`, and `maxRound` directly from props.

Pre-task reads:
- [ ] Read `src/lib/renderers/timeline-data-pipeline.ts` (full file)
- [ ] Read `src/lib/types.ts` (FrameData, ScatterPoint, RibbonData)

### Step 6.1 — Write failing test

```typescript
// tests/unit/lane-svg-chart.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LaneSvgChart from '../../src/lib/components/LaneSvgChart.svelte';

const baseProps = {
  color: '#67e8f9',
  colorRgba06: 'rgba(103,232,249,.06)',
  totalRounds: 30,
  currentRound: 0,
  points: [],
  ribbon: undefined,
  yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
  maxRound: 0,
  xTicks: [],
};

describe('LaneSvgChart', () => {
  it('renders an SVG element', () => {
    const { container } = render(LaneSvgChart, { props: baseProps });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders future zone rect when rounds < totalRounds', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        currentRound: 10,
        points: [{ round: 10, y: 0.5, latency: 50 }],
        maxRound: 10,
      },
    });
    const futureZone = container.querySelector('.future-zone');
    expect(futureZone).not.toBeNull();
  });
});
```

Run — confirm fails.

### Step 6.2 — Create LaneSvgChart.svelte

```svelte
<!-- src/lib/components/LaneSvgChart.svelte -->
<!-- SVG scatter chart for one lane. Replaces Canvas TimelineRenderer for this endpoint. -->
<!-- viewBox: 0 0 1000 200 (preserveAspectRatio=none — stretches to fill lane-chart div) -->
<script lang="ts">
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { prepareFrame } from '$lib/renderers/timeline-data-pipeline';
  import { tokens } from '$lib/tokens';
  import type { FrameData } from '$lib/types';

  // Props
  let {
    endpointId,
    color,
    colorRgba06,
    totalRounds,
    currentRound = 0,
  }: {
    endpointId: string;
    color: string;
    colorRgba06: string;
    totalRounds: number;
    currentRound?: number;
  } = $props();

  // SVG coordinate space
  const VB_W = 1000;
  const VB_H = 200;
  const PAD_Y_TOP = 10;
  const PAD_Y_BOT = 10;
  const PLOT_H = VB_H - PAD_Y_TOP - PAD_Y_BOT;

  // Derived FrameData for this endpoint only
  const frameData: FrameData = $derived.by(() => {
    const measureState = $measurementStore;
    const endpoints = get(endpointStore);
    const thisEp = endpoints.find(ep => ep.id === endpointId);
    if (!thisEp) {
      return {
        pointsByEndpoint: new Map(),
        ribbonsByEndpoint: new Map(),
        yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
        xTicks: [],
        maxRound: 0,
        freezeEvents: [],
        hasData: false,
      };
    }
    return prepareFrame([thisEp], measureState);
  });

  const hasData: boolean = $derived(frameData.hasData);
  const maxRound: number = $derived(Math.max(frameData.maxRound, 1));

  // Scale helpers
  function toX(round: number): number {
    const dataMaxRound = Math.max(totalRounds, maxRound);
    return (round / dataMaxRound) * VB_W;
  }

  function toY(normalizedY: number): number {
    // normalizedY: 0 = max (top of chart), 1 = min (bottom)
    return PAD_Y_TOP + (1 - normalizedY) * PLOT_H;
  }

  // Derived path data
  const points = $derived(frameData.pointsByEndpoint.get(endpointId) ?? []);
  const ribbon = $derived(frameData.ribbonsByEndpoint.get(endpointId));

  // Scatter dot data
  interface SvgDot { cx: number; cy: number; round: number; latency: number; }
  const dots: SvgDot[] = $derived(
    points.map(pt => ({
      cx: toX(pt.round),
      cy: toY(pt.y),
      round: pt.round,
      latency: pt.latency,
    }))
  );

  // Latest dot (the "now" point)
  const nowDot: SvgDot | null = $derived(dots.length > 0 ? (dots[dots.length - 1] ?? null) : null);

  // Future zone x start (data ends here)
  const futureZoneX: number = $derived(nowDot ? nowDot.cx : 0);
  const showFutureZone: boolean = $derived(hasData && futureZoneX < VB_W);

  // Trace path
  const tracePath: string = $derived.by(() => {
    if (dots.length === 0) return '';
    return dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.cx},${d.cy}`).join(' ');
  });

  // Ribbon area path (P25–P75 fill)
  const ribbonPath: string = $derived.by(() => {
    if (!ribbon || ribbon.p25Path.length === 0) return '';
    const top = ribbon.p75Path; // p75 = top of ribbon
    const bot = ribbon.p25Path; // p25 = bottom of ribbon
    if (top.length === 0 || bot.length === 0) return '';

    const topPts = top.map(([round, ny]) => `${toX(round)},${toY(ny)}`);
    const botPts = [...bot].reverse().map(([round, ny]) => `${toX(round)},${toY(ny)}`);
    return `M${topPts.join(' L')} L${botPts.join(' L')} Z`;
  });

  // Median path (P50 dashed line)
  const medianPath: string = $derived.by(() => {
    if (!ribbon || ribbon.p50Path.length === 0) return '';
    return ribbon.p50Path.map(([round, ny], i) =>
      `${i === 0 ? 'M' : 'L'}${toX(round)},${toY(ny)}`
    ).join(' ');
  });

  // Gridlines (3 horizontal, evenly spaced in SVG space)
  const gridlineYs: number[] = [
    PAD_Y_TOP + PLOT_H * 0.25,
    PAD_Y_TOP + PLOT_H * 0.5,
    PAD_Y_TOP + PLOT_H * 0.75,
  ];
</script>

<svg
  class="lane-svg"
  viewBox="0 0 {VB_W} {VB_H}"
  preserveAspectRatio="none"
  aria-hidden="true"
  style:--ep-color={color}
  style:--ribbon-fill={colorRgba06}
  style:--grid-line={tokens.color.svg.gridLine}
  style:--future-zone={tokens.color.svg.futureZone}
  style:--dot-r="{tokens.lane.dotRadius}"
  style:--now-r="{tokens.lane.nowDotRadius}"
>
  <!-- Horizontal gridlines -->
  {#each gridlineYs as gy}
    <line
      class="grid-line"
      x1="0" y1={gy}
      x2={VB_W} y2={gy}
    />
  {/each}

  <!-- Future zone -->
  {#if showFutureZone}
    <rect
      class="future-zone"
      x={futureZoneX}
      y="0"
      width={VB_W - futureZoneX}
      height={VB_H}
    />
  {/if}

  {#if hasData}
    <!-- P25–P75 ribbon fill -->
    {#if ribbonPath}
      <path class="ribbon" d={ribbonPath} />
    {/if}

    <!-- P50 median dashed line -->
    {#if medianPath}
      <path class="median" d={medianPath} />
    {/if}

    <!-- Trace line -->
    {#if tracePath}
      <path class="trace" d={tracePath} />
    {/if}

    <!-- Scatter dots -->
    <g class="dots">
      {#each dots as dot (dot.round)}
        <circle
          class="dot"
          cx={dot.cx}
          cy={dot.cy}
          r={tokens.lane.dotRadius}
          aria-label="Round {dot.round}: {Math.round(dot.latency)}ms"
        />
      {/each}
    </g>

    <!-- "Now" pulsing dot -->
    {#if nowDot}
      <circle
        class="now-dot"
        cx={nowDot.cx}
        cy={nowDot.cy}
        r={tokens.lane.nowDotRadius}
      />
      <!-- Expanding ring animation -->
      <circle
        cx={nowDot.cx}
        cy={nowDot.cy}
        r={tokens.lane.ringInitialR}
        fill="none"
        stroke="var(--ep-color)"
        stroke-width="0.5"
        opacity="0.2"
      >
        <animate attributeName="r" values="{tokens.lane.ringInitialR};{tokens.lane.ringFinalR}" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".2;0" dur="2s" repeatCount="indefinite"/>
      </circle>
    {/if}

  {:else}
    <!-- Empty state: centered text -->
    <text
      class="empty-text"
      x={VB_W / 2}
      y={VB_H / 2}
      text-anchor="middle"
      dominant-baseline="middle"
    >Waiting for data</text>
  {/if}
</svg>

<style>
  .lane-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .grid-line {
    stroke: var(--grid-line);
    stroke-width: 0.5;
  }

  .future-zone {
    fill: var(--future-zone);
  }

  .ribbon {
    fill: var(--ribbon-fill);
  }

  .median {
    fill: none;
    stroke: var(--ep-color);
    stroke-width: 1.8;
    stroke-dasharray: 6 5;
    opacity: 0.45;
  }

  .trace {
    fill: none;
    stroke: var(--ep-color);
    stroke-width: 1.5;
    opacity: 0.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dot {
    fill: var(--ep-color);
    opacity: 0.85;
    cursor: pointer;
    transition: r 0.1s ease, opacity 0.1s ease;
  }

  .dot:hover {
    r: 5.5;
    opacity: 1;
    filter: drop-shadow(0 0 8px var(--ep-color));
  }

  .now-dot {
    fill: var(--ep-color);
    filter: drop-shadow(0 0 10px var(--ribbon-fill)) drop-shadow(0 0 3px var(--ep-color));
  }

  .empty-text {
    font-family: 'Martian Mono', monospace;
    font-size: 14px;
    font-weight: 300;
    fill: rgba(255,255,255,.14);
  }
</style>
```

### Step 6.3 — Verify test

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/lane-svg-chart.test.ts
```
Expected: both tests green.

---

## Task 7 — Create CrossLaneHover.svelte

Global hover line + frosted tooltip. Attached to the `<div class="lanes">` container via `mousemove`.

Pre-task reads:
- [ ] Read `src/lib/stores/ui.ts` (updated in Task 3)
- [ ] Read `src/lib/stores/measurements.ts`

### Step 7.1 — Write failing test

```typescript
// tests/unit/cross-lane-hover.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CrossLaneHover from '../../src/lib/components/CrossLaneHover.svelte';

describe('CrossLaneHover', () => {
  it('renders hover line element', () => {
    const { container } = render(CrossLaneHover, { props: { totalRounds: 30 } });
    expect(container.querySelector('.hover-line')).not.toBeNull();
  });

  it('hover line is inactive by default', () => {
    const { container } = render(CrossLaneHover, { props: { totalRounds: 30 } });
    const line = container.querySelector('.hover-line');
    expect(line?.classList.contains('active')).toBe(false);
  });
});
```

Run — confirm fails.

### Step 7.2 — Create CrossLaneHover.svelte

```svelte
<!-- src/lib/components/CrossLaneHover.svelte -->
<!-- Positioned hover line (full-height gradient) + frosted tooltip.            -->
<!-- Must be placed as a sibling of the lanes container, position:fixed.        -->
<!-- Receives round and x from uiStore.laneHoverRound / laneHoverX.             -->
<script lang="ts">
  // Block #8 fix: removed unused `statisticsStore` import
  import { uiStore } from '$lib/stores/ui';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { tokens } from '$lib/tokens';

  let { totalRounds }: { totalRounds: number } = $props();

  let hoverX: number | null = $derived($uiStore.laneHoverX);
  let hoverRound: number | null = $derived($uiStore.laneHoverRound);
  let isActive: boolean = $derived(hoverX !== null && hoverRound !== null);

  // Per-endpoint values at hovered round
  interface EndpointHoverRow {
    id: string;
    label: string;
    color: string;
    latency: number | null;
  }

  const hoverRows: EndpointHoverRow[] = $derived.by(() => {
    if (hoverRound === null) return [];
    const endpoints = $endpointStore.filter(ep => ep.enabled);
    return endpoints.map(ep => {
      const epState = $measurementStore.endpoints[ep.id];
      // Block #8 fix: samples are ordered by round, so use index lookup (O(1)) instead of .find() (O(n))
      const sample = epState?.samples[hoverRound - 1] ?? null;
      return {
        id: ep.id,
        label: ep.label || ep.url,
        color: ep.color,
        latency: sample?.status === 'ok' ? sample.latency : null,
      };
    });
  });

  // Comparative insight: fastest vs slowest
  const deltaLabel: string = $derived.by(() => {
    const valid = hoverRows.filter(r => r.latency !== null);
    if (valid.length < 2) return '';
    const sorted = [...valid].sort((a, b) => (a.latency ?? 0) - (b.latency ?? 0));
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    if (!fastest || !slowest || fastest.latency === null || slowest.latency === null) return '';
    const ratio = (slowest.latency / fastest.latency).toFixed(1);
    return `${fastest.label} is ${ratio}× faster`;
  });

  function fmtLatency(ms: number | null): string {
    if (ms === null) return '—';
    return `${Math.round(ms)}ms`;
  }
</script>

<!-- Hover line — position:fixed, driven by hoverX clientX -->
<div
  class="hover-line"
  class:active={isActive}
  style:left="{hoverX}px"
  style:--t3={tokens.color.text.t3}
  aria-hidden="true"
></div>

<!-- Hover tooltip -->
{#if isActive && hoverRound !== null && hoverX !== null}
  <div
    class="hover-tip"
    class:active={isActive}
    style:left="{hoverX + 16}px"
    style:top="74px"
    style:--tooltip-bg={tokens.color.tooltip.bg}
    style:--glass-border={tokens.color.glass.border}
    style:--glass-highlight={tokens.color.glass.highlight}
    style:--t1={tokens.color.text.t1}
    style:--t3={tokens.color.text.t3}
    style:--t4={tokens.color.text.t4}
    style:--mono={tokens.typography.mono.fontFamily}
    role="tooltip"
    aria-live="polite"
  >
    <div class="tip-inner">
      <div class="tip-round">Round {hoverRound}</div>
      {#each hoverRows as row (row.id)}
        <div class="tip-row">
          <div class="tip-dot" style:background={row.color} style:box-shadow="0 0 4px {row.color}"></div>
          <div class="tip-name">{row.label}</div>
          <div class="tip-val" style:color={row.color}>{fmtLatency(row.latency)}</div>
        </div>
      {/each}
      {#if deltaLabel}
        <div class="tip-delta">{deltaLabel}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hover-line {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 1px;
    pointer-events: none;
    z-index: 5;
    opacity: 0;
    transition: opacity 0.08s;
    background: linear-gradient(
      180deg,
      transparent 10%,
      rgba(255,255,255,.12) 50%,
      transparent 90%
    );
  }

  .hover-line.active { opacity: 1; }

  .hover-tip {
    position: fixed;
    z-index: 10;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .hover-tip.active { opacity: 1; }

  .tip-inner {
    background: var(--tooltip-bg);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px;
    padding: 10px 14px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 1px rgba(255,255,255,.1);
    min-width: 160px;
  }

  .tip-round {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 400;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }

  .tip-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 5px 0;
  }

  .tip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tip-name {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 300;
    color: var(--t3);
    flex: 1;
  }

  .tip-val {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
  }

  .tip-delta {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--t4);
    text-align: right;
    margin-top: 6px;
    padding-top: 5px;
    border-top: 1px solid rgba(255,255,255,.04);
  }
</style>
```

### Step 7.3 — Verify

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/cross-lane-hover.test.ts
```
Expected: both tests green.

---

## Task 8 — Create XAxisBar.svelte

Shared x-axis row below the lanes. Shows round numbers; future rounds dimmed.

Pre-task reads:
- [ ] Read `src/lib/renderers/timeline-data-pipeline.ts` (computeXTicks)

### Step 8.1 — Write failing test (Block #9 fix)

```typescript
// tests/unit/components/x-axis-bar.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import XAxisBar from '../../../src/lib/components/XAxisBar.svelte';

describe('XAxisBar', () => {
  it('renders tick labels for given totalRounds', () => {
    const { getByText } = render(XAxisBar, {
      props: { totalRounds: 30, currentRound: 15 },
    });
    // Should render at least the final round tick
    expect(getByText('30')).toBeTruthy();
  });

  it('applies future class to rounds beyond currentRound', () => {
    const { container } = render(XAxisBar, {
      props: { totalRounds: 30, currentRound: 10 },
    });
    const futureTicks = container.querySelectorAll('.x-tick.future');
    expect(futureTicks.length).toBeGreaterThan(0);
  });
});
```

Run — confirm fails, then create component.

### Step 8.2 — Create XAxisBar.svelte

```svelte
<!-- src/lib/components/XAxisBar.svelte -->
<!-- Shared x-axis: "Round" label on left (aligns with panel), then tick labels.  -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  let {
    totalRounds,
    currentRound,
  }: {
    totalRounds: number;
    currentRound: number;
  } = $props();

  // Generate readable tick labels — show ~6 ticks
  const ticks: Array<{ label: string; isFuture: boolean }> = $derived.by(() => {
    const step = Math.ceil(totalRounds / 6);
    const result: Array<{ label: string; isFuture: boolean }> = [];
    for (let r = step; r <= totalRounds; r += step) {
      result.push({ label: String(r), isFuture: r > currentRound });
    }
    // Always include totalRounds
    if (result.length === 0 || result[result.length - 1]?.label !== String(totalRounds)) {
      result.push({ label: String(totalRounds), isFuture: totalRounds > currentRound });
    }
    return result;
  });
</script>

<div
  class="x-bar"
  aria-label="Round axis"
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--x-height="{tokens.lane.xAxisHeight}px"
  style:--lanes-padding-x="{tokens.lane.paddingX}px"
>
  <div class="x-spacer" aria-hidden="true">
    <span class="x-spacer-label">Round</span>
  </div>
  <div class="x-labels" role="list" aria-label="Round markers">
    {#each ticks as tick}
      <span
        class="x-tick"
        class:future={tick.isFuture}
        role="listitem"
        aria-label="Round {tick.label}{tick.isFuture ? ' (future)' : ''}"
      >{tick.label}</span>
    {/each}
  </div>
</div>

<style>
  .x-bar {
    height: var(--x-height);
    display: flex;
    align-items: center;
    padding: 0 var(--lanes-padding-x);
    flex-shrink: 0;
  }

  .x-spacer {
    width: var(--panel-width);
    padding: 0 28px;
    flex-shrink: 0;
  }

  .x-spacer-label {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 300;
    color: var(--t4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .x-labels {
    flex: 1;
    display: flex;
    justify-content: space-between;
    padding: 0 18px;
  }

  .x-tick {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 300;
    color: var(--t3);
  }

  .x-tick.future {
    color: var(--t4);
    opacity: 0.5;
  }
</style>
```

### Step 8.3 — Verify XAxisBar tests

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/components/x-axis-bar.test.ts
```
Expected: both tests green.

---

## Task 9 — Create FooterBar.svelte

Pre-task reads:
- [ ] Read `src/lib/stores/measurements.ts`
- [ ] Read `src/lib/stores/settings.ts` (check `cap` field name)

### Step 9.1 — Write failing test (Block #9 fix)

```typescript
// tests/unit/components/footer-bar.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import FooterBar from '../../../src/lib/components/FooterBar.svelte';

describe('FooterBar', () => {
  it('renders "Measuring from your browser" text', () => {
    const { getByText } = render(FooterBar, { props: {} });
    expect(getByText(/Measuring from your browser/i)).toBeTruthy();
  });

  it('renders progress text with round counter', () => {
    // With default store state (idle, 0 rounds), should render "0 of"
    const { getByText } = render(FooterBar, { props: {} });
    expect(getByText(/of/i)).toBeTruthy();
  });

  it('renders config label with interval and timeout', () => {
    const { container } = render(FooterBar, { props: {} });
    // Config label contains "interval" or "timeout" unit
    expect(container.querySelector('.config')).not.toBeNull();
  });
});
```

Run — confirm fails, then create component.

### Step 9.2 — Create FooterBar.svelte

```svelte
<!-- src/lib/components/FooterBar.svelte -->
<!-- "Measuring from your browser" + config summary + progress stats.         -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';

  let lifecycle = $derived($measurementStore.lifecycle);
  let roundCounter = $derived($measurementStore.roundCounter);
  let cap = $derived($settingsStore.cap);
  let delay = $derived($settingsStore.delay);
  let timeout = $derived($settingsStore.timeout);

  // Count errors and timeouts across all endpoints
  let errorCount = $derived.by(() => {
    let errors = 0;
    let timeouts = 0;
    for (const ep of Object.values($measurementStore.endpoints)) {
      for (const s of ep.samples) {
        if (s.status === 'error') errors++;
        if (s.status === 'timeout') timeouts++;
      }
    }
    return { errors, timeouts };
  });

  let progressLabel = $derived.by(() => {
    const total = cap > 0 ? cap : '∞';
    const { errors, timeouts } = errorCount;
    const parts: string[] = [`${roundCounter} of ${total} complete`];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (timeouts > 0) parts.push(`${timeouts} timeout${timeouts === 1 ? '' : 's'}`);
    return parts.join(' · ');
  });

  let configLabel = $derived(`${delay / 1000}s interval · ${timeout / 1000}s timeout`);
</script>

<footer
  class="foot"
  style:--footer-bg={tokens.color.footer.bg}
  style:--footer-border={tokens.color.glass.border}
  style:--t1={tokens.color.text.t1}
  style:--t3={tokens.color.text.t3}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--footer-height="{tokens.lane.footerHeight}px"
>
  <span class="highlight">Measuring from your browser</span>
  <span class="config">{configLabel}</span>
  <div class="spacer"></div>
  <span class="progress">{progressLabel}</span>
</footer>

<style>
  .foot {
    height: var(--footer-height);
    display: flex;
    align-items: center;
    padding: 0 20px;
    flex-shrink: 0;
    background: var(--footer-bg);
    border-top: 1px solid var(--footer-border);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 300;
    color: var(--t3);
    gap: 16px;
  }

  .highlight {
    color: var(--t1);
    font-weight: 400;
  }

  .spacer { flex: 1; }

  .config, .progress { color: var(--t3); }

  @media (max-width: 767px) {
    .foot { padding: 0 12px; gap: 8px; }
    .config { display: none; }
  }
</style>
```

### Step 9.3 — Verify FooterBar tests (Block #9 fix)

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/components/footer-bar.test.ts
```
Expected: all 3 tests green.

---

## Task 10 — Create LanesView.svelte and wire Layout.svelte

This is the layout cutover. `LanesView` replaces `VisualizationArea`. `Layout.svelte` becomes a thin shell: topbar + lanes + xaxis + footer.

Pre-task reads:
- [ ] Read `src/lib/components/Layout.svelte`
- [ ] Read `src/lib/components/App.svelte`
- [ ] Read `src/lib/stores/endpoints.ts`
- [ ] Read `src/lib/stores/settings.ts`

### Step 10.1 — Create LanesView.svelte

> **Block #7 fix:** `LanesView` calls `prepareFrame()` **once** per reactive update for all enabled endpoints, then passes per-lane data as props to each `LaneSvgChart`. This avoids N redundant pipeline calls and fixes the `get()` reactivity gap.
>
> **Advisory A9 fix — `colorToRgba06` guard:** Add input validation before parsing — if `hex` is not a 6-digit hex string (does not match `/^#[0-9a-fA-F]{6}$/`), return a safe fallback (`'rgba(103,232,249,.06)'`) rather than producing `NaN` values.

```svelte
<!-- src/lib/components/LanesView.svelte -->
<!-- The lanes container. One Lane+LaneSvgChart per enabled endpoint.            -->
<!-- Owns the mousemove handler that drives CrossLaneHover via uiStore.          -->
<!-- Calls prepareFrame() ONCE per update; passes per-lane data as props.        -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { prepareFrame } from '$lib/renderers/timeline-data-pipeline';
  import { tokens } from '$lib/tokens';
  import Lane from './Lane.svelte';
  import LaneSvgChart from './LaneSvgChart.svelte';

  // Enabled endpoints only
  const endpoints = $derived($endpointStore.filter(ep => ep.enabled));
  const totalRounds = $derived($settingsStore.cap > 0 ? $settingsStore.cap : 30);

  // Call prepareFrame() ONCE for all enabled endpoints (Block #7 / A5 fix)
  const frameData = $derived(prepareFrame(endpoints, $measurementStore));

  // Color RGBA06 helper for ribbon fill
  function colorToRgba06(hex: string): string {
    // Advisory A2 fix: guard non-6-digit-hex inputs with a safe fallback
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return 'rgba(103,232,249,.06)'; // cyan fallback
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},.06)`;
  }

  // ── Cross-lane hover handler ────────────────────────────────────────────────
  let lanesEl: HTMLDivElement;

  const PANEL_W = tokens.lane.panelWidth + tokens.lane.paddingX; // 260

  function handleMouseMove(e: MouseEvent): void {
    const rect = lanesEl.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Don't activate hover over left panel
    if (x < PANEL_W) {
      uiStore.clearLaneHover();
      return;
    }

    const chartW = rect.width - PANEL_W;
    if (chartW <= 0) return;

    const pct = (x - PANEL_W) / chartW;
    const round = Math.round(pct * (totalRounds - 1)) + 1;
    const clamped = Math.max(1, Math.min($measurementStore.roundCounter, round));

    if (clamped < 1 || clamped > $measurementStore.roundCounter) {
      uiStore.clearLaneHover();
      return;
    }

    uiStore.setLaneHover(clamped, e.clientX);
  }

  function handleMouseLeave(): void {
    uiStore.clearLaneHover();
  }

  // Per-lane stats from statistics store
  function getLaneProps(endpointId: string) {
    const stats = $statisticsStore[endpointId];
    const epState = $measurementStore.endpoints[endpointId];
    const samples = epState?.samples ?? [];

    if (!stats || !stats.ready) {
      // Not enough data yet — show last known latency as placeholder
      const lastLatency = epState?.lastLatency ?? 0;
      return {
        p50: lastLatency,
        p95: lastLatency,
        p99: lastLatency,
        jitter: 0,
        lossPercent: 0,
        ready: false,
      };
    }

    // Loss: fraction of non-ok samples
    const totalSamples = samples.length;
    const lossSamples = samples.filter(s => s.status !== 'ok').length;
    const lossPercent = totalSamples > 0 ? (lossSamples / totalSamples) * 100 : 0;

    return {
      p50: stats.p50,
      p95: stats.p95,
      p99: stats.p99,
      jitter: stats.stddev,
      lossPercent,
      ready: true,
    };
  }
</script>

<div
  class="lanes"
  id="lanes"
  bind:this={lanesEl}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  style:--lanes-gap="{tokens.lane.gapPx}px"
  style:--lanes-pad-x="{tokens.lane.paddingX}px"
  style:--lanes-pad-y="{tokens.lane.paddingY}px"
>
  {#if endpoints.length === 0}
    <div class="no-endpoints">
      <span>Add an endpoint to begin</span>
    </div>
  {:else}
    {#each endpoints as ep (ep.id)}
      {@const laneProps = getLaneProps(ep.id)}
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
      >
        {#snippet children()}
          <!-- Pass pre-computed per-lane data from the single frameData call (Block #7 / A5 fix) -->
          <LaneSvgChart
            color={ep.color}
            colorRgba06={colorToRgba06(ep.color)}
            {totalRounds}
            currentRound={$measurementStore.roundCounter}
            points={frameData.pointsByEndpoint.get(ep.id) ?? []}
            ribbon={frameData.ribbonsByEndpoint.get(ep.id)}
            yRange={frameData.yRange}
            maxRound={frameData.maxRound}
            xTicks={frameData.xTicks}
          />
        {/snippet}
      </Lane>
    {/each}
  {/if}
</div>

<style>
  .lanes {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--lanes-pad-y) var(--lanes-pad-x) 4px;
    gap: var(--lanes-gap);
    overflow: auto; /* Advisory A4 fix: auto instead of hidden so lanes scroll on small viewports */
    min-height: 0;
  }

  .no-endpoints {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Martian Mono', monospace;
    font-size: 13px;
    font-weight: 300;
    color: rgba(255,255,255,.14);
  }
</style>
```

> **Mobile overflow fix (Advisory A4):** Change `.lanes` `overflow` from `hidden` to `auto` so that on small screens where lanes overflow the container height, the user can scroll rather than having content clipped.

### Step 10.1b — Write failing LanesView test (Block #9 fix)

```typescript
// tests/unit/components/lanes-view.test.ts (new file)
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LanesView from '../../../src/lib/components/LanesView.svelte';

describe('LanesView', () => {
  it('renders a lane for each enabled endpoint', () => {
    // With default store (no endpoints), renders the "no endpoints" empty state
    const { container } = render(LanesView, { props: {} });
    expect(container.querySelector('.lanes')).not.toBeNull();
  });

  it('renders "Add an endpoint" prompt when no endpoints are enabled', () => {
    const { getByText } = render(LanesView, { props: {} });
    expect(getByText(/Add an endpoint/i)).toBeTruthy();
  });
});
```

Run — confirm fails, then proceed with the full LanesView implementation above.

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/components/lanes-view.test.ts
```
Expected: both tests green after implementation.

### Step 10.2 — Replace Layout.svelte

```svelte
<!-- src/lib/components/Layout.svelte -->
<!-- Glass Lanes layout shell: background + orbs + topbar + lanes + xaxis + footer. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';
  import Topbar from './Topbar.svelte';
  import LanesView from './LanesView.svelte';
  import XAxisBar from './XAxisBar.svelte';
  import FooterBar from './FooterBar.svelte';
  import CrossLaneHover from './CrossLaneHover.svelte';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  // Announce lifecycle changes for screen readers
  let announcer: HTMLDivElement;
  let prevLifecycle = get(measurementStore).lifecycle;
  let unsubLifecycle: (() => void) | null = null;

  function announce(msg: string): void {
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 50);
  }

  const totalRounds = $derived($settingsStore.cap > 0 ? $settingsStore.cap : 30);
  const currentRound = $derived($measurementStore.roundCounter);

  onMount(() => {
    unsubLifecycle = measurementStore.subscribe((state) => {
      const cur = state.lifecycle;
      const prev = prevLifecycle;
      if (prev !== 'running' && cur === 'running') {
        const n = get(endpointStore).filter(ep => ep.enabled).length;
        announce(`Test started with ${n} endpoint${n === 1 ? '' : 's'}`);
      } else if (prev === 'running' && cur === 'stopping') {
        announce(`Test stopped after ${state.roundCounter} rounds`);
      } else if (prev !== 'completed' && cur === 'completed') {
        announce(`Test completed after ${state.roundCounter} rounds`);
      }
      prevLifecycle = cur;
    });
  });

  onDestroy(() => { unsubLifecycle?.(); });
</script>

<a href="#lanes" class="skip-link">Skip to lanes</a>

<!-- Background layers (fixed, behind everything) -->
<div class="bg" aria-hidden="true"></div>
<div class="orb orb-1" aria-hidden="true"></div>
<div class="orb orb-2" aria-hidden="true"></div>
<div class="orb orb-3" aria-hidden="true"></div>

<!-- App shell -->
<div
  class="app"
  id="lanes"
  style:--bg-base={tokens.color.surface.base}
  style:--orb-cyan={tokens.color.orb.cyan}
  style:--orb-pink={tokens.color.orb.pink}
  style:--orb-violet={tokens.color.orb.violet}
  style:--t1={tokens.color.text.t1}
>
  <Topbar {onStart} {onStop} />
  <LanesView />
  <XAxisBar {totalRounds} {currentRound} />
  <FooterBar />
</div>

<!-- Cross-lane hover overlays (fixed position, above everything) -->
<CrossLaneHover {totalRounds} />

<!-- ARIA live region -->
<div
  bind:this={announcer}
  id="sonde-announcer"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
></div>

<style>
  /* ── Skip link ── */
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    z-index: 9999;
    padding: 8px 16px;
    background: #67e8f9;
    color: #0c0a14;
    font-weight: 600;
    text-decoration: none;
    border-radius: 0 0 4px 0;
    transition: top 100ms ease;
  }
  .skip-link:focus { top: 0; }

  /* ── Animated gradient background ── */
  .bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(ellipse 80% 60% at 20% 10%, rgba(103,232,249,.07) 0%, transparent 60%),
      radial-gradient(ellipse 60% 80% at 85% 90%, rgba(249,168,212,.06) 0%, transparent 50%),
      radial-gradient(ellipse 50% 50% at 50% 50%, rgba(139,92,246,.04) 0%, transparent 60%),
      linear-gradient(160deg, #0c0a14 0%, #100e1e 40%, #0e0c18 100%);
    animation: bgShift 20s ease-in-out infinite alternate;
  }

  @keyframes bgShift {
    0%   { filter: hue-rotate(0deg) brightness(1); }
    100% { filter: hue-rotate(8deg) brightness(1.02); }
  }

  /* ── Floating orbs ── */
  .orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    filter: blur(80px);
    animation: float 15s ease-in-out infinite;
  }
  .orb-1 {
    width: 400px; height: 400px;
    top: -80px; left: 10%;
    background: var(--orb-cyan);
    animation-delay: 0s;
  }
  .orb-2 {
    width: 350px; height: 350px;
    bottom: -60px; right: 5%;
    background: var(--orb-pink);
    animation-delay: -5s;
    animation-duration: 18s;
  }
  .orb-3 {
    width: 250px; height: 250px;
    top: 40%; left: 50%;
    background: var(--orb-violet);
    animation-delay: -10s;
    animation-duration: 22s;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33%       { transform: translate(30px, -20px) scale(1.05); }
    66%       { transform: translate(-20px, 15px) scale(.95); }
  }

  /* ── App shell ── */
  .app {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--t1);
  }

  /* ── SR only ── */
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

### Step 10.3 — Update App.svelte bridgeTokensToCss()

The `bridgeTokensToCss()` function must be updated to bridge the new Glass tokens. Read `App.svelte` first (already read above).

Replace the `bridgeTokensToCss()` function body in `App.svelte`:

```typescript
function bridgeTokensToCss(): void {
  const root = document.documentElement;

  // Background
  root.style.setProperty('--bg-base', tokens.color.surface.base);

  // Text opacity layers
  root.style.setProperty('--t1', tokens.color.text.t1);
  root.style.setProperty('--t2', tokens.color.text.t2);
  root.style.setProperty('--t3', tokens.color.text.t3);
  root.style.setProperty('--t4', tokens.color.text.t4);
  root.style.setProperty('--t5', tokens.color.text.t5);

  // Accent
  root.style.setProperty('--accent-cyan',   tokens.color.accent.cyan);
  root.style.setProperty('--accent-pink',   tokens.color.accent.pink);
  root.style.setProperty('--accent-green',  tokens.color.accent.green);
  root.style.setProperty('--green-glow',    tokens.color.accent.greenGlow);

  // Glass
  root.style.setProperty('--glass-bg',        tokens.color.glass.bg);
  root.style.setProperty('--glass-border',    tokens.color.glass.border);
  root.style.setProperty('--glass-highlight', tokens.color.glass.highlight);

  // Orbs
  root.style.setProperty('--orb-cyan',   tokens.color.orb.cyan);
  root.style.setProperty('--orb-pink',   tokens.color.orb.pink);
  root.style.setProperty('--orb-violet', tokens.color.orb.violet);

  // Fonts
  root.style.setProperty('--sans', tokens.typography.sans.fontFamily);
  root.style.setProperty('--mono', tokens.typography.mono.fontFamily);

  // Spacing
  root.style.setProperty('--spacing-xxs', `${tokens.spacing.xxs}px`);
  root.style.setProperty('--spacing-xs',  `${tokens.spacing.xs}px`);
  root.style.setProperty('--spacing-sm',  `${tokens.spacing.sm}px`);
  root.style.setProperty('--spacing-md',  `${tokens.spacing.md}px`);
  root.style.setProperty('--spacing-lg',  `${tokens.spacing.lg}px`);
  root.style.setProperty('--spacing-xl',  `${tokens.spacing.xl}px`);
  root.style.setProperty('--spacing-xxl', `${tokens.spacing.xxl}px`);

  // Radius
  root.style.setProperty('--radius-sm', `${tokens.radius.sm}px`);
  root.style.setProperty('--radius-md', `${tokens.radius.md}px`);
  root.style.setProperty('--radius-lg', `${tokens.radius.lg}px`);
  root.style.setProperty('--radius-btn', `${tokens.radius.btn}px`);

  // Timing
  root.style.setProperty('--timing-fade-in',   `${tokens.timing.fadeIn}ms`);
  root.style.setProperty('--easing-standard',  tokens.easing.standard);
  root.style.setProperty('--easing-decelerate',tokens.easing.decelerate);

  // Legacy properties (Settings/Share drawers not yet redesigned)
  root.style.setProperty('--surface-raised',   tokens.color.surface.mid);
  root.style.setProperty('--surface-elevated', tokens.color.surface.deep);
  root.style.setProperty('--text-primary',     tokens.color.text.t1);
  root.style.setProperty('--text-secondary',   tokens.color.text.t2);
  root.style.setProperty('--text-muted',       tokens.color.text.t3);
  root.style.setProperty('--border',           tokens.color.chrome.border);
  root.style.setProperty('--accent',           tokens.color.chrome.accent);
  root.style.setProperty('--accent-hover',     tokens.color.chrome.accentHover);
  root.style.setProperty('--status-success',   tokens.color.status.success);
  root.style.setProperty('--status-error',     tokens.color.status.error);
  root.style.setProperty('--status-timeout',   tokens.color.status.timeout);
}
```

### Step 10.4 — Run full verification

```bash
cd /Users/shane/claude/sonde && npm run typecheck && npm run build
```
Expected: no type errors, build succeeds. Check for any import that still references the removed components.

```bash
npx vitest run
```
Expected: all existing tests pass (no regressions from the retired renderer tests — those are updated in Task 12).

---

## Task 11 — Empty state and edge cases

### Step 11.1 — Verify Lane empty state (AC-7)

`LaneSvgChart` already renders "Waiting for data" when `hasData === false`. Add an explicit test:

```typescript
// Append to tests/unit/lane-svg-chart.test.ts
it('renders "Waiting for data" when no measurements exist', () => {
  const { container } = render(LaneSvgChart, {
    props: {
      endpointId: 'ep-new',
      color: '#67e8f9',
      colorRgba06: 'rgba(103,232,249,.06)',
      totalRounds: 30,
    },
  });
  const text = container.querySelector('.empty-text');
  expect(text?.textContent).toContain('Waiting for data');
});
```

```bash
cd /Users/shane/claude/sonde && npx vitest run tests/unit/lane-svg-chart.test.ts
```
Expected: 3 tests green.

### Step 11.2 — Verify no-raw-visual-values ESLint rule

```bash
cd /Users/shane/claude/sonde && npx eslint src/lib/tokens.ts src/lib/components/Lane.svelte src/lib/components/LaneSvgChart.svelte
```
Expected: 0 errors. If any hex/rgba appear outside `tokens.ts`, move them to the token file.

---

## Task 12 — Update retired renderer tests

The Canvas-based tests (`timeline-renderer.test.ts`, `render-scheduler.test.ts`) still compile and pass because the source files are not deleted — just no longer imported by the app. Update the test files to reflect their retired status and avoid any future confusion.

Pre-task reads:
- [ ] Read `tests/unit/timeline-renderer.test.ts`
- [ ] Read `tests/unit/render-scheduler.test.ts`

### Step 12.1 — Update timeline-renderer.test.ts

Add a describe block at the top noting the renderer is retired, but keep existing tests so we don't lose coverage of the isolated class:

```typescript
// Prepend to tests/unit/timeline-renderer.test.ts after existing imports:

// NOTE: TimelineRenderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead of a shared Canvas 2D.
// These tests remain to ensure the class still compiles and its coordinate math
// is correct should it be needed for a future alternate view.
```

No test deletions; just the comment block.

### Step 12.2 — Run full suite

```bash
cd /Users/shane/claude/sonde && npx vitest run
```
Expected: all tests green.

### Step 12.3 — Typecheck and lint

```bash
cd /Users/shane/claude/sonde && npm run typecheck && npm run lint
```
Expected: 0 errors, 0 warnings on new files.

---

## Verification Checklist

Run all of the following before marking this plan complete. Non-zero exit codes = task NOT done.

```bash
cd /Users/shane/claude/sonde

# 1. Typecheck
npm run typecheck

# 2. Tests
npx vitest run

# 3. Lint (no raw hex/rgba outside tokens.ts)
npm run lint

# 4. Build
npm run build
```

Then open the built app in a browser and manually verify each AC:

- [ ] AC-1: Background gradient and 3 orbs visible
- [ ] AC-2: Fonts are Sora/Martian Mono (inspect DevTools)
- [ ] AC-3: Topbar 54 px, gradient logo, green pulse dot
- [ ] AC-4: Each endpoint = one lane card, 18 px radius
- [ ] AC-5: Lane panel 250 px, hero P50 54 px weight-200
- [ ] AC-6: SVG shows gridlines, dots, ribbon, median, trace, now-pulse
- [ ] AC-7: Empty state "Waiting for data" before test starts
- [ ] AC-8: Hover line spans all lanes when mouse in chart area
- [ ] AC-9: Tooltip shows round, per-endpoint values, comparative label
- [ ] AC-10: X-axis round numbers, future rounds dimmed
- [ ] AC-11: Footer shows "Measuring from your browser" + stats
- [ ] AC-12: No SummaryCards, no sonar pings, no HeatmapCanvas in primary view
- [ ] AC-13: Hover line does NOT appear when mouse is in left panel (x < 260)
- [ ] AC-14: `tokens.ts` exports `glass` group; no `ink*` tokens in production paths
- [ ] AC-15: No raw hex/rgba in any new .svelte file

---

## Key decisions / risks

1. **`color-mix()` in `.lane::after`** — Used for the left-edge inner glow. Falls back gracefully (no glow) in browsers without support. If needed, replace with hardcoded rgba variants for the two default endpoint colors (cyan/pink).

2. **Endpoint color → rgba06** — `colorToRgba06()` in `LanesView.svelte` now validates the input with `/^#[0-9a-fA-F]{6}$/` and returns a cyan fallback for non-6-digit-hex inputs (Advisory A2 fix). The default `ep0`–`ep9` tokens are all 6-digit hex so the guard is only a safety net.

3. **Statistics `stddev` as jitter proxy** — The lane panel shows "Jitter" using `stats.stddev`. This is consistent with how the old SummaryCard labeled it.

4. **`totalRounds` default** — When `settingsStore.cap === 0` (unlimited), `totalRounds` defaults to 30. This affects XAxisBar labels and LaneSvgChart future-zone. If cap is 0, the future zone never shows once round 30 is passed. A future improvement can dynamically expand totalRounds.

5. **HeatmapCanvas not deleted** — Retained in the file tree. Not imported by any new component. Can be restored for a future "alternate views" tab.
