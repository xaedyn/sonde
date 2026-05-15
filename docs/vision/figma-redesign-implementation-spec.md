# Chronoscope Figma Redesign Implementation Spec

**Status:** Draft implementation contract
**Created:** 2026-05-15
**Reference artifact:** local-only Figma export. If needed, place the export at `docs/artifacts/chronoscope-redesign-figma/` before re-inspection.
**Decision:** Use the Figma concept as the visual north star. Do not import the generated React code.

---

## Purpose

This spec explains how to redesign Chronoscope around the Figma concept while preserving the product's real diagnostic model, proof boundaries, accessibility bar, performance profile, and existing Svelte architecture.

The goal is not to copy a prototype. The goal is to translate the prototype's stronger visual direction into the real Chronoscope product.

The target outcome:

> Chronoscope feels cleaner, calmer, more premium, and easier to understand, while remaining more accurate, evidence-driven, and technically capable than the Figma prototype.

---

## North Star

The redesign should combine two things:

1. **Figma's visual personality**
   - Softer, cleaner dark interface.
   - Plain-language verdict-first hierarchy.
   - More approachable endpoint rows.
   - Report artifact that feels intentional and shareable.
   - Investigate layout that separates browser facts from additional proof steps.

2. **Chronoscope's production truth**
   - Real synchronized browser measurements.
   - Real endpoint configuration and run state.
   - Real diagnostic narrative and claim registry.
   - Real browser timing visibility, CORS, and Timing-Allow-Origin handling.
   - Real Cloudflare remote vantage checks.
   - Real optional local-agent evidence.
   - Real history baselines and share/report payloads.
   - Existing accessibility, CI, visual regression, and trust-copy test discipline.

The Figma concept supplies the feel. Chronoscope supplies the truth.

---

## Non-Negotiables

- **No unsupported cause claims.** The UI may say what was measured, compared, hidden, or worth checking next. It must not blame ISP, Wi-Fi, API, DNS, route, or server unless evidence gates explicitly support that claim.
- **No prototype data in production UI.** Every visible number, verdict, status, timeline mark, and report row must map to existing real state or a new tested data model.
- **No framework migration.** Keep the production app Svelte/Vite. Do not import the generated React app, MUI, Radix, Tailwind, or Recharts dependency tree.
- **No visual regression in trust surfaces.** Browser limitations, timing visibility, remote-vantage caveats, local-agent privacy, and report-copy semantics must stay more precise than the Figma prototype.
- **No horizontal overflow at 375px.** Mobile should be a designed product, not a crushed desktop dashboard.
- **No app shell clutter.** Keep the redesign calm. Avoid reintroducing a permanent footer bar, heavy left rail, or many simultaneous competing charts.
- **No generic SaaS dashboard drift.** Chronoscope should feel like a refined diagnostic instrument, not a generic observability template.
- **Performance cannot materially worsen.** The production bundle should not absorb prototype-only chart/UI libraries for visual convenience.

---

## What To Keep From Figma

### App Shell

Keep the cleaner top navigation direction:

- Product mark and name.
- Run status in the top bar.
- Clear Start/Stop affordance.
- Compact controls for run details, share, settings, and endpoint management.
- Status, Live, and Investigate as the primary IA.

Adaptation notes:

- Report should remain primarily a share/export artifact, not necessarily a fourth main navigation tab.
- The current `Run details` popover should survive and adopt the visual style.
- Mobile navigation must avoid hiding critical controls off-canvas.

### Status Overview

Keep the Figma concept's simpler answer hierarchy:

- A clear verdict headline.
- A short status badge.
- Measured facts in plain language.
- Browser limitation row when applicable.
- One next useful check.
- Endpoint summary rows with latency, jitter, status, and compact trend.

Adaptation notes:

- The score/dial should support the answer, not dominate it.
- The current dial can be retained only if it becomes visually calmer and stable across message length.
- The Overview should fit common desktop viewports without forcing scroll for the default 4-endpoint state.

### Investigate

Keep the split:

- **Measured from your browser**
- **Needs another check**

This is a strong information architecture because it makes proof boundaries visible.

Adaptation notes:

- "Needs another check" must not imply the check proves global truth.
- Remote and local proof panels should be powered by the existing stores and proof-flow utilities.
- Browser timing limitations should use the existing diagnostic-narrative language and claim gates.

### Report

Keep the concept of a report as a polished artifact:

- Header with verdict.
- Measured facts.
- Endpoint comparison table.
- Browser limitations.
- Compact timeline summary.
- Next validation step.
- Copy Summary and Share Link actions.

Adaptation notes:

- Support and snapshot/brag modes must remain distinct.
- Hosted-report fallback, hash-based share links, privacy constraints, and local-agent sanitization must remain intact.

### Visual System

Keep the broad feel:

- Deep near-black background.
- Graphite surfaces.
- Cyan active/system accent.
- Amber caution.
- Green clean/proof state.
- Rose only for request failures or true errors.
- Modern readable sans.
- Mono only for endpoints, timings, timestamps, sample counts, and compact technical labels.
- Softer, calmer panels than the current instrument-heavy app.

---

## What To Reject From Figma

- React implementation and routing.
- Prototype package/dependency tree.
- Hardcoded endpoint data.
- `Math.random()` chart data.
- The phrase "your local Wi-Fi and core ISP connection are likely fine."
- Any copy that says an outside check will "prove" whether something affects everyone globally.
- Mobile nav that hides report/actions off the right edge.
- Report table that requires horizontal scrolling as the primary mobile answer.
- Large ambient glow/orb background treatment.
- Low-contrast muted text.
- Icon-only buttons without accessible labels.
- Score label "Based on aggregate latency" unless it maps to an accurate score explanation.
- Generated comments such as "V2/V3" in production code.

---

## Current Product Traits To Preserve

The redesign must preserve these existing product advantages:

- Browser-first, no-account measurement.
- Synchronized rounds across endpoints.
- Response-gated cadence.
- Default endpoint set and custom endpoint management.
- Verdict-first Status view.
- Live unified/split/solo trace behavior.
- Investigate correlation, distribution, phase timing, loaded latency, network context, remote vantage, and local-agent proof.
- Claim registry and proof-gated diagnostic narrative.
- Timing-Allow-Origin and CORS guidance.
- Local history baselines.
- Share/support report and snapshot/brag report modes.
- Hosted report creation and hash-share fallback.
- Local-agent privacy boundaries.
- Collective-intelligence opt-in boundaries.
- CI, visual tests, axe checks, CodeQL, DeepSource, and PR review workflow.

---

## Architecture Decision

Keep the production stack:

- Svelte 5
- Vite
- TypeScript
- Existing CSS/token approach
- Existing SVG/canvas charting where appropriate
- Existing stores and pure utility functions

Do not add:

- React
- Tailwind
- MUI
- Radix
- Recharts
- Emotion
- Large component libraries

Reason:

The generated Figma bundle is useful as visual evidence, but it is not production architecture. The current Chronoscope app has a small runtime dependency footprint and deeply integrated diagnostic stores. Importing the prototype would make the product heavier and less trustworthy without adding real capability.

---

## Screen Requirements

### 1. App Shell

The app shell should become visually closer to Figma while retaining Chronoscope's real controls.

Required elements:

- Chronoscope mark and name.
- Run status: measuring/stopped/starting/stopping.
- Run context: endpoint count, timeout, cadence, elapsed/request progress.
- Start/Stop button.
- Run details popover.
- Endpoint management.
- Share.
- Settings.
- Status, Live, Investigate tabs.

Desktop behavior:

- Single compact top shell.
- No permanent bottom bar.
- No always-visible left rail unless a future design specifically proves it earns the space.

Mobile behavior:

- Controls must wrap or collapse without hiding the primary Start/Stop action.
- Navigation may scroll horizontally only if the selected tab and primary controls remain obvious.
- No content should require horizontal page scroll.

Likely files:

- `src/lib/components/Layout.svelte`
- `src/lib/components/Topbar.svelte`
- `src/lib/components/ViewSwitcher.svelte`
- `src/lib/components/EndpointDrawer.svelte`
- `src/lib/stores/ui.ts`

### 2. Status Overview

