# Chronoscope Figma Alignment Acceptance Spec

**Created:** 2026-05-15  
**Status:** Source-of-truth acceptance contract for the recovery redesign  
**Stack decision:** Keep the existing Chronoscope Svelte stack. Do not import, ship, or migrate to the generated React prototype.

## Why This Exists

The previous redesign work improved Chronoscope's diagnostic engine, trust language, reports, responsive behavior, and visual polish, but it preserved too much of the old product shell. This spec defines the missing work precisely: adapt the accepted Figma direction into the current Svelte application so the live product visibly matches the intended composition.

This is not a request for another light restyle. The target is a product-level hierarchy replacement while preserving Chronoscope's real measurement and diagnostic systems.

## Frozen Reference Artifacts

Reference source:

- Local Figma export: `/Users/shane/claude/chronoscope-redesign-figma/`
- Captured reference manifest: `docs/artifacts/figma-alignment-reference/manifest.json`
- Current production mismatch manifest: `docs/artifacts/figma-alignment-current/manifest.json`

Reference screenshots:

- Overview desktop: `docs/artifacts/figma-alignment-reference/screenshots/overview-desktop-2048x1330.png`
- Overview laptop: `docs/artifacts/figma-alignment-reference/screenshots/overview-laptop-1440x900.png`
- Overview mobile: `docs/artifacts/figma-alignment-reference/screenshots/overview-mobile-390x844.png`
- Live desktop/laptop/mobile: `docs/artifacts/figma-alignment-reference/screenshots/live-*.png`
- Investigate desktop/laptop/mobile: `docs/artifacts/figma-alignment-reference/screenshots/investigate-*.png`
- Report desktop/laptop/mobile: `docs/artifacts/figma-alignment-reference/screenshots/report-*.png`

Mismatch screenshots:

- Current laptop: `docs/artifacts/figma-alignment-current/screenshots/current-overview-laptop-1440x900.png`
- Current mobile: `docs/artifacts/figma-alignment-current/screenshots/current-overview-mobile-390x844.png`

The reference screenshots are the visual contract. The current screenshots are examples of what must no longer be true after the alignment work.

## Non-Negotiables

1. Chronoscope stays a Svelte app.
2. Production UI must be rebuilt as Svelte components using existing stores and utilities.
3. The generated React prototype is visual reference only.
4. The old left endpoint rail must not be the primary desktop frame.
5. The giant dial must not dominate the Overview.
6. The primary first-viewport answer must be the Figma-style verdict card.
7. Top navigation must expose `Overview`, `Live`, `Investigate`, and `Report`.
8. `Report` must become reachable as a first-class top-level surface, while share/hash report behavior remains supported.
9. Accuracy and proof boundaries outrank visual drama. UI copy must never imply certainty beyond the diagnostic evidence.
10. No PR merges without local screenshots compared against the frozen reference and a live-site check after deployment.

## Overview Acceptance Criteria

The Overview is the highest-risk surface and must be fixed first.

Pass criteria:

- The first desktop viewport has a Figma-style top app bar with brand left, start/stop control right, settings affordance right, and second-row navigation.
- Navigation labels are `Overview`, `Live`, `Investigate`, and `Report`.
- The dominant visual element is a large verdict/evidence card, not the old dial.
- The score ring is a supporting module inside the verdict card.
- The verdict card includes:
  - severity badge,
  - measuring/running state where applicable,
  - plain-language headline,
  - measured fact sentence,
  - interpretation sentence,
  - primary outside-network verification CTA,
  - secondary evidence CTA.
- Measured endpoint rows appear below the verdict card with endpoint label, status phrase, compact sparkline, latency, and delta/variation.
- Event log appears beside or below measured endpoints depending on viewport.
- Mobile preserves the same hierarchy: top bar, nav, verdict card, measured endpoints, event log. It may scroll, but it must not start with the old giant dial-first layout.

Fail criteria:

- Desktop still shows the persistent left endpoint rail.
- Overview still centers on the large chronograph dial.
- `Status` remains the primary nav label instead of `Overview`.
- Report is absent from top-level navigation.
- The primary answer is compressed into a thin strip.
- Mobile first viewport is mostly dial.

## Live Acceptance Criteria

Live may retain Chronoscope's real scope functionality, but it must fit the new shell.

Pass criteria:

- Live is reached from the top-level nav.
- Its header, controls, tab state, and surface styling match the reference navigation/system.
- Endpoint selection is available through compact controls or summary rows, not through the old permanent left rail.
- Scope/canvas behavior remains real and testable.
- No horizontal overflow at 390 px mobile width.

## Investigate Acceptance Criteria

Investigate keeps existing diagnostic depth, but the presentation must align with the Figma proof-system aesthetic.

Pass criteria:

- The page uses the new top-level shell.
- The page separates measured browser facts, interpretation, and next proof steps.
- Existing CORS/timing limitation language remains accurate.
- Existing remote vantage/local companion proof boundaries remain explicit.
- The page does not introduce speculative root-cause claims.

## Report Acceptance Criteria

Report must become a visible product surface while retaining share/report behavior.

Pass criteria:

- `Report` appears in top-level nav.
- Report can render from the current run, shared report context, or the best available local context.
- Existing hosted/hash share behavior remains intact.
- Report actions still support copy/share flows.
- The report artifact uses the same dark premium visual system as the reference.

## Data And Copy Rules

Use real Chronoscope data only:

- Endpoints come from `endpointStore` / monitored derived stores.
- Latency, jitter, loss, score, and readiness come from existing measurement/statistics stores.
- Verdicts and confidence come from existing diagnostic narrative and scoring utilities.
- Timeline/event content comes from existing storyline/event utilities.
- Remote/local proof CTAs wire into existing Investigate/proof flows.

Copy must be evidence-bound:

- Prefer "measured from this browser" over broad network claims.
- Say "likely" only when the diagnostic model has supporting evidence.
- Do not tell users their Wi-Fi, ISP, DNS, route, or endpoint is definitely the issue unless the measured evidence can prove it.
- When evidence is browser-limited, say so directly.

## PR Sequence

PR 1: Shell and Navigation Alignment

- Replace the old shell impression with the Figma-style top app bar and top-level nav.
- Keep drawers/popovers for endpoints, settings, and share.
- Add `Report` as a first-class view state.
- Remove the permanent desktop left rail from the default Overview/Live/Investigate/Report composition.

PR 2: Overview Verdict Card

- Rebuild Overview around the Figma-style verdict card.
- Move score into a supporting ring/module.
- Preserve real diagnostic narrative, confidence, baseline, limitation, and next-step data.

PR 3: Measured Endpoints and Event Log

- Replace the old Overview lower section with measured endpoint rows and event log.
- Preserve compact sparkline/history signal.
- Keep endpoint drilldowns into Live/Investigate.

PR 4: Live, Investigate, and Report Alignment

- Bring secondary surfaces into the new shell and visual system.
- Promote Report as a top-level app view without breaking shared report mode.

PR 5: Fidelity, Mobile, Accessibility, and Deployment Gate

- Add/extend screenshot checks against deterministic degraded fixtures.
- Verify desktop, laptop, and mobile against the frozen reference.
- Verify live production after merge.

## Merge Gate For Every PR

Before merging any Figma alignment PR:

1. Run typecheck, lint, unit tests, build, and targeted visual tests.
2. Capture local implementation screenshots at the same reference sizes.
3. Compare against the relevant frozen reference screenshots.
4. Record a short mismatch ledger in the PR summary.
5. Fix material visual drift before merge.
6. After merge and deployment, check `https://chronoscope.dev/` directly.

## Definition Of Done

The Figma alignment is complete only when opening `https://chronoscope.dev/` looks unmistakably like the frozen Figma direction while remaining powered by Chronoscope's existing Svelte measurement, diagnosis, reporting, and sharing systems.

The final live product must not read as "the old Chronoscope with nicer panels." It must read as the accepted redesigned product.
