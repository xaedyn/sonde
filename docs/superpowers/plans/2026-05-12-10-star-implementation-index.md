# 10-Star Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the approved 10-star roadmap into phase-level implementation plans that can be executed in order without relying on thread memory.

**Architecture:** Each phase is its own executable plan with PR-sized slices, files, tests, acceptance gates, and trust rules. Phases should be merged in order because later phases depend on the proof loop, report modes, and trust language system created earlier.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Testing Library, Playwright, Cloudflare Pages Functions, optional Node local companion agent.

---

## Completion Status

As of 2026-05-13, the original six phase plans below have shipped through PR #143 and deployed to Cloudflare Pages. Future work should start with a fresh live product review and a new plan for any newly discovered gaps, not by reopening these completed phases by default.

## Source Of Truth

Read these in this order before executing any phase:

1. `docs/vision/10-star-product-roadmap.md`
2. This index
3. The phase plan being executed
4. Recent merged PRs with `git log --oneline -8`
5. Current workspace state with `git status --short --branch`

## Phase Plans

1. `docs/superpowers/plans/2026-05-12-phase-1-guided-proof-flow.md`
2. `docs/superpowers/plans/2026-05-12-phase-2-share-report-excellence.md`
3. `docs/superpowers/plans/2026-05-12-phase-3-trust-language-system.md`
4. `docs/superpowers/plans/2026-05-12-phase-4-local-agent-productization.md`
5. `docs/superpowers/plans/2026-05-12-phase-5-advanced-browser-diagnostics.md`
6. `docs/superpowers/plans/2026-05-12-phase-6-collective-edge-intelligence.md`

## Execution Rules

- Start each phase from latest `main`.
- Use branch names in the form `codex/phase-N-short-name`.
- Keep each PR to one slice when possible.
- Do not stage old untracked screenshot files in the repository root.
- Do not add new diagnostic claims without tests that prove the evidence gate.
- Do not ship browser-only features that imply traceroute, WiFi, DNS trace, TLS chain, or packet-path proof.
- After every user-facing phase PR, verify locally and on GitHub:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - focused Playwright visual coverage when layout changes
- After merge, confirm CI, CodeQL, DeepSource, Cloudflare deploy, and a live smoke test when the change affects `chronoscope.dev`.

## Recommended PR Slices

Phase 1 should ship as three PRs:

- Remote proof loop
- Focused local proof panel
- Evidence refresh and stale proof state

Phase 2 should ship as three PRs:

- Share schema and mode selection
- Support report and snapshot report layouts
- Report copy audit and visual hardening

Phase 3 should ship as three PRs:

- Claim registry
- Copy safety gates
- Surface migration to registry-backed copy

Phase 4 should ship as three PRs:

- Companion protocol typing and result summaries
- Guided install and pairing
- Privacy-safe local proof report integration

Phase 5 should ship as four PRs:

- Loss pattern classification
- Bufferbloat test
- DNS-over-HTTPS trace approximation
- BGP/ASN topology context

Phase 6 should ship as exploration first, then product:

- Privacy model and consent contract
- Local anonymization and payload tests
- Server ingest and aggregate summary
- UI integration behind explicit opt-in

## Stop Conditions

Stop and ask for direction when:

- A phase plan conflicts with the current product behavior on `main`.
- A test requires a diagnostic claim that cannot be proven by available evidence.
- A privacy change would collect endpoint URLs, IP addresses, WiFi identifiers, or local history without explicit consent.
- A phase would make the first-run UI busier for ordinary users.
