# Synthesis Design Contract

**Created:** 2026-05-17
**Status:** Cross-cutting design contract for the next UI/UX arc
**Scope:** Shell, Overview, Live, Investigate, EndpointDetail (new), Report
**Supersedes:** `2026-05-16-overview-figma-fidelity-design.md` (Overview-only; its discipline rules are absorbed here at broader scope)
**Decision:** The next arc combines the composition language of an external prototype (`~/claude/chrono-redesign-v2`, a Figma Make export reviewed 2026-05-17) with the measurement substance, copy discipline, and fidelity-gate test pattern of the current shipped Chronoscope. Neither design is the target on its own.

---

## Purpose

The Figma redesign that shipped through PRs 154–163 closed the rough information-architecture gap but did not close the visual-design gap, as documented in the superseded 2026-05-16 spec. Subsequent review against a second prototype (`chrono-redesign-v2`) surfaced two new findings:

1. The shipped Overview's hero card is measurably oversized and pushed too low vs. the intent (1320×410 at y=183 today; the synthesis lands it inside the 880–1040 width × 100–160 top × 360–460 height envelope at 1440×900 — see Section 2 for the authoritative DOM contract).
2. The product lacks two pieces of information design that meaningfully improve the diagnostic story: a per-endpoint route with a dedicated URL, and a spatial visualization of what is actually being measured (browser ↔ paths ↔ endpoints).

This contract defines the next arc: a 9-PR sequence that introduces URL-based routing, closes the surface gap, adds the missing IA pieces, fixes two cross-cutting defects (mobile nav clipping, design-token CSS lint gap), and stays inside Chronoscope's measurement and trust boundaries.

Target outcome:

> A first-time visitor unmistakably reads Chronoscope as a calm, premium diagnostic instrument that tells them what their browser can and cannot prove — and gives them a shareable per-endpoint deep-link if they want one.

## Reference Inputs

| Source | Role | Location |
|---|---|---|
| Shipped Chronoscope (live) | Substance reference: measurement engine, copy discipline, severity-state coupling, custom multi-trace canvas, cross-endpoint comparison matrix, fidelity-gate test pattern | `https://chronoscope.dev/`, `src/lib/components/`, `tests/visual/figma-fidelity-gate.spec.ts` |
| Figma Overview reference manifest | Composition reference (still authoritative for routes already in manifest) | `docs/artifacts/figma-alignment-reference/manifest.json` |
| External prototype `chrono-redesign-v2` | Composition reference for shell, Overview right-column, Investigate landing, EndpointDetail, Report artifact framing | `~/claude/chrono-redesign-v2/src/app/` (React/Tailwind/Radix; *do not copy stack, copy composition only*) |
| Walk-through evidence captured 2026-05-17 | Side-by-side measurements at 1440 and 375 | Working-tree screenshots `live-*.png`, `v2-*.png` (not committed) |

The external prototype is a Figma Make export. Its stack (React + Tailwind + Radix + MUI + emotion + recharts) is irrelevant; only its composition decisions are referenced. Its `Guidelines.md` is unedited template content and is ignored.

## Design Principles

