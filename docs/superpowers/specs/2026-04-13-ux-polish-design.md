---
date: 2026-04-13
feature: ux-polish
type: spec
approach: full-responsive-polish
---

# UX Polish — Design Spec

## Problem

Chronoscope's UI is functionally complete but lacks the information hierarchy, responsive design, and transition polish expected of a shipping product. Button weighting is flat, engineering labels compete with hero data, empty states are lifeless, state transitions are instant, and the 375px mobile viewport is untested. Users perceive these as "unfinished" even when the underlying tool works correctly.

## Acceptance Criteria

**AC-1 (Button hierarchy):** At 1440px, the Start button has a visible filled accent background that is distinguishable from all other topbar buttons without reading labels. At 375px, secondary buttons render as icon-only with `aria-label` attributes.

**AC-2 (Information hierarchy):** The lane panel shows the endpoint label (e.g. "Google") in Sora 12px/500 above the hero number. The text "P50 MEDIAN LATENCY" does not appear. A single word "Median" appears in 9px/t4 beneath the hero number.

**AC-3 (Empty state):** When no measurement data exists, each lane chart renders a centered SVG ring with `stroke: ep-color` and the text "Waiting for data" in 10px/t4. With `prefers-reduced-motion: reduce`, the ring has no `<animate>` children.

**AC-4 (State transitions):** Clicking Start triggers a CSS transition on the button's `background`, `border-color`, and `color` properties (duration ≥100ms). With `prefers-reduced-motion: reduce`, these transitions have `duration: 0s`.

**AC-5 (Mobile 375px):** At 375px viewport width, no element overflows the viewport horizontally. All interactive elements have a minimum tappable area of 44x44px (achieved via element size or padding). The Start/Stop button renders with a text label (not icon-only).

## Success Metrics

- AC-1 through AC-5 pass at 1440px, 768px, 375px, and 480px viewports
- Zero layout overflow or horizontal scroll at 375px (verified by Playwright `page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)`)
- `prefers-reduced-motion` disables all new animations (verified by Playwright emulation)
- No performance regression: `npm run typecheck`, `npm run lint`, `npm test` all pass
- Playwright visual regression baselines updated in the same PR

## Out of Scope

- Label auto-generation from URLs (user-added endpoints showing raw URLs is acceptable)
- Label persistence in localStorage/share payloads
- PWA, offline support, native mobile
- Touch gestures beyond standard tap
- Endpoint drawer visual redesign (spacing refinement only)
- Compact mode (4+ endpoints) redesign — polish applies to full-panel mode; compact mode inherits what it can

---

## 1. Topbar Button Hierarchy

### Current
Four identically-styled ghost buttons: + Endpoint, Settings, Share, Start. All use `border: glass.border`, `color: t2`, `font-size: 11px`. Start has a faint pink accent but is barely distinguishable.

### New Tokens Required

Add to `tokens.ts` primitive section:
```
cyan15: 'rgba(103,232,249,.15)',
cyan25: 'rgba(103,232,249,.25)',
cyan40: 'rgba(103,232,249,.4)',    // already exists
pink15: 'rgba(249,168,212,.15)',
pink25: 'rgba(249,168,212,.25)',
```

Add to `tokens.ts` semantic section under `color.accent`:
```
cyanBgSubtle:     primitive.cyan15,
cyanBorderSubtle: primitive.cyan25,
pinkBgSubtle:     primitive.pink15,
pinkBorderSubtle: primitive.pink25,
```

Add to `tokens.breakpoints`:
```
small: 480
```

### Target

**Start button (idle/stopped/completed):**
- Background: `accent.cyanBgSubtle`
- Border: `accent.cyanBorderSubtle`
- Color: `accent.cyan`
- On hover: background `accent.cyan25`, border `accent.cyan40`, `translateY(-1px)`, `box-shadow: 0 2px 16px rgba(103,232,249,.2)`

**Stop button (running):**
- Background: `accent.pinkBgSubtle`
- Border: `accent.pinkBorderSubtle`
- Color: `accent.pink`
- On hover: background `accent.pink25`, `box-shadow: 0 2px 16px rgba(249,168,212,.2)`

