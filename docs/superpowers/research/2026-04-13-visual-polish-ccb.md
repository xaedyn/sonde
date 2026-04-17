---
date: 2026-04-13
feature: visual-polish
type: ccb
---

# Codebase Context Brief — Visual Polish

## Stack

- Svelte 5 (runes mode) + Vite + TypeScript (strict)
- Sora (sans) + Martian Mono (mono) web fonts
- Glass-morphism dark theme: bg `#0c0a14`, accents cyan `#67e8f9` / pink `#f9a8d4`
- Design tokens in `src/lib/tokens.ts` — single source for all visual primitives
- Vitest (unit) + Playwright (visual regression)
- Cloudflare Pages deploy

## Existing Patterns

- **Component architecture:** Svelte 5 runes (`$derived`, `$state`, `$props`). No stores for UI-local state.
- **Styling:** Scoped `<style>` blocks per component. CSS custom properties bridged from tokens via `style:` directives. No utility-class framework.
- **Layout:** Flex column shell (Topbar → LanesView → XAxisBar → FooterBar). Lanes fill remaining viewport. Left panel 250px fixed, chart flex:1.
- **Responsive:** Single breakpoint at 767px (tablet). Mobile stacks lane panel vertically. No responsive typography or button collapse.
- **Animation:** CSS transitions/keyframes. SVG `<animate>` for now-dot pulse. `prefers-reduced-motion` partially respected.

## Relevant Files

| File | Purpose | Key elements to modify |
|------|---------|----------------------|
| `src/lib/tokens.ts` | Design token system — all raw values | Typography scale, spacing, breakpoints |
| `src/lib/components/Topbar.svelte` | App header: logo, status, action buttons | Button hierarchy, status integration |
| `src/lib/components/Lane.svelte` | Lane card: left panel + chart area | Label/URL hierarchy, stats layout, compact mode |
| `src/lib/components/LaneSvgChart.svelte` | SVG scatter chart per lane | Empty state rendering |
| `src/lib/components/LanesView.svelte` | Lane container, layout mode logic | Empty state when no endpoints |
| `src/lib/components/EndpointRow.svelte` | Endpoint config row in drawer | Spacing, control styling |
| `src/lib/components/EndpointPanel.svelte` | Endpoint list + add button | Drawer content layout |
| `src/lib/components/EndpointDrawer.svelte` | Drawer shell (dialog) | Drawer chrome, mobile sheet |
| `src/lib/components/Layout.svelte` | App shell, background orbs | Responsive grid |
| `src/lib/components/FooterBar.svelte` | Footer status bar | Already contains legend |

## Constraints

- Token system is the single source of truth — no raw hex/rgba/px values in components (enforced by ESLint rule `no-raw-visual-values`)
- Existing Playwright visual regression tests must not break — any visual change needs baseline updates
- Glass-morphism visual language is locked (established 2026-04-09) — enhance within it, don't replace it
- Data must remain the hero — this is a networking tool, not a portfolio piece

## Open Questions

- The 250px fixed panel width is a hard constraint in `tokens.lane.panelWidth` — should this become fluid for mobile, or does the existing vertical-stack mobile layout handle it?
- Compact mode (4+ endpoints) already hides the left panel and shows an overlay header — how does the polish interact with compact mode?
- The endpoint `label` field exists on the data model but the Lane component shows the raw URL — is this a deliberate choice or an oversight?
