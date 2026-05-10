# Verdict-First Status Design

Date: 2026-05-10
Status: Approved for implementation planning

## Product Goal

Chronoscope should preserve S80's instant "open it and it is alive" feeling while making the first answer far more useful. The first screen should tell users what is happening, how confident Chronoscope is, and what to inspect next before asking them to interpret charts.

This first slice does not add new measurement capability. It reorganizes the existing browser, remote-vantage, local-history, and diagnostic-narrative evidence so the product feels verdict-first instead of cockpit-first.

## Scope

Implement a first PR called "Verdict-First Chronoscope" with these changes:

- Rename the primary view from `Overview` to `Status`.
- Rename `Diagnose` to `Investigate`.
- Hide disabled `Strata` and `Terminal` tabs from the visible view switcher.
- Make default, non-shared sessions feel live immediately through safe auto-start or a strong ready-to-measure state.
- Promote the plain-language diagnostic answer above the dial on the first screen.
- Keep the live dial and per-endpoint comparison visible as the S80 inheritance.
- Auto-select the most useful endpoint when entering `Investigate`.
- Preserve the existing deeper evidence: histogram, correlation, browser timing visibility, CORS/Timing-Allow-Origin guidance, remote vantage, phase timing, recent samples, and history baseline chips.

Out of scope for this PR:

- New network quality scoring models.
- New bufferbloat, DNS trace, BGP, or local-agent capabilities.
- Full report redesign.
- A full settings/presets redesign.
- A visual identity restart.

## Information Architecture

The visible top-level navigation becomes:

1. `Status` - "Is everything okay?"
2. `Live` - "What is happening right now?"
3. `Investigate` - "Why does it look that way?"

The underlying `ActiveView` union can remain `overview | live | diagnose | strata | terminal` for compatibility during this PR. The user-facing labels change first; type-level route renames can be a later migration if worthwhile.

Disabled tabs should not appear in production navigation. Showing unreleased destinations makes the product feel unfinished and competes with the answer-first story.

## Status View

The Status view should read from top to bottom as:

1. Diagnostic answer and confidence.
2. Live instrument.
3. Per-endpoint comparison.
4. Event feed or supporting status evidence.

The first visible content should be the verdict surface currently rendered by `CausalVerdictStrip`. It should be restyled or repositioned as the primary status answer, not a secondary card under the dial.

The dial remains important, but it becomes the live instrument that supports the answer. Users should not need to decode the dial before seeing the verdict.

The per-endpoint comparison stays prominent because this is the direct S80 lineage: multiple endpoints measured together, with current latency and tail behavior visible at a glance.

## Open-and-Alive Behavior

S80's strongest product lesson is that measurement starts without ceremony. Chronoscope should adopt that feeling without weakening its safety model.

Default behavior:

- On a normal app visit where every enabled endpoint is public and no shared payload is pending, Chronoscope should begin measuring automatically after bootstrap.
- Auto-start should not run in shared report mode.
- Auto-start should not run while a config-mode shared payload is staged for user acceptance.
- Auto-start should not run when every endpoint is disabled.
- Auto-start should not run when any enabled endpoint is private, loopback, link-local, or otherwise local-only; those sessions remain explicit-start unless the user has already saved a future opt-in setting. This PR does not need to add that opt-in.

If auto-start is suppressed, the first answer surface must say why in plain language and offer a single obvious Start action. The product should never open with a vague `Halted` label that makes a healthy idle state feel broken.

Topbar lifecycle language should become more human:

- `Ready` before a run starts.
- `Measuring` while running.
- `Paused` or `Stopped` only after the user explicitly stops a run.
- `Complete` after a capped run finishes.

This protects the S80 immediacy without making shared links or sensitive local endpoints unexpectedly generate traffic.

## Investigate Auto-Selection

When the user opens `Investigate` and no endpoint is focused, Chronoscope should choose a sensible endpoint automatically.

Selection priority:

1. `diagnosticNarrative.verdict.worstEpId`, when present.
2. The ready endpoint with the highest p95.
3. The endpoint with the latest threshold-crossing event.
4. The first monitored endpoint with samples.
5. The first monitored endpoint.

The view may still show an empty state only when there are no monitored endpoints. It should not ask users to "pick an endpoint" when the app already has enough data to recommend one.

This auto-selection should set `uiStore.focusedEndpointId` so the rail, Live, and Investigate remain consistent.

Implementation should use one shared pure helper, not view-local duplicate logic, so Status CTAs, rail focus, and Investigate agree on the same recommended target.

## Diagnostic Answer

The answer surface should include:

- Plain-language verdict headline.
- One-sentence explanation.
- Confidence badge with a tooltip/title reason.
- Baseline chip when history evidence exists.
- Median, jitter, and loss summary.
- A clear next action, preferably a single primary "Investigate ..." CTA when there is a target endpoint.
- A collecting-progress state that says how many samples are needed before Chronoscope can make a stronger call.

The tone should be direct and human:

- Good: "Everything looks healthy."
- Shared problem: "Multiple endpoints slowed together, so this looks local to your network or shared path."
- Isolated problem: "Google is slow while comparison endpoints are normal, so this looks endpoint-specific."
- Collecting: "Collecting enough samples to make a call."
- Auto-start suppressed: "Ready to measure. Start when you want Chronoscope to probe your saved endpoints."

## Mobile Behavior

Mobile should favor the same mental model:

1. Verdict first.
2. Compact live instrument.
3. Endpoint comparison.

The Status view may stack content instead of preserving desktop proportions. The important invariant is that users see the answer before the large instrument consumes the screen.

Investigate should also auto-select on mobile; a blank "pick an endpoint" state is especially costly on small screens.

## Error Handling and Compatibility

Persisted payloads that still reference `overview` or `diagnose` should continue to work. This PR changes labels and routing behavior, not the serialized schema.

If the selected endpoint disappears after endpoint edits or share loading, auto-selection should re-run when the user enters `Investigate`.

If all endpoints are disabled, Status should still render a clear collecting/no-enabled-endpoints state and the Start control should not imply useful measurement is happening.

Shared result reports should continue to open in report mode, bypassing the live Status shell as they do today.

## Testing

Unit/component tests should cover:

- View switcher visible labels: Status, Live, Investigate.
- Disabled Strata/Terminal tabs are not rendered in the visible navigation.
- Default public-endpoint sessions auto-start after bootstrap.
- Shared report, staged shared config, all-disabled endpoint, and local-only endpoint states do not auto-start.
- Idle topbar/status copy says Ready rather than Halted.
- Investigate auto-selects `worstEpId` when available.
- Investigate falls back to highest p95 when no explicit worst endpoint exists.
- Investigate preserves an existing focused endpoint.
- No endpoint empty state appears only when no monitored endpoint exists.

Visual/browser checks should cover:

- Desktop Status first paint at 1440x900: answer visible above the dial.
- Mobile Status first paint around 390x844: verdict visible before large charts dominate.
- Default desktop/mobile visits show live measurement progress without requiring the user to discover the Start button.
- Desktop Investigate with data and no prior focus: endpoint detail appears without manual rail selection.
- Mobile Investigate with data and no prior focus: endpoint detail appears without a blank picker state.

## Success Criteria

This PR is successful when a new user can open Chronoscope and understand the current network state in under 10 seconds without knowing what p95, CORS, TAO, or remote vantage mean.

The product should still reward expert inspection, but expertise should be optional after the first answer.
