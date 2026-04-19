# Phase notes — Chronoscope v2 redesign

Accumulating log of watch-items surfaced during phased delivery but deferred
for later attention. Each entry names the phase it came from, the signal, and
the condition under which it becomes actionable.

## Phase 7 decisions

- **Migration hops all green before any deletion landed.** Non-negotiable
  honored: v4→v7 (three hops), v5→v7, v6→v7, v7 pass-through, plus
  stray-Lanes-on-v7 coerce, debug-log fires for Lanes-family input,
  no log for modern input, and an explicit assertion that hypothetical
  Lanes-era Settings fields (`timelineZoom`, `heatmapResolution`,
  `laneDensity`) are structurally dropped by the `readSettingsField`
  allowlist. 18/18 migration tests pass; first deletion commit was layered
  on top of that green baseline.
- **`LegacyActiveView` + `LegacyPersistedSettings` intermediate types.**
  Kept legacy view strings contained to the migration chain so the public
  `ActiveView` union could narrow cleanly to
  `overview | live | atlas | strata | terminal` without casts leaking to
  consumers. Only `stepV6toV7` crosses from legacy → narrow.
- **Debug-log policy.** `stepV6toV7` logs at `console.debug` when a
  Lanes-family view collapses to 'overview'. Quiet for modern payloads
  (no false breadcrumbs). Chose debug level over warn because this is an
  expected one-time transition per user, not an error.
- **CR finding: `CURRENT_VERSION` was hardcoded in App.svelte's fallback
  payload writer.** `App.svelte:177` had `version: 6` while
  `persistence.ts` moved `CURRENT_VERSION` to 7 — fresh installs would
  have written a legacy schema needing re-migration. Fixed by exporting
  `CURRENT_VERSION` from `persistence.ts` and referencing it at the call
  site. **Pattern generalized (but not yet added to PATTERNS.md):** when
  a schema version bump lands, grep `version:\s*<N>` across `src/` before
  merging — any non-migration-code hit is a bug. Could formalize as
  PATTERNS.md §4 on the next phase that bumps the schema.
- **Bundle delta (net subtraction, non-negotiable satisfied):**
  - JS: 76.32 KB → 62.32 KB gzip — **−14.00 KB** (−45.97 KB raw)
  - CSS: 13.24 KB → 10.17 KB gzip — **−3.07 KB** (−17.68 KB raw)
  - Combined: **−17.07 KB gzip** (−63.65 KB raw)
  - 21 files removed (−7,592 LoC); 567/567 tests, typecheck clean, lint clean.
- **No README to update.** The repo has no top-level README.md; only
  `PATTERNS.md` and `PHASE_NOTES.md`. Neither referenced Lanes in
  user-facing text (Phase 7 updated the comment banners inside retired
  files, not documentation). `handoff/` docs are historical design
  records left intact.
- **Deferred CR nitpicks.** `tokens.ts` banner + `tokens.lane` namespace
  rename (touches 5 consumer files) left for a follow-up cleanup PR;
  `color-mix-fallbacks.test.ts` regex robustness also deferred. `Layout.svelte`
  `strata`/`terminal` fallthrough retained as defense-in-depth with an
  intent-explaining comment — ViewSwitcher's disabled guard is the
  primary control; the fallthrough is the backstop.
- **`tokens.lane` rename is the biggest follow-up watch-item** —
  post-Phase-7 the group holds only `chartWindow` + shell-chrome
  (topbar/rail/x-axis/footer heights), so the name is misleading. When a
  future cleanup PR lands the rename, migrate consumers in `App.svelte`,
  `LiveView.svelte`, `ScopeCanvas.svelte`, `FooterBar.svelte`, and this
  file in one commit.

## Phase 4 decisions

- **verdict.ts reuse landed without new branches.** `AtlasView` consumes
  `PHASE_LABELS` and the `Tier2Phase` vocabulary directly; the new
  `phaseHypothesis()` entry point sits alongside `computeCausalVerdict`
  in the same file without touching the existing decision tree. Single-
  endpoint phase-dominance and network-wide causal verdict share the
  phase vocabulary but are otherwise independent functions — the split
  kept `computeCausalVerdict`'s 7 branches untouched.
- **Rail is the only endpoint picker.** AtlasView empty-state (no
  `focusedEndpointId`) directs users back to the rail rather than
  rendering its own picker. Consistent with the Phase 1 non-negotiable
  that the rail is the single source of endpoint selection.
- **No spec drift.** Plan called for per-phase waterfall + P50/P95 toggle
  + anomaly callout when a phase dominates + recent-samples strip + rail-
  only picker + Atlas tab enabled. All shipped. The verdict card was an
  opportunistic reuse — `phaseHypothesis()` output is surfaced as a
  Verdict + Evidence section instead of a bespoke anomaly card.
