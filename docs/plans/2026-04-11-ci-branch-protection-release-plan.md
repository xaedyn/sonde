# CI, Branch Protection & Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Establish CI quality gates, branch protection, repo metadata, and first release for Sonde.
**Tech Stack:** Svelte 5, TypeScript 6, Vite 8, Vitest 4, ESLint 10, GitHub Actions

---

## Phase 1 — Cleanup Commit + Lint Fixes

### Step 1.1 — Create feature branch and commit cleanup

```bash
git checkout -b chore/ci-and-project-setup
git add -A
git commit -m "chore: remove dead files and unused deps

Deleted: s80worker.js, chart.min.js, public/icons.svg, tsconfig.app.json,
lighthouserc.js, static/fonts/.gitkeep
Removed deps: @testing-library/jest-dom, svelte-check
Removed scripts: lint:lighthouse"
```

Expected: branch created, clean working tree.

---

### Step 1.2 — Fix: unused variables

**Group: prefix with `_` or remove**

- [ ] **`src/lib/components/App.svelte` line 10** — `measurementStore` imported but never used outside the import block.

  Remove the import line entirely:
  ```diff
  - import { measurementStore } from '$lib/stores/measurements';
  ```

- [ ] **`src/lib/components/App.svelte` line 101** — `currentEndpoints` assigned but never read.

  The variable is only used for a comment. Remove the assignment, keep the loop body:
  ```diff
  - const currentEndpoints = get(endpointStore);
  - // Clear existing and add persisted ones using stored URLs
    endpointStore.setEndpoints([]);
  ```

- [ ] **`src/lib/components/LaneSvgChart.svelte` lines 13-18** — `currentRound`, `maxRound`, `xTicks` are destructured from `$props()` but never used in the template or script.

  Remove from the destructure and from the type annotation:
  ```diff
    let {
      color,
      colorRgba06,
      visibleStart = 1,
      visibleEnd = 60,
  -   currentRound = 0,
      points = [],
      ribbon = undefined,
      yRange,
  -   maxRound = 0,
  -   xTicks = [],
      heatmapCells = [],
      timeoutMs = 5000,
    }: {
      color: string;
      colorRgba06: string;
      visibleStart?: number;
      visibleEnd?: number;
  -   currentRound?: number;
      points: readonly ScatterPoint[];
      ribbon: RibbonData | undefined;
      yRange: YRange;
  -   maxRound: number;
  -   xTicks: readonly XTick[];
      heatmapCells?: readonly HeatmapCellData[];
      timeoutMs?: number;
    } = $props();
  ```

  Also remove the unused imports from the script (verify no other code in LaneSvgChart references `XTick` before removing):
  ```diff
  - import type { ScatterPoint, RibbonData, YRange, XTick, HeatmapCellData } from '$lib/types';
  + import type { ScatterPoint, RibbonData, YRange, HeatmapCellData } from '$lib/types';
  ```

  **Also update the caller** in `src/lib/components/LanesView.svelte`. Remove the props that are no longer accepted by `LaneSvgChart`:
  ```diff
    <LaneSvgChart
      color={ep.color}
      colorRgba06={colorToRgba06(ep.color)}
  -   currentRound={$measurementStore.roundCounter}
      points={allPoints}
      ribbon={cachedRibbons.get(ep.id)}
      yRange={frameData.yRange}
  -   maxRound={frameData.maxRound}
  -   xTicks={frameData.xTicks}
      heatmapCells={heatmapCellsByEndpoint.get(ep.id) ?? []}
      timeoutMs={$settingsStore.timeoutMs}
    />
  ```

- [ ] **`src/lib/components/LaneSvgChart.svelte` line 250** — `i` defined in `{#each}` but unused.

  Change:
  ```diff
  - {#each cellRects as rect, i}
  + {#each cellRects as rect, _i}
  ```

