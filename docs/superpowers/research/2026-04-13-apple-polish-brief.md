---
date: 2026-04-13
feature: apple-polish
type: research-brief
---

# Research Brief — Apple UX Polish

## Industry Patterns

### Button Hierarchy in Dark UIs
Apple HIG specifies `borderedProminent > bordered > borderless` [VERIFIED]. Linear uses exactly one filled accent button per view — all others are ghost/text [VERIFIED]. Arc Browser: one filled button per toolbar maximum [SINGLE]. Converged convention across Apple-ecosystem tools: **one filled element per visual group**, never two filled buttons adjacent [UNVERIFIED].

### Data Display Hierarchy
Apple Health: hero metric in ~48pt semibold, no label above it — the card title IS the label. Unit in ~17pt secondary gray beside the number. Contextual stats in ~13pt [VERIFIED]. Activity rings: color-as-label pattern replaces text labels entirely — the ring color identifies the metric, not a text string [VERIFIED]. Stocks: semantic color in pills reduces label dependency [SINGLE].

**Takeaway:** The hero number should be self-explanatory. Labels above the hero number are redundant — the panel context (endpoint name) provides the label. Supporting stats should be visually demoted.

### Empty States
Linear: single line of gray text + ghost action link. No illustrations, no emoji [VERIFIED]. Notion: faded line-art illustration (~64px, ~0.4 opacity) with one instructional sentence [VERIFIED]. **The line:** if the empty state has more visual weight than a populated state, it's kitschy. Professional tools use **less** visual weight empty than populated [UNVERIFIED].

### State Transitions
Apple Timer: `spring(0.3s, bounce: 0.15)` for idle→active. Button fill crossfades green→red over 200ms, label swaps. No scale transform [VERIFIED]. Linear: 150ms ease-out opacity crossfade between icon states [SINGLE]. Convention: under 250ms, color crossfade only, no layout shift [UNVERIFIED].

### Mobile Dark Dashboards
Apple Health: 2-col → 1-col, hero metric preserved, sparkline hidden. Lower-priority cards behind "Show All" [VERIFIED]. Grafana: panels stack full-width, legends collapse to tap-expand drawer, time selector → bottom sheet [SINGLE]. Pattern: preserve hero metric + primary action, collapse secondary metadata, eliminate multi-series viz rather than shrinking [UNVERIFIED].

## Codebase Findings

### Data Flow for Modifications
- **Topbar** receives only `onStart`/`onStop` callbacks. Reads `measurementStore.lifecycle` and `uiStore` for state. Button styling is entirely local CSS — no shared button component.
- **Lane** is purely presentational. Receives pre-resolved `url` prop (actually `ep.label || ep.url` from LanesView). The `label` field exists on Endpoint type and is always populated for defaults ("Google", "Cloudflare DNS"). User-added endpoints get empty labels (fall back to URL).
- **LaneSvgChart** empty state is a single SVG `<text>` element — trivial to replace.
- **EndpointDrawer** is store-driven (uiStore.showEndpoints), conditionally mounted in App.svelte.
- **No shared animation utilities** — all transitions are inline per component. Token values in `tokens.timing`.

### Key Constraint: Label Persistence
`label` is NOT persisted in localStorage or share payloads — only `url` and `enabled` are saved. Default endpoints get labels from `DEFAULT_ENDPOINTS`. User-added endpoints (via "+ Add endpoint") call `endpointStore.addEndpoint('https://', '')` — empty label, URL becomes the display text. **This means label-first display requires either: (a) persisting labels, or (b) auto-generating labels from URLs.**

### Responsive Infrastructure
Layout mode is computed in `layout.ts` via `deriveLayoutMode()`, driven by ResizeObserver in LanesView. Mobile detection uses `matchMedia`. Current logic: single breakpoint at 767px. Compact mode (4+ endpoints) already hides the panel and shows an overlay header. The responsive infrastructure exists — it just needs more breakpoints and mobile-specific treatments for the topbar.

### No Interface Modifications
All changes are CSS/template-level within existing components. No store contracts, type interfaces, or cross-component APIs are being modified. Dependency enumeration: N/A — pure visual refactor.
