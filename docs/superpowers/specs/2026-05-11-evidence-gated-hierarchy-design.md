# Evidence-Gated Hierarchy Design

Date: 2026-05-11
Status: Draft for user review
Owner: Codex

## Goal

Tighten Chronoscope's product hierarchy without weakening trust.

Chronoscope must feel more decisive, but every primary sentence must be backed by the evidence the app actually has. The product must not imply hop-by-hop routing, Wi-Fi, ISP, DNS-chain, TLS certificate, or origin blame when the browser cannot prove that. The app may still recommend validation steps, but those steps must be framed as ways to raise certainty rather than as confirmed fixes.

## Non-Goals

- Do not redesign the whole visual system.
- Do not rebuild the measurement engine.
- Do not introduce local-agent-only claims into the browser-only UI.
- Do not add broad rankings such as "fastest internet" or "perfect connection" unless Chronoscope has comparative evidence.
- Do not remove diagnostic personality; make it more precise.

## Product Principle

Accuracy outranks boldness.

Every diagnostic sentence belongs to one of four claim classes:

1. **Measured**
   Directly observed from Chronoscope's samples, settings, or browser APIs.
   Example: "Median latency is 31 ms across 50 successful samples."

2. **Inferred**
   Supported by browser-visible patterns, but not directly proven.
   Example: "Browser-visible evidence points to endpoint-specific slowdown."

3. **Limited**
   States what Chronoscope cannot prove from the current evidence.
   Example: "Browser timing cannot prove Wi-Fi, ISP, hop-by-hop path, DNS-chain, or TLS certificate causes."

4. **Next Validation**
   A recommended action that increases certainty.
   Example: "Run a remote check to compare this browser path with an outside Cloudflare vantage."

Unsupported causal language is forbidden in the primary UI. Avoid "is your Wi-Fi", "is your ISP", "the endpoint is broken", "the origin is slow", or "your internet is perfect" unless that claim is backed by a capability that can prove it.

## Legacy Copy Retirement

The existing `Verdict.headline` strings are not trusted product copy after this project. They may remain as internal compatibility fields while the migration is in progress, but no primary user-facing surface may render them directly once the evidence-gated model ships.

Affected surfaces include:

- Status verdict headline
- Investigate interpretation copy
- Remote vantage interpretation copy
- Shared report hero
- Shared report endpoint status labels
- Copy-summary text
- History/session summaries

If a legacy string is still needed internally, it must either be:

1. rewritten as a `DiagnosticClaim`, or
2. mapped through a claim-safe presenter before display.

No Svelte component may invent diagnostic interpretation copy from raw stats. Components may render measured values, but causal, confidence, limitation, and validation language must come from the diagnostic claim model.

## User Experience

### Status Hierarchy

The Status view must read top-down as:

1. **Answer**
   A short plain-language verdict. It must include claim scope when the verdict is inferred.

2. **Trust**
   Confidence badge plus the reason for that confidence. The reason must be visible or one click/hover away, not hidden only in code.

3. **Primary Validation Action**
   One recommended next action that improves certainty. This is not always "Investigate". It can be "Run remote check", "Keep collecting", "Open Investigate", "Share snapshot", or "Compare from another network".

4. **Evidence**
   The small set of facts behind the answer: ready endpoints, samples, p50/jitter/loss, threshold, timing visibility, and whether remote vantage/baseline evidence exists.

5. **Limits**
   Compact but visible caveats. Honesty should feel like part of the product, not a legal disclaimer.

The hierarchy must make the recommended action more legible than the decorative instrumentation. The dial and charts remain valuable evidence, but the verdict and validation step own the first decision.

### Evidence Threshold Constants

Use these constants unless implementation discovers an existing stricter threshold that already governs the same behavior:

- **Minimum ready samples:** 8 successful samples on an endpoint. Below this, the endpoint is not ready for interpretation.
- **Minimum actionable samples:** 12 successful samples on the thinnest ready endpoint. Below this, the primary action is to keep collecting.
- **Minimum mature samples:** 30 successful samples on the thinnest ready endpoint. At or above this, claims may reach high strength if other gates also pass.
- **Loss warning threshold:** 1.0% failed requests.
- **Jitter warning threshold:** the existing Chronoscope jitter warning threshold.

### Primary Validation Action Resolver

Only one primary validation action must appear in Status. When multiple actions are possible, choose the first applicable item in this priority order:

1. **Collect more samples**
   Show when the thinnest ready endpoint has fewer than the minimum actionable sample count or not all enabled endpoints have reached the minimum ready sample count.

2. **Explain browser visibility**
   Show when the primary answer, limitation, or next validation would mention DNS, TCP, TLS, server, or transfer timing but the current timing visibility is total-only or mixed.

3. **Run remote check**
   Show when there is a degraded or suspicious endpoint and no current remote vantage result exists for that endpoint.

4. **Open Investigate**
   Show when there is enough evidence to inspect a specific endpoint or correlation pattern.

5. **Compare from another network**
   Show when browser-visible evidence points to a shared path but remote vantage cannot resolve the question.

6. **Share support report**
   Show when degraded evidence is mature enough to be useful to another person.

7. **Share snapshot**
   Show when the run is healthy, mature, and eligible for measured brag/snapshot language.

The resolver must return both the button label and the reason it was chosen. This reason must be available to tests and may be shown in UI as helper copy.

A suspicious endpoint is any enabled endpoint with one or more of: p50 above threshold, elevated failed-request rate, elevated jitter, repeated recent threshold crossings, or a degraded inferred claim involving that endpoint.

### Investigate Hierarchy

Investigate must distinguish evidence from interpretation:

- "Measured" sections show concrete values and sample counts.
- "Interpretation" sections say what pattern the evidence matches.
- "Limits" sections state browser visibility constraints.
- "Improve confidence" sections recommend the next validation action.

For total-only timing, Investigate must not imply DNS/TCP/TLS/server phase causes. It must explain that total latency can show symptoms but cannot isolate those phases without Timing-Allow-Origin and usable Resource Timing data.

### Sharing Hierarchy

Share must support two legitimate intents:

1. **Support Report**
   For sending evidence to someone helping troubleshoot.
   Required label: "Support report"
   Required description: "Read-only evidence with samples, verdict, confidence, and browser limits."

2. **Snapshot Link**
   For sharing or bragging about a clean run.
   Required label: "Snapshot link"
   Required description: "Share this run's measured results."

Bragging rights are allowed only as measured claims. A healthy high-confidence run can say:

- "Clean browser-visible run"
- "4 endpoints measured"
- "p50 26 ms"
- "0.0% failed requests"
- "50 samples kept"

It must not say:

- "Perfect internet"
- "Best connection"
- "ISP is clean"
- "No network issue exists"

Shared reports must preserve caveats and confidence reasons. A recipient should be able to understand both what the sender measured and what Chronoscope cannot prove.

### Snapshot Eligibility

Celebratory snapshot language is allowed only when all of these are true:

- every enabled endpoint is ready
- the thinnest ready endpoint has at least 30 successful samples
- no enabled endpoint has p50 above the active threshold
- average failed-request rate is at or below 1.0%
- average jitter is below the jitter warning threshold
- no active baseline comparison says the run is elevated or severe
- no remote vantage result contradicts the healthy browser-visible result
- the copy only states measured values and scoped browser-visible health

If any condition fails, the share surface may still provide a report link, but it must use neutral language such as "Share measured results" or "Share support report".

## Claim Model

Add or extend a pure diagnostic model that produces a list of claim objects. Existing `DiagnosticNarrative` can be extended rather than replaced.

Proposed shape:

```ts
type ClaimKind = 'measured' | 'inferred' | 'limited' | 'next-validation';
type ClaimStrength = 'low' | 'medium' | 'high';
type EvidenceGate =
  | 'sample-ready'
  | 'sample-actionable'
  | 'sample-mature'
  | 'all-enabled-ready'
  | 'total-timing'
  | 'phase-timing'
  | 'remote-vantage'
  | 'baseline-ready'
  | 'local-agent';

interface DiagnosticClaim {
  readonly id: string;
  readonly kind: ClaimKind;
  readonly strength: ClaimStrength;
  readonly text: string;
  readonly evidenceIds: readonly string[];
  readonly requiredEvidence: readonly EvidenceGate[];
}
```

Rules:

- Claims with `requiredEvidence: ['phase-timing']` cannot appear unless phase timing exists.
- Claims with `requiredEvidence: ['remote-vantage']` cannot appear unless remote vantage data exists for the relevant endpoint or endpoint set.
- Claims with `requiredEvidence: ['baseline-ready']` cannot appear unless baseline comparison is ready for the relevant endpoint or endpoint set.
- Claims with `requiredEvidence: ['local-agent']` cannot appear in browser-only mode.
- Claims with `requiredEvidence: ['sample-actionable']` cannot appear unless the thinnest relevant endpoint has at least 12 successful samples.
- Claims with `requiredEvidence: ['sample-mature']` cannot appear unless the thinnest relevant endpoint has at least 30 successful samples.
- Claims may require multiple gates. For example, "Cloudflare also sees this endpoint as slow" requires browser evidence, remote vantage evidence, and a matching endpoint result.
- Low-confidence inferred claims must use scoped language such as "may", "could", or "not enough evidence yet".
- High-confidence inferred claims may use "evidence points to", but still should not become direct proof language.

### Claim Strength Decision Table

Use this table as the default source of truth for claim strength. If a case does not fit the table, choose the lower strength.

| Evidence state | Allowed strength | Copy style |
| --- | --- | --- |
| Fewer than 8 successful samples on the thinnest ready endpoint | low | collecting / not enough evidence |
| 8-11 successful samples on the thinnest ready endpoint | low | early signal / keep collecting |
| 12-29 successful samples, at least 2 ready endpoints | medium | evidence suggests / compare more |
| 30+ successful samples, all enabled endpoints ready, total-only timing | medium | browser-visible evidence points to / phase cause unknown |
| 30+ successful samples, all enabled endpoints ready, phase timing visible where needed | high | browser-visible evidence points to / measured phase detail |
| Remote vantage agrees with browser-visible degraded result | high for remote-vantage claim only | outside vantage also observed |
| Baseline is ready and agrees with current run | high for baseline-relative claim only | above/matches local baseline |
| Remote or baseline evidence contradicts browser-visible result | low or medium | mixed evidence / validate again |

Healthy claims use the same strength table, but the copy must remain scoped. Even high-confidence healthy copy must say "browser-visible symptoms are inside threshold", not "there is no network problem."

## Data Flow

1. Measurement engine records samples exactly as today.
2. Statistics store computes endpoint stats exactly as today.
3. `buildDiagnosticNarrative` computes verdict, confidence, evidence, limitations, next steps, and claim objects.
4. Status consumes only the primary answer claim, primary confidence reason, primary validation claim, evidence highlights, and top limitation.
5. Investigate consumes the full claim list grouped by kind.
6. Report/share consumes the same claim list and copies caveats into shared artifacts.

This keeps diagnostic truth in pure utilities instead of scattering copy rules across Svelte components.

The implementation must include a migration pass that removes direct rendering of legacy `Verdict.headline` from user-facing surfaces. If a compatibility field remains, tests must prove it is not the source for Status, Report, Share, Investigate, remote vantage, or history summary copy.

## Components

### `diagnostic-narrative.ts`

Extend the narrative with claim objects and stricter next-step selection.

Responsibilities:

- classify claims by kind and strength
- gate claims by evidence availability
- generate primary validation action
- expose conservative copy for browser-only limits
- expose a primary answer claim that replaces legacy `Verdict.headline`
- expose a denylist-safe summary string for history and shared reports

### `CausalVerdictStrip.svelte`

Render a stronger hierarchy:

- answer headline
- confidence reason affordance
- primary validation action
- compact evidence row
- compact limitation row

It must not invent copy. It renders claims supplied by the narrative layer.

### `DiagnoseView.svelte`

Group current evidence into clearer sections:

- measured facts
- interpretation
- browser visibility
- remote vantage
- improve confidence

Existing visuals remain; copy and ordering become more explicit.

### `SharePopover.svelte`

Rename/share intent copy:

- primary: Support report
- secondary: Snapshot link
- tertiary: Configuration link

The snapshot path may be celebratory when the run is healthy, but only by showing measured facts.

### `ReportView.svelte`

Show shared reports as evidence artifacts:

- verdict and confidence
- "What Chronoscope measured"
- "What this suggests"
- "What this cannot prove"
- "Recommended validation"

Copy summary must use the same claim model.

### `remote-vantage/insight.ts`

Remote vantage copy must be claim-gated too.

Allowed:

- "Cloudflare reached this endpoint in 42 ms."
- "Your browser p50 is 180 ms while this Cloudflare edge measured 42 ms."
- "This difference points to a browser-path difference; compare another network or use the local agent to narrow it."

