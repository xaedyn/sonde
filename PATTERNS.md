# Patterns — Chronoscope v2 redesign

Cross-phase rules that generalize out of CodeRabbit / DeepSource findings.
Appended to as new generalizable findings land. Future self-reviews on
MEDIUM- or HIGH-risk PRs consult this file as a checklist.

Format: numbered entries, each with one-sentence rule, one-sentence why,
originating PR, and a concrete check for the adversarial self-review pass.

---

## 1. Merge `$effect`s that share writable state
**Rule:** If two `$effect`s read or write the same flag, merge them into one — sibling effects have no ordering guarantee in Svelte 5.
**Why:** One effect can write the shared flag before the other reads it, silently skipping logic that gated on the prior value (e.g. dropping a screen-reader announcement for the current tick).
**Found in:** PR #46 (Phase 2 ChronographDial threshold-cross effects).
**Check in self-review:** Grep the file for `$effect`. For every pair, list each flag they touch. If any flag appears in two or more effects, merge or justify.

## 2. Gate every motion surface behind `prefers-reduced-motion`
**Rule:** Every animation — CSS keyframes, SVG `<animate>`, and JS-driven (rAF / setInterval / tween) — must respect the user's reduced-motion preference. Cover all three surfaces, not just one.
**Why:** Skipping any single surface lets animation leak through for users who explicitly disabled it. WCAG 2.3.3 applies to all motion equally.
**Found in:** PR #46 (Phase 2 ChronographDial — CSS pulse was gated, SVG `<animate>` pip and rAF hand lerp were not).
**Check in self-review:** For every animated element in the PR, confirm the gate lives on the right surface — `@media (prefers-reduced-motion: reduce)` for CSS, a reactive `prefersReducedMotion` boolean driven by a **live** `matchMedia` listener (not just an initial read) for SVG and JS. The listener must be installed inside `$effect` with `return () => mq.removeEventListener(...)` for cleanup.

## 3. User-facing aggregates go through `monitoredEndpoints`, not raw `endpointStore`
**Rule:** Any derivation that feeds a displayed score, verdict, metric, rank, or live visualization (dial orbit, racing strip row, event feed filter, baseline window, …) must iterate `monitoredEndpointsStore`, not `$endpointStore`. Raw iteration is reserved for chrome that intentionally lists every endpoint regardless of status (the rail, management drawers).
**Why:** `networkQualityStore` already filters disabled endpoints. If downstream views iterate the raw store, a disabled endpoint with stale samples can become the "worst endpoint", inflate counts, move the median, and contradict the score on the same screen.
**Found in:** PR #46 (Phase 2 OverviewView — live median, worst-endpoint, over-count, total-samples, dial orbit all iterated raw).
**Check in self-review:** Grep the PR for `endpointStore` subscriptions and `$endpoints` iterations. For each, ask: "does this feed a number or a mark the user sees?" If yes, switch to `$monitoredEndpointsStore`. If no (chrome listing), add a comment explaining why the raw store is intentional.
