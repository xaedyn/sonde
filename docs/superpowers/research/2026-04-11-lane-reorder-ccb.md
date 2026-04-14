---
date: 2026-04-11
feature: lane-reorder
type: codebase-context-brief
---

# Codebase Context Brief — Lane Drag-to-Reorder

## Stack

Svelte 5 (runes), TypeScript ~6.0.2, Vite 8, Vitest ^4.1.3, SVG per-lane charts.

## Existing Patterns

- **State:** Svelte writable stores with explicit mutation methods. Endpoints stored as `Endpoint[]` — array order = display order.
- **Rendering:** `LanesView.svelte` iterates `$endpointStore.filter(ep => ep.enabled)` with `{#each endpoints as ep (ep.id)}` — keyed by id, rendered in array order.
- **Components:** `Lane.svelte` is a glass card with stats panel (left) + chart slot (right). Accepts `children` snippet for `LaneSvgChart`.
- **Persistence:** `persistence.ts` saves `{ url, enabled }[]` to localStorage. Order is preserved implicitly by array position.
- **Interaction:** `LanesView` handles mousemove/mouseleave for cross-lane hover. No existing pointer event handlers.
- **Tokens:** All visual constants in `src/lib/tokens.ts`. Timing, easing, colors, spacing.

## Relevant Files

| File | Purpose | Key Exports/Signatures |
|------|---------|----------------------|
| `src/lib/components/LanesView.svelte` | Lanes container, prepareFrame, hover handler | Renders `{#each endpoints as ep}` |
| `src/lib/components/Lane.svelte` | Glass card per endpoint | Props: endpointId, color, url, stats, compact, children |
| `src/lib/stores/endpoints.ts` | Endpoint CRUD store | `endpointStore.addEndpoint()`, `.removeEndpoint()`, `.updateEndpoint()`, `.setEndpoints()` |
| `src/lib/tokens.ts` | Design tokens | `tokens.timing.*`, `tokens.easing.*`, `tokens.color.text.*` |
| `src/lib/utils/persistence.ts` | localStorage save/load | `saveSettings()`, `loadPersistedSettings()` |

## Constraints

- Must not interfere with existing chart hover/selection interactions (mousemove on `.lane-chart`).
- Must work in both full and compact lane modes.
- Must work in 2-column grid layout mode (4+ endpoints).
- Lane cards use `flex: 1` — heights are dynamic. Drag must account for variable card heights.
- Endpoint order persists via array position — no schema migration needed.

## Open Questions

- Should reorder work during an active test run, or only when idle? (Reordering while running would cause visual discontinuity as lanes shift.)
