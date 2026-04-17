---
date: 2026-04-13
feature: visual-polish
type: design-validation
---

# Design Validation — UX Polish

## Acceptance Criteria (from Step 2.5)

AC1: When a user sees the topbar in idle/stopped state, the Start button is the only filled/accented element in the action row — visually distinguishable from secondary buttons without reading the label. When running, the Stop button uses a distinct destructive visual treatment.

AC2: When a user glances at a lane's left panel, the endpoint label (e.g. "Google") is the primary identifier — not the raw URL. The P50 hero number is self-explanatory without the "P50 MEDIAN LATENCY" engineering label. Stats row reads as supporting context.

AC3: When the app is in idle state with no measurement data, each lane chart shows a purposeful empty state using existing design language without introducing new visual patterns.

AC4: When the user clicks Start, the button visually transforms with a CSS transition rather than an instant swap. All transitions respect `prefers-reduced-motion`.

AC5: When viewed at 375px width, the topbar does not overflow. Start/Stop remains a full tappable button (44px min). Secondary actions collapse. Lane cards usable with no horizontal scroll. All touch targets meet WCAG 2.1 AA (44x44px).

## Dependency Enumeration

No existing interfaces modified — pure CSS/template visual refactor. No store contracts, type interfaces, or cross-component APIs change. All modifications are within existing component boundaries.

## Questions Asked & Answers

### Zero Silent Failures

- **What happens to existing users when this ships?**
  Nothing breaks. All changes are CSS/template-level. Existing localStorage settings load identically. Share payload URLs render identically (label display is derived from existing `ep.label || ep.url` fallback, which already works).

- **What happens to existing data?**
  No schema or format changes. MeasurementSample, EndpointMeasurementState, SharePayload, PersistedSettings — all unchanged.

- **What happens to existing integrations?**
  No API callers exist — this is a client-side SPA. The share URL format is unchanged.

- **What's the failure mode if the first deployment step succeeds but the second fails?**
  Single atomic deploy to Cloudflare Pages. No multi-step deployment — all changes ship as one static bundle.

### Failure at Scale

- **Does this work at 10x?**
  N/A for visual refactor — no runtime logic changes. The CSS transitions (200ms crossfade, responsive clamp) have zero impact on measurement performance.

- **Concurrent operations?**
  No state mutations added. Button transitions are pure CSS — no race conditions possible.

- **External dependency unavailability?**
  No new external dependencies. The SVG icons for collapsed mobile buttons will be inline SVG, not fetched.

### Simplest Attack

- **Cheapest abuse vector?**
  N/A — no new inputs, endpoints, or auth surfaces. All changes are presentation-layer.

- **Auth/authz misconfiguration?**
  No new endpoints or permissions introduced.

- **Unprivileged user information leakage?**
  No new data exposed. Label display was already the existing behavior for default endpoints.

## Gaps Found

1. **Label persistence gap:** User-added endpoints have empty labels — they'll display raw URLs. The `label` field is not persisted in localStorage or share payloads. Default endpoints ("Google", "Cloudflare DNS") always have labels.

## Fixes Applied

1. **Label persistence:** Out of scope for this visual polish — the existing `ep.label || ep.url` fallback handles this gracefully. User-added endpoints showing their URL is correct behavior (the user typed that URL). A future feature could auto-extract hostname as label, but that's additive scope. No design change needed.
