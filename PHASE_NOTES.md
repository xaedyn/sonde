# Phase notes — Chronoscope v2 redesign

Accumulating log of watch-items surfaced during phased delivery but deferred
for later attention. Each entry names the phase it came from, the signal, and
the condition under which it becomes actionable.

## Open watch-items

### DeepSource Category A — "function declaration in global scope" (Phase 0)
DeepSource JavaScript flags every `export function` at module top level in
`classify.ts`, `format.ts`, `persistence.ts`, and the co-located test files
(11 hits). The rule is mis-calibrated for ES modules: `export function` is
*scoped to the module*, not global. The same pattern exists throughout the
pre-existing codebase without being flagged, which suggests the rule was
enabled after most of the repo was written.

**Action:** add a suppression rule to `.deepsource.toml` (or disable the
specific analyzer check) in a small maintenance PR when convenient. Keeps the
"blocking issues" state honest so future real findings don't get lost in
noise.

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

### CodeRabbit auto-review on v2 redesign branch (Phase 0)
`.coderabbit.yaml` was widened to include `chronoscope-v2-redesign` in
`reviews.auto_review.base_branches`. The config change applied for future PRs
but did not retroactively unlock review on PR #44; 17 minutes of manual
trigger attempts produced only ack comments, no review.

**Action:** verify CodeRabbit actually posts a review on **PR #45 (Phase 1)**.
If PR #45 is still silent, investigate dashboard-level auto-review settings
(CodeRabbit's repository or organization configuration in the web UI may
override file-based config) before merging any further phases.
