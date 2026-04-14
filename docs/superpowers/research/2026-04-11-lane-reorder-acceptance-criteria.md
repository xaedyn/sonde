---
date: 2026-04-11
feature: lane-reorder
type: acceptance-criteria
---

# Acceptance Criteria — Lane Drag-to-Reorder

AC1: When a user presses and drags the grip handle on a lane card, the card follows the pointer vertically and neighboring cards animate to show the drop position with a smooth CSS transition.

AC2: When the user releases the dragged card, the endpoint store array is reordered to match the new visual position, and the new order persists across page reload via localStorage.

AC3: When a user interacts with the chart area (hover, click), drag does not activate — drag only initiates from the grip handle element.

AC4: When lanes are in compact mode or 2-column grid layout, the drag handle is visible and reordering functions correctly.