- [ ] **`src/lib/components/SharePopover.svelte` line 30** — `configSize` assigned but never used in the template.

  Remove the line:
  ```diff
  - let configSize = $derived(estimateShareSize(configPayload));
  ```

- [ ] **`src/lib/components/SharedResultsBanner.svelte` line 6** — `endpointStore` imported but never used.

  Remove:
  ```diff
  - import { endpointStore } from '$lib/stores/endpoints';
  ```

- [ ] **`src/lib/components/VisualizationArea.svelte` line 21** — `toggleMobileSplit` defined but never called (the template uses direct assignments instead).

  Remove the function:
  ```diff
  - function toggleMobileSplit(): void {
  -   mobileSplitTab = mobileSplitTab === 'timeline' ? 'heatmap' : 'timeline';
  - }
  ```

- [ ] **`src/lib/renderers/render-scheduler.ts` line 16** — `DATA_BUDGET_MS` assigned but the conditional that was meant to use it was removed. The constant is defined but `runFrame` no longer uses it.

  Remove the constant:
  ```diff
  - const DATA_BUDGET_MS = 8;          // skip effects when data takes this long or more
    const OVERLOAD_THRESHOLD_MS = 12;  // frames above this count toward the streak
  ```

- [ ] **`src/lib/renderers/timeline-data-pipeline.ts` line 414** — `_endpointColor` parameter prefixed with `_` already but the error shows it without. Check: the function signature is:

  ```ts
  function heatmapColor(
    latency: number, status: SampleStatus, stats: EndpointStatistics, _endpointColor: string,
  ): string {
  ```

  The parameter already has the `_` prefix. Run lint to confirm this error resolves — it may be a stale error from a cached run. If it still errors, rename:
  ```diff
  - function heatmapColor(
  -   latency: number, status: SampleStatus, stats: EndpointStatistics, _endpointColor: string,
  + function heatmapColor(
  +   latency: number, status: SampleStatus, stats: EndpointStatistics, endpointColor: string,
  ```
  Then remove the parameter from the call site if it's unused — or keep it with `_endpointColor` (the underscore prefix already satisfies the rule in most configs). If linting persists, add an ESLint disable comment for that one line: `// eslint-disable-next-line @typescript-eslint/no-unused-vars`

- [ ] **`src/lib/stores/measurements.ts` line 57** — `_removed` from object destructure is flagged. The pattern is:

  ```ts
  const { [endpointId]: _removed, ...rest } = s.endpoints;
  ```

  This is a deliberate omit pattern; `_removed` is unused by design. Add a targeted disable:
  ```diff
  + // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [endpointId]: _removed, ...rest } = s.endpoints;
  ```

---

### Step 1.3 — Fix: stale `svelte-ignore` comments

Each of these files has a `svelte-ignore` for a warning code that no longer fires in the current Svelte 5 version. Remove the comment line.

- [ ] **`src/lib/components/EndpointDrawer.svelte` line 46**

  Remove:
  ```diff
  - <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <dialog
  ```

- [ ] **`src/lib/components/KeyboardOverlay.svelte` line 80**

  Remove:
  ```diff
  - <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
  ```

- [ ] **`src/lib/components/SettingsDrawer.svelte` line 132**

  Remove:
  ```diff
  - <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <dialog
  ```

- [ ] **`src/lib/components/SharePopover.svelte` line 142**

  Remove:
  ```diff
  - <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
  ```

---

### Step 1.4 — Fix: missing `{#each}` keys

- [ ] **`src/lib/components/LaneSvgChart.svelte` line 179** — gridlines loop:

  ```diff
  - {#each gridlineYs as gy}
  + {#each gridlineYs as gy (gy)}
  ```

- [ ] **`src/lib/components/LaneSvgChart.svelte` line 250** — cellRects loop (already has `_i` after Step 1.2):

  ```diff
  - {#each cellRects as rect, _i}
  + {#each cellRects as rect, _i (rect.x)}
  ```

  Note: `rect.x` is the computed SVG x-position (`i * cellW`), which is unique per cell within a render.