**Start↔Stop transition:**
- `transition: background 200ms ease, border-color 200ms ease, color 200ms ease`
- Label is an instant text swap — the 200ms color crossfade makes it imperceptible

**Secondary buttons (Settings, Share, + Endpoint):**
- Border: `transparent`
- Background: `transparent`
- Color: `t3` (demoted from current t2)
- On hover: background `glass.bg`, color `t2`, `translateY(-1px)`

**Status area:**
- DOM structure: keep existing `.run-status` div between logo and spacer. Remove `.sep` (the vertical divider element). The `.run-status` div already occupies the correct position.
- Running state: existing green pulse dot + "Round N" text in `t3` mono 11px. Remove the "Running ·" prefix — the Stop button and green dot communicate running state.
- Starting/stopping transitional states: show "Starting..." / "Stopping..." as currently implemented (no change)
- Idle/stopped/completed: hide `.run-status` entirely (`display: none`)
- Status dot entrance: `transform: scale(0)→scale(1)` over 200ms with `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring overshoot)
- Status dot exit: `transform: scale(1)→scale(0)` over 150ms ease-in

### Desktop (>767px)
All buttons visible with text labels.

### Mobile (≤767px)
- Start/Stop: full button with text label, `min-width: 72px`, `min-height: 44px` (directly meets WCAG touch target — no padding math needed)
- Settings: collapses to gear icon (inline SVG, 16x16 viewBox), button element `min-width: 44px`, `min-height: 44px`, `aria-label="Settings"`
- Share: collapses to share icon, same 44x44 minimum, `aria-label="Share"`
- + Endpoint: collapses to plus-circle icon, same 44x44 minimum, `aria-label="Add endpoint"`
- Gap between buttons: 4px
- Logo: at <480px, `max-width: 80px` with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (CSS-only truncation, no conditional rendering)

---

## 2. Lane Panel Information Hierarchy

### Current
Top to bottom: raw URL (11px mono t3) → hero number 54px → "P50 MEDIAN LATENCY" (9px mono t4) → stats grid (P95/P99/Jitter/Loss all at 14px)

### Target

**Endpoint label (primary identifier):**
- Text: `ep.label || ep.url` (already resolved in LanesView — no data flow change)
- Font: 12px / weight 500 / Sora (promoted from 11px mono weight 300)
- Color: t2 (promoted from t3)
- `text-overflow: ellipsis`, `max-width: 100%`

**Hero number:**
- Desktop: `font-size: 54px` (unchanged)
- Mobile (≤767px): `font-size: clamp(32px, 10vw, 54px)`
- Remove the "P50 MEDIAN LATENCY" label. Replace with "Median" in 9px / weight 300 / Martian Mono / color t4. This is a demotion from a long engineering label to a short contextual hint — not a contradiction. The old label is removed; the new word occupies the same position but is shorter and quieter.

**Stats row:**
- Demote values: 12px (down from 14px)
- Demote labels: 8px / color t5 (existing `rgba(255,255,255,.07)` — down from t4)
- Increase gap: 12px (up from 10px)
- Desktop: 4-column grid (unchanged)
- Mobile (≤767px): CSS container query on `.lane-stats` — when container width < 200px, switch to `grid-template-columns: 1fr 1fr` (2×2). This uses `container-type: inline-size` on the parent, avoiding JS measurement. Container queries are supported in all modern browsers and align with the existing CSS-first approach.

---

## 3. Empty State

### Current
Single SVG `<text>` — "Waiting for data", 14px / weight 300, `rgba(255,255,255,.14)`.

### Target
- A single ring, centered in the SVG plot area
- Ring: `<circle>`, `stroke: var(--ep-color)`, `fill: none`, `opacity: 0.06`, `r: 40`, `stroke-width: 0.5` (all in viewBox units)
- Animation: `<animate attributeName="r" values="38;42" dur="3s" repeatCount="indefinite"/>` + `<animate attributeName="opacity" values="0.04;0.08" dur="3s" repeatCount="indefinite"/>`
- Text below ring: "Waiting for data" in SVG `<text>`, 10px / `var(--mono)` / `fill: rgba(255,255,255,.1)` — smaller and more muted than current
- `prefers-reduced-motion`: wrap `<animate>` elements in a `{#if !reducedMotion}` check. The ring renders static at `opacity: 0.06, r: 40`. The `reducedMotion` boolean is derived from `matchMedia('(prefers-reduced-motion: reduce)')` (add to component if not already present).
- No illustrations, no emoji, no instructional text

---

## 4. State Transitions

### Start → Running
- Button: background/border/color crossfade over 200ms ease (CSS transition, already specified in Section 1)
- Label: instant "Start" → "Stop" text swap
- Status area: `.run-status` transitions from `display: none` → visible. Round counter and dot fade in with `opacity: 0→1` over 200ms. Dot scales in with spring easing.

### Running → Stopped
- Button: pink→cyan crossfade 200ms
- Label: "Stop" → "Start"
- Dot: `scale(1)→scale(0)` over 150ms ease-in, then `.run-status` hides
- Round counter: remains visible briefly during the scale-out, then hidden with the container

### Starting / Stopping (transitional)
- Show "Starting..." / "Stopping..." text as currently implemented
- Button is disabled during these states (already the case)
- No special transition — these states are brief (<500ms typically)

### All transitions
- `prefers-reduced-motion`: all CSS `transition-duration` set to `0s` via media query
- No layout shift — Start and Stop button occupy the same space (same `min-width`)

---

## 5. Mobile Responsive

### Topbar (≤767px)
- Icon-only secondary buttons with 44x44px minimum interactive area (Section 1)
- Logo truncation at <480px via CSS `max-width` + `text-overflow` (Section 1)
- Padding: `0 12px`, gap: `4px`

### Lane Cards (≤767px)
- Panel stacks vertically (already exists)
- Hero number: `clamp(32px, 10vw, 54px)`
- Stats: 2×2 via CSS container query (Section 2)
- Panel padding: `16px 20px` (down from `24px 28px`)

### Footer
- At <480px: hide "Measuring from your browser" text via `display: none`
- Legend bar and progress text remain

### Breakpoints
- `768px` (existing): tablet — panel stacks, buttons collapse to icons
- `480px` (new, `tokens.breakpoints.small`): small phone — logo truncation, footer text hidden, tighter spacing

### Viewport Testing
- 1440px (wide desktop), 768px (tablet), 480px (small phone), 375px (iPhone SE) — all four must pass AC-1 through AC-5

---

## 6. Inline SVG Icons

Three icons for mobile topbar. All use `viewBox="0 0 16 16"`, `stroke="currentColor"`, `fill="none"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.

- **Gear** (Settings): 6-tooth cog outline
- **Share** (Share): square with upward arrow (iOS share idiom)
- **Plus** (+ Endpoint): circle with centered plus

Inline in Topbar.svelte. Desktop: hidden (`display: none`). Mobile: visible, replacing text labels. Each icon wrapped in its button element (same `<button>` as desktop, just different content via `{#if isMobile}`).

The `isMobile` boolean is derived from `matchMedia('(max-width: 767px)')` — consistent with the existing responsive approach in LanesView.

---

## Security Surface

No new attack surface. All changes are CSS/template-level. No new inputs, endpoints, auth paths, or data exposure.

## Rollout

- Single atomic deploy to Cloudflare Pages
- No backward compatibility concerns — pure visual changes
- Rollback: revert the commit
- Playwright visual regression baselines updated in the same PR

## Edge Cases

- **Empty label + URL display:** User-added endpoints fall back to URL via `ep.label || ep.url`. No change needed.
- **Compact mode (4+ endpoints):** Compact overlay header has its own layout (28px bar). Label promotion (Sora 12px) and stats demotion (12px values) apply to compact header labels where space permits. Mobile topbar collapse applies regardless.
- **Shared view:** "Run your own" button gets filled accent treatment (same as Start). Secondary buttons get ghost treatment.
- **0 endpoints:** "Add an endpoint to begin" in LanesView unchanged. The + Endpoint icon button is reachable on mobile (44x44 tap target).
- **prefers-reduced-motion:** All `<animate>` elements gated by `reducedMotion` check. All CSS transitions set to `0s` via `@media (prefers-reduced-motion: reduce)`. Tested at all four viewports.
- **Starting/Stopping transitional states:** Show existing "Starting..." / "Stopping..." text. Button disabled. No special transition needed — these states last <500ms.