The Status view should be the first screen a user understands.

Required hierarchy:

1. Verdict badge and headline.
2. Measured fact row.
3. Browser limitation row, when relevant.
4. Next useful check.
5. Compact quality/score explanation.
6. Endpoint summary.
7. Chronoscope-native timeline/history strip.

Required behaviors:

- Default 4-endpoint state fits desktop without awkward scroll.
- 375px mobile uses a designed progressive layout.
- Score must never contradict the diagnostic answer.
- Every verdict sentence must come from `buildDiagnosticNarrative` or a compatible proof-gated helper.

Likely files:

- `src/lib/components/OverviewView.svelte`
- `src/lib/components/CausalVerdictStrip.svelte`
- `src/lib/components/ChronographDial.svelte`
- `src/lib/components/RacingStrip.svelte`
- `src/lib/components/RunStorylineCard.svelte`
- `src/lib/utils/diagnostic-narrative.ts`
- `src/lib/utils/score-explanation.ts`

### 3. Timeline / History Signature

The timeline should become a core Chronoscope signature, not a tiny secondary widget.

It should show:

- Time labels such as `-3m`, `-2m`, `-1m`, `Now` or equivalent run-relative time.
- Stable periods.
- Spike clusters.
- Timeout/failure markers.
- Which endpoint was affected.
- Browser freeze/background markers if present.
- Enough size for non-engineers to see what happened.

It should not copy `s80.me`; it should express Chronoscope's evidence model:

- One event can include endpoint, severity, evidence type, and confidence.
- Timeline marks should support report sharing.
- Mobile timeline should use larger marks and fewer simultaneous details.

Likely files:

- `src/lib/components/RunStorylineCard.svelte`
- `src/lib/components/EventFeed.svelte`
- `src/lib/stores/history.ts`
- `src/lib/utils/evidence-trail.ts`
- `src/lib/utils/diagnostic-report.ts`

### 4. Live View

Live should keep the real Chronoscope scope power but become calmer and easier to read.

Required improvements:

- Clear time axis.
- Clear ms units.
- Threshold label that does not overlap data.
- Endpoint legend/chips that are compact and readable.
- Unified, split, and solo modes retained.
- Empty/paused/running states styled consistently with the new shell.

Do not replace the real scope with a generic Recharts area chart unless it preserves synchronized-round semantics and current interaction power.

Likely files:

- `src/lib/components/LiveView.svelte`
- `src/lib/components/ScopeCanvas.svelte`
- `src/lib/components/LiveFooter.svelte`
- `src/lib/stores/measurements.ts`
- `src/lib/stores/statistics.ts`

### 5. Investigate

Investigate should adopt Figma's clearer proof split while keeping all existing diagnostic depth.

Required sections:

- Diagnostic answer.
- Measured from your browser.
- Browser visibility / Timing-Allow-Origin / CORS.
- Endpoint distribution.
- Cross-endpoint correlation.
- Remote vantage.
- Local agent.
- Loaded latency.
- Network context.
- Phase timing when available.

Information architecture:

- Start with the most useful answer.
- Then separate measured facts from evidence gaps.
- Put proof actions near the uncertainty they reduce.
- Avoid saying "prove" when an action merely compares another vantage or gathers more evidence.

Likely files:

- `src/lib/components/DiagnoseView.svelte`
- `src/lib/components/LocalProofPanel.svelte`
- `src/lib/remote-vantage/insight.ts`
- `src/lib/stores/remote-vantage.ts`
- `src/lib/stores/companion.ts`
- `src/lib/utils/claim-registry.ts`
- `src/lib/utils/diagnostic-narrative.ts`

### 6. Report

Reports should look closer to the Figma artifact while preserving report modes and share behavior.

Required sections:

- Report kind: support or snapshot.
- Verdict and confidence.
- Measured facts.
- Evidence trail.
- Timeline summary.
- Endpoint comparison.
- Browser limitations.
- Remote vantage result, when present.
- Local-agent result, sanitized and only when present.
- History baseline, when relevant.
- Next validation step.
- Copy Summary and Share Link actions.

Mobile report:

- Avoid relying on a wide table as the primary representation.
- Use stacked rows or compact comparison cards.
- Preserve share/copy controls.