- **CR finding that generalized.** Pair-dominance verdicts returned
  `verdictPhase: 'mixed'`, so consumers that did `verdictPhase === phase`
  silently dropped the visual emphasis on both cited phases. Fixed by
  adding `dominantPhases: readonly Tier2Phase[]` to `PhaseHypothesis`,
  populated as `[]` / `[top]` / `[top, second]` for the three branches,
  consumed via `includes()`. **Pattern to watch for in future verdict
  types:** when a discriminant value collapses multiple concrete states
  into one (`'mixed'`), pair it with an explicit set so UI emphasis
  can key on membership rather than equality.
- **P95 empty-state was lying.** Toggling to P95 before `tier2P95` was
  populated emptied the view with "Awaiting tier-2 samples…" — even
  when P50 data was right there. Branched the copy: when `mode === 'p95'`
  and `tier2Averages` exists, surfaces "P95 phase breakdown not yet
  available" with a hint to switch back to P50. Same rule applies to
  any future mode-gated empty state: distinguish "no data at all" from
  "no data in this mode."
- **PATTERNS.md §2 + §3 honored without new entries.** Atlas motion
  (chip hovers, bar-segment brightness) is `@media (prefers-reduced-
  motion: reduce)` gated; the hero bar itself has no JS-driven
  animation. `monitoredEndpointsStore` is the only endpoint source.
  No new cross-phase rules surfaced.

## Phase 3 decisions

- **SVG polylines over Canvas2D.** Spec recommended Canvas2D for
  production (reuse `timeline-renderer.ts`), but the prototype uses SVG
  and Phase 3 was framed as light mode. With 10 endpoints × 60 rounds =
  600 draw ops, SVG is comfortably 60 fps; revisit only if a future
  phase pushes the point count past ~2,000.
- **Routing updates alongside the view.** Now that Live exists, Rail
  double-click + Space drill to `'live'` (was `'lanes'` in Phases 1–2.5),
  RacingStrip click routes to `'live'` (shift-click still `'lanes'`
  until Atlas lands), OverviewView event-feed drill to `'live'`. The
  OverviewView **Diagnose** CTA stays pointed at `'lanes'` pending
  Phase 4 Atlas — same TODO pattern comment at the call site.
- **PATTERNS.md §2 + §3 honored without new entries.** All Phase 3 UI
  motion (chip hovers, tooltip) is `@media (prefers-reduced-motion:
  reduce)` gated; the scope itself has no JS-driven animation — traces
  redraw on data change, not lerp. Every metric derivation iterates
  `monitoredEndpointsStore`. No new cross-phase rules surfaced.
- **Per-component fixes from CR on PR #48** (sparkline-style gap logic
  reuse, trailing-edge throttle pattern, keyboard accessibility on
  interactive SVG elements) did not generalize beyond their components,
  so they live in the commit history rather than PATTERNS.md.
- **No new stores.** LiveView composes from `measurementStore`,
  `statisticsStore`, `settingsStore`, `uiStore`, and the derived
  `monitoredEndpointsStore` — per the MEDIUM-risk non-negotiable.

### Phase 3 — Deferred

- **Time-range selector.** `liveOptions.timeRange` persists
  (`1m`/`5m`/`15m`/`1h`/`24h`) from the Phase 0 migration, but no UI
  exposes it yet. Scope uses a fixed `tokens.lane.chartWindow` (60
  rounds). Future enhancement — retain the persisted field because
  removing it would require a v7 migration just to undo scaffolding.

## Phase 2.5 decisions

- **v5→v6 migration landed cleanly.** Full chain tested end-to-end:
  v1 → v6, v2 → v6, v3 → v6, v4 → v6 (two-hop), v5 → v6 (one-hop), v6
  pass-through. Unknown/missing/non-numeric version → null fallback.
  Garbage `overviewMode` coerces to `'classic'`. Forward-written
  `overviewMode` on a v5 payload is honored. New-field seeding lives in
  `stepV5toV6` in `persistence.ts`; runtime hydration in
  `apply-persisted-settings.ts`.
- **verdict.ts ⇄ classify.ts boundary.** classify answers *"what bucket
  does X land in?"* — owns `classify`, `networkQuality`, `networkLevel`,
  `overviewVerdict`, and the three style palettes. verdict answers
  *"why is X in that bucket and what's the one-sentence diagnosis?"* —
  owns `computeCausalVerdict`, phase-dominance derivation, and the
  `Tier2Phase` / `Verdict` vocabulary. No cyclic imports: verdict imports
  `EndpointStatistics` only; classify has zero verdict dependency.
  Boundary documented as two-line file-header comment in each file.