- [ ] **`src/lib/components/XAxisBar.svelte` line 57** — ticks loop:

  ```diff
  - {#each ticks as tick}
  + {#each ticks as tick (tick.label)}
  ```

---

### Step 1.5 — Fix: mutable `Map` in reactive context → `SvelteMap`

- [ ] **`src/lib/components/LanesView.svelte` line 59** — `cachedRibbons` is reactive state; needs `SvelteMap`.

  Add import at top of script block:
  ```diff
  + import { SvelteMap } from 'svelte/reactivity';
  ```

  Change the declaration:
  ```diff
  - let cachedRibbons: ReadonlyMap<string, RibbonData> = new Map();
  + let cachedRibbons: ReadonlyMap<string, RibbonData> = new SvelteMap();
  ```

- [ ] **`src/lib/components/Layout.svelte` line 42**

  The `byRound` map inside `sampleTimestamps` derived is the flagged mutable Map. It is a local variable in a `$derived.by()` block, not a reactive state variable — this is a false positive from the rule, which doesn't distinguish local computation maps from reactive state.

  Add a targeted disable comment inside the `$derived.by` before the map creation:
  ```diff
    const sampleTimestamps = $derived.by((): readonly number[] => {
      const endpoints = Object.values($measurementStore.endpoints);
  +   // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const byRound = new Map<number, number>();
  ```

- [ ] **`src/lib/components/LanesView.svelte` line 83** — `heatmapCellsByEndpoint` uses `new Map()` inside `$derived.by()`. Same local-computation pattern as Layout — targeted disable:

  ```diff
    const heatmapCellsByEndpoint: ReadonlyMap<string, readonly HeatmapCellData[]> = $derived.by(() => {
  +   // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const map = new Map<string, readonly HeatmapCellData[]>();
  ```

- [ ] **`src/lib/components/TimelineCanvas.svelte` line 70**

  The `sampleCounts` map is module-level mutable state used for tracking, not reactive state. Same situation — targeted disable:
  ```diff
  + // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const sampleCounts = new Map<string, number>();
  ```

---

### Step 1.6 — Fix: raw visual values → tokens

All raw hex and raw rgba/rgb values must be replaced with tokens references. The `local/no-raw-visual-values` rule and the `no-restricted-syntax` hex rule both fire. Only `src/lib/tokens.ts` is exempt.

- [ ] **`src/lib/components/HeatmapCanvas.svelte` line 81** — `'rgba(255,255,255,0.9)'` hover highlight:

  The `drawHoverHighlight` function uses a raw rgba for the stroke. Add a token. In `tokens.ts` there is `primitive.glassHighlight = 'rgba(255,255,255,.12)'` and `tokens.color.glass.highlight`. The hover highlight is intentionally brighter (0.9 opacity). Add a new semantic token for it:

  In `src/lib/tokens.ts`, inside the `glass` object, add after `highlight`:
  ```diff
      highlight:   primitive.glassHighlight,
  +   highlightStrong: 'rgba(255,255,255,.9)',
      shadow:      'rgba(0,0,0,.15)',
  ```

  Then in `HeatmapCanvas.svelte`:
  ```diff
  - ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  + ctx.strokeStyle = tokens.color.glass.highlightStrong;
  ```

  Also add the import at the top of the script if not present:
  ```diff
    import { tokens } from '$lib/tokens';
  ```
  (Already imported — just reference it.)

- [ ] **`src/lib/components/LanesView.svelte` line 99** — `'rgba(103,232,249,.06)'` fallback in `colorToRgba06`:

  The function returns `tokens.color.accent.cyan06` as its semantic equivalent. Replace:
  ```diff
  - return 'rgba(103,232,249,.06)';
  + return tokens.color.accent.cyan06;
  ```

