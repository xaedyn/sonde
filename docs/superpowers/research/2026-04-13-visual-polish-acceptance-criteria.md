---
date: 2026-04-13
feature: visual-polish
type: acceptance-criteria
---

# Acceptance Criteria — Visual Polish

## AC1: Primary Action Dominance

When a user sees the topbar in idle/stopped state, the Start button is the only filled/accented element in the action row — visually distinguishable from secondary buttons (Settings, Share, + Endpoint) without reading the label. When running, the Stop button uses a distinct destructive visual treatment (not identical to Start).

## AC2: Information Hierarchy in Lane Panel

When a user glances at a lane's left panel, the endpoint label (e.g. "Google") is the primary identifier — not the raw URL. The P50 hero number is self-explanatory without the "P50 MEDIAN LATENCY" engineering label. Stats row (P95/P99/Jitter/Loss) reads as supporting context, not competing with the hero number.

## AC3: Empty State

When the app is in idle state with no measurement data, each lane chart shows a purposeful empty state that communicates readiness — not flat gray text. The empty state uses existing design language (glass, accent colors, subtle motion) without introducing new visual patterns.

## AC4: State Transition Continuity

When the user clicks Start, the button visually transforms (fill, color, label) with a CSS transition rather than an instant swap. The status indicator in the topbar animates in rather than appearing instantly. When stopped, the transition is equally smooth. All transitions respect `prefers-reduced-motion`.

## AC5: Mobile Viewport (375px)

When viewed at 375px width, the topbar does not overflow or clip. The Start/Stop button remains a full, tappable button (minimum 44px touch target). Secondary actions collapse to a more compact representation. Lane cards are fully usable with no horizontal scroll. All touch targets meet WCAG 2.1 AA minimum (44x44px).