Likely files:

- `src/lib/components/ReportView.svelte`
- `src/lib/components/SharePopover.svelte`
- `src/lib/share/share-payload-builder.ts`
- `src/lib/share/share-manager.ts`
- `src/lib/utils/diagnostic-report.ts`
- `src/lib/utils/report-mode.ts`
- `src/lib/companion/sanitize.ts`

---

## Data Mapping

| Figma element | Production source | Notes |
| --- | --- | --- |
| Start/Stop | `measurementEngine`, stores used by `Topbar.svelte` | Preserve starting/stopping disabled states. |
| Run status | `measurementStore`, `settingsStore`, endpoint count | Existing `Run details` popover should own detailed mechanics. |
| Score | `networkQualityStore`, `diagnosticAlignedScore`, `buildScoreExplanation` | Score must align with diagnostic severity. |
| Verdict | `buildDiagnosticNarrative` | No hand-authored verdict strings in components. |
| Measured fact row | `DiagnosticNarrative.supportingSummary` plus endpoint stats | Must be concise and evidence-backed. |
| Browser limitation row | `describeTimingVisibility`, timing visibility fields | Include CORS/Timing-Allow-Origin when relevant. |
| Next useful check | `DiagnosticNarrative.primaryValidation` and triage actions | Wording must say what uncertainty is reduced. |
| Endpoint rows | `endpointStore`, `measurementStore`, `statisticsStore`, `lastLatencies` | Include median, jitter, failure/timeout status, and compact trend. |
| Tiny sparklines | Existing sample ring buffers | No random/generated traces. |
| Timeline strip | `RunStorylineCard`, `EventFeed`, sample/event history | Time labels and event marks must be real. |
| Live chart | `ScopeCanvas` and measurement samples | Preserve synchronized-round model. |
| Investigate browser evidence | `DiagnoseView` derived stats/correlation/phase timing | Keep distribution and correlation evidence. |
| Remote check | `remoteVantageStore`, `buildRemoteVantageInsight` | Avoid "global proof" language. |
| Local agent | `companionStore`, `LocalProofPanel`, sanitized companion report | Privacy defaults stay intact. |
| Report artifact | `buildDiagnosticReport`, `ReportView`, share payload builder | Keep support/snapshot modes. |

---

## Approved Copy Patterns

Use these patterns or close variants:

- "Measured from this browser."
- "This endpoint was slower from your browser during this run."
- "Other endpoints stayed inside the current threshold during the same window."
- "Browser timing is limited for this endpoint."
- "The browser could not see DNS, TCP, or TLS timing for this endpoint."
- "An outside check can reduce uncertainty by comparing another vantage point."
- "A local agent check can capture DNS, TLS, route, and Wi-Fi evidence from this device."
- "We measured latency and failures. We did not prove root cause."
- "No endpoint is currently above the report threshold."
- "This report includes sanitized local-agent evidence only."

Use with care:

- "Likely" only when the claim registry and diagnostic narrative support an inference.
- "Clean" only when thresholds, sample counts, and failures support a clean-run state.
- "Stable" only for measured latency/failure behavior in the active run or a named history window.

Forbidden unless explicitly evidence-gated by tests:

- "Your ISP is fine."
- "Your Wi-Fi is fine."
- "The server is the cause."
- "The API is the issue."
- "This proves the problem is global."
- "Everyone is affected."
- "Server problem detected."
- "This will fix it."
- "Everything is fine" when score, sample count, visibility, or endpoint readiness says otherwise.

---

## Visual System Contract

### Color

Use Figma's broad palette direction, but tune for contrast and current Chronoscope identity.

- App background: near-black with subtle blue-green tint.
- Primary surface: graphite, slightly lifted from background.
- Secondary surface: darker graphite.
- Border: low-contrast but visible.
- Primary accent: cyan.
- Caution: amber.
- Good/proof: green.
- Error/failure: rose.
- Muted text: must pass contrast checks where it carries meaning.

Avoid:

- Large decorative cyan/purple orbs.
- Heavy blue-purple gradients.
- Low-contrast gray text for important evidence.
- Many saturated endpoint colors competing with semantic colors.