- [ ] **`src/lib/components/SummaryCard.svelte` line 20** — `'#4a90d9'` fallback hex color:

  This is a default color for `endpoint` when the store returns nothing. Replace with a token. `tokens.color.endpoint[0]` is `'#67e8f9'` (cyan). The fallback `'#4a90d9'` is an old color not in the token system. Since the expression already uses `tokens.color.endpoint[0]`, the double fallback `?? '#4a90d9'` can just be removed — `tokens.color.endpoint[0]` is always defined as a readonly string:

  ```diff
  - let color = $derived(endpoint?.color ?? tokens.color.endpoint[0] ?? '#4a90d9');
  + let color = $derived(endpoint?.color ?? tokens.color.endpoint[0]);
  ```

  TypeScript may complain that `tokens.color.endpoint[0]` could be `undefined` (tuple inference). If so, cast:
  ```diff
  + let color = $derived(endpoint?.color ?? (tokens.color.endpoint[0] as string));
  ```

- [ ] **`src/lib/renderers/color-map.ts` lines 9-10** — `STATUS_COLORS` has raw hex values:

  The color-map file is in `src/lib/renderers/` not `src/lib/tokens.ts`, so the no-raw-visual-values rule applies. These colors match `tokens.color.status.timeout` (`'#9b5de5'`) and `tokens.color.status.error` (`'#c77dff'`).

  Add import:
  ```diff
  + import { tokens } from '$lib/tokens';
  ```

  Replace the STATUS_COLORS object:
  ```diff
  - export const STATUS_COLORS = {
  -   timeout: '#9b5de5',
  -   error: '#c77dff',
  - } as const;
  + export const STATUS_COLORS = {
  +   timeout: tokens.color.status.timeout,
  +   error: tokens.color.status.error,
  + } as const;
  ```

- [ ] **`src/lib/share/hash-router.ts` line 16** — `'#4a90d9'` fallback in `pickColor`:

  Replace with a token reference:
  ```diff
  - return palette[index % palette.length] ?? '#4a90d9';
  + return palette[index % palette.length] ?? tokens.color.endpoint[0];
  ```

  Add import if not present:
  ```diff
  + import { tokens } from '../tokens';
  ```
  (Already imported at line 12 — just update the reference.)

  The `tokens.color.endpoint[0]` type is `string` (from `as readonly string[]`), so no cast needed.

- [ ] **`src/lib/stores/endpoints.ts` line 17** — same `'#4a90d9'` fallback in `pickColor`:

  ```diff
  - return palette[index % palette.length] ?? '#4a90d9';
  + return palette[index % palette.length] ?? tokens.color.endpoint[0];
  ```

---

### Step 1.7 — Fix: non-null assertions (`!`)

Replace each `!` assertion with proper null narrowing. The non-null assertions are safe by logic but violate the strict no-assertion rule.

- [ ] **`src/lib/components/CrossLaneHover.svelte` line 28** — `samples[mid]!.round`

  The array access inside the binary search loop is guarded by `lo <= hi` so `samples[mid]` is always defined. Replace with optional chaining + nullish coalescing:
  ```diff
  - if (samples[mid]!.round < targetRound) lo = mid + 1;
  + if ((samples[mid]?.round ?? 0) < targetRound) lo = mid + 1;
  ```

- [ ] **`src/lib/components/HeatmapCanvas.svelte` lines 238-239** — `sorted[0]!` and `sorted[sorted.length - 1]!`

  These are already guarded by the `sorted.length > 0` check from `stats.length > 0` above. Use index access with non-null-safe pattern:
  ```diff
  - const fastest = sorted[0]!;
  - const slowest = sorted[sorted.length - 1]!;
  + const fastest = sorted[0];
  + const slowest = sorted[sorted.length - 1];
  ```

  TypeScript will now infer `fastest` and `slowest` as `... | undefined`. The null guard immediately below already handles this:
  ```ts
  if (!fastest || !slowest || fastest.avg === undefined || slowest.avg === undefined) return;
  ```
  That guard already exists at line 240+, so removing the assertions just lets the existing guard do the work.

