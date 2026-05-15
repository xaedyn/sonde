# Chronoscope 10-Star Product Roadmap

**Status:** Living source of truth  
**Created:** 2026-05-12  
**Current production baseline:** `main` through PR #143, deployed to Cloudflare Pages
**Read this first in future sessions.**

---

## Purpose

This roadmap keeps Chronoscope from drifting as the conversation compacts. It captures what the product is becoming, what is already done, what remains, and the exact order we should use for the next phases.

The short version: Chronoscope should become the default browser-first answer to:

> "Is this my network, this site, both, or honestly still unknown?"

The answer must be useful, shareable, and visually excellent, but it must never overclaim. Trust beats drama every time.

---

## Product Concept

Chronoscope is a browser-first network diagnostic product. It measures multiple endpoints from the user's real browser path, compares those measurements in synchronized rounds, explains what the browser can and cannot prove, and produces shareable reports that separate measured facts from next validation steps.

The original inspiration is the simplicity of `s80`: instant, direct, no-account visibility into network behavior. Chronoscope takes that idea further by adding multi-site comparison, diagnostic language, browser limitations, outside vantage checks, local-agent proof, history, and polished reports.

The 10-star version is not "more charts." It is a guided proof system:

1. Measure from the browser.
2. State only what the evidence supports.
3. Show what is missing.
4. Offer one next test that would reduce uncertainty.
5. Preserve the evidence in a report someone else can understand.

---

## Non-Negotiables

- **Accuracy over confidence.** If we cannot prove cause, say what we measured and what remains unknown.
- **No wild goose chases.** Every recommendation must state what it can prove or disprove.
- **Browser limits must be visible.** No browser traceroute, WiFi radio data, raw DNS trace, TLS certificate chain, packet capture, or MTR is possible without the local agent.
- **Reports must be shareable by normal people.** Support use and bragging-rights use are both valid.
- **Dense, not cramped.** The product can be information-rich, but it must stay readable at 375px and efficient on desktop.
- **No hidden trust debt.** Any sentence that sounds like cause must be backed by evidence, an explicit confidence level, or a clear caveat.

---

## Current State

Chronoscope is already well beyond the original browser latency sketch.

Shipped capabilities:

- Browser-based synchronized multi-endpoint HTTP latency testing.
- Status, Live, and Investigate views with responsive shell behavior.
- Plain-language diagnostic verdicts with confidence labels and browser-visibility limits.
- Timing-Allow-Origin and CORS guidance where phase timing is hidden.
- Local history baselines for comparing current runs to prior browser sessions.
- Cloudflare outside-vantage checks and hosted reports.
- Optional local companion agent with signed loopback communication, DNS/TLS/route/WiFi probes, and SQLite history.
- Advanced browser diagnostics with loaded-latency checks, outside DNS/topology context, and proof-scoped caveats.
- Opt-in collective intelligence foundation with privacy contract, local payload sanitizer, server-side private-field rejection, aggregate ingest, and an aggregate summary surface.
- Share/support report flow with hosted fallback to hash-based links.
- Compact evidence trail on reports: browser test, current answer, browser visibility, outside check, local agent.
- Executable triage cards on reports: visibility, Investigate, outside check, local agent, share/compare.
- CI, CodeQL, DeepSource, PR review flow, and Cloudflare Pages deploy pipeline.

Useful reference docs:

- `docs/vision/VISION-2026-04-07.md`
- `docs/vision/PRODUCT-VISION-2026-04-11.md`
- `docs/cloudflare-remote-vantage.md`
- `docs/companion-local-agent.md`
- `docs/superpowers/plans/2026-05-12-10-star-implementation-index.md`

Recent product spine:

- PR #104: Support report sharing.
- PR #109: Evidence-gated hierarchy design.
- PR #110-#114: Plain-language verdict and trust hierarchy polish.
- PR #115: Guided triage actions.
- PR #116: Executable triage evidence trail.
- PR #119-#121: Guided proof flow with remote proof loop, focused local proof, and stale proof refresh.
- PR #122-#126: Share/report excellence with support versus snapshot report modes, mode-specific rendering, and copy/visual guardrails.
- PR #127: Claim registry foundation for evidence-gated diagnostic language.
- PR #128: Claim registry wired into diagnostic narrative validation and copied report summaries.
- PR #129: Trust-copy hardening for remote vantage, evidence trail, and history baseline surfaces.
- PR #130: Plain-language metric copy for copied reports and outside-vantage explanations.
- PR #131: Guided local-agent pairing with local-only safety, token-path guidance, health state, and WiFi redaction defaults.
- PR #132: Typed local companion probe results with section envelopes and bounded route subprocess timeouts.
- PR #133-#138: Local-agent report safety, guided proof integration, and local proof polish.
- PR #139: Advanced browser diagnostics with optional network context.
- PR #140-#143: Collective intelligence privacy, payload, ingest, and summary context.

---

## Roadmap Order

### Phase 1: Guided Proof Flow

**Status:** Shipped through PR #121.

**Goal:** Turn the current action cards into a guided loop where every action updates the evidence trail and report state in place.

Why this is next:

- PR #116 made the cards executable, but some actions still open broad surfaces.
- The next 10-star step is making each action feel like a focused proof step.
- This phase directly protects trust: users see what changed after each test.

Expected PR slices:

1. **Remote proof loop**
   - Run outside check from report and Investigate.
   - Show running, captured, failed, and stale states compactly.
   - Summarize clean/slow/error remote results in the same language as the evidence trail.
   - Do not imply local-path or origin cause unless browser and outside evidence support that claim.

2. **Focused local-agent flow**
   - Replace "open Settings" as the primary local-agent action with a focused connection/probe panel.
   - Preselect the implicated endpoint when one exists.
   - Show pairing token, health check, probe toggles, run button, and captured result in one flow.
   - Keep the full Settings integration as a secondary path.

3. **Evidence state refresh**
   - After remote or local proof runs, update the evidence trail, triage card badge, and report share payload.
   - Make stale evidence obvious when the report is older than the latest proof.

Acceptance bar:

- At 375px and 1440px, no horizontal overflow.
- Every action has a visible state before, during, and after.
- A failed remote/local action produces a useful next step, not a dead end.
- Report copy never says "cause" unless the required evidence exists.

Likely files:

- `src/lib/components/ReportView.svelte`
- `src/lib/components/DiagnoseView.svelte`
- `src/lib/components/CompanionPanel.svelte`
- New focused component if needed: `src/lib/components/LocalProofPanel.svelte`
- `src/lib/utils/evidence-trail.ts`
- `src/lib/remote-vantage/insight.ts`
- `src/lib/stores/remote-vantage.ts`
- `src/lib/stores/companion.ts`
- Tests under `tests/unit/components`, `tests/unit/utils`, and `tests/visual/ac-verification.spec.ts`

### Phase 2: Share and Report Excellence

**Status:** Shipped through PR #126.

**Goal:** Make reports feel like polished diagnostic artifacts, not app screenshots.

Expected PR slices:

1. **Support report mode**
   - Best for help desks, service owners, ISPs, teammates.
   - Leads with facts, limitations, and next validation.
   - Includes compact evidence trail and endpoint table.

2. **Snapshot/brag mode**
   - Best for "look how clean/fast/stable this is."
   - Leads with clean-run proof, sample count, endpoints, threshold, and timestamp.
   - Avoids support-style caveats unless a limitation materially changes interpretation.

3. **Report copy audit**
   - Copy link, copy summary, hosted report, and visible report text must all use the same evidence hierarchy.
   - Replace any awkward engineer-only phrasing with plain language.

Acceptance bar:

- A non-engineer can understand what happened in under 20 seconds.
- A network engineer can inspect evidence without feeling patronized.
- Support and bragging uses are clearly distinct without adding a marketing page.

Likely files:

- `src/lib/components/ReportView.svelte`
- `src/lib/components/SharePopover.svelte`
- `src/lib/share/share-payload-builder.ts`
- `src/lib/utils/diagnostic-report.ts`
- `src/lib/utils/evidence-trail.ts`
- `tests/unit/components/share-popover.test.ts`
- `tests/unit/utils/diagnostic-report.test.ts`
- `tests/visual/ac-verification.spec.ts`

### Phase 3: Trust Language System

**Status:** Shipped through PR #130.

**Goal:** Make diagnostic language mechanically hard to misuse.

Expected PR slices:

1. **Claim registry**
   - Centralize claim types: measured, inferred, limited, next validation.
   - Tie each claim to required evidence gates.
   - Use this in Status, Investigate, Reports, Share, and copy summaries.

2. **Copy safety tests**
   - Expand tests that reject overclaims.
   - Ban unsupported phrases such as "your ISP is," "the server is the cause," or "this will fix" unless explicitly evidence-gated.

3. **Plain-language rewrite pass**
   - Replace dense phrases with user-readable facts.
   - Keep technical detail available in compact evidence rows or advanced panels.

Acceptance bar:

- Product copy can say "observed," "measured," "compared," "also slow from outside," or "not captured."
- Product copy cannot imply root cause without enough evidence.
- Tests catch the most dangerous trust failures.

Likely files:

- `src/lib/utils/diagnostic-narrative.ts`
- `src/lib/utils/diagnostic-report.ts`
- `src/lib/utils/evidence-trail.ts`
- `src/lib/remote-vantage/insight.ts`
- `src/lib/utils/history-baseline.ts`
- `tests/unit/user-facing-copy-safety.test.ts`
- `tests/unit/utils/diagnostic-narrative.test.ts`

### Phase 4: Local Agent Productization

**Status:** Shipped through PR #138.

**Goal:** Turn the optional companion from a powerful hidden tool into a first-class proof engine.

Expected PR slices:

1. **Guided install/pairing**
   - Clear local-only safety explanation.
   - Token path and copy instructions.
   - Health check feedback.

2. **Structured probe results**
   - DNS trace, TLS/cert, route/MTR, WiFi, and history summarized separately.
   - Each section states what it can prove.

3. **Local proof report integration**
   - Decide what local-agent data can be included in share reports without leaking private data.
   - Redact WiFi SSID/BSSID unless explicitly allowed.
   - Keep private local history out of public reports unless explicitly exported.

Acceptance bar:

- A first-time user can connect the agent without reading a README.
- Local proof never leaks private WiFi or local history by default.
- The report can explain "browser could not see this; local agent captured it."

Likely files:

- `companion/local-agent.cjs`
- `src/lib/companion/protocol.ts`
- `src/lib/companion/client.ts`
- `src/lib/stores/companion.ts`
- `src/lib/components/CompanionPanel.svelte`
- New focused component if needed: `src/lib/components/LocalProofPanel.svelte`
- `docs/companion-local-agent.md`
- `tests/unit/companion/*`
- `tests/unit/components/CompanionPanel.test.ts`

### Phase 5: Advanced Browser Diagnostics

**Status:** Shipped through PR #139.

**Goal:** Add more no-install evidence while preserving the browser-first promise.

Candidate slices:

1. **DNS-over-HTTPS chain visualization**
   - Browser-safe approximation.
   - Label it as outside resolver evidence, not the user's true local DNS path.

2. **Bufferbloat test**
   - Use Cloudflare saturation endpoint.
   - Measure latency while download saturation runs.
   - Grade with plain-language caveats.

3. **Loss pattern classification**
   - Random, burst, periodic, or insufficient data.
   - Avoid implying cause.

4. **BGP/ASN context**
   - Use public APIs to add route context.
   - Label it as internet topology context, not active path proof.

Acceptance bar:

- Each feature says exactly what vantage point it measures from.
- Each feature integrates into the evidence trail or report only when useful.
- No advanced feature makes the first screen busier for ordinary use.

Likely files:

- New `src/lib/dns/*`, `src/lib/bufferbloat/*`, or `src/lib/topology/*`
- `functions/api/vantage/saturation.ts`
- `src/lib/utils/diagnostic-narrative.ts`
- `src/lib/components/DiagnoseView.svelte`
- `src/lib/components/ReportView.svelte`

### Phase 6: Collective Edge Intelligence

**Status:** Shipped through PR #143.

**Goal:** Explore the longer-term moat: aggregate opt-in browser measurements into anonymous internet health intelligence.

This is not next. It should wait until the core diagnostic/report loop is excellent.

Acceptance bar before starting:

- Clear privacy model.
- Explicit opt-in.
- No endpoint URLs or private identifiers without consent.
- Public aggregate value without creating surveillance creep.

---

## Working Process For Every Phase

Use this flow unless the user explicitly says otherwise:

1. Read this roadmap.
2. Check `git status --short --branch`.
3. Check recent merged PRs with `git log --oneline -5`.
4. Create a `codex/<feature>` branch.
5. Write failing tests for the behavior.
6. Implement the smallest coherent slice.
7. Run local verification:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test -- --run`
   - `npm run build`
   - Focused Playwright/visual tests for UI changes.
8. Open a draft PR.
9. Wait for CI, CodeQL, DeepSource, and review comments.
10. Patch review feedback.
11. Mark ready, merge, and confirm Cloudflare deploy.
12. Smoke-test `chronoscope.dev` when the change is user-facing.

Do not silently stage unrelated files. As of this roadmap creation, there are old untracked screenshot files in the workspace root; leave them alone unless the user asks.

---

## Context Handoff For Future Sessions

When a future session starts, the user can help by saying:

> "Read `docs/vision/10-star-product-roadmap.md`, check latest main, then continue the next unchecked phase."

The assistant should then:

1. Read this file.
2. Inspect recent PRs and current branch state.
3. Confirm whether Phase 1 is still next or already done.
4. Continue with the smallest PR slice that advances the roadmap.

---

## Decision Log

### 2026-05-12

- Created this roadmap after PR #116 shipped the compact evidence trail and executable report triage actions.
- Decided the next phase should be **Guided Proof Flow**, not another visual redesign.
- Decided the product's highest-order constraint remains trust: every diagnostic claim must be tied to measured evidence, known browser limits, or an explicit next validation step.
- Shipped Phase 1 and Phase 2 through PR #126. Phase 3 began with PR #127's registry and PR #128's narrative/report wiring, then PR #129 extended trust-copy guardrails through evidence trail, remote vantage, and history baseline surfaces. PR #130 completed the plain-language metric copy slice by keeping internal p50 data while exposing median language in copied report and outside-vantage text. PR #131 opened Phase 4 with guided local-agent pairing, token-path guidance, health state, and default WiFi privacy. PR #132 added typed local companion probe result sections and bounded route command timeouts.

### 2026-05-13

- Completed the original six-phase 10-star roadmap through PR #143.
- Phase 4 continued through local-agent report safety and guided proof integration.
- Phase 5 shipped advanced browser diagnostics: loaded-latency evidence, browser-safe outside DNS/topology context, and strict proof-boundary copy.
- Phase 6 shipped as an explicitly opt-in foundation: consent contract, sanitized aggregate payloads, server ingest guardrails, aggregate summary API, and a compact Investigate aggregate-context panel.
- Current next step is not another roadmap phase by default. It is a fresh live product review, then a new roadmap only for issues discovered in production use.

### 2026-05-15

- Evaluated the generated Figma redesign prototype as a local-only reference artifact. Future sessions should place that artifact at `docs/artifacts/chronoscope-redesign-figma/` if the prototype needs to be re-inspected.
- Decided to use the Figma concept as the visual north star, but not as production code.
- Created `docs/vision/figma-redesign-implementation-spec.md` to define the redesign contract: visual system, trust-copy rules, data mapping, screen requirements, PR sequence, accessibility requirements, and performance constraints.
