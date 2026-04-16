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
  t3: 'rgba(255,255,255,.5)',
  t4: 'rgba(255,255,255,.32)',
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
  pink70:     'rgba(249,168,212,.7)',
  cyan15:     'rgba(103,232,249,.15)',
  cyan25:     'rgba(103,232,249,.25)',
  pink15:     'rgba(249,168,212,.15)',
  pink25:     'rgba(249,168,212,.25)',
  amber:      '#fbbf24',

  green:     '#86efac',
  greenGlow: 'rgba(134,239,172,.5)',

  // Tier2 phase palette (opacity-attenuated primitives for waterfall segments)
  tier2Dns:      'rgba(134,239,172,.7)',   // green   — DNS resolution
  tier2Tcp:      'rgba(103,232,249,.7)',   // cyan    — TCP connect
  tier2Tls:      'rgba(196,181,253,.7)',   // violet  — TLS handshake
  tier2Ttfb:     'rgba(251,191,36,.7)',    // amber   — server processing (TTFB)
  tier2Transfer: 'rgba(249,168,212,.7)',   // pink    — content transfer
  tier2LabelText: 'rgba(255,255,255,.40)', // bumped from t4 (.32) to .40 for WCAG AA

  // Glass surfaces
  glassBg:        'rgba(255,255,255,.03)',
  glassBorder:    'rgba(255,255,255,.07)',
  glassHighlight: 'rgba(255,255,255,.12)',

  // Lane surface (slightly darker glass)
  laneBg: 'rgba(255,255,255,.025)',

  // Topbar
  topbarBg: 'rgba(255,255,255,.025)',

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

  // Ambient background accent (tokenized from Layout.svelte's .bg pink radial)
  bgAccent: 'rgba(249,168,212,.03)',

  // Elevation-aware surface border hierarchy (dim → mid → bright, ≥ .04 delta per tier)
  borderDim:    'rgba(255,255,255,.04)',
  borderMid:    'rgba(255,255,255,.08)',
  borderBright: 'rgba(255,255,255,.14)',
} as const;

// ── Semantic tokens ────────────────────────────────────────────────────────
export const tokens = {
  color: {
    surface: {
      base:     primitive.bgBase,
      mid:      primitive.bgMid,
      deep:     primitive.bgDeep,
      raised:   primitive.bgMid,
      elevated: primitive.bgDeep,
      overlay:  'rgba(0, 0, 0, 0.6)',
      border: {
        dim:    primitive.borderDim,
        mid:    primitive.borderMid,
        bright: primitive.borderBright,
      },
    },

    bg: {
      accent: primitive.bgAccent,
    },

    text: {
      t1: primitive.t1,
      t2: primitive.t2,
      t3: primitive.t3,
      t4: primitive.t4,
      t5: primitive.t5,
      emptyFill: 'rgba(255,255,255,.1)',
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
      cyan25:           primitive.cyan25,
      cyanBgSubtle:     primitive.cyan15,
      cyanBorderSubtle: primitive.cyan25,
      pink25:           primitive.pink25,
      pinkBgSubtle:     primitive.pink15,
      pinkBorderSubtle: primitive.pink25,
      green:      primitive.green,
      greenGlow:  primitive.greenGlow,
    },

    glow: {
      cyan: 'rgba(103,232,249,.2)',
      pink: 'rgba(249,168,212,.2)',
    },

    glass: {
      bg:          primitive.glassBg,
      bgStrong:    'rgba(255,255,255,.045)',
      bgHover:     'rgba(255,255,255,.07)',
      border:      primitive.glassBorder,
      borderHover: primitive.glassHighlight,
      highlight:      primitive.glassHighlight,
      highlightStrong: 'rgba(255,255,255,.9)',
      shadow:         'rgba(0,0,0,.15)',
      shadowStrong: 'rgba(0,0,0,.5)',
      statsBorder:  'rgba(255,255,255,.04)',
    },

    lane: {
      bg: primitive.laneBg,
    },

    topbar: {
      bg: primitive.topbarBg,
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

    heatmap: {
      fast:     'rgba(103,232,249,.6)',   // cyan — clearly good (brand accent)
      normal:   'rgba(234,179,8,.4)',     // yellow — moderate
      elevated: 'rgba(249,115,22,.7)',    // orange — attention
      slow:     'rgba(239,68,68,.7)',     // red — problem
      timeout:  'rgba(185,28,28,.85)',    // crimson — critical
    },

    orb: {
      cyan:   primitive.orbCyan,
      pink:   primitive.orbPink,
      violet: primitive.orbViolet,
    },

    tier2: {
      dns:       primitive.tier2Dns,
      tcp:       primitive.tier2Tcp,
      tls:       primitive.tier2Tls,
      ttfb:      primitive.tier2Ttfb,
      transfer:  primitive.tier2Transfer,
      labelText: primitive.tier2LabelText,
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
    caption: { size: 9,  weight: 400, opacity: 0.5,  letterSpacing: '0.04em' },
    label:   { size: 11, weight: 500, opacity: 0.58, letterSpacing: '0.06em' },
    body:    { size: 14, weight: 400, opacity: 0.94, letterSpacing: '0' },
  },

  spacing: {
    xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, lg2: 20, xl: 24, xxl: 32, xxxl: 48,
  },

  radius: {
    xs:  4,
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
    tooltipDelay:     50,    // faster than hoverTip — tier2 tooltip needs snappier response
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
    statTransition:  200,
    dotEntrance:     200,
    dotExit:         150,
    loadingPulse:         2400,
    loadingRingDuration:  1800,
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
    chartWindow:    60,   // max visible rounds in SVG chart (sliding window)
    topbarHeight:   54,
    xAxisHeight:    30,
    footerHeight:   38,
    minHeight:           120,   // px — minimum lane height before 2-col triggers (AC3)
    compactHeaderHeight:  28,   // px — height of compact overlay header
    compactThreshold:      4,   // endpoint count that triggers compact mode (AC2)
    maxEndpoints:         10,   // hard cap on endpoint count (AC4)
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

  breakpoints: { small: 480, mobile: 375, tablet: 768, desktop: 1024, wide: 1440 },
} as const;

export type Tokens = typeof tokens;