- [ ] **`src/lib/engine/measurement-engine.ts` lines 119, 148, 152, 166**

  **Line 119** — `this.workers[idx]!`:
  ```diff
  - const { worker } = this.workers[idx]!;
  + const managed = this.workers[idx];
  + if (!managed) return;
  + const { worker } = managed;
  ```

  **Line 148** — `this.roundBuffer.get(roundId)!.push(msg)`:
  ```diff
  - this.roundBuffer.get(roundId)!.push(msg);
  + const buffer = this.roundBuffer.get(roundId);
  + if (buffer) buffer.push(msg);
  ```

  **Line 152** — `this.roundBuffer.get(roundId)!.length`:
  After the refactor above, the condition becomes:
  ```diff
  - if (this.expectedResponses === 0 || this.roundBuffer.get(roundId)!.length >= this.expectedResponses) {
  + const roundMessages = this.roundBuffer.get(roundId);
  + if (this.expectedResponses === 0 || (roundMessages && roundMessages.length >= this.expectedResponses)) {
  ```

  **Line 166** — `this.flushTimers.get(roundId)!`:
  ```diff
  - clearTimeout(this.flushTimers.get(roundId)!);
  + const timer = this.flushTimers.get(roundId);
  + if (timer !== undefined) clearTimeout(timer);
  ```

- [ ] **`src/lib/share/hash-router.ts` line 50** — `payload.results![i]`:

  The `if (payload.mode === 'results' && payload.results)` guard ensures `payload.results` is defined. But TypeScript still infers the outer `ids.forEach` callback might access beyond that. The narrowing works per-closure but TS can lose it. Use a local variable:
  ```diff
    if (payload.mode === 'results' && payload.results) {
  +   const results = payload.results;
      // Build a MeasurementState snapshot from the payload results
      const endpointsRecord: MeasurementState['endpoints'] = {};
  
      ids.forEach((id, i) => {
  -     const epResults = payload.results![i];
  +     const epResults = results[i];
  ```

- [ ] **`src/lib/stores/measurements.ts` lines 137, 142**

  **Line 137** — `samples[samples.length - 1]!.round`:
  ```diff
  - if (samples.length === 0 || sample.round >= samples[samples.length - 1]!.round) {
  + const lastSample = samples[samples.length - 1];
  + if (samples.length === 0 || sample.round >= (lastSample?.round ?? 0)) {
  ```

  **Line 142** — `samples[i - 1]!.round`:
  ```diff
  - while (i > 0 && samples[i - 1]!.round > sample.round) i--;
  + while (i > 0 && (samples[i - 1]?.round ?? 0) > sample.round) i--;
  ```

