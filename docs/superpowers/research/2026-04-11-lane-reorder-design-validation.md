---
date: 2026-04-11
feature: lane-reorder
type: design-validation
---

# Design Validation — Lane Drag-to-Reorder

## Acceptance Criteria (from Step 2.5)

AC1: When a user presses and drags the grip handle on a lane card, the card follows the pointer vertically and neighboring cards animate to show the drop position with a smooth CSS transition.

AC2: When the user releases the dragged card, the endpoint store array is reordered to match the new visual position, and the new order persists across page reload via localStorage.

AC3: When a user interacts with the chart area (hover, click), drag does not activate — drag only initiates from the grip handle element.

AC4: When lanes are in compact mode or 2-column grid layout, the drag handle is visible and reordering functions correctly.

## Dependency Enumeration

No existing interfaces modified. `endpointStore` gains a new `reorderEndpoint(fromIndex, toIndex)` method — purely additive. No external consumers break.

## Questions Asked & Answers

### Zero Silent Failures
- What happens to existing users when this ships? Nothing — drag handle appears but existing interactions unchanged. No migration needed.
- What happens to existing data? Endpoint array order is already persisted. No format change.
- What happens if the first deployment step succeeds but the second fails? N/A — single static build, no multi-step deploy.

### Failure at Scale
- Does this work at 10x endpoints? Max endpoints is capped at 10 (`MAX_ENDPOINTS`). Drag with 10 cards is fine.
- Concurrent operations? Reorder during active test: endpoint store update triggers reactive re-render. Measurement data is keyed by endpoint ID, not position — no data loss.

### Simplest Attack
- N/A — client-side-only feature, no server endpoints, no auth surface. Share URLs encode endpoints by value, not by position reference.

## Gaps Found

No gaps identified.

## Fixes Applied

None required.