### Typography

- Sans-serif for narrative, controls, labels, and headings.
- Mono for endpoints, values, run mechanics, timestamps, sample counts, and compact technical evidence.
- Avoid 9px or 10px text for essential meaning.
- Use uppercase tracking sparingly; it should organize, not decorate.
- Headlines should be short and plain.

### Surfaces

- Use panels for meaningful groups.
- Avoid panels inside panels unless a table/list row needs a local boundary.
- Prefer clean section grouping, thin dividers, and spacing over stacked cards.
- Keep radii restrained, generally 8-12px.

### Motion

- Active measurement can pulse subtly.
- Timeline/live updates can animate lightly.
- Respect `prefers-reduced-motion`.
- Avoid constant background motion or ornamental shimmer.

---

## Accessibility Requirements

Every redesigned slice must pass:

- Axe scan with no critical or serious issues.
- Icon-only controls have accessible names.
- Keyboard focus is visible.
- Tabs use proper roles and selected state.
- Buttons are buttons, links are links.
- Charts provide useful labels or live-region summaries.
- Color is not the only indicator of status.
- Mobile tap targets remain comfortable.

The generated Figma prototype failed axe for icon-only button names and contrast. The redesign must fix these before any PR can merge.

---

## Performance Requirements

Do not add dependencies only to mimic the prototype.

Expected approach:

- CSS/Svelte for shell, panels, badges, rows, and report artifact.
- Existing SVG/canvas logic for visualizations where possible.
- Small focused helpers when a visual primitive needs shared behavior.
- Keep bundle growth justified and measured.

Every implementation PR should include:

- `npm run build`
- Bundle size comparison against the prior main build when visual/chart dependencies change.

---

## Implementation Sequence

The redesign should ship in small PRs, each deployable on its own.

### PR 1: Design Tokens And Shared Chrome

Goal:

- Introduce the Figma-inspired visual system without changing product behavior.

Scope:

- Shared colors/surfaces/type helpers.
- Button/badge/panel classes or small Svelte primitives if needed.
- Topbar and tab polish.
- No diagnostic logic changes.

Validation:

- Unit tests for app shell where existing tests cover controls.
- Visual tests at 1440x900, 390x844, and 375x667.
- Axe scan.

### PR 2: Status Overview Redesign

Goal:

- Make the first screen closer to Figma's clear verdict hierarchy.

Scope:

- `OverviewView.svelte`
- `CausalVerdictStrip.svelte`
- `ChronographDial.svelte`
- `RacingStrip.svelte`
- `RunStorylineCard.svelte`

Rules:

- No unsupported copy.
- Score remains diagnostic-aligned.
- Default desktop view fits without awkward scroll.
- Mobile uses deliberate progressive layout.

Validation:

- Existing overview unit tests.
- New copy safety tests for any new verdict/supporting text.
- Visual no-scroll tests.
- Screenshot comparison against Figma reference direction.

### PR 3: Timeline Signature

Goal:

- Make event history readable, time-aware, and distinctively Chronoscope.

Scope:

- `RunStorylineCard.svelte`
- `EventFeed.svelte`
- Report timeline summary model if needed.

Rules:

- Time must be legible.
- Event marks must be large enough to understand.
- The timeline should not copy `s80.me`.
- Mobile timeline must avoid tiny bars.

Validation:

- Unit tests for event bucketing/labels.
- Visual tests for desktop and mobile.

### PR 4: Live View Calm Readability

Goal:

- Keep the real scope, improve clarity.

Scope:

- `LiveView.svelte`
- `ScopeCanvas.svelte`
- `LiveFooter.svelte`

Rules:

- Preserve unified/split/solo behavior.
- Keep synchronized-round semantics.
- Improve labels, units, thresholds, and endpoint chips.

Validation:

- Existing live/scope tests.
- Playwright running-state screenshot.
- Canvas nonblank checks.

### PR 5: Investigate Redesign

Goal:

- Adopt the Figma evidence split while retaining all proof surfaces.

Scope:

- `DiagnoseView.svelte`
- `LocalProofPanel.svelte`
- Remote-vantage and proof-flow display components if split out.