- [ ] **`src/lib/utils/statistics.ts` lines 110, 110, 114, 114, 128**

  These are inside `if (tier2Samples.length >= 2)` and `if (tier2Samples.length > 0)` guards. The `first` variable is `tier2Samples[0]` which TypeScript types as `MeasurementSample | undefined`. The `s.tier2!` assertions inside `.filter()` and `.reduce()` are guarded by having already filtered to `s => s.tier2 !== undefined`.

  **Lines 110 (two assertions on `first.tier2!`):**
  ```diff
  - const first = tier2Samples[0];
  + const first = tier2Samples[0];
  + if (!first?.tier2) {
  +   // tier2Samples is non-empty, so first exists; this satisfies TypeScript
  + }
  ```

  The cleaner approach: use a narrowed variable:
  ```diff
  - const first = tier2Samples[0];
  - const rest = tier2Samples.slice(1);
  -
  - // Cold: has TCP or TLS overhead
  - const firstHasColdOverhead =
  -   (first.tier2!.tcpConnect > 0 || first.tier2!.tlsHandshake > 0);
  -
  - // Warm: rest with no TCP reconnect
  - const warmSamples = rest.filter(
  -   s => s.tier2!.tcpConnect === 0 && s.tier2!.tlsHandshake === 0
  - );
  + const first = tier2Samples[0];
  + const rest = tier2Samples.slice(1);
  +
  + if (!first?.tier2) return { .../* early empty return with null */ };
  ```

  Actually the simpler, most maintainable fix — since `tier2Samples` is already filtered to `s.tier2 !== undefined` — is to type-assert once at the filter boundary:

  ```diff
  - const tier2Samples = okSamples.filter(s => s.tier2 !== undefined);
  + const tier2Samples = okSamples.filter(
  +   (s): s is MeasurementSample & { tier2: TimingPayload } => s.tier2 !== undefined
  + );
  ```

  Add `TimingPayload` to imports at the top of the file if not already present. Then all `s.tier2!` and `first.tier2!` accesses become plain `s.tier2` and `first.tier2` — no assertions needed. This is the correct fix.

  **Line 128** — `s.tier2![field]` inside the avg reducer:
  Resolved by the filter type guard fix above.

- [ ] **`src/main.ts` line 5** — `document.getElementById('app')!`

  The `getElementById` may return `null`. Add a guard:
  ```diff
  - const app = mount(App, { target: document.getElementById('app')! });
  + const appTarget = document.getElementById('app');
  + if (!appTarget) throw new Error('Mount target #app not found');
  + const app = mount(App, { target: appTarget });
  ```

---

### Step 1.8 — Fix: other errors

- [ ] **`src/lib/components/LanesView.svelte` line 153** — stale `svelte-ignore a11y_no_static_element_interactions`:

  Remove the comment:
  ```diff
  - <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
  ```

- [ ] **`src/lib/components/LanesView.svelte` line 188** — `svelte/no-useless-children-snippet`:

  The `{#snippet children()}` wrapper around the `LaneSvgChart` inside `<Lane>` is unnecessary in Svelte 5 when there is only a single default slot. Replace the snippet wrapper with direct children:
  ```diff
    <Lane ... >
  -   {#snippet children()}
        {@const allPoints = ...}
        <LaneSvgChart ... />
  -   {/snippet}
    </Lane>
  ```

- [ ] **`src/lib/components/Layout.svelte` lines 26-27** — `svelte/no-dom-manipulating`:

  Lines 26-27 are inside the `announce` function:
  ```ts
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = msg; }, 50);
  ```

  The rule fires because the component uses direct DOM property assignment (`textContent`) instead of reactive state. Convert to reactive state:

  ```diff
    let announcer: HTMLDivElement;
  + let announcerText = $state('');
    let prevLifecycle = get(measurementStore).lifecycle;
    let unsubLifecycle: (() => void) | null = null;
  
    function announce(msg: string): void {
  -   if (!announcer) return;
  -   announcer.textContent = '';
  -   setTimeout(() => { announcer.textContent = msg; }, 50);
  +   announcerText = '';
  +   setTimeout(() => { announcerText = msg; }, 50);
    }
  ```

  In the template, replace `bind:this={announcer}` with reactive binding:
  ```diff
    <div
  -   bind:this={announcer}
      id="sonde-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class="sr-only"
  - ></div>
  + >{announcerText}</div>
  ```

  Remove the `announcer` variable declaration since it's no longer needed.

- [ ] **`src/lib/stores/ui.ts` line 36** — `@typescript-eslint/no-unused-expressions`:

  Line 36 is:
  ```ts
  next.has(endpointId) ? next.delete(endpointId) : next.add(endpointId);
  ```

  This is a ternary used for side effects (not assigned). TypeScript-ESLint flags it. Convert to `if/else`:
  ```diff
  - next.has(endpointId) ? next.delete(endpointId) : next.add(endpointId);
  + if (next.has(endpointId)) {
  +   next.delete(endpointId);
  + } else {
  +   next.add(endpointId);
  + }
  ```