Forbidden without additional evidence:

- "Your ISP is the source."
- "The origin is the source."
- "DNS path is the likely source."
- "Wi-Fi is the issue."

### `diagnose-stats.ts`

Correlation copy must avoid direct blame.

Replace "likely your network" / "likely that site" style text with scoped interpretation:

- shared spikes: "Spikes line up across multiple endpoints, so the symptom is shared from the browser's point of view."
- isolated spikes: "Spikes are mostly isolated to this endpoint in the browser-visible data."
- sparse comparator data: "Comparator data is sparse; run longer before interpreting the pattern."

## Error Handling And Edge Cases

- **Low sample count:** show collecting/low confidence; do not render strong inferred claims.
- **Total-only timing:** allow total latency conclusions; block phase-cause claims.
- **No remote vantage:** suggest remote check; do not compare browser versus outside path.
- **No baseline:** say no local baseline; do not imply the run is unusual historically.
- **Healthy run:** say measured symptoms are inside threshold; do not say there is no network problem.
- **Shared snapshot:** preserve sender threshold, sample counts, timing mode, confidence reason, and caveats.
- **Local/private endpoints:** do not auto-start unsafe local probes; keep current guarded behavior.
- **Contradictory evidence:** lower confidence and surface the contradiction instead of choosing the more dramatic story.
- **Remote vantage errors:** describe the HTTP/error result as measured; do not infer origin, CDN, DNS, or path cause without corroborating evidence.
- **History summaries:** store claim-safe summaries, not legacy verdict headlines.

## Copy Safety Rules

Add a copy safety test fixture that scans user-facing source and expected strings for forbidden unsupported phrases. The test must fail on these patterns unless the string appears in a denylist test, documentation example, or explicit "must not say" section:

- `likely your network`
- `likely that site`
- `likely source`
- `your ISP is`
- `ISP is clean`
- `Wi-Fi is the issue`
- `origin is the source`
- `DNS path is the source`
- `perfect internet`
- `no network issue exists`

Allowed safer phrasing:

- `browser-visible evidence points to`
- `the symptom is shared from the browser's point of view`
- `mostly isolated in the browser-visible data`
- `cannot prove from the browser alone`
- `run another validation step`

The test must focus on user-facing strings in `src/lib`. It must ignore this spec file and test cases that intentionally assert forbidden copy is blocked.

## Testing Requirements

Unit tests:

- low sample count cannot produce high-confidence language
- total-only timing cannot produce DNS/TCP/TLS/server cause claims
- browser-only mode cannot assert Wi-Fi/router/ISP as fact
- remote-vantage claims require remote-vantage evidence
- baseline claims require baseline-ready evidence
- healthy/brag snapshot copy only contains measured claims
- shared report copy includes confidence and limitations
- primary validation action follows the resolver priority order
- contradictory remote or baseline evidence lowers claim strength
- legacy `Verdict.headline` is not rendered directly by user-facing components
- copy safety denylist blocks unsupported causal phrases

Component tests:

- Status shows primary validation action when available
- Status exposes confidence reason
- Share popover includes Support Report and Snapshot Link language
- Report view separates measured facts, inferred interpretation, limits, and validation
- Report view does not render `likely source` endpoint pills; it renders claim-safe status text
- Remote vantage panels use measured/inferred/limited copy from the claim model

Visual/accessibility tests:

- Status hierarchy fits desktop and mobile without page overflow
- primary validation action is keyboard reachable
- share/report copy remains readable at mobile widths
- no axe violations across Status, Investigate, Share, and Report

Production smoke:

- load `chronoscope.dev`
- let samples collect
- verify no console errors
- verify all primary views render
- verify share popover paths
- stop any active run before finishing

## Acceptance Criteria

- The app's primary diagnostic text is evidence-scoped.
- Confidence is explained, not merely badged.
- There is one clear primary validation action on Status.
- Browser limitations are visible where they affect interpretation.
- Share supports both support and bragging use cases without unsupported claims.
- Shared reports preserve measured/inferred/limited/validation separation.
- Tests prevent unsupported causal language from returning.
- Legacy verdict copy is retired or mapped through claim-safe presenters before display.
- Primary validation action selection is deterministic and test-covered.
- Snapshot/brag language appears only for eligible healthy measured runs.

## Open Decisions

None for this scope. The approved direction is evidence-gated hierarchy, with accuracy above boldness.
