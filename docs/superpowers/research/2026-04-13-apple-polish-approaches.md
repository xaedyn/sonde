---
date: 2026-04-13
feature: apple-polish
type: approaches
---

# Approach Decision Memos — Apple UX Polish

---

## APPROACH: Surgical Hierarchy

### Core Idea
Touch only what breaks information hierarchy — button weighting, label cleanup, stats demotion, empty state — without restructuring layout or adding responsive complexity.

### Mechanism
Reweight the topbar: Start gets a filled cyan background, secondary buttons become borderless text-only. In the lane panel, swap URL for label as primary text, drop the "P50 MEDIAN LATENCY" engineering label (the card context provides it), and demote stats to t4/smaller. Replace the empty state SVG text with a subtle pulsing ring in the brand accent. Add 200ms CSS crossfade transitions on Start↔Stop color change. Leave mobile as-is — the existing vertical stack at <768px is functional if imperfect.

### Fit Assessment
- **Scale fit:** Matches — CSS-only changes, zero runtime cost
- **Team fit:** Fits — no new patterns, just CSS and template edits
- **Operational:** Zero operational burden — no new dependencies, no infrastructure
- **Stack alignment:** Pure Svelte/CSS within existing token system

### Tradeoffs
- **Strong at:** Maximum visual impact with minimum code delta. Lowest risk of regression. Ships fast.
- **Sacrifices:** Mobile gets no dedicated treatment. Endpoint drawer stays utilitarian. The 375px viewport will be better (topbar button reduction helps) but not purpose-built.

### What We'd Build
- Topbar button hierarchy (filled primary, borderless secondary)
- Lane panel label/stats hierarchy cleanup
- Empty state pulsing accent ring
- Start↔Stop crossfade transition
- Status text integration into button state

### The Bet
The 80/20 rule applies: 80% of the "Apple feel" comes from information hierarchy and restraint, not from responsive engineering or micro-interactions.

### Reversal Cost
If wrong at 30 days: easy — all changes are CSS/template, no data model or architecture changes.

### What We're Not Building
Mobile-specific topbar collapse. Responsive typography. Endpoint drawer redesign. State machine animations beyond the Start/Stop toggle.

### Industry Precedent
Linear ships a single filled accent button per view with no mobile-specific toolbar treatment — the information hierarchy alone carries the design [VERIFIED].

---

## APPROACH: Full Responsive Polish

### Core Idea
Treat this as a complete responsive design pass — hierarchy changes plus dedicated mobile treatments for every component, responsive typography, and topbar collapse.

### Mechanism
Everything in Surgical Hierarchy, plus: add responsive typography tokens using `clamp()` for hero numbers and stat values. At <768px, topbar secondary buttons collapse to icons (gear, share, link) with tooltips — Start/Stop remains full-width at bottom as a floating action bar. Lane panel width becomes fluid with `min()`. Stats row switches to 2×2 grid below 300px panel width. Endpoint drawer mobile sheet gets refined spacing. Add a second breakpoint at 480px for small phones.

### Fit Assessment
- **Scale fit:** Matches — still CSS/template only, but more media queries and responsive tokens
- **Team fit:** Fits — Svelte's style system handles responsive well
- **Operational:** Zero — same deploy target (Cloudflare Pages, static)
- **Stack alignment:** Extends existing token system with responsive values; adds icon assets for collapsed buttons

### Tradeoffs
- **Strong at:** Complete, polished experience across all viewports. Genuine "show this to anyone" quality at 375px. The full Apple bar.
- **Sacrifices:** 2-3x the code delta of Surgical Hierarchy. More visual regression test baselines to update. Risk of unintended layout shifts in compact mode (4+ endpoints). Icon selection for collapsed buttons is a design decision that needs to be made.

### What We'd Build
- Everything from Surgical Hierarchy
- Responsive typography tokens (`clamp()`)
- Mobile topbar: icon-only secondary buttons + bottom-anchored Start/Stop
- Fluid lane panel width
- 2×2 stats grid for narrow viewports
- Refined mobile endpoint drawer spacing
- Second breakpoint (480px)
- SVG icons for Settings, Share, + Endpoint

### The Bet
Mobile viewport quality matters to how the product is perceived even if most users are on desktop — because the first impression often happens when someone shares a link and it's opened on a phone.

### Reversal Cost
If wrong at 30 days: moderate — responsive tokens and icon components can be removed, but the layout changes across multiple components would need coordinated rollback.

### What We're Not Building
Native mobile app. PWA offline support. Touch gesture interactions beyond standard tap targets.

### Industry Precedent
Apple Health mobile collapses 2-col to 1-col while preserving hero metrics [VERIFIED]. Grafana mobile stacks panels full-width with collapsible legends [SINGLE].

---

## Comparison Matrix

| Criterion | Surgical Hierarchy | Full Responsive Polish |
|-----------|-------------------|----------------------|
| AC1: Primary action dominance | STRONG — filled primary, borderless secondary | STRONG — same, plus icon-only mobile collapse |
| AC2: Information hierarchy | STRONG — label-first, stats demoted, label dropped | STRONG — same, plus responsive typography scaling |
| AC3: Empty state | STRONG — accent ring replaces flat text | STRONG — identical treatment |
| AC4: State transition continuity | STRONG — 200ms crossfade on Start/Stop | STRONG — identical treatment |
| AC5: Mobile viewport (375px) | PARTIAL — hierarchy helps but no dedicated mobile layout | STRONG — purpose-built mobile topbar, fluid panel, 2×2 stats |
| Scale fit | Matches | Matches |
| Team fit | Fits | Fits |
| Operational burden | Zero | Zero |
| Stack alignment | Fits existing | Extends existing (new tokens, icons) |