- **Dial breathing chrome uses `@property`-registered CSS custom
  properties**, not JS-driven SVG attribute animation. `--ring-opacity`,
  `--face-stroke`, `--tick-minor-op`, `--tick-major-op`, `--label-op`,
  `--score-weight` each registered with the correct `<number>` / `<length>`
  syntax and initial value; values lerp over 900 ms via `transition`.
  Reduced-motion users get the `@media` gate that kills the transition
  — same pattern as the rim pulse from Phase 2.
- **ChronographDialV2 as a sibling, not a variant.** Classic dial stays
  frozen at its Phase 2 shape; V2 is a separate file. Geometry constants
  are duplicated rather than extracted to a shared module — intentional
  per the "sibling, not branched" directive so a bug fix on one doesn't
  silently change the other. Revisit if a third dial ever ships.
- **`monitoredEndpointsStore` held across every new derivation.** Score
  history ring, event-derivation walk, baseline pool, verdict rows,
  sparkline samples, `avgP50`/`avgJitter`/`avgLoss` all iterate
  `monitored` per PATTERNS.md §3. Enriched derivations short-circuit
  when `!isEnriched` so Classic users pay no CPU.
- **Event relative-time clock is independent of measurement cadence.**
  EventFeed "N s ago" labels would stall between rounds if `now` was
  derived from `measurements.roundCounter`; the ticker is a 1 s
  `setInterval` gated on `isEnriched`, combined with roundCounter as a
  secondary trigger. Torn down on mode flip + `onDestroy`.
- **No new PATTERNS.md entries this phase** — CR's findings on PR #47
  (EventFeed self-invalidating effect, RacingStrip sparkline gap logic,
  honest-hint copy, test title/assertion mismatch) were component-local
  rather than cross-phase rules, so they live in the commit history
  and PR discussion, not the patterns catalogue.

## Phase 2 decisions

- **Classic Overview only.** Phase 2 ships the minimal chronograph dial + diagnosis
  strip + metrics triptych. Phase 2.5 layers on the Enriched additions (baseline
  arc, 60s quality trace, racing strip, event feed, breathing chrome, within-band
  label) — gated by an `overviewMode: 'classic' | 'enriched'` setting so both
  dials render from the same data.
- **Verdict vs networkLevel asymmetry** (3-bucket dial label vs 4-bucket topbar
  pill) is deliberate — documented at the call site in `src/lib/utils/classify.ts`
  and formalized as a cross-phase pattern in `PATTERNS.md`. Do not unify without
  a product call.
- **Drill destination currently `'lanes'`.** `OverviewView` `handleDrill` and
  `EndpointRail` `handleDoubleClick`/`handleKeydown` all route focus-change + view
  switch to `'lanes'` because Atlas isn't built yet. Swap to `'atlas'` in Phase 4;
  comments flag the TODO in both files.
- **Three motion surfaces gated on prefers-reduced-motion.** The chronograph dial
  has CSS rim pulse, SVG `<animate>` pip ring, and rAF-driven hand lerp — all
  gated via a single `prefersReducedMotion` boolean driven by a live `matchMedia`
  listener. Formalized as PATTERNS.md §2.
- **`monitoredEndpointsStore` is now the only entry point for user-facing
  aggregates.** Added to `src/lib/stores/derived.ts` in the fix commit during
  code review; `networkQualityStore` refactored to consume it so the enabled-only
  invariant lives in one place. Any Phase 2.5+ derivation feeding a displayed
  metric must iterate this store, not the raw `endpointStore`. Formalized as
  PATTERNS.md §3.
- **PAUSED badge is lifecycle-scoped** — shows only for `stopped`/`completed`,
  never `idle` or `starting`. Prop on `ChronographDial` is `paused: boolean`,
  computed in `OverviewView`.
- **PATTERNS.md added at repo root** (`7554cd7`). Bootstrapped with three rules
  generalizing out of the CR review on PR #46: merge `$effect`s that share
  writable state, gate every motion surface on `prefers-reduced-motion`, route
  user-facing aggregates through `monitoredEndpointsStore`. Future adversarial
  self-review passes on MEDIUM/HIGH-risk PRs consult it as a checklist.

## Phase 1 decisions

- **Lanes stayed enabled** in `ViewSwitcher` (only 4 of 5 non-Overview tabs
  disabled, instead of the briefed 5 of 5). Reason: the Phase 0 v4→v5
  migration rewrites every legacy `activeView` (`timeline`/`heatmap`/`split`)
  to `'lanes'`, so disabling the Lanes tab would strand users with no UI
  route to the existing Glass Lanes visualization. Plan to disable/retire
  alongside legacy view removal in **Phase 7**.