Rules:

- Separate measured browser facts from next proof actions.
- Remote check language must say "compare another vantage" or "reduce uncertainty."
- Local-agent language must state local-only capabilities and privacy boundaries.

Validation:

- Unit tests for remote/local proof states.
- Copy safety tests.
- Visual tests for limited timing, remote captured, remote failed, local absent, local captured.

### PR 6: Report Artifact Redesign

Goal:

- Make reports visually match the Figma artifact direction while preserving report modes.

Scope:

- `ReportView.svelte`
- `SharePopover.svelte`
- `diagnostic-report.ts`
- `report-mode.ts`

Rules:

- Support mode and snapshot/brag mode remain distinct.
- Mobile report cannot depend on horizontal table scroll as the primary answer.
- Copy Summary must match visible evidence hierarchy.

Validation:

- Unit tests for report model/copy summary.
- Visual tests for support and snapshot reports.
- Share URL and hosted fallback smoke tests.

### PR 7: Mobile, Accessibility, And Performance Hardening

Goal:

- Make the redesign feel finished across real devices.

Scope:

- Mobile layout corrections across shell, Status, Live, Investigate, Report.
- Focus states.
- Contrast fixes.
- Bundle check.

Validation:

- Axe scan.
- 375x667, 390x844, 1440x900 visual pass.
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

---

## Test Strategy

### Unit Tests

Add or update tests for:

- Copy safety and forbidden phrases.
- Diagnostic narrative mapping.
- Score explanation mapping.
- Timeline event labels and event grouping.
- Report mode rendering and copy summary.
- Remote/local proof state labels.
- Mobile shell visibility of primary controls.

### Visual Tests

Use Playwright visual checks for:

- Status overview default state.
- Status degraded state.
- Status clean/snapshot state.
- Live running state.
- Investigate timing-limited state.
- Investigate remote-proof captured state.
- Report support mode.
- Report snapshot mode.
- Mobile 375px and 390px.

### Accessibility

Run axe against:

- Status
- Live
- Investigate
- Report
- Share/report modal or popover
- Settings or endpoint management surfaces touched by the redesign

### Manual Browser QA

For each PR:

- Load app.
- Start measurement.
- Stop measurement.
- Switch tabs.
- Open Run details.
- Open Share.
- Check mobile.
- Confirm no console errors.
- Confirm no permanent pings/dev servers remain running after QA.

---

## Definition Of Done

The redesign is complete only when:

- The app visually follows the Figma direction.
- The generated React code remains outside production.
- Every visible claim is evidence-backed or caveated.
- Overview is understandable in under 10 seconds.
- Investigate clearly separates measured facts from next checks.
- Reports feel polished and shareable.
- Mobile is deliberately designed, not compressed.
- Axe has no critical or serious issues.
- No horizontal page overflow at 375px.
- Tests, lint, typecheck, and build pass.
- Cloudflare deployment completes after merge.

---

## Open Decisions

These should be answered before implementation planning:

1. Should the Overview retain a visible circular score/dial, or move score into a smaller textual quality module?
2. Should Report remain only a share/export surface, or appear as a fourth top-level tab?
3. Should endpoint management stay in the drawer, or become a compact topbar/dropdown action?
4. Should the timeline become the primary right-side Overview module, replacing per-endpoint comparison, or should users switch between them?
5. Should the redesign keep the current named default endpoints and colors, or introduce more subdued endpoint colors?

Recommended defaults:

1. Keep a smaller score/dial only if it supports the verdict without dominating.
2. Keep Report as share/export, not a primary tab.
3. Keep endpoint management in the drawer for now.
4. Use Timeline as the signature Overview module and keep endpoint comparison compact below/alongside it.
5. Keep endpoint identity colors but reduce saturation in summary contexts.

---

## Handoff Prompt For Future Sessions

Use this prompt after context compaction:

> Read `docs/vision/figma-redesign-implementation-spec.md`, inspect the local Figma export at `docs/artifacts/chronoscope-redesign-figma/` if it is available, then continue with the next unimplemented PR slice. Preserve Chronoscope's evidence gates and do not import the generated React code.
