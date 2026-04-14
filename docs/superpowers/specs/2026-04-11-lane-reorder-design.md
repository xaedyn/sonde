---
date: 2026-04-11
feature: lane-reorder
type: spec
---

# Lane Drag-to-Reorder — Design Spec

## Problem

Users with multiple endpoints cannot control the visual ordering of lane cards. The display order is fixed by the order endpoints were added. Users want to arrange lanes by priority or comparison interest.

## Success Metrics

- Lanes can be reordered via drag-and-drop using a grip handle
- New order persists across page reload
- Drag interaction does not interfere with chart hover/selection
- Works in full, compact, and 2-column grid layout modes

## Out of Scope

- Keyboard-based reordering (future a11y enhancement)
- Drag between different layout modes (e.g., dragging from 2-col into 1-col)
- Touch gesture refinement beyond basic pointer events (pointerdown/move/up work on touch natively)

## Approach

Pointer events + CSS transforms. Zero dependencies.

### Drag Handle

6-dot grip icon (⠿) rendered as an SVG or CSS dots pattern on the left edge of the stats panel in Lane.svelte. In compact mode, the grip appears on the left edge of the compact header.

- `cursor: grab` on hover, `cursor: grabbing` during drag
- `touch-action: none` on the handle to prevent scroll conflict on mobile
- Handle is a `<button>` with `aria-label="Reorder lane"` for accessibility

### Drag Interaction (LanesView.svelte)

1. `pointerdown` on grip handle: capture the pointer, record starting Y and the lane's index
2. `pointermove`: apply `transform: translateY(deltaY)` to the dragged card. Calculate which neighbor the card has crossed based on cumulative offset vs. card heights. Shift crossed neighbors with `transform: translateY(±cardHeight)` using CSS transition.
3. `pointerup`: commit the new order via `endpointStore.reorderEndpoint(fromIndex, toIndex)`. Remove all inline transforms. Persistence happens automatically (existing save-on-change pattern).

### Visual Feedback

- Dragged card: `z-index: 10`, `opacity: 0.92`, `box-shadow` elevation, `scale(1.01)` — subtle "lifted" feel
- Neighbor shift: `transition: transform 200ms cubic-bezier(0.4, 0.0, 0.2, 1)` (tokens.easing.standard)
- On drop: card snaps to final position (transforms removed, DOM order updated reactively)

### Store Changes (endpoints.ts)

Add `reorderEndpoint(fromIndex: number, toIndex: number): void` method that splices the endpoint from `fromIndex` and inserts at `toIndex`.

### 2-Column Grid

In grid mode, drag works within the visual flow. The grid reflows naturally when the array order changes. During drag, only vertical displacement is tracked — horizontal position is handled by grid layout.

## Security Surface

None. Client-side-only interaction. No new inputs, no server communication.

## Rollout

Static site — deploy replaces the bundle. No backward compatibility concerns. No rollback needed beyond reverting the commit.

## Edge Cases

- **Single endpoint:** Drag handle hidden (nothing to reorder).
- **During active test:** Allowed. Measurements keyed by endpoint ID, not position. Store update triggers reactive re-render; charts continue uninterrupted.
- **Rapid re-drag:** Pointer capture ensures only one drag at a time. Previous drag completes on pointerup before a new one can start.
- **Drag beyond container bounds:** Clamp translateY to container bounds. pointerup outside container still commits (pointer capture ensures we receive the event).
- **Disabled endpoints:** Disabled endpoints are filtered out of the visible list. Reordering operates on the full endpoint array (not just visible), so disabled endpoint positions are preserved.