- **Disabled-tab pattern** (`tabindex=-1` + `title` tooltip "Prototype in
  progress — not yet available." + `aria-disabled` + `aria-pressed` for the
  toggle state) is the template for Phases 2–6. Each phase that brings a
  view online just flips `enabled: true` on its `VIEWS` entry in
  `ViewSwitcher.svelte`.

## Deferred

### Phase 5 — Strata view (#50)
Handoff spec `handoff/02-view-specs/strata.md` is exploratory with no
prototype. Every prior phase shipped against a validated visual; Phase
5 would mean re-deriving design from prose. Blocked on a design cycle
producing a static prototype + clarity on what "Strata" actually
visualizes (histograms vs percentile stacks vs time-banded strata).
Tab stays disabled-with-tooltip until unblocked.

### Phase 6 — Terminal view (#51)
Same shape as #50: `handoff/02-view-specs/terminal.md` is exploratory,
no prototype exists. Open questions include structured-log-vs-console
framing, live-tail / pause-on-scroll behavior, and the relationship to
the existing Overview EventFeed (superset or different cut?). Tab
stays disabled-with-tooltip until unblocked.

## Open watch-items

### DeepSource Category A — "function declaration in global scope" (Phase 0)
DeepSource JavaScript flags every `export function` at module top level in
`classify.ts`, `format.ts`, `persistence.ts`, and the co-located test files
(11 hits in Phase 0; +1 on `networkLevel` in Phase 1; expected to grow with
each phase). The rule is mis-calibrated for ES modules: `export function` is
*scoped to the module*, not global. The same pattern exists throughout the
pre-existing codebase without being flagged, which suggests the rule was
enabled after most of the repo was written.

**Action:** add a suppression rule to `.deepsource.toml` (or disable the
specific analyzer check) in a small maintenance PR when convenient. Keeps
the "blocking issues" state honest so future real findings don't get lost
in noise. Becoming higher-priority as the count climbs.

### `readSettingsField` cyclomatic complexity 12 (Phase 0)
`src/lib/utils/persistence.ts` — introduced during the `normalizeV5` refactor
that split per-field readers out of the main normalizer. The helper is a
linear shape validator (one ternary per Settings field), so its complexity
reflects field count rather than cognitive complexity. Splitting further
would pad the file without improving readability.

**Action:** revisit if **Phase 2.5 or later** adds more fields to `Settings`
(e.g. `overviewMode`, additional threshold knobs). At that point, break
`readCorsMode` / `readRegion` out as their own helpers, bringing the parent
back under 10.

### Rail drill destination is `'lanes'` until Live ships (Phase 1)
`src/lib/components/EndpointRail.svelte` — both `handleDoubleClick` and
`handleKeydown` (Space) call `uiStore.setActiveView('lanes')`. The
`endpoint-rail.md` spec says drill should go to **Live**, but Live is
disabled in Phase 1 and would route to the Overview stub. Lanes is the
only working detail view today, so it's the right Phase 1 destination.

**Action:** when **Phase 3** lands the Live view, swap both call sites
(double-click + Space-keydown) to `setActiveView('live')`. Comments in the
file already flag the TODO.

### Phase 1 script-only nitpicks deferred (Phase 1)
`scripts/phase-1-screenshots.mjs` — CodeRabbit flagged two minor patterns:
1. The `epMod.endpointStore.subscribe` Promise pattern uses `const unsub`
   referenced inside the synchronous callback. Current code works because
   `setTimeout(unsub, 0)` defers the access past initialization, but a
   future refactor that reads `unsub` synchronously would TDZ-crash.
2. No `try/finally` around the browser lifecycle — a thrown navigation or
   `evaluate` would leak the Chromium process.

**Action:** clean up alongside any future expansion of the screenshot
script (e.g., when Phase 2/3 adds dial / live screenshots and the script
grows enough to warrant proper structure). Not worth a standalone PR.

## Resolved

### CodeRabbit auto-review on v2 redesign branch (Phase 0 → Phase 1)
The `.coderabbit.yaml` widening landed in Phase 0 PR #44 — that PR's
manual trigger was a no-op because CodeRabbit had already evaluated and
cached "skip" for that base branch. **PR #45 (Phase 1) confirmed the
config works:** auto-review fired without prompting, posted 6 actionable
comments + 2 nitpicks, then a follow-up review with 2 more after the
cleanup commit. Future phase PRs will get reviewed automatically.
