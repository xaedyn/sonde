# Evidence-Gated Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unsupported cause-forward product copy with an evidence-gated diagnostic hierarchy that explains exactly what Chronoscope can prove, what it can only infer, and what validation action should happen next.

**Architecture:** Keep the existing diagnostic pipeline intact, but promote a new `DiagnosticNarrative` contract as the source of truth for user-facing diagnosis text. Legacy verdict headlines may remain for compatibility, but status strips, reports, share text, and history summaries must render safe measured/inferred claims from the narrative layer.

**Tech Stack:** SvelteKit, TypeScript, Vitest, Testing Library, existing diagnostic utilities and Cloudflare-ready frontend build.

---

## Current State

- `buildDiagnosticNarrative` still derives much of its user-facing story from `computeCausalVerdict`.
- Several surfaces render legacy cause-forward copy such as “likely your network” or “likely source.”
- Reports and history summaries use `verdict.headline`, which is too strong for evidence-limited browser timing.
- Share actions treat “support” as the only obvious narrative, while snapshots should also support bragging rights for high-quality measured results.

## Evidence Rules

- Do not make a diagnostic call before every enabled endpoint has at least 8 samples.
- Prefer collecting more samples until the thinnest endpoint has at least 12 samples.
- Treat 30 samples per endpoint as the maturity threshold for high-confidence snapshot/brag claims.
- Only make high-confidence shared-path language when browser-visible timing has enough phase visibility and all enabled endpoints are mature.
- Copy must distinguish measured facts from inferred possibilities.
- Browser limitations, CORS, and Timing-Allow-Origin gaps must appear in the answer or next validation step when they materially limit the conclusion.

## Tasks

- [ ] Add tests that fail on the current implementation:
  - `DiagnosticNarrative` exposes `primaryAnswer`, `primaryValidation`, `claims`, `safeSummary`, and `snapshotEligibility`.
  - Shared/isolated/remote/report/share copy avoids unsupported “likely source/network/site” language.
  - Reports and history do not render `verdict.headline`.
  - Share popover presents Support report, Snapshot link, then Configuration link.
  - A denylist test scans user-facing source strings for known unsafe claims.

- [ ] Implement the narrative contract:
  - Add evidence-gated claim metadata.
  - Add sample readiness/actionability/maturity thresholds.
  - Add primary validation actions for collecting samples, explaining browser visibility, opening Investigate, running remote validation, comparing networks, support reports, and snapshots.
  - Add snapshot/brag eligibility based on mature samples and clean measured symptoms.

- [ ] Replace unsafe UI/report/history copy:
  - `CausalVerdictStrip.svelte` uses `primaryAnswer` and `primaryValidation`.
  - `ReportView.svelte` uses `primaryAnswer`/`safeSummary` and neutral endpoint labels.
  - `diagnostic-report.ts` summary copy is evidence-labeled.
  - `session-summary.ts` saves the safe narrative instead of legacy headlines.
  - `SharePopover.svelte` uses the new action hierarchy.

- [ ] Make remote-vantage and correlation language safe:
  - Replace causal statements with outside-vantage or browser-visible evidence language.
  - Remove “likely network/site/source” phrasing from source comments and strings.

- [ ] Verify:
  - Run focused unit tests for diagnostic narrative, reports, share popover, remote vantage, history, verdict, and copy safety.
  - Run full `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
  - Use Browser or Playwright to inspect the updated local UI hierarchy if the app can be served cleanly.

## Acceptance Criteria

- Chronoscope never presents an unsupported root cause as fact.
- The primary answer is clear enough for a first-time user and precise enough for a network engineer.
- Every strong claim is backed by visible evidence, and weaker claims are labeled as limited or needing validation.
- The next action is obvious and evidence-based.
- Snapshot sharing supports both support workflows and brag-worthy clean results without overstating confidence.
- Tests prevent regression to unsafe diagnostic language.