1. **Brains stay, body changes.** The measurement engine, store-derived statistics, real-time correlation, remote vantage, companion agent, and intelligence ingest pipeline are not in scope. This contract changes how the user sees what the engine already produces.
2. **Distinguish landing from focus.** Investigate becomes a landing view (what we can see across all endpoints, what we can't, how to get more). When the user focuses an endpoint, they navigate to a stable URL (`/endpoint/:id`), not a mutated in-place state.
3. **Show limits structurally, not just verbally.** When timing visibility is `partial` or `hidden`, render the DNS/TCP/TLS/TTFB rows with the value "Hidden" at low opacity. Make the limit visible as UI, not only as prose.
4. **Calm shell, live affordance.** The top bar reads as a single calm band, not two. The "Measuring" pulse and elapsed counter live inside the band so the live affordance is preserved.
5. **Composition first, motion last.** Reserve animation for state changes that matter (Start/Stop, severity transitions, pulse packets during active measurement). Do not animate every panel on mount or every route change.
6. **Discipline is non-negotiable.** Every claim in the verdict is labeled either `Measured Fact` or `Interpretation`. No causal claim is made that exceeds what the browser actually observed.
7. **The fidelity gate moves with the contract.** Every PR in the sequence extends the fidelity-gate test (new DOM contracts, new viewport assertions, new reference assets), not merely passes it.

## Vocabulary Alignment

The codebase has 8+ overlapping severity/tone vocabularies today (`DiagnosticSeverity`, `EvidenceTrailTone`, `OverviewVerdict`, `HealthBucket`, `StoryBeatSeverity`, verdict tone, run-storyline confidence, history-baseline status, plus a local `EndpointSummary['tone']` inside `FigmaOverviewView`). This is technical debt that the synthesis must not amplify.

**Per-surface vocabulary mapping (use these, do not invent new ones):**

| Surface use | Vocabulary | Values | Source |
|---|---|---|---|
| Verdict severity pill (Overview) | `DiagnosticSeverity` | `'healthy' \| 'watch' \| 'degraded'` | `src/lib/utils/diagnostic-narrative.ts:20` |
| Endpoint status (Investigate cards, NetworkTopology nodes, Overview rows, EndpointDetail hero) | `EndpointTone` *(new — introduce in PR 2)* | `'good' \| 'watch' \| 'bad' \| 'collecting'` | New export in `src/lib/utils/endpoint-tone.ts` |
| Event log entries | `EvidenceTrailTone` | `'good' \| 'watch' \| 'bad' \| 'neutral'` | `src/lib/utils/evidence-trail.ts:12` |
| Run storyline beats | `StoryBeatSeverity` | `'info' \| 'watch' \| 'bad' \| 'good'` | `src/lib/utils/run-storyline.ts:19` |

**`EndpointTone` derivation rules** (PR 1 specifies, PR 2 exports, PRs 6–9 consume):

Per-endpoint inputs: `EndpointStatistics | null` for the endpoint, plus its `lastStatus` from the measurement store, plus `settings.healthThreshold` (read from the settings store at the call site; the derivation function takes it as an explicit parameter). Derivation runs the rules top-to-bottom; first match wins. There is **no dependency on the global `measurementStore.lifecycle`** — an endpoint's tone reflects only its own sample history. A newly-added endpoint mid-run shows `'collecting'` while existing endpoints continue showing their real tones.

**Precedence preserved from current code** (`FigmaOverviewView.svelte:152–169`): a recent timeout or error always trumps "not enough samples." A freshly-added endpoint that immediately times out shows `'bad'`, not `'collecting'`. The rule order below preserves this.

1. `'bad'` — `lastStatus === 'timeout'` OR `lastStatus === 'error'` OR (`stats?.ready === true` AND `stats.lossPercent >= 1`)
2. `'collecting'` — `stats === null` OR `stats.ready === false` (per `EndpointStatistics.ready`, which itself encodes the "enough samples" threshold per `MIN_READY_SAMPLES = 8` in `diagnostic-narrative.ts:141`)
3. `'watch'` — `stats.p95 > healthThreshold` OR `stats.stddev >= 25`
4. `'good'` — otherwise

This formalizes the same derivation `FigmaOverviewView.svelte:152–169` already performs informally; the spec promotes it to an exported function. Unit tests must cover each branch and the precedence (specifically: an endpoint with a recent timeout AND `stats === null` resolves to `'bad'`, not `'collecting'`).

Severity pill in the verdict card maps `DiagnosticSeverity` to a visible label:

- `'healthy'` → `Good`
- `'watch'` → `Watch`
- `'degraded'` → `Degraded`

When `lifecycle === 'starting' && DiagnosticNarrative.kind === 'collecting'`, the pill renders `Collecting` instead (a UI-only label that does not map to a severity enum).

## Routing Infrastructure

The synthesis introduces a URL-based router. Today there is none — `Layout.svelte` mounts views via `{#if activeView === ...}` on `$uiStore.activeView`, and `public/_redirects` only catches `/r/* /index.html 200`. A direct browser load of `https://chronoscope.dev/endpoint/abc` would 404 from Cloudflare Pages with no JS running. This must be fixed before any URL-based surface (Sections 2–7) is implementable.

**Choice: hand-rolled wrapper, not a library.** Five routes do not justify a runtime dependency (svelte-routing, svelte-spa-router). The wrapper is ~50 lines.

### Router API contract

New module `src/lib/router.ts` exports exactly:

```ts
export type RouteName = 'overview' | 'live' | 'investigate' | 'endpoint' | 'report';

// Discriminated union — illegal combinations cannot typecheck.
export type RouteState =
  | { readonly name: 'overview' | 'live' | 'investigate' | 'report'; readonly endpointId: null }
  | { readonly name: 'endpoint'; readonly endpointId: string };

export function currentRoute(): RouteState;
export function navigateTo(route: RouteState, options?: { replace?: boolean }): void;
export function subscribeRoute(handler: (state: RouteState) => void): () => void;
export function initRouter(): void;  // called once from App.svelte during bootstrap (step 5)
// pathFor is a private (non-exported) helper used by navigateTo; not part of the public API
```

**`pathFor` (private helper, not exported but specified here for clarity):**

```ts
function pathFor(state: RouteState): string {
  switch (state.name) {
    case 'overview':    return '/';
    case 'live':        return '/live';
    case 'investigate': return '/investigate';
    case 'endpoint':    return `/endpoint/${state.endpointId}`;
    case 'report':      return '/report';
  }
}
```

The discriminated union makes the `endpoint` branch type-safe: TypeScript guarantees `state.endpointId` is `string` (not `string | null`) in that branch. `pathFor` cannot generate `/endpoint/null` or `/endpoint/`. The unreachable branches of the switch are statically exhaustive.

**Semantics:**

- `initRouter()` parses `window.location.pathname` once, reconciles to `uiStore.activeView` and (when the route is `endpoint`) `uiStore.focusedEndpointId`, and installs a `popstate` listener.
- `navigateTo(state)` calls `history.pushState({}, '', pathFor(state))`, updates `uiStore.activeView` per the mapping, then dispatches to subscribers. `options.replace === true` uses `replaceState` instead.

**`focusedEndpointId` is semantically overloaded in the existing codebase — the router does NOT take exclusive ownership.** (Caught in Round 5 review.) Today this single field carries two distinct meanings:

| Meaning | Used by |
|---|---|
| Navigation target ("which endpoint detail are we viewing") | Overview drill, Investigate drill, EndpointDetail mount |
| In-page focus state ("which endpoint is highlighted on the current page") | LiveView solo-mode trace (`LiveView.svelte:69,79,85`), ReportView endpoint highlighting (`ReportView.svelte:163,199`), keyboard shortcut clear (`shortcuts.ts:68`), persisted-focus rehydration (`apply-persisted-settings.ts:54`) |

The synthesis preserves both semantics on the single field by giving the router a **weak contract**, not exclusive ownership:

- When `navigateTo({ name: 'endpoint', endpointId })` fires, the router sets `uiStore.focusedEndpointId = endpointId`.
- When `navigateTo` fires with any other route, the router does **NOT** clear `focusedEndpointId`. Other consumers (Live solo-mode, Report highlighting, shortcuts, persistence) continue to read and write the field freely.
- `InvestigateLanding` decides whether to render the landing two-column view or to mount `EndpointDetail` based on the **route name** (`currentRoute().name === 'investigate'` vs `'endpoint'`), not on `focusedEndpointId`. There is no auto-navigation triggered by store-side mutation of `focusedEndpointId`.
- `EndpointDetail` reads its target endpoint from `currentRoute().endpointId` (the route is the source of truth for "which endpoint this page is about"). It does not read `focusedEndpointId`.

This preserves today's Live solo-mode and Report highlighting behavior. The Overview drilling case mentioned in earlier drafts ("components must call `navigateTo` to drill") still applies for *cross-page navigation* — but in-page focus state (Live's chip click → solo trace, Report's row hover → highlight) continues to mutate `focusedEndpointId` directly without invoking the router.
- `subscribeRoute(handler)` returns an unsubscribe function (Svelte-store convention). Handler fires on `popstate` and on any `navigateTo`.
- `currentRoute()` returns the synchronous current route.
- **Permitted callers of `history.pushState` / `history.replaceState`** — the router is the only NEW code permitted to call these APIs. The existing `src/lib/share/hash-router.ts` retains its `replaceState` calls (currently at lines 326 and 349 for URL cleanup after applying a snapshot payload — verify exact line numbers at implementation time). PR 4's lint or unit-test guard against unauthorized `pushState`/`replaceState` calls must explicitly whitelist `src/lib/share/hash-router.ts`. No other file may add new `pushState`/`replaceState` calls without updating both this contract and the guard whitelist.

### Boot sequence ordering

The synthesis introduces `initRouter()` into a boot sequence that already exists in `src/lib/components/App.svelte:239-293`. Today's sequence is sync `initHashRouter()` → async `await initHostedReportRouter()` → conditional `loadPersistedSettings()` → engine creation → persistence sync → shortcuts → auto-start decision. `initRouter()` must slot in at exactly one place:

**Order (authoritative — PR 4 modifies `App.svelte:bootstrap()` to insert step 4):**

1. `bridgeTokensToCss()` — unchanged.
2. `initHashRouter()` (sync) — unchanged. May `replaceState` to clean up a `/r/<code>` URL after applying the snapshot payload. Returns share mode or `null`.
3. `await initHostedReportRouter()` (async, only when step 2 returned `null`) — unchanged. May `replaceState` similarly.
4. `loadPersistedSettings()` + `applyPersistedSettings()` (sync, skipped only for `'results'` share mode) — unchanged. This writes to `uiStore.activeView` from persisted state. **First-install branch:** when `loadPersistedSettings()` returns `null` (no persisted state, fresh browser), the existing code seeds region-aware defaults via `buildDefaultEndpoints(detected)` and does not write `uiStore.activeView` (it remains at its default `'overview'`). Step 5's reconciliation handles both paths identically: it reads the URL and rewrites uiStore as needed regardless of what step 4 did.
5. **NEW: `initRouter()`.** Runs after persistence has settled. Parses `window.location.pathname` and reconciles `uiStore.activeView` to the URL-derived state. **The URL is authoritative for `activeView`** — if the URL is `/endpoint/abc` and persistence loaded `activeView === 'live'`, the URL wins and `uiStore.activeView` is rewritten to `'diagnose'`. If the URL is `/` and persistence loaded any other view, the URL still wins and uiStore is normalized to `'overview'`. **For `focusedEndpointId`:** when the URL is `/endpoint/<id>`, the router writes `focusedEndpointId = <id>` (this is the navigation semantic). When the URL is any other route, the router does NOT overwrite the persisted `focusedEndpointId` — the persisted value remains (this preserves in-page-focus semantics from the last session for Live solo-mode etc.). Rationale: a user who pasted a deep-link URL into the browser bar should land on the URL's route, not their last-session route, but their persisted in-page focus state on other pages should survive. **Share-mode behavior:** `initRouter()` runs in every share mode (including `'results'`). For `'results'` mode, the URL after `initHashRouter()`'s cleanup is `/` and the router resolves to `{ name: 'overview', endpointId: null }` — but `uiStore.isSharedView === true` is set by hash-router, so the shared-results-banner renders as shell and the user can subsequently `navigateTo` deeper. Snapshot data flow is preserved across router navigation (see Edge Cases for per-route behavior in share mode).
6. Engine creation, persistence sync, shortcuts, auto-start decision — unchanged.

**Why this order matters:**

- `initRouter()` before `initHashRouter()`: the wrapper would see `/r/<code>` as "unknown path" and `replaceState` to `/`, racing the hash-router's eventual cleanup. Wrong.
- `initRouter()` before `loadPersistedSettings()`: the wrapper writes URL-derived `activeView` to uiStore, then persistence overwrites it with the persisted value. The URL's intent is lost. Wrong.
- `initRouter()` after persistence and after all share-URL processing: the URL is now the ground truth for routing. Persisted state hydrates other concerns (settings, endpoints, terminal filters, live-options) but not view choice. Right.

**Race-condition unit test required in PR 4:** simulate a boot where `initHostedReportRouter()` takes >100ms to resolve, verify that `initRouter()` does not run until it completes, and verify that a deep-link load of `/endpoint/abc` (with no `/r/` URL) correctly sets `uiStore.focusedEndpointId === 'abc'` after the full sequence completes.

**RouteName ↔ ActiveView mapping table:**

The codebase's `ActiveView` type (`src/lib/types.ts:217`) is `'overview' | 'live' | 'diagnose' | 'report' | 'strata' | 'terminal'`. The router's `RouteName` (above) is a smaller set with the user-facing label `'investigate'` rather than the legacy internal `'diagnose'`. Mapping:

| RouteName | ActiveView | Notes |
|---|---|---|
| `'overview'` | `'overview'` | 1:1 |
| `'live'` | `'live'` | 1:1 |
| `'investigate'` | `'diagnose'` | Names diverge by design (UI label vs. legacy store value); router translates both directions |
| `'endpoint'` | `'diagnose'` | EndpointDetail mounts within the same logical view; `focusedEndpointId` distinguishes it from landing |
| `'report'` | `'report'` | 1:1 |

**Legacy ActiveView values:** `'strata'` and `'terminal'` are persisted ActiveView values that may exist in `localStorage` from prior versions. `initRouter()` reconciliation rule: if `uiStore.activeView` is `'strata'` or `'terminal'` at boot AND no path was parsed from the URL, coerce both `uiStore.activeView` to `'overview'` and `currentRoute()` to `{ name: 'overview', endpointId: null }`. This matches the existing `readActiveView()` coercion at `src/lib/utils/persistence.ts:229` — the router does not introduce new persistence behavior, it just ensures URL state and store state agree.

**Path → RouteName parse rules (for `initRouter` and `popstate`):**

| Pathname | Parsed RouteName | Validation |
|---|---|---|
| `/` | `'overview'` | — |
| `/live` | `'live'` | — |
| `/investigate` | `'investigate'` | — |
| `/endpoint/<id>` | `'endpoint'` | `id` must match anchored regex `^[a-zA-Z0-9_-]{1,64}$` (no substring matches) |
| `/report` | `'report'` | — |
| Other (including `/diagnose`) | (triggers replace-redirect per "Unknown / malformed routes" table below) | The legacy `/diagnose` path is intentionally NOT a parse target — the user-facing URL is `/investigate`. Anyone with a bookmark or external link to `/diagnose` is redirected. |

**Path map (canonical):**

| RouteState | Path |
|---|---|
| `{ name: 'overview', endpointId: null }` | `/` |
| `{ name: 'live', endpointId: null }` | `/live` |
| `{ name: 'investigate', endpointId: null }` | `/investigate` |
| `{ name: 'endpoint', endpointId: '<id>' }` | `/endpoint/<id>` |
| `{ name: 'report', endpointId: null }` | `/report` |

**Unknown / malformed routes redirect** (replace, not push, so they don't pollute back-stack):

| Incoming pathname | Action |
|---|---|
| `/endpoint/` (empty id) | `replaceState('/investigate')` |
| `/endpoint/<id>` where id fails validation (see below) | `replaceState('/investigate')` |
| `/endpoint/<id>` where id is valid but not in `monitoredEndpointsStore` at load time | `replaceState('/investigate')` |
| Any other unknown path | `replaceState('/')` |
| `/r/*` paths | Untouched — handled by existing hash-router; router-wrapper is a no-op for these |

### `endpointId` validation contract

`endpointId` segments come from user-controlled URLs (shared links, manually-typed addresses). Spec:

- **Allowed characters:** must fully match the anchored regex `^[a-zA-Z0-9_-]{1,64}$`. No `.`, no `/`, no URL-encoded characters, no Unicode. The anchoring is load-bearing: an unanchored pattern would match valid substrings inside attacker input (`/endpoint/abc@malicious` would partially match `abc`). PR 4 unit tests must explicitly cover `abc@malicious`, `abc/def`, `abc.def`, `<script>`, and the empty string as invalid inputs.
- **Length:** 1 to 64 characters inclusive.
- **Source format today:** Endpoint IDs are generated either by the share payload (`shared-ep-<i>-<timestamp>`, see `src/lib/share/hash-router.ts:80`) or by user-add flow (currently UUID-style strings). Both forms fall within the allowed character class.
- **Validation point:** Router-wrapper validates on parse. Invalid IDs trigger the `replaceState('/investigate')` redirect — they never reach any component.
- **Encoding:** The router does not URL-decode `endpointId`. If a path contains percent-encoding, validation fails and the redirect fires.

### XSS surface

`endpointId` flows into:

- The component prop for `EndpointDetailView` (read-only, used to look up an `Endpoint` from the store).
- The `← Back to Investigate` link's `href` (a constant, not interpolated).
- Telemetry / breadcrumbs: none in this arc. Observability is deferred to a follow-on arc (see Production Signals — Deferred section). When that arc adds telemetry, its privacy contract must specify how `endpointId` is logged (categorical reason code, never raw value).

`endpointId` does **not** flow into:

- Inner HTML of any element.
- URL-bar updates other than the path itself (already validated).
- Analytics payloads other than as the validated `endpointId` (treated as opaque key).

The validation contract above (`^[a-zA-Z0-9_-]{1,64}$`, anchored) makes the segment safe to render as text content but it is never inserted as HTML.

### Cloudflare Pages SPA fallback

`public/_redirects` updates to:

```
/r/*           /index.html  200
/endpoint/*    /index.html  200
/live          /index.html  200
/investigate   /index.html  200
/report        /index.html  200
/diagnose      /investigate 301
```

Order matters: `/r/*` stays first so hash-router shared URLs aren't accidentally caught by the new SPA fallback. The catch-all `/*` route is intentionally NOT added — unknown paths beyond the explicit list above should 404 (Cloudflare default) rather than silently serving the SPA, which would mask real broken-link bugs.

The `/diagnose → /investigate 301` rule handles legacy hard-loads. Without this, a bookmarked `/diagnose` URL would return Cloudflare 404 (no SPA shell loads, no JS runs, no in-app redirect fires). The 301 makes Cloudflare itself handle the redirect at the edge, so the URL bar updates to `/investigate` before any JS executes and `initRouter()` then parses `/investigate` normally. (The router's in-app `replaceState('/investigate')` rule for parse failures only fires when JS is already running, so it can't rescue a hard-load 404.) `/` is unmapped because Cloudflare Pages serves `index.html` for the bare root by default.

### Shared-results-view interaction

When `uiStore.isSharedView === true` (the user loaded a `/r/<code>` snapshot URL):

- The router still operates; navigating to `/endpoint/:id` within a shared view is allowed and navigates to the endpoint detail for the snapshot's endpoint set.
- Navigating to a URL whose `endpointId` is not in the snapshot's endpoint set redirects to `/investigate` (same rule as non-shared).
- The shared-results banner (`SharedResultsBanner.svelte`) remains visible across all router transitions; it is shell, not route content.
- `endpointId` values from a shared snapshot follow the `shared-ep-<i>-<timestamp>` shape and pass the validation contract.

## Per-Surface Contract

For each surface: **source attribution** (where the composition comes from), **anatomy** (the required pieces in order), **DOM contracts** (selectors the fidelity gate will assert), **state behavior** (healthy/degraded/collecting/failure variants where relevant), **copy discipline** (what we say and what we refuse to say), **disallowed**.

---

### 1. Shell

**Source:** Composition from `chrono-redesign-v2/src/app/components/Layout.tsx`. Live affordance from shipped Topbar. Mobile-nav-clipping fix is new.

**Anatomy:**

1. Single floating sticky band at top, ~64px tall at desktop, with brand on the left, segmented-control nav in the center, Start/Stop + settings cog on the right.
2. No second visual band underneath. The nav lives inside the same band as the brand and run controls.
3. When measurement is running: a cyan pulsing dot + `T+MM:SS` elapsed counter sit adjacent to the Stop button, inside the band.
4. The settings cog opens an overlay sheet for endpoint management, share, run details, and preferences (consolidating today's three icon ovals).

**DOM contracts (fidelity-gate assertions):**

- `header.shell` exists exactly once and is the only sticky-top element of height ≥ 56px.
- `nav.view-switcher` is a child of `header.shell` (not a sibling); fidelity gate fails if a second nav band exists below the header.
- `button.view-tab` count is exactly 4, labels are `Overview` / `Live` / `Investigate` / `Report` (no decorative numeric suffixes, no icons-only at desktop).
- At 375 viewport: every `button.view-tab` has `getBoundingClientRect().right <= window.innerWidth` (currently violated by both shipped and v2; the gate must lock this fix in).
- At 1440 viewport: header height is between 56 and 72 px inclusive.
- `[data-measuring="true"]` exists in the header when `measurementStore.lifecycle === 'running'` and contains a `T+MM:SS` text node updated at ≥ 1 Hz.

**Mobile nav strategy:**

- At <420px the nav uses an `overflow-x: auto` strip with a right-edge fade gradient (≥ 24px wide) and a visible chevron affordance when tabs are clipped. The fade is removed when the strip is fully scrolled to the right.
- Alternative considered and rejected: collapse to icon-only at <420px. Rejected because Chronoscope's tab names are diagnostic (Investigate, Report) and icons alone obscure what each route is for. Tab text remains, scrolling is signaled.

**Copy discipline:**

- The brand text remains `Chronoscope`. The descriptor text underneath (currently `HTTP LATENCY MONITOR · MULTI-SITE`) is removed at desktop ≥ 768 px; the brand stands alone.
- Stop button label is `Stop` when running, `Start` when idle. No `Stop Test` / `Start Test` (the "Test" is implicit from the product context).

**Disallowed:**

- A second nav band below the brand/run-controls band.
- Numeric tab suffixes in the accessible name (`"Overview 1"` etc. as currently rendered).
- Icon-only top-right cluster (today's three ovals: endpoints, share, settings).
- A pink Stop button with no Measuring affordance — Stop must always be paired with the live indicator when active.

---

### 2. Overview (`/`)

**Source:** Composition from `chrono-redesign-v2/src/app/pages/MainStatus.tsx`. Copy discipline from shipped. NetworkTopology component is new.

**Anatomy (single source of truth for hero geometry):**

1. Verdict card on the left. At 1440 viewport: width 880–1040 px, top 100–160 px, height 360–460 px (the DOM-contract ranges below are authoritative — Purpose section earlier in the doc described the *intent* in approximate numbers; these ranges are what the fidelity gate enforces).
2. NetworkTopology panel on the right, same vertical alignment, occupying ~4-cols-of-12 width.
3. Below: measured-endpoints list and event log in a 7+5 grid, top-aligned just below the hero row.

**Verdict card internal anatomy (preserved from superseded spec, refined):**

1. Severity pill (`good` / `degraded` / `watch` / `collecting`) on top, optionally with a `Measuring` pill.
2. Headline (sans, 36–52 px clamp, max-width ~820 px).
3. `Measured Fact: <one sentence>` paragraph.
4. `Interpretation: <one sentence>` paragraph at slightly lower text contrast.
5. Primary action button.
6. Secondary text-only action.

**Score ring:** The 10.0 score numeral remains supported in the verdict card but is demoted to a smaller inline component inside the card (≤ 80 px diameter), not a separate column. The v2 prototype omits a score; shipped Chronoscope keeps it; this contract keeps it as supporting evidence, not as the dominant visual.

**NetworkTopology (new component):**

- Origin node on the left (browser, neutral surface, mono `BROWSER` label below).
- Endpoint nodes on the right, one per monitored endpoint, colored by `EndpointTone`: `good` → emerald, `watch` → amber, `bad` → rose, `collecting` → cyan.
- Connecting path lines between origin and each endpoint, baseline color `var(--shell-divider)`.
- When `measurementStore.lifecycle === 'running'`: animated pulse packets travel origin → endpoint along each path at a cadence derived from real round timing (not `setInterval(Math.random)`).
- When an endpoint is in `watch` or `bad` tone: the endpoint node has a slow inner-glow pulse animation (2s loop, respects `prefers-reduced-motion`).
- Labels never overlap nodes (the v2 prototype fails this at 1440 — implementation must use computed label rects with collision avoidance).

**DOM contracts:**

- `.verdict-card` width is between 880 and 1040 px at 1440 viewport.
- `.verdict-card` top is between 100 and 160 px at 1440 viewport.
- `.verdict-card` height is between 360 and 460 px at 1440 viewport.
- `.network-topology` is a sibling of `.verdict-card` at desktop (md+) and stacks below at mobile.
- `.network-topology .endpoint-node` count equals `monitoredEndpointsStore` length when length is 1–8. When length is 0: `.network-topology` renders an empty state (see Edge Cases section). When length is >8: `.network-topology` collapses to a compact grid layout that caps at 8 visible nodes with a `+N more` summary chip.
- `.measured-endpoints` and `.event-log` both have `top >= .verdict-card.bottom` (no overlap).

**Copy discipline (preserved from superseded spec):**

State examples remain authoritative:

| State | Headline | Measured Fact | Interpretation |
|---|---|---|---|
| Healthy | `This test looks healthy.` | `Clean browser-visible run: successful checks across all measured sites.` | `Chronoscope has not seen a meaningful slowdown or failure in this window.` |
| Degraded | `One endpoint is slower than the others from your browser.` | `Your browser is reaching the other measured sites normally, but <endpoint> is showing repeated latency spikes.` | `That points to this browser path or that endpoint. An outside check can help separate local-path evidence from broader service evidence.` |
| Collecting | `Collecting enough data to call this test.` | `<n> successful samples so far; comparison needs more.` | `Chronoscope needs a few successful checks before it can compare endpoints responsibly.` |
| Failure | `<endpoint> failed from your browser.` | `<n> consecutive failures observed in this window.` | `Could be the endpoint, your network path to it, or a CORS block. An outside check separates these.` |

**Disallowed:**

- A verdict card outside the 880–1040 width, 100–160 top, 360–460 height range at 1440 viewport.
- NetworkTopology with overlapping labels at any tested viewport.
- A score ring rendered as a dominant left column equal in visual weight to the verdict text.
- The phrase `(high confidence; Based on N+ successful checks)` inside `Interpretation` (it duplicates the measured fact and reads as marketing). Replace with the state-table copy above.
- NetworkTopology rendered with >8 endpoint nodes uncollapsed (mobile chip cap of 8 is the maximum visual count).

---

### 3. Live (`/live`)

**Source:** Composition from shipped Live (multi-trace overlay is best-in-class). Paused-state UX from `chrono-redesign-v2/src/app/pages/LiveMeasurement.tsx`.

**Anatomy unchanged** from shipped:

1. Hero card with `Live latency trace` headline + metadata chips (focused path / endpoint count / round counter / window).
2. View toggle (`Unified` / `Split`).
3. Threshold callout chip (e.g. `TRIGGER 120ms`).
4. Multi-trace canvas (custom, not recharts).
5. Footer chips: one per endpoint with `LAST <ms>` and `p95 <ms>`.

**Paused state (new):**

- When `lifecycle !== 'running'`, the canvas is dimmed (opacity ~0.4) and slightly blurred (backdrop-filter blur 8 px).
- Centered modal card with: ⠿ activity glyph, `Measurement Paused` headline, body text `Click Start in the top bar to resume live network diagnostics.` with `Start` rendered as a key-cap (small bordered chip).
- Respects `prefers-reduced-motion` (no blur animation, instant fade).
- Modal does not block interaction with the top bar.

**DOM contracts:**

- `.live-surface` exists exactly once.
- `.live-hero` exists exactly once.
- `.live-scope-panel` exists exactly once.
- `.live-footer-chip` count equals monitored endpoint count (up to 8).
- When `lifecycle !== 'running'`: `.live-paused-overlay` exists with `role="status"` and contains the text `Measurement Paused`.

**Mobile-specific:**

- At <768 px the metadata chips wrap to multiple lines if needed; the canvas takes priority over chips for vertical space.
- At <420 px: only the focused-path chip and round-counter chip are visible by default; remaining chips collapse into a `+N more` accordion.

**Disallowed:**

- Rendering the canvas as a static idle chart when paused (current behavior; gives no signal that nothing is happening).
- recharts or any third-party charting library (custom canvas remains the implementation).

---

### 4. Investigate (`/investigate`) — landing view

**Source:** Two-column composition from `chrono-redesign-v2/src/app/pages/Investigate.tsx`. Copy discipline from shipped.

**Anatomy:**

1. Header strip: `Investigate Evidence` headline, subtitle `Detailed endpoint diagnostics and what the browser can see.`
2. Two-column grid below (stacks at <1024 px):
   - **Left column — Measured from your browser:** kicker `MEASURED FROM YOUR BROWSER`, subtitle `What we can definitively see from your current environment.`, then one card per monitored endpoint with: endpoint name (mono, clickable link to `/endpoint/:id`), status pill (label derived from `EndpointTone` per mapping below), three-cell grid (`LATENCY` / `JITTER` / `FAILURES`), visibility chip at the bottom whose label is derived from `TimingVisibility.level` per the table in Section 5. The chip has two parts: a short ALL-CAPS label (`COLLECTING` / `HIDDEN BY SERVER` / `PARTIAL VISIBILITY` / `FULL VISIBILITY`) used as the visible chip text and matched by fidelity-gate assertions, and an optional body sentence rendered below for the `HIDDEN BY SERVER` and `PARTIAL VISIBILITY` cases only (see Copy Discipline below for exact body strings).

**EndpointTone → status pill label mapping** (explicit contract; do not reinvent in PR 8):

| `EndpointTone` | Pill label | Pill color tone |
|---|---|---|
| `'good'` | `STABLE` | emerald |
| `'watch'` | `SPIKING` | amber |
| `'bad'` | `FAILING` | rose |
| `'collecting'` | `COLLECTING` | cyan |

This mapping is also the canonical pill label set used on EndpointDetail's hero card and Report's endpoint comparison table — use the same labels everywhere so users don't relearn the vocabulary per surface.
   - **Right column — Needs outside validation:** kicker `NEEDS OUTSIDE VALIDATION`, subtitle `Data required to prove whether the issue is local to you.`, then two action cards: `Check from Outside Vantage Points` (wired to existing remote-vantage flow) and `Check with Local Agent` (wired to companion-agent flow with `NOT INSTALLED` chip when absent). Below: a `Why do we separate this?` callout in a cyan-tinted card.

**What moves out:** the existing DiagnoseView's endpoint-focused content (distribution histogram, comparison matrix, phase waterfall, last-8-samples, browser-visibility breakdown) leaves Investigate and moves to `/endpoint/:id` (see section 5). DiagnoseView decomposes from ~1,800 lines to ~400.

**DOM contracts:**

- `.investigate-landing` exists when `currentRoute().name === 'investigate'` (regardless of `focusedEndpointId` — landing mount is driven by route, not focus state).
- `.investigate-landing > .measured-column` and `.investigate-landing > .validation-column` both exist.
- `.measured-column .endpoint-card` count equals monitored endpoint count.
- Each `.endpoint-card` contains a `.visibility-chip` whose text content matches `/^(COLLECTING|HIDDEN BY SERVER|PARTIAL VISIBILITY|FULL VISIBILITY)$/` (the canonical ALL-CAPS chip labels — see Copy discipline below for the exact mapping from `TimingVisibility.level`).
- `.validation-column .why-separate-callout` exists and contains the text `we never guess the root cause without proof`.
- Clicking an `.endpoint-card` calls `navigateTo({ name: 'endpoint', endpointId })`, which sets the route to `'endpoint'`. The router then mounts `EndpointDetailView` and `.investigate-landing` unmounts (driven by route change, not by `focusedEndpointId` change).

**Copy discipline:**

- Visibility chip has two layers, both bound to `TimingVisibility.level` (not directly to `corsMode`):

  | `level` | Chip label (visible, ALL CAPS) | Body sentence (when shown) |
  |---|---|---|
  | `'none'` | `COLLECTING` | *(no body)* |
  | `'total-only'` | `HIDDEN BY SERVER` | `The browser is not permitted to see exactly where time is spent (DNS, TCP, or server delay). We can only measure total trip time.` |
  | `'mixed'` | `PARTIAL VISIBILITY` | `Some samples exposed detailed timing; others did not. Mixed visibility usually means the server sends Timing-Allow-Origin inconsistently.` |
  | `'phase'` | `FULL VISIBILITY` | *(no body — full visibility needs no apology)* |

- The chip label is what the fidelity-gate DOM regex matches: `/^(COLLECTING|HIDDEN BY SERVER|PARTIAL VISIBILITY|FULL VISIBILITY)$/` on the chip element's text content. Body sentences are rendered as a sibling `<p>` element when present and are not asserted by the gate (they're prose, not contract).
- The `Why do we separate this?` callout text is: `We measure latency, but we never guess the root cause without proof. Separating facts from interpretation prevents falsely blaming your ISP or a specific server.` (Preserved verbatim from v2 prototype, which preserved Chronoscope's own discipline.)

**Disallowed:**

- Investigate landing showing endpoint-focused detail (histogram, waterfall, matrix). That content lives on `/endpoint/:id` now.
- A `Check with Local Agent` card that links to a download without first checking installation status.
- A single-column landing on desktop ≥1024 px.

---

### 5. EndpointDetail (`/endpoint/:id`) — NEW route

**Source:** Composition from `chrono-redesign-v2/src/app/pages/EndpointDetail.tsx`. Comparison matrix and phase breakdown from shipped DiagnoseView. Ghost-row treatment is new (lifted from v2's Browser Visibility panel and applied to all hidden-timing rows).

**Anatomy:**

1. `← Back to Investigate` text link top-left.
2. Hero card: endpoint name in mono at 36–48 px, external-link icon button, status chip with `<state>: <one-sentence explanation>`, on the right two stat tiles (`P95 LATENCY` and `SUCCESS RATE`).
3. **Latency Distribution panel** (left, 8 of 12 cols on desktop): histogram with bins colored by relation to threshold (`<= threshold` = cyan, `> threshold` = amber). Dashed reference line labeled `Warning Threshold` at the threshold bin boundary. Interpretation sentence directly below the chart, e.g. `Performance is splitting into two distinct speed groups. This often means traffic is occasionally taking a different, slower route.` (bimodal) or `A tight cluster indicates consistent and predictable network performance.` (unimodal).
4. **Browser Visibility panel** (right, 4 of 12 cols): visibility chip at top whose label is derived from `TimingVisibility.level` (see below). Below: timing rows for DNS Lookup, TCP Handshake, TLS Negotiation, and Time to First Byte. The visibility classification comes from `describeTimingVisibility(samples, corsMode)` in `src/lib/utils/diagnostic-narrative.ts:171`, which returns `TimingVisibility { level: 'none' | 'total-only' | 'mixed' | 'phase'; ... }`. The mapping from `level` to panel behavior:

| `TimingVisibility.level` | Chip label | Rows (DNS / TCP / TLS / TTFB) |
|---|---|---|
| `'none'` (zero successful samples yet) | `COLLECTING` | All rows render value `Collecting` at full opacity (not `Hidden` — we don't yet know what visibility we have). |
| `'total-only'` (samples exist, no phase timing on any) | `HIDDEN BY SERVER` | All four rows render value `Hidden` at 40% opacity. |
| `'mixed'` (some samples have phase timing, some don't) | `PARTIAL VISIBILITY` | Rows render the average of phases that exposed data; rows with zero phase samples render `Hidden` at 40% opacity. |
| `'phase'` (every successful sample exposed phases) | `FULL VISIBILITY` | All rows render real values at full opacity. |

The visibility status depends on real measured phase-data presence per `hasMeaningfulTier2`, not on `corsMode` alone — a `cors`-mode request can still be phase-blind if the server omits `Timing-Allow-Origin`, and a `no-cors` request may rarely produce phase data depending on browser behavior.
5. **Compare With Other Endpoints panel** (full-width below): time-binned matrix (preserved from shipped DiagnoseView). One row per endpoint, columns are time slots, pink cells indicate spikes >1.5× endpoint's own median. Includes the existing legend (`normal` / `spike` / `no data`).
6. **Phase Breakdown (Advanced)** collapsible panel: preserved from shipped DiagnoseView for same-origin endpoints (DNS · TCP · TLS · Server · Transfer waterfall). Renders as empty for opaque endpoints with the explanation that detailed phase timing requires same-origin or a local agent.
7. **Last 8 Samples** panel: preserved from shipped DiagnoseView (per-sample horizontal bars with relative timing and pass/fail status).

**DOM contracts:**

- `.endpoint-detail` exists at route `/endpoint/:id` where `:id` matches an endpoint in `monitoredEndpointsStore`.
- `.endpoint-detail .hero-card` exists exactly once.
- `.endpoint-detail .distribution-panel` contains a `.warning-threshold-line` element.
- `.endpoint-detail .browser-visibility` panel: when `describeTimingVisibility(samples, settings.corsMode).level` is `'total-only'` or `'mixed'`, the rows that lack phase data render with `data-hidden="true"` and text `Hidden`. When `level === 'none'`, no rows render `data-hidden="true"` (they render `Collecting` instead). When `level === 'phase'`, no row renders `data-hidden="true"`. The chip element exposes `[data-visibility-level="<level>"]` for fidelity-gate assertion.
- `.endpoint-detail .comparison-matrix` exists with one `.matrix-row` per monitored endpoint.
- `/endpoint/<unknown-id>` redirects to `/investigate` with no error state.

**Copy discipline:**

- The interpretation sentence under the histogram is computed from the distribution shape, not hardcoded. Three templates exist (unimodal-tight, unimodal-wide, bimodal); each is bound to a measurable property of the distribution.
- `Hidden` rows must use the literal word `Hidden`, not `—` or `n/a`. The word is load-bearing.
- The status chip sentence is one of: `This endpoint is stable and performing well.` / `This endpoint is showing intermittent latency spikes.` / `This endpoint is currently failing from this browser.` / `Still collecting samples for this endpoint.` No causal language ("your network", "their server") in the status chip; causal language lives only in the histogram interpretation and only when supported by distribution shape.

**Navigation contracts:**

- Clicking an endpoint card on Investigate landing navigates to `/endpoint/:id`.
- Clicking an endpoint row on Overview navigates to `/endpoint/:id` (replaces today's focused-state mutation).
- Report deep-links use `/endpoint/:id` as the canonical per-endpoint URL.
- `← Back to Investigate` navigates to `/investigate` (not browser-back, which may not exist for direct-loaded URLs).

**Disallowed:**

- A `/endpoint/:id` page that loads without a histogram for endpoints with ≥10 successful samples.
- Phase-breakdown values for opaque endpoints (must show the empty/hidden state, not placeholder zeros).
- Bimodal interpretation text on a unimodal distribution.

---

### 6. Report (`/report`)

**Source:** Artifact framing from `chrono-redesign-v2/src/app/pages/Report.tsx`. Evidence trail timeline and copy-link CTAs preserved from shipped ReportView. Per-endpoint deep links use `/endpoint/:id` from section 5.

**Anatomy:**

1. Header strip: `Diagnostic Report` headline, `Generated on <ISO date>` subtitle, CTAs on the right: `Copy Summary` (secondary) + `Share Link` (primary white).
2. **Artifact card** (single bordered surface, heavy rounding ~24 px):
   - Branded header: small `CHRONOSCOPE` brand mark + uppercase wordmark at low contrast.
   - Severity badge (icon + tone-colored chip) + headline (`Degraded Connection Detected`, `Healthy Run`, etc.) + one-sentence body that inline-tags the relevant endpoint as a clickable chip (e.g. `One endpoint (<chip>api.service</chip>) is significantly slower than the others from this browser.`).
   - `MEASURED FACTS` section: two-cell grid (`DURATION`, `SAMPLES`).
   - `ENDPOINT COMPARISON` section: table with columns Endpoint / Avg Latency / Jitter / Status. Spiking/failing rows are highlighted with a tinted background.
3. **Evidence Trail timeline** (below the artifact card, preserved from shipped): sample range, start time, time, duration, sample period, stream type, local time.
4. **Timeline Summary** card (preserved from shipped): one-sentence summary of any meaningful events in the captured window.
5. Operational chrome CTAs (preserved from shipped): `Copy Snapshot Link`, `Copy Support Bundle`, `Copy Report Link`, `Run Your Own Test` — these live BELOW the timeline, not inside the artifact card.

**DOM contracts:**

- `.report-surface` exists exactly once.
- `.report-hero` exists exactly once.
- `.report-strip` (the artifact card) exists exactly once.
- `.evidence-trail` exists below `.report-strip`.
- `.report-strip .endpoint-chip` links navigate to `/endpoint/:id`.
- `button[data-action="copy-report-link"]` produces a URL containing the run identifier as a query parameter (not a fragment, so it survives copy/paste through systems that strip fragments).

**Copy discipline:**

- The artifact card's headline is bound to severity. No marketing language.
- The endpoint chip uses the real endpoint label (e.g. `api.service.net`), not a prototype name.

**Disallowed:**

- Operational CTAs (Copy Snapshot, Copy Support Bundle) inside the artifact card. The artifact card is the *thing* you're sharing; CTAs sit around it.
- An artifact card that lacks the branded header (the brand is part of what makes it a credible attachment).

---

## Cross-Cutting Requirements

### Background and depth

Preserved from superseded spec, with one update:

- Deep near-black base (`#0c0a14`, not pure black). Pure black is rejected; the softer navy reads better in extended use.
- Restrained blue/teal/purple depth across the page.
- **No CSS radial-gradient orbs at corners.** The current `Layout.svelte:128-137` pattern (linear gradient + two radial-gradient ellipses at corners) bands on certain displays. Replace with one of:
  - Pre-dithered SVG noise mask layered over a solid base.
  - A single subtle vertical gradient `linear-gradient(180deg, <shell>, <base>)` with no radial overlays.
  - Solid base with no gradient.
- The choice between the three is empirical: implement, test on 2-3 displays at full resolution, pick the one that doesn't band. Default if untested: solid base.

### Motion budget

- One-shot mount animations: **none.** No stagger entrance, no panel fade-in, no route-change blur. Routes change instantly.
- State-change animations: **yes, restrained.** Start/Stop button transitions, severity-pill color crossfades (200 ms), NetworkTopology pulse packets, measuring-dot pulse, paused-state blur fade.
- Live data animations: **yes.** Trace line growth, distribution histogram bar height changes.
- `prefers-reduced-motion`: all decorative animations disabled, only essential state-change crossfades retained.

### Mobile behavior

- No horizontal page overflow at 375, 390, or 430 px viewport.
- Tab strip uses overflow-x scroll with fade affordance at <420 px (see Shell).
- All tap targets ≥44×44 px effective.
- All routes pass `axe-core` accessibility scan with zero violations.
- Tested viewports added to fidelity gate: **375** (currently only 390 is tested; 375 catches the mobile-nav clipping that 390 misses).

### Design-token CSS discipline

PR 2 closes the ESLint CSS gap discovered in the 2026-05-17 review:

- Current `eslint-rules/no-raw-visual-values.js` only visits JavaScript `Literal` nodes. CSS strings inside Svelte `<style>` blocks pass through. The shipped `FigmaOverviewView.svelte` has 22 raw `rgba(...)` values and 1 raw hex value (`#2f80ff` at line 688) plus `#0891b2` in `Topbar.svelte:246` that the rule does not catch.
- PR 2 must pick one of two paths (see PR 2 scope for full detail):
  - Option A: Extend `no-raw-visual-values.js` to walk Svelte `<style>` blocks via `postcss`.
  - Option B: Rewrite the `tokens.ts:3` header promise to JS-only and adopt `stylelint` for CSS discipline (recommended).
- All subsequent PRs (3–9) must pass the chosen lint discipline. Status quo (promise the rule can't keep) is unacceptable for this arc.

### Typecheck includes svelte-check

PR 2 adds `svelte-check` to `devDependencies` and updates `package.json`:

```diff
- "typecheck": "tsc --noEmit && npm run typecheck:functions",
+ "typecheck": "tsc --noEmit && svelte-check && npm run typecheck:functions",
```

Reason: `tsc --noEmit` does not validate Svelte template prop usage. Decomposing 1,799 lines of Svelte in PRs 7–8 without `svelte-check` is asking for silent template-prop drift.

---

## Known Product-Truth Deviations from External Prototype

Chronoscope intentionally differs from `chrono-redesign-v2` in the following ways. These are not bugs to "fix" for visual fidelity:

- **Copy retains `Measured Fact:` / `Interpretation:` labels.** The prototype fuses fact and interpretation into one block. Chronoscope keeps them separate because the separation is the product.
- **Severity is bound to real measurement state.** The prototype hardcodes `DEGRADED`. Chronoscope's severity pills are derived from `diagnosticNarrative.severity`.
- **Score numeral remains.** The prototype omits a score. Chronoscope keeps it as supporting evidence in the verdict card; removing it would lose the at-a-glance "is the network OK right now" affordance.
- **Live multi-trace uses custom canvas.** The prototype uses recharts area chart. Chronoscope's custom canvas handles 4-endpoint overlays and hundreds of samples without choking.
- **NetworkTopology uses real round timing for pulses.** The prototype uses `setInterval(800 + Math.random() * 800)` (800–1600 ms range, decoupled from any measurement event). Chronoscope's pulses fire from real measurement-round events.
- **EndpointDetail interpretation text is derived, not hardcoded.** The prototype hardcodes a bimodal interpretation. Chronoscope computes which template applies from distribution shape.
- **Background is `#0c0a14` deep navy, not pure black.**

## Known Product-Truth Deviations from Original Figma Reference (preserved)

Carried forward from superseded spec:

- The Figma phrase implying local Wi-Fi and core ISP are likely fine is too strong for browser-only evidence in some cases. Chronoscope uses narrower evidence-bound language.
- Chronoscope does not claim an outside network check proves global availability. It is a second vantage, not universal truth.
- Chronoscope may show collecting and healthy states more often than the degraded Figma screenshot because real data determines state.
- Report remains a top-level nav item.

---

## PR Sequence

Each PR is independently merge-able and ends with a fidelity-gate update. Branch convention `codex/synthesis-<slug>`.

### PR 1: This contract + manifest regeneration

**Branch:** `codex/overview-fidelity-spec` (current; PR title makes the supersede explicit).

**Scope:**

- This document.
- Retire `2026-05-16-overview-figma-fidelity-design.md` in the same commit.
- **Regenerate `docs/artifacts/figma-alignment-reference/manifest.json`** — the existing manifest contains text strings the new contract forbids (`STOP TEST`, `START TEST`, `SCORE / BASED ON / AGGREGATE LATENCY`, the local-Wi-Fi/ISP causal phrase, ALL-CAPS tab labels). Manifest must reflect the new copy or every later PR fails the gate. Regenerate by re-exporting Figma reference frames at the documented viewports against the *new* contract's copy rules; update the manifest's `text` field per route.
- Add a placeholder for the 3 new `endpoint-detail` entries to be populated in PR 5 (file shape only — actual screenshots/text come with the route).

**Merge gate:** Spec review (`adversarial-spec-review`), manifest schema validation, no broken JSON.

**Unblocks:** All PRs below.

### PR 2: Tooling foundation (lint + svelte-check + EndpointTone export)

**Branch:** `codex/synthesis-tooling-foundation`

**Scope:**

- **Close the CSS lint-rule gap.** Two options, must pick one (do not ship "either/or"):
  - Option A: Extend `eslint-rules/no-raw-visual-values.js` to walk Svelte `<style>` blocks. Requires invoking a CSS parser (`postcss`) inside the rule because `svelte-eslint-parser` exposes `<style>` content as raw text, not a parsed AST. ~80 lines of rule code + postcss devDep.
  - Option B: Rewrite the `tokens.ts:3` promise to scope to JS only; add `stylelint` + `stylelint-config-standard` as devDeps; add a stylelint rule for raw color/length values in `*.svelte` files; add `npm run lint:css` script; wire into CI.
  - **Recommendation: Option B** — stylelint is the standard CSS-linting tool, the config is well-trodden, and keeping the ESLint rule narrowly scoped to JS is honest about the rule's actual coverage. ~3-4 hours including CI wiring.
- Add `svelte-check` to `devDependencies` (currently not installed). Update `package.json`:
  ```diff
  - "typecheck": "tsc --noEmit && npm run typecheck:functions",
  + "typecheck": "tsc --noEmit && svelte-check && npm run typecheck:functions",
  ```
- Export the new `EndpointTone` type and derivation function from `src/lib/utils/endpoint-tone.ts` per the Vocabulary Alignment section above. Add unit tests for the four derivation rules.

**Merge gate:** Typecheck (now includes svelte-check), lint (now catches CSS raw values), unit tests, build. No UI changes in this PR.

**Unblocks:** All subsequent surface PRs depend on `EndpointTone` and the lint discipline.

### PR 3: Ghost rows in Browser Visibility panel

**Branch:** `codex/synthesis-ghost-rows`

**Scope:** Add `.timing-row[data-hidden="true"]` treatment to `DiagnoseView.svelte`'s existing Browser Visibility panel. DNS/TCP/TLS/TTFB render at 40% opacity with value `Hidden` when `describeTimingVisibility(samples, settings.corsMode).level` is `'total-only'` or `'mixed'` (and only for the rows that actually lack phase data, per Section 5 panel rules). Rows render `Collecting` (not `Hidden`) when level is `'none'`. ~1 surface change.

**Merge gate:** Typecheck (with svelte-check), lint (CSS discipline enforced), unit tests, build, axe scan, visual regression on the existing investigate route at 3 viewports.

**Unblocks:** Pattern reuse in EndpointDetail (PR 7). Note: PR 7 moves this panel to the new route; the carry cost is acknowledged.

### PR 4: Router + shell calmness

**Branch:** `codex/synthesis-router-shell`

**Scope:**

- New `src/lib/router.ts` per the Routing Infrastructure section. Hand-rolled `popstate`/`pushState` wrapper, ~50 lines.
- Update `public/_redirects` per the Cloudflare Pages SPA fallback section.
- Wire `initRouter()` into `src/lib/components/App.svelte` before any view mounts. Reconcile router state with `uiStore.activeView` + `uiStore.focusedEndpointId`.
- Refactor `Topbar.svelte` + `ViewSwitcher.svelte` + `Layout.svelte` into a single sticky band.
- Remove numeric tab suffixes from accessible names.
- Add mobile nav fade-gradient + chevron affordance at <420 px.
- Integrate Measuring pulse + `T+MM:SS` elapsed counter into the band.
- Replace the three icon ovals (endpoints, share, run details) with a single settings cog that opens an overlay sheet.

**Merge gate:** Typecheck (with svelte-check), lint, unit tests including new router tests (URL→state, state→URL, redirect rules, validation rules, popstate handling), build, axe scan, fidelity-gate updated with: single header band assertion, no numeric suffixes assertion, all 4 tabs visible at 375 viewport assertion, router URL reconciliation assertion (visit `/live` directly, confirm Live mounts).

**Unblocks:** All URL-based surfaces.

### PR 5: Dead-code purge

**Branch:** `codex/synthesis-dead-code-purge`

**Scope:**

- Delete `OverviewView.svelte` (orphan, 494 lines).
- Delete its dead consumer tree: `ChronographDial.svelte` (792), `CausalVerdictStrip.svelte` (675), `RacingStrip.svelte` (377), `RunStorylineCard.svelte` (970), `OverviewSubtabStrip.svelte` (unknown lines).
- Delete unreferenced components: `EndpointRail.svelte` (268), `EventFeed.svelte` (212), `LatencyLegend.svelte`.
- **Delete the test files for every component above in the same commit.** Round 5 review verified that `tests/unit/components/{ChronographDial,CausalVerdictStrip,RacingStrip,RunStorylineCard,EndpointRail,EventFeed}.test.ts` all import these components. Deleting the component without its test fails the merge gate. The rule is: delete the component and its colocated test file together, in the same commit. Before deletion, also grep `tests/` for any cross-cutting test (visual regression, fidelity gate, accessibility) that imports or asserts against the components by name; update those as needed.
- Rename `FigmaOverviewView.svelte` → `OverviewView.svelte` (the new canonical Overview; the old `OverviewView.svelte` has been deleted so the name is free).
- Verify orphan status before each deletion: grep for actual `import` statements (string matches in comments/CSS classes don't count). The protocol per file: (a) grep for imports of the component; (b) confirm only its colocated test file appears (or zero results); (c) `git rm` the component and the test file together; (d) `npm run typecheck && npm test` must pass; (e) commit. If any step fails, abort the deletion for that file, file a follow-up note, and proceed with the remaining files.

**Merge gate:** Typecheck (with svelte-check) passes after each deletion, lint, unit tests, build. ~3,800 lines net deletion.

**Unblocks:** NetworkTopology PR (clean tree to work in).

### PR 6: NetworkTopology component + Overview placement

**Branch:** `codex/synthesis-network-topology`

**Scope:**

- New `NetworkTopology.svelte` (Svelte 5 + SVG, store-wired).
- Implement label-collision avoidance for endpoint labels at all viewports (1, 2, …, 8 endpoint counts must all render without overlap; >8 invokes the compact-grid + `+N more` collapse from Section 2).
- Wire pulse animation to real `measurementStore` round events: each successful sample for endpoint X triggers a single pulse along the origin→X path; cadence is whatever the real measurement loop produces, not interval-driven.
- Empty state: when `monitoredEndpointsStore.length === 0`, render an empty-state card with copy `Add an endpoint to see your network map.` and a CTA that opens the endpoint-management overlay.
- Place NetworkTopology in Overview right column.
- Resize verdict card to land inside the 880–1040 × 100–160 × 360–460 envelope at 1440 viewport.
- Endpoint clicks on NetworkTopology nodes call `navigateTo({ name: 'endpoint', endpointId: <id> })`.

**Merge gate:** Typecheck (with svelte-check), lint, unit tests including NetworkTopology layout tests at 1, 4, 8, 12 endpoint counts, build, axe scan. Fidelity-gate updated with: verdict-card bounds assertions, NetworkTopology DOM contracts, no-label-overlap assertion (via computed rects), empty-state assertion.

**Unblocks:** Overview reaches v2's composition fidelity.

### PR 7: EndpointDetail route + DiagnoseView decomposition

**Branch:** `codex/synthesis-endpoint-detail`

**Scope:**

- New route `/endpoint/:id` wired into the router from PR 4. Use `navigateTo({ name: 'endpoint', endpointId })` and `subscribeRoute(...)`.
- New `EndpointDetailView.svelte` composed of: hero card, distribution panel (with threshold + bimodal coloring + derived interpretation per the distribution-shape thresholds below), browser-visibility panel (with ghost rows from PR 3), comparison matrix (moved from DiagnoseView), phase-breakdown collapsible (moved), last-8-samples panel (moved).
- DiagnoseView shrinks from 1,799 lines to ~400 (only landing-view content remains; that becomes PR 8).
- Update Overview endpoint-row clicks to call `navigateTo({ name: 'endpoint', endpointId })`.
- Update Report endpoint chips to link to `/endpoint/:id`.
- Populate `docs/artifacts/figma-alignment-reference/manifest.json` with the 3 `endpoint-detail` entries (placeholder added in PR 1).
- **Hash-router compatibility** (see "Hash-Router and Share-URL Compatibility" section): `src/lib/share/hash-router.ts` is **not modified** by this PR. Snapshot URLs continue to land users on `/` and the shared-results-banner; the router-wrapper (PR 4) is a no-op for `/r/*` paths. PR 7 must verify by test that a snapshot URL load does not trigger a `navigateTo` call.
- **Endpoint disappears mid-view:** if the focused `endpointId` is removed from `monitoredEndpointsStore` while EndpointDetail is mounted, `subscribeRoute`/`monitoredEndpointsStore` subscriber detects the loss and calls `navigateTo({ name: 'investigate' }, { replace: true })`.

**Distribution-shape interpretation thresholds** (concrete, testable):

Compute on the histogram bins (typically 7–10 bins, log-spaced from min sample to max).

**Precondition: when total successful samples < 8** (the `MIN_READY_SAMPLES` threshold from `diagnostic-narrative.ts:141`), the template selection short-circuits to `insufficient-data` and the histogram itself is not rendered (an empty-state card appears in its place — see EndpointDetail Edge Cases). This avoids division-by-zero when `highestBinCount` is 0 and avoids attaching interpretation copy to a distribution that doesn't yet have a meaningful shape.

Otherwise compute:

- `peakRatio = secondHighestBinCount / highestBinCount` (in [0, 1]; `highestBinCount >= 1` is guaranteed by the precondition)
- `binsAboveThreshold = count of bins with count > 0 and binMin > healthThreshold`

Templates:

| Condition | Template name | Interpretation copy |
|---|---|---|
| Total successful samples < 8 (precondition) | `insufficient-data` | *(no interpretation copy rendered — histogram replaced by empty-state card with copy `Collecting samples — distribution will appear once enough data is captured.`)* |
| `binsAboveThreshold === 0` AND `peakRatio < 0.4` | `unimodal-tight` | `A tight cluster indicates consistent and predictable network performance.` |
| `binsAboveThreshold === 0` AND `peakRatio >= 0.4` | `unimodal-wide` | `Latency varies but stays below the threshold throughout this window.` |
| `binsAboveThreshold >= 1` AND `peakRatio >= 0.3` | `bimodal` | `Performance is splitting into two distinct speed groups. This often means traffic is occasionally taking a different, slower route.` |
| `binsAboveThreshold >= 1` AND `peakRatio < 0.3` | `tail-spikes` | `Most samples are fast, with intermittent slow outliers. Often indicates occasional congestion rather than a baseline problem.` |

These are unit-testable: given an array of bin counts and a threshold, the template selection is deterministic. Tests must cover each branch including `insufficient-data` (zero samples, 1 sample, exactly 7 samples — all hit the precondition; 8 samples falls through to the shape templates).

**Merge gate:** Typecheck (with svelte-check), lint, unit tests including the 5 distribution templates (including `insufficient-data`) + snapshot-load-does-not-call-navigateTo + endpoint-disappears-mid-view scenarios, build, axe scan on the new route. Fidelity-gate extended to 5 routes × 4 viewports (2048×1330, 1440×900, 390×844, 375×667) = 20 cases.

**Unblocks:** Investigate landing decomposition in PR 8.

### PR 8: Investigate landing redesign

**Branch:** `codex/synthesis-investigate-landing`

**Scope:**

- Rewrite default Investigate state (when route is `{ name: 'investigate' }`) as the two-column landing from Section 4.
- When the user clicks an endpoint card, call `navigateTo({ name: 'endpoint', endpointId })` (PR 7's route).
- DiagnoseView renamed to `InvestigateLandingView.svelte` for clarity (the file is now Investigate-landing-only).
- Wire `Check from Outside Vantage Points` to existing remote-vantage flow.
- Wire `Check with Local Agent` to existing companion-agent installation-check flow.

**Merge gate:** Typecheck (with svelte-check), lint, unit tests, build, axe scan. Fidelity-gate updated with: landing DOM contracts, two-column layout assertion at ≥1024 px, stacked layout assertion at <1024 px.

**Unblocks:** Final IA in place.

### PR 9: Report artifact framing

**Branch:** `codex/synthesis-report-artifact`

**Scope:**

- Restructure ReportView to use the artifact-card framing from Section 6.
- Inline endpoint chips call `navigateTo({ name: 'endpoint', endpointId })`.
- Operational CTAs move below the evidence trail (out of the artifact card).
- Evidence trail timeline + timeline-summary card preserved.

**Merge gate:** Typecheck (with svelte-check), lint, unit tests, build, axe scan. Fidelity-gate updated with: artifact-card DOM contracts, endpoint-chip link assertions.

**Unblocks:** Synthesis complete.

---

## Hash-Router and Share-URL Compatibility

**Correction to prior assumption (caught in Round 2 review):** The current `SharePayload` schema in `src/lib/types.ts:371-394` is `{ v: 1 | 2; mode; endpoints; settings; report?; remoteVantage?; localCompanion?; results? }` — it contains **no** `activeView` and **no** `focusedEndpointId` fields. Today's share-URL system has never preserved which view the sharer was on or which endpoint they were focused on. There is no view/focus migration to perform.

This shapes the deep-link product story:

**Two distinct URL-sharing mechanisms post-synthesis:**

1. **Snapshot URLs** (`/r/<code>`, existing): produced by the share-manager flow, encode endpoints + settings + measured results. Carry no view/focus state. Always land the recipient on `/` (Overview) — same as today.
2. **Browser-bar URLs** (`/endpoint/:id`, new in this arc): copy-pasted directly from the browser URL bar. Carry only the route. Reach an endpoint detail page on the recipient's data (if they have the same endpoint configured) OR redirect to `/investigate` (if they don't, per Routing Infrastructure validation rules).

These mechanisms do not overlap. A `/r/<code>` URL never produces a `/endpoint/:id` route; a `/endpoint/:id` URL never produces snapshot data.

**Behavior contracts:**

- Old `/r/<code>` snapshot URLs continue to load via the existing hash-router path. The router-wrapper from PR 4 is a no-op for `/r/*` paths — it does not call `navigateTo` after hash-router applies the payload. The shared-results-banner remains the entry-affordance for those URLs.
- A future observability arc may add a session-level signal to observe whether share-recipients navigate from `/` to `/endpoint/:id` after the snapshot loads. If that funnel turns out to be load-bearing, an even-later arc can introduce `SharePayload v: 3` with optional view/focus fields and an `applyRouteFromSnapshot()` call — both **out of scope for this arc**.
- The existing `hash-router.ts` security invariants (documented at lines 5-16: cadence not persisted, config staging, results-mode read-only) are untouched. The router-wrapper sits *beside* hash-router, not downstream of it.

**What this changes for users:**

- A user who shared a snapshot URL while focused on AWS sees that URL still land their recipient on `/` (today's behavior). Recipient sees the snapshot, has to click into AWS themselves. **Same as today, not a regression.**
- A user who wants to deep-link to AWS specifically can now copy `https://chronoscope.dev/endpoint/<aws-id>` from the URL bar. This only works for recipients who have a matching endpoint configured.
- Snapshot URLs and deep-link URLs serve different sharing intents; no automatic conversion between them.

## Edge Cases

The fidelity gate and unit tests must cover the following states or they remain ambient bugs.

### NetworkTopology

| Endpoint count | Behavior |
|---|---|
| 0 | Render empty-state card: copy `Add an endpoint to see your network map.` + CTA opening endpoint-management overlay. |
| 1–8 | Render one endpoint node per endpoint, full layout. |
| >8 | Compact grid: cap at 8 visible nodes + `+N more` summary chip. Clicking the chip opens an overlay listing all endpoints. |

### EndpointDetail

| Condition | Behavior |
|---|---|
| `endpointId` not in `monitoredEndpointsStore` at mount time | Router redirects to `/investigate` (see Routing Infrastructure). |
| Focused endpoint removed from store while mounted | Subscriber detects loss, calls `navigateTo({ name: 'investigate' }, { replace: true })`. |
| Endpoint has 0 successful samples | Distribution panel renders empty-state copy `Collecting samples — distribution will appear once enough data is captured.`; Browser Visibility panel renders all rows as `Collecting` (not `Hidden`); comparison matrix shows the endpoint row with all-empty cells. |
| `TimingVisibility.level === 'mixed'` (some samples have phase timing, some don't) | Browser Visibility panel renders measured phases at full opacity; rows with zero phase samples as ghost rows with `Hidden`. The visibility chip reads `PARTIAL VISIBILITY`. |
| Multiple `EndpointDetail` navigations in flight | Router enforces single-state ordering: the last `navigateTo` wins; in-flight subscriber callbacks for prior states are no-ops because they re-read `currentRoute()` before acting on stale state. |

### Live route

| Condition | Behavior |
|---|---|
| `uiStore.isSharedView === true` (snapshot mode) | Live route renders the snapshot's captured trace; Paused overlay does NOT render (lifecycle is by-design not-running in snapshot mode). Add `[data-shared-snapshot="true"]` attribute to `.live-surface` so the gate can assert the overlay is absent. |
| `monitoredEndpointsStore.length === 0` | Render Live empty-state card before the chart: copy `Add an endpoint to start measuring.`; chart panel hidden. |

### Snapshot-mode behavior across routes

When `uiStore.isSharedView === true`, the router still functions and `navigateTo` works. Per-route data sources:

| Route | Data source in snapshot mode |
|---|---|
| `/` (Overview) | Verdict card, NetworkTopology, endpoint rows, event log all render from the snapshot's captured `samples` data — never from a fresh measurement run (engine is not started in snapshot mode per `autoStartDecision`). |
| `/live` | Trace canvas renders the snapshot's captured `samples` as a static replay (paused overlay suppressed — see row above). View toggle (Unified/Split) and threshold callout still work; they're presentational. |
| `/investigate` (landing) | Endpoint cards render from snapshot stats. `Check from Outside Vantage Points` and `Check with Local Agent` cards render but their CTAs are disabled with tooltip text `Outside checks require a live run — start a new test to verify.` |
| `/endpoint/:id` | Hero card + distribution histogram + comparison matrix + last-8-samples all render from snapshot data for that endpoint. Phase-breakdown collapsible behaves identically (data presence determines visibility). Browser-visibility ghost rows render per `describeTimingVisibility` against the snapshot samples. Comparison matrix shows the snapshot's endpoint set, not the recipient's local endpoints. |
| `/report` | Renders the snapshot's report metadata directly (same as today's behavior when `sharedReportMode === true`). Endpoint chips in the artifact card link to `/endpoint/:id` within the snapshot's endpoint set. |

A `navigateTo({ name: 'endpoint', endpointId })` call where `endpointId` is not in the snapshot's endpoint set redirects to `/investigate` (same validation rule as non-shared mode).

### Investigate landing

| Condition | Behavior |
|---|---|
| `monitoredEndpointsStore.length === 0` | Left column renders empty-state in place of endpoint cards; right column still renders. |
| Endpoint with `corsMode === 'no-cors'` AND no measured samples | `TimingVisibility.level === 'none'`, so visibility chip reads `COLLECTING` per the canonical chip mapping in Section 5. No special-case copy — the absence-of-samples state is communicated through the standard COLLECTING chip + standard "Collecting" row values. |

### Shell

| Condition | Behavior |
|---|---|
| `lifecycle === 'starting'` (between Start click and first sample) | Measuring pulse renders; elapsed counter shows `T+00:00`. |
| `lifecycle === 'stopping'` | Measuring pulse fades but elapsed counter remains visible until lifecycle transitions to `'stopped'` or `'completed'`. |

## Production Signals — Deferred

**Verified during Round 4 review:** Sentry is not installed in this project. `package.json` contains no `@sentry/*` dependencies; no `Sentry.init(...)` call exists in `src/`. The CLAUDE.md mentions of Sentry refer to *skills* the author has access to for other projects, not to this codebase's actual integration. Earlier drafts of this spec assumed Sentry was integrated and built a Production Signals section on that assumption. That assumption was wrong.

**Decision:** Production observability is **out of scope for this synthesis arc.** Adding a telemetry stack (Sentry install + DSN + init wiring + payload contract + privacy enforcement) is a separate concern from the UI/UX synthesis this contract delivers, and bundling them would expand PR 2's scope materially and add cross-arc coupling that doesn't belong in a visual/IA refresh.

**A follow-on observability arc will own:**

- Telemetry stack choice (Sentry, a custom Cloudflare Worker `/api/telemetry` endpoint, or other).
- Payload privacy contract across all telemetry API surfaces.
- Enforcement guard mechanism (lint rule, wrapper module, both).
- 30/90-day success definitions that depend on production signal data.
- Funnel analytics for `/endpoint/:id` deep-link adoption.
- Performance metrics (LCP, INP) for the new surfaces.

**Acceptance for the synthesis arc is therefore CI-only:** typecheck, lint, unit tests, visual regression, axe scan, build, production smoke for SPA-fallback verification. Whether the deep-link product story is actually adopted in production is a question the follow-on arc answers, not this one. This is honest about what the synthesis delivers and what it does not.

**Success definition for this arc** (operational, not perceptual; the Purpose statement's "calm, premium diagnostic instrument" reading is acknowledged as unfalsifiable from inside this arc):

- All 9 PRs merge with their per-PR merge gates passing.
- All Acceptance Checklist items below pass.
- Production smoke (`npm run smoke:live`) passes against the deployed shell.
- A teammate sanity-walks the live shell at desktop + mobile after PR 9 and confirms no visible regressions vs. the spec's per-surface contracts.

## Acceptance Checklist

The synthesis is complete only when all of these are true:

- [ ] All 9 PRs merged.
- [ ] Fidelity gate covers 5 routes × 4 viewports (2048×1330 desktop, 1440×900 laptop, 390×844 mobile, 375×667 mobile-SE) = 20 cases, all passing. Note: 375 is added by this arc (in PR 4) on top of the existing 3-viewport gate; 390 is retained for continuity with existing baselines.
- [ ] All 4 nav tabs fully visible at 375 viewport with fade affordance for any clipping.
- [ ] No numeric suffixes in any tab's accessible name.
- [ ] Verdict card at 1440 viewport: 880 ≤ width ≤ 1040, 100 ≤ top ≤ 160, 360 ≤ height ≤ 460.
- [ ] NetworkTopology renders without label overlap at endpoint counts 1, 4, 8.
- [ ] NetworkTopology empty state renders at endpoint count 0.
- [ ] NetworkTopology compact-grid state renders at endpoint count > 8.
- [ ] Endpoints whose `TimingVisibility.level` is `'total-only'` or `'mixed'` render `Hidden` ghost rows on EndpointDetail's Browser Visibility panel. Endpoints at `'none'` render `Collecting` rows (not `Hidden`). Endpoints at `'phase'` render real values throughout.
- [ ] `/endpoint/<unknown-id>` and `/endpoint/<invalid-charset>` both redirect to `/investigate` without error.
- [ ] Old `/r/<code>` snapshot URLs continue to load via the hash-router path and land users on `/` with the shared-results-banner visible (unchanged from today; snapshots never preserved view/focus, see Hash-Router and Share-URL Compatibility section).
- [ ] DiagnoseView (or its renames) totals less than 800 lines combined across the resulting files.
- [ ] `npm run typecheck` includes `svelte-check`.
- [ ] CSS lint (either extended ESLint rule or stylelint) catches raw hex/rgba in `<style>` blocks; zero violations in `src/`.
- [ ] No CSS radial-gradient orbs at page-level backgrounds.
- [ ] Live route renders Measurement Paused overlay when `lifecycle !== 'running'` AND `isSharedView !== true`.
- [ ] `npm test` passes (all 1,140+ unit tests + new ones added per PR).
- [ ] `npm run test:visual` passes.
- [ ] Production smoke (`npm run smoke:live`) passes after final Cloudflare deploy.
- [ ] All 4 distribution-template branches have unit test coverage on EndpointDetail.
- [ ] No `Sentry`, `@sentry/`, or other unintroduced-telemetry references remain in any file changed by PRs 2–9. (Observability deferred to follow-on arc per Production Signals — Deferred section.)

## Fidelity Review Ledger

Every implementation PR after this spec must include a short ledger with these comparison points:

| Point | Reference Evidence | Render Evidence | Required Result |
|---|---|---|---|
| Shell | v2 `Layout.tsx` composition + shipped live affordance | New 1440×900 + 375×667 screenshots | Single sticky band; no numeric suffixes; all 4 tabs visible at 375 |
| Overview hero | v2 `MainStatus.tsx` left column + shipped copy discipline | New 1440×900 screenshot + computed rect of `.verdict-card` | Width 880–1040, top 100–160 |
| Network topology | v2 `NetworkTopology.tsx` composition (not implementation) | New 1440×900 + 375×667 screenshots + DOM check for label rects | Pulses tied to real round events; no label-node overlap |
| Investigate landing | v2 `Investigate.tsx` two-column composition | New 1440×900 + 375×667 screenshots | Two columns at ≥1024 px, stacked at <1024 px, all DOM contracts present |
| EndpointDetail | v2 `EndpointDetail.tsx` composition + shipped matrix + ghost-row treatment | New 1440×900 + 375×667 screenshots + CORS-mode test | Histogram with threshold line; ghost rows for opaque endpoints; comparison matrix preserved |
| Report artifact | v2 `Report.tsx` artifact framing + shipped evidence trail | New 1440×900 screenshot | Artifact card has branded header; operational CTAs below the trail |
| Truth copy | Claim registry + diagnostic narrative tests | Unit/copy-safety output | No causal claims exceeding browser evidence |

## Risks

These are the highest-confidence things that go wrong if the sequence is rushed:

1. **DiagnoseView decomposition (PRs 7 + 8) is the highest-risk pair.** That file is 1,799 lines of cross-cutting logic (correlations, phase hypotheses, remote vantage, intelligence panel, store wiring). Decomposing cleanly while moving features to a new route is non-trivial. Mitigation: PR 3 (ghost rows) and PR 7 (extract to EndpointDetail) precede PR 8 (decompose remainder); each step moves a coherent unit, not a refactor sweep.
2. **NetworkTopology is real implementation work.** SVG layout with label collision avoidance, pulse animations tied to real measurement events, store wiring — 2–3 days of focused work just for PR 6 alone. The v2 prototype version is broken at 1440; do not anchor on it as the reference implementation, only as the composition reference.
3. **Cross-PR consistency requires this contract to actually be followed.** The shipped 12-PR redesign drifted — the superseded spec admits the result is "structurally translated, not visually designed." The mitigation is the fidelity gate test pattern. Every PR 2–9 must *extend* the gate, not just pass it.
4. **Snapshot URLs and `/endpoint/:id` deep-links are separate mechanisms.** The Hash-Router and Share-URL Compatibility section makes this explicit, but it's worth restating as a risk: anyone reasoning about "share a snapshot of my degraded endpoint" will reach for `/r/<code>` (snapshot) by reflex, and may expect that recipient lands on the endpoint detail. They will not — snapshots have never preserved view/focus state, and this arc does not add that. If post-launch usage shows this is a real confusion, a future arc can introduce `SharePayload v: 3` with optional view/focus fields. Implementation-time discipline: PR 7 must not silently couple snapshot decoding with `navigateTo` — keep the router-wrapper a no-op for `/r/*` paths as the section specifies.
5. **Cloudflare Pages SPA fallback (`public/_redirects`) is load-bearing.** Without the updates in PR 4, direct-loaded `/endpoint/:id` URLs return Cloudflare 404 — silent from the user's POV (no JS runs, no redirect fires). PR 4's merge gate must include a deployment-preview smoke test that opens `https://preview-<hash>.chronoscope.pages.dev/endpoint/test` and confirms the SPA shell loads.
6. **PR 5 deletes ~3,800 lines of "dead" code.** Per the fact-check, the orphan status is verified at the `import` statement level, but Svelte's reactivity sometimes resolves component references through other paths (test fixtures, story files, dynamic mounts). The PR's merge gate requires per-file typecheck after each deletion to catch any non-import dependency.
7. **PR 2's choice between CSS-lint-rule-extension and stylelint adoption is load-bearing for PR 4+.** If the team is split on which option to take, decide before PR 2 starts. Spec recommends Option B (stylelint) but does not preclude Option A.

## Out of Scope

Explicitly not part of this contract:

- Collective intelligence "you vs. everyone right now" feature (the 10-star direction surfaced 2026-05-17). That's a separate arc.
- Continuous passive measurement (background companion-agent) as a default mode.
- Public honesty rating / standard advocacy.
- Cross-session trend tracking ("your latency to api.service has been worsening over 3 weeks").
- Account system or persistence beyond browser local storage.

These are valid 10-star directions; this contract is the 8-star surface arc that earns the credibility to do them.