---

### Step 1.9 — Verify lint is clean

```bash
cd /Users/shane/claude/sonde
npm run lint
```

Expected output: no errors. If any remain, fix before proceeding.

Also run typecheck and tests to confirm nothing is broken:

```bash
npm run typecheck
npm test
```

Expected: 0 type errors, 329 tests passing.

---

### Step 1.10 — Commit lint fixes

```bash
git add src/
git commit -m "fix: resolve all 55 ESLint errors for CI gate

- Remove unused imports and variables (measurementStore, currentEndpoints,
  currentRound, maxRound, xTicks, configSize, endpointStore, toggleMobileSplit,
  DATA_BUDGET_MS, _removed destructure)
- Remove stale svelte-ignore comments (4 files)
- Add {#each} key expressions (XAxisBar, LaneSvgChart x2)
- Convert mutable Map to SvelteMap in LanesView; eslint-disable for
  local-computation maps in Layout and TimelineCanvas
- Replace 6 raw visual values with tokens (HeatmapCanvas, LanesView,
  SummaryCard, color-map, hash-router, endpoints store)
- Add token: tokens.color.glass.highlightStrong for canvas hover stroke
- Replace 17 non-null assertions with proper null narrowing
  (CrossLaneHover, HeatmapCanvas, measurement-engine, hash-router,
  measurements store, statistics, main.ts)
- Fix no-unused-expressions in ui.ts toggleCard
- Fix no-dom-manipulating in Layout.svelte announcer
- Fix no-useless-children-snippet in LanesView"
```

---

## Phase 2 — Infrastructure

### Step 2.1 — Add `.node-version` file

```bash
echo "22" > /Users/shane/claude/sonde/.node-version
```

Verify:
```bash
cat /Users/shane/claude/sonde/.node-version
# Expected: 22
```

---

### Step 2.2 — Add CI workflow

Create `/Users/shane/claude/sonde/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  typecheck:
    name: Type check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run typecheck

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7
```

---

### Step 2.3 — Bump package.json version

Edit `/Users/shane/claude/sonde/package.json` line 4:

```diff
- "version": "0.0.0",
+ "version": "0.1.0",
```

---

### Step 2.4 — Commit infrastructure

```bash
git add .node-version .github/workflows/ci.yml package.json
git commit -m "chore: add CI workflow, node version pin, and bump to 0.1.0

- .github/workflows/ci.yml: four parallel jobs (typecheck, lint, test, build)
  on ubuntu-latest, Node 22, with concurrency cancel-in-progress
- .node-version: pins Node 22 for fnm/nvm/setup-node
- package.json: version 0.0.0 -> 0.1.0"
```

---

## Phase 3 — PR, Merge, Branch Protection, Metadata, Release

### Step 3.1 — Push branch and open PR

```bash
git push -u origin chore/ci-and-project-setup
gh pr create \
  --title "chore: CI, lint fixes, branch protection setup, and v0.1.0" \
  --body "$(cat <<'EOF'
## Summary

- Removes dead files and unused deps committed in prior cleanup session
- Fixes all 55 ESLint errors so CI passes from first run
- Adds `.github/workflows/ci.yml` with four parallel jobs: typecheck, lint, test, build
- Pins Node 22 via `.node-version`
- Bumps package version to 0.1.0 ahead of first GitHub Release

## CI jobs

| Job | Script | Gate |
|-----|--------|------|
| typecheck | `npm run typecheck` | tsc --noEmit |
| lint | `npm run lint` | eslint src |
| test | `npm test` | vitest run |
| build | `npm run build` | vite build + artifact upload |

## Test plan

- [ ] All 4 CI jobs pass green in the Actions tab
- [ ] `npm run lint` exits 0 locally
- [ ] `npm run typecheck` exits 0 locally
- [ ] `npm test` shows 329 passing
- [ ] `npm run build` succeeds and `dist/` is non-empty
EOF
)"
```

