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
  amberGlow:  'rgba(251,191,36,.33)',   // #fbbf2455 — chronograph degraded glow
  amberTone:  '#b38410',                // darker amber for arcs/borders

  // Accent glow/tone companions (Phase 0 — v2 views)
  cyanGlow: 'rgba(103,232,249,.33)',    // #67e8f955
  cyanTone: '#3aa7b8',
  pinkGlow: 'rgba(249,168,212,.33)',    // #f9a8d455
  pinkTone: '#b0628a',

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

  // Chronograph dial face / scope canvas background (Phase 0 — v2 views)
  bgDialFace: '#141021',

  // Overlay layer used by v2 share/settings sheets (deeper than legacy overlay)
  overlayDeep: 'rgba(11,8,20,.85)',

  // Rail row surfaces (Phase 0 — v2 endpoint rail)
  glassBgRailHover:    'rgba(255,255,255,.06)',
  glassBgRailSelected: 'rgba(255,255,255,.10)',

  // SVG primitives used by dial, orbit ring, scope grid (Phase 0 — v2 views)
  svgGridCyan:   'rgba(103,232,249,.05)',
  svgGridMajor:  'rgba(255,255,255,.06)',
  svgTickMinor:  'rgba(255,255,255,.18)',
  svgTickMajor:  'rgba(255,255,255,.50)',
  svgHandStroke: '#ffffff',
  svgDialRim:    'rgba(255,255,255,.14)',
  svgOrbitTrack: 'rgba(255,255,255,.06)',
  svgOrbitEdge:  'rgba(255,255,249,.10)',

  // Tooltip surface for scope crosshair (Phase 0 — v2 Live view)
  tooltipBgDeep:  'rgba(10,9,18,.92)',
  tooltipBorder:  'rgba(255,255,255,.10)',
  tooltipText:    'rgba(255,255,255,.95)',
  tooltipTextDim: 'rgba(255,255,255,.55)',

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
      // Chronograph dial face + scope canvas background (v2 views).
      dialFace:    primitive.bgDialFace,
      overlayDeep: primitive.overlayDeep,
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
      cyanGlow:   primitive.cyanGlow,
      cyanTone:   primitive.cyanTone,
      pink:       primitive.pink,
      pinkBright: primitive.pinkBright,
      pink40:     primitive.pink40,
      pink20:     primitive.pink20,
      pink12:     primitive.pink12,
      pink06:     primitive.pink06,
      pinkGlow:   primitive.pinkGlow,
      pinkTone:   primitive.pinkTone,
      cyan25:           primitive.cyan25,
      cyanBgSubtle:     primitive.cyan15,
      cyanBorderSubtle: primitive.cyan25,
      pink25:           primitive.pink25,
      pinkBgSubtle:     primitive.pink15,
      pinkBorderSubtle: primitive.pink25,
      amber:      primitive.amber,
      amberGlow:  primitive.amberGlow,
      amberTone:  primitive.amberTone,
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
      // Rail-scoped glass surfaces (v2 endpoint rail). Distinct from bgHover/bgStrong
      // above to preserve existing-component visuals (see Phase 0 handoff notes).
      bgRailHover:    primitive.glassBgRailHover,
      bgRailSelected: primitive.glassBgRailSelected,
      border:      primitive.glassBorder,
      borderHover: primitive.glassHighlight,
      highlight:      primitive.glassHighlight,
      highlightStrong: 'rgba(255,255,255,.9)',
      shadow:         'rgba(0,0,0,.15)',
      shadowStrong: 'rgba(0,0,0,.5)',
      statsBorder:  'rgba(255,255,255,.04)',
    },

    topbar: {
      bg: primitive.topbarBg,
    },

    footer: {
      bg: primitive.footerBg,
    },

    tooltip: {
      bg: primitive.tooltipBg,
      // Deep tooltip surface for v2 scope crosshair.
      bgDeep:  primitive.tooltipBgDeep,
      border:  primitive.tooltipBorder,
      text:    primitive.tooltipText,
      textDim: primitive.tooltipTextDim,
    },

    svg: {
      gridLine:        primitive.gridLine,
      futureZone:      primitive.futureZone,
      nowDotCyan:      primitive.nowDotCyan,
      nowDotPink:      primitive.nowDotPink,
      thresholdStroke: primitive.thresholdStroke,
      // v2 chronograph + scope primitives.
      gridLineCyan:  primitive.svgGridCyan,
      gridLineMajor: primitive.svgGridMajor,
      tickMinor:     primitive.svgTickMinor,
      tickMajor:     primitive.svgTickMajor,
      handStroke:    primitive.svgHandStroke,
      dialRim:       primitive.svgDialRim,
      orbitTrack:    primitive.svgOrbitTrack,
      orbitEdge:     primitive.svgOrbitEdge,
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

    // v2 named scale — aligned to the prototype (`v2/Chronoscope v2.html`), which
    // is the pixel-fidelity source of truth. Half-pixel sizes from the earlier
    // handoff spec were reconciled to the prototype's integer-px scale.
    scale: {
      xs:   '10px',  // micro labels, all-caps only
      sm:   '11px',  // mono metadata, urls
      md:   '12px',  // controls, chip text
      base: '13px',  // body copy, chips
      lg:   '14px',  // rail metrics, brand name, sub-metric numbers
      xl:   '17px',  // subsection titles, logo
      xl2:  '20px',  // section titles
      xl3:  '24px',  // page titles
      xxl:  '32px',  // reserved for Overview triptych values
    },
    tracking: {
      kicker:  '0.22em',
      label:   '0.14em',
      tight:   '-0.01em',
      display: '-0.03em',
      body:    '0',
    },
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
    progressiveDisclosure: 250,   // SummaryCard stagger
    loadingPulse:         2400,   // LoadingAnimation
    loadingRingDuration:  1800,   // LoadingAnimation

    // v2 motion primitives.
    handLerp:        0.15,   // dial hand smoothing factor (per-frame)
    pulseRim:         400,   // ms — inner-rim stroke color swap on threshold cross
    pulseDialGlow:    900,   // ms — outer drop-shadow flash window; shared by CSS keyframe duration and JS pulse-window timer so the two can't drift
    orbitPulse:      1400,   // ms — orbit pip radius pulse when over threshold
    traceRepaint:      16,   // ms — scope canvas repaint throttle
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
  },

  // Shell + sliding window constants. Phase 7 retired the Lanes family and
  // its layout-algorithm tokens (gapPx / padding* / dotRadius / nowDotRadius /
  // ringInitialR / compactThreshold / compactHeaderHeight / maxEndpoints /
  // panelWidth / minHeight / chartPadding*). chartWindow still drives the
  // Live scope window; topbarHeight / railWidth / xAxisHeight / footerHeight
  // are the v2 shell chrome constants.
  lane: {
    chartWindow:    60,
    topbarHeight:   58,
    railWidth:     264,
    xAxisHeight:    30,
    footerHeight:   38,
  },

  breakpoints: { small: 480, mobile: 375, tablet: 768, desktop: 1024, wide: 1440 },
} as const;

export type Tokens = typeof tokens;