---

### Step 3.2 — Wait for CI to pass

```bash
gh pr checks
```

Expected: all 4 checks green. If any fail, fix the root cause and push a new commit.

---

### Step 3.3 — Merge PR

```bash
gh pr merge --squash --delete-branch
```

---

### Step 3.4 — Set branch protection

Apply after the CI run names are registered (GitHub requires at least one run before a check name can be required):

```bash
gh api --method PUT repos/xaedyn/sonde/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {"strict": true, "contexts": ["Type check", "Lint", "Unit tests", "Build"]},
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

Verify:
```bash
gh api repos/xaedyn/sonde/branches/main/protection | jq '.required_status_checks.contexts'
# Expected: ["Type check","Lint","Unit tests","Build"]
```

> **Note on context names:** The `contexts` array must match the `name:` values in the CI job definitions exactly. Verify the names in the Actions tab after the first run completes if the API call fails.

---

### Step 3.5 — Set repo metadata

```bash
gh repo edit xaedyn/sonde \
  --description "Browser-based HTTP latency diagnostic with visual lane-based analysis" \
  --add-topic latency \
  --add-topic speedtest \
  --add-topic network-diagnostics \
  --add-topic network-tools \
  --add-topic web-performance \
  --add-topic svelte \
  --add-topic typescript \
  --add-topic vite \
  --add-topic web-workers \
  --add-topic http \
  --add-topic visualization
```

Verify:
```bash
gh repo view xaedyn/sonde --json description,repositoryTopics
```

---

### Step 3.6 — Create GitHub Release v0.1.0

```bash
git fetch origin main
gh release create v0.1.0 \
  --target main \
  --title "v0.1.0 — Glass Lanes" \
  --generate-notes
```

Verify:
```bash
gh release view v0.1.0
```

Expected: release shows tag `v0.1.0`, generated notes listing merged PRs since initial commit.

---

## Verification Checklist

Before claiming this plan is complete, confirm all of the following:

- [ ] `npm run lint` → 0 errors
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm test` → 329 tests passing
- [ ] `npm run build` → exits 0, `dist/` non-empty
- [ ] PR #N shows 4/4 CI checks green in GitHub Actions
- [ ] Branch protection active on `main` (force pushes blocked, 4 required checks)
- [ ] Repo description and 11 topics set on xaedyn/sonde
- [ ] GitHub Release `v0.1.0` exists, targeting `main`, with auto-generated notes
- [ ] `package.json` version is `0.1.0`
- [ ] `.node-version` contains `22`
- [ ] `.github/workflows/ci.yml` exists with 4 jobs

---

## Error Reference

### If `color-map.ts` import of tokens causes a circular dependency

`color-map.ts` → `tokens.ts` should be safe (tokens has no imports from renderers). If a circular import error occurs at build time, fallback: inline the hex values as string constants at the top of `color-map.ts` with an explanatory comment, and add an ESLint disable for those two lines only.

### If `tokens.color.endpoint[0]` produces a TypeScript `undefined` error

The type of `tokens.color.endpoint` is `readonly string[]`. Index access on `readonly string[]` returns `string | undefined` in strict mode. Cast:
```ts
return palette[index % palette.length] ?? (tokens.color.endpoint[0] as string);
```

### If branch protection API rejects with 422

The check context names must exactly match what GitHub records after the first CI run. Open the Actions tab, find the first run, and copy the exact job display names. Common mismatch: `test` vs `Unit tests`.

### If `SvelteMap` import fails (wrong package path)

Svelte 5 exports `SvelteMap` from `svelte/reactivity`. If the import resolves but the type doesn't satisfy `ReadonlyMap<string, RibbonData>`, use a type assertion:
```ts
let cachedRibbons = new SvelteMap<string, RibbonData>() as ReadonlyMap<string, RibbonData>;
```
