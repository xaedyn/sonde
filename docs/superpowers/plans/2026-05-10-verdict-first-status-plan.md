# Verdict-First Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chronoscope open like S80, answer first like a diagnostic expert, and route users into the right evidence without blank picker states.

**Architecture:** Keep existing route IDs (`overview`, `live`, `diagnose`) for compatibility, but change user-facing labels and layout. Add pure helpers for lifecycle copy, safe auto-start decisions, and investigation target selection so App, Topbar, Status, and Investigate agree. Preserve existing diagnostic components while moving their hierarchy to verdict-first.

**Tech Stack:** Svelte 5, TypeScript, Svelte stores, Vitest, @testing-library/svelte, Playwright visual tests.

---

## File Structure

- Create `src/lib/utils/lifecycle-copy.ts` for lifecycle labels and start/stop button copy.
- Create `src/lib/utils/status-intent.ts` for safe auto-start decisions and investigation target selection.
- Add tests in `tests/unit/utils/lifecycle-copy.test.ts` and `tests/unit/utils/status-intent.test.ts`.
- Modify `src/lib/components/App.svelte` to call safe auto-start after bootstrap and expose suppressed-start state.
- Modify `src/lib/types.ts` and `src/lib/stores/ui.ts` to add a non-persisted `autoStartSuppressionReason` UI field.
- Modify `src/lib/components/Topbar.svelte` to use lifecycle copy and replace `Halted`.
- Modify `src/lib/components/ViewSwitcher.svelte` to show `Status`, `Live`, `Investigate` only.
- Modify `src/lib/components/Layout.svelte` to pass `onStart` into Status.
- Modify `src/lib/components/OverviewView.svelte` to become the user-facing Status layout and pass Start/Investigate CTAs into the verdict surface.
- Modify `src/lib/components/CausalVerdictStrip.svelte` to support the hero answer variant and ready-to-measure CTA.
- Modify `src/lib/components/DiagnoseView.svelte` so `Investigate` auto-selects a target when focus is missing or stale.
- Update visual tests that locate `Overview` or `Diagnose` by visible label.

## Task 1: Lifecycle Copy Helper

**Files:**
- Create: `src/lib/utils/lifecycle-copy.ts`
- Create: `tests/unit/utils/lifecycle-copy.test.ts`
- Modify: `src/lib/components/Topbar.svelte`
- Modify: `tests/unit/components/topbar.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/unit/utils/lifecycle-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  runStatusText,
  startStopButtonLabel,
  isStartLifecycle,
} from '../../../src/lib/utils/lifecycle-copy';

describe('lifecycle-copy', () => {
  it('uses Ready before the first run instead of Halted', () => {
    expect(runStatusText('idle')).toBe('Ready');
  });

  it('uses Measuring while running', () => {
    expect(runStatusText('running')).toBe('Measuring');
  });

  it('uses Stopped after an explicit stop', () => {
    expect(runStatusText('stopped')).toBe('Stopped');
  });

  it('uses Complete after capped completion', () => {
    expect(runStatusText('completed')).toBe('Complete');
  });

  it('keeps transition copy explicit', () => {
    expect(runStatusText('starting')).toBe('Starting...');
    expect(runStatusText('stopping')).toBe('Stopping...');
  });

  it('keeps the button action short and predictable', () => {
    expect(startStopButtonLabel('idle')).toBe('Start');
    expect(startStopButtonLabel('running')).toBe('Stop');
    expect(startStopButtonLabel('completed')).toBe('Start');
  });

  it('treats idle, stopped, and completed as start-capable states', () => {
    expect(isStartLifecycle('idle')).toBe(true);
    expect(isStartLifecycle('stopped')).toBe(true);
    expect(isStartLifecycle('completed')).toBe(true);
    expect(isStartLifecycle('running')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/unit/utils/lifecycle-copy.test.ts
```

Expected: FAIL because `src/lib/utils/lifecycle-copy.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/utils/lifecycle-copy.ts`:

```ts
import type { TestLifecycleState } from '../types';

export function runStatusText(lifecycle: TestLifecycleState): string {
  if (lifecycle === 'running') return 'Measuring';
  if (lifecycle === 'starting') return 'Starting...';
  if (lifecycle === 'stopping') return 'Stopping...';
  if (lifecycle === 'stopped') return 'Stopped';
  if (lifecycle === 'completed') return 'Complete';
  return 'Ready';
}

export function startStopButtonLabel(lifecycle: TestLifecycleState): string {
  if (lifecycle === 'running') return 'Stop';
  if (lifecycle === 'starting') return 'Starting...';
  if (lifecycle === 'stopping') return 'Stopping...';
  return 'Start';
}

export function isStartLifecycle(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed';
}
```

- [ ] **Step 4: Wire Topbar to the helper**

In `src/lib/components/Topbar.svelte`, add:

```ts
import { isStartLifecycle, runStatusText, startStopButtonLabel } from '$lib/utils/lifecycle-copy';
```

Replace the local `runText`, `startStopLabel`, and `isStartButton` derivations with:

```ts
const runText = $derived(runStatusText(lifecycle));
const startStopLabel = $derived(startStopButtonLabel(lifecycle));
const isStartButton = $derived(isStartLifecycle(lifecycle));
```

Update `handleStartStop` so the running action remains stop:

```ts
function handleStartStop(): void {
  if (lifecycle === 'running') onStop?.();
  else if (isStartButton) onStart?.();
}
```

- [ ] **Step 5: Update the existing Topbar tests**

In `tests/unit/components/topbar.test.ts`, replace duplicated local label helpers with imports from `lifecycle-copy.ts`. The assertions should expect:

```ts
expect(runStatusText('idle')).toBe('Ready');
expect(runStatusText('running')).toBe('Measuring');
expect(runStatusText('completed')).toBe('Complete');
expect(startStopButtonLabel('running')).toBe('Stop');
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- tests/unit/utils/lifecycle-copy.test.ts tests/unit/components/topbar.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/utils/lifecycle-copy.ts src/lib/components/Topbar.svelte tests/unit/utils/lifecycle-copy.test.ts tests/unit/components/topbar.test.ts
git commit -m "feat: clarify lifecycle status copy"
```

## Task 2: Status Intent Helper

**Files:**
- Create: `src/lib/utils/status-intent.ts`
- Create: `tests/unit/utils/status-intent.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/unit/utils/status-intent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  autoStartDecision,
  selectInvestigationEndpointId,
} from '../../../src/lib/utils/status-intent';
import type { Endpoint, EndpointStatistics, MeasurementState } from '../../../src/lib/types';

const ep = (id: string, url = `https://${id}.example.com`): Endpoint => ({
  id,
  url,
  enabled: true,
  label: id,
  color: '#fff',
});

const stat = (endpointId: string, p95: number, ready = true): EndpointStatistics => ({
  endpointId,
  sampleCount: ready ? 30 : 0,
  p50: p95 / 2,
  p95,
  p99: p95,
  p25: p95 / 3,
  p75: p95 * 0.75,
  p90: p95 * 0.9,
  min: 1,
  max: p95,
  stddev: 2,
  ci95: { lower: 1, upper: p95, margin: 1 },
  connectionReuseDelta: null,
  lossPercent: 0,
  ready,
});

const measurement = (ids: readonly string[]): MeasurementState => ({
  lifecycle: 'running',
  epoch: 1,
  roundCounter: 1,
  startedAt: Date.now(),
  stoppedAt: null,
  freezeEvents: [],
  errorCount: 0,
  timeoutCount: 0,
  endpoints: Object.fromEntries(ids.map((id) => [
    id,
    {
      endpointId: id,
      lastLatency: 20,
      lastStatus: 'ok',
      lastErrorMessage: null,
      tierLevel: 1,
      samples: {
        length: 1,
        tailIndex: 0,
        at: () => undefined,
        filter: () => [],
        map: () => [],
        find: () => undefined,
        reduce: (_cb, initial) => initial,
        slice: () => [{ round: 1, latency: 20, status: 'ok', timestamp: Date.now() }],
        forEach: () => undefined,
        toArray: () => [{ round: 1, latency: 20, status: 'ok', timestamp: Date.now() }],
        [Symbol.iterator]: function* () { yield { round: 1, latency: 20, status: 'ok' as const, timestamp: Date.now() }; },
      },
    },
  ])),
});

describe('status-intent autoStartDecision', () => {
  it('auto-starts normal public endpoint sessions', () => {
    expect(autoStartDecision({
      endpoints: [ep('google', 'https://www.google.com/favicon.ico')],
      isSharedView: false,
      sharedReportMode: false,
      hasPendingShare: false,
    })).toEqual({ shouldStart: true, reason: null });
  });

  it('suppresses shared reports, staged shares, disabled-only sessions, and local endpoints', () => {
    expect(autoStartDecision({ endpoints: [ep('a')], isSharedView: true, sharedReportMode: true, hasPendingShare: false }).shouldStart).toBe(false);
    expect(autoStartDecision({ endpoints: [ep('a')], isSharedView: false, sharedReportMode: false, hasPendingShare: true }).shouldStart).toBe(false);
    expect(autoStartDecision({ endpoints: [{ ...ep('a'), enabled: false }], isSharedView: false, sharedReportMode: false, hasPendingShare: false }).shouldStart).toBe(false);
    expect(autoStartDecision({ endpoints: [ep('router', 'http://192.168.1.1')], isSharedView: false, sharedReportMode: false, hasPendingShare: false }).shouldStart).toBe(false);
  });
});

describe('status-intent selectInvestigationEndpointId', () => {
  it('preserves an existing valid focus', () => {
    expect(selectInvestigationEndpointId({
      monitored: [ep('a'), ep('b')],
      stats: { a: stat('a', 200), b: stat('b', 50) },
      measurements: measurement(['a', 'b']),
      currentFocusedId: 'b',
      worstEpId: 'a',
    })).toBe('b');
  });

  it('prefers explicit worst endpoint', () => {
    expect(selectInvestigationEndpointId({
      monitored: [ep('a'), ep('b')],
      stats: { a: stat('a', 50), b: stat('b', 200) },
      measurements: measurement(['a', 'b']),
      currentFocusedId: null,
      worstEpId: 'b',
    })).toBe('b');
  });

  it('falls back to highest ready p95', () => {
    expect(selectInvestigationEndpointId({
      monitored: [ep('a'), ep('b')],
      stats: { a: stat('a', 120), b: stat('b', 240) },
      measurements: measurement(['a', 'b']),
      currentFocusedId: null,
    })).toBe('b');
  });

  it('falls back to first endpoint with samples, then first monitored endpoint', () => {
    expect(selectInvestigationEndpointId({
      monitored: [ep('a'), ep('b')],
      stats: {},
      measurements: measurement(['b']),
      currentFocusedId: null,
    })).toBe('b');
    expect(selectInvestigationEndpointId({
      monitored: [ep('a'), ep('b')],
      stats: {},
      measurements: { ...measurement([]), endpoints: {} },
      currentFocusedId: null,
    })).toBe('a');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/unit/utils/status-intent.test.ts
```

Expected: FAIL because `src/lib/utils/status-intent.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/utils/status-intent.ts`:

```ts
import type { Endpoint, MeasurementState, StatisticsState } from '../types';
import { isSafeSharedUrl } from './url-safety';

export type AutoStartSuppressionReason =
  | 'shared-report'
  | 'pending-share'
  | 'no-enabled-endpoints'
  | 'local-endpoint';

export interface AutoStartDecision {
  readonly shouldStart: boolean;
  readonly reason: AutoStartSuppressionReason | null;
}

export function autoStartDecision(input: {
  readonly endpoints: readonly Endpoint[];
  readonly isSharedView: boolean;
  readonly sharedReportMode: boolean;
  readonly hasPendingShare: boolean;
}): AutoStartDecision {
  if (input.isSharedView && input.sharedReportMode) return { shouldStart: false, reason: 'shared-report' };
  if (input.hasPendingShare) return { shouldStart: false, reason: 'pending-share' };

  const enabled = input.endpoints.filter((endpoint) => endpoint.enabled);
  if (enabled.length === 0) return { shouldStart: false, reason: 'no-enabled-endpoints' };
  if (enabled.some((endpoint) => !isSafeSharedUrl(endpoint.url))) {
    return { shouldStart: false, reason: 'local-endpoint' };
  }
  return { shouldStart: true, reason: null };
}

export function selectInvestigationEndpointId(input: {
  readonly monitored: readonly Endpoint[];
  readonly stats: StatisticsState;
  readonly measurements: MeasurementState;
  readonly currentFocusedId: string | null;
  readonly worstEpId?: string | null;
  readonly recentEventEndpointIds?: readonly string[];
}): string | null {
  const validIds = new Set(input.monitored.map((endpoint) => endpoint.id));
  if (input.currentFocusedId !== null && validIds.has(input.currentFocusedId)) {
    return input.currentFocusedId;
  }

  if (input.worstEpId && validIds.has(input.worstEpId)) return input.worstEpId;

  let highest: { id: string; p95: number } | null = null;
  for (const endpoint of input.monitored) {
    const stats = input.stats[endpoint.id];
    if (!stats?.ready) continue;
    if (highest === null || stats.p95 > highest.p95) highest = { id: endpoint.id, p95: stats.p95 };
  }
  if (highest !== null) return highest.id;

  for (const endpointId of input.recentEventEndpointIds ?? []) {
    if (validIds.has(endpointId)) return endpointId;
  }

  for (const endpoint of input.monitored) {
    const samples = input.measurements.endpoints[endpoint.id]?.samples;
    if (samples && samples.length > 0) return endpoint.id;
  }

  return input.monitored[0]?.id ?? null;
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/unit/utils/status-intent.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/utils/status-intent.ts tests/unit/utils/status-intent.test.ts
git commit -m "feat: add status intent helpers"
```

## Task 3: Safe Auto-Start Wiring

**Files:**
- Modify: `src/lib/components/App.svelte`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/stores/ui.ts`
- Modify: `tests/unit/types.test.ts`
- Test: `tests/unit/utils/status-intent.test.ts`

- [ ] **Step 1: Extend UI state for non-persisted auto-start suppression**

In `src/lib/types.ts`, add import-safe type usage near `UIState`:

```ts
export type AutoStartSuppressionReason =
  | 'shared-report'
  | 'pending-share'
  | 'no-enabled-endpoints'
  | 'local-endpoint';
```

Add to `UIState`:

```ts
autoStartSuppressionReason: AutoStartSuppressionReason | null;
```

In `src/lib/stores/ui.ts`, initialize:

```ts
autoStartSuppressionReason: null,
```

Add store method:

```ts
setAutoStartSuppressionReason(reason: UIState['autoStartSuppressionReason']): void {
  update((s) => ({ ...s, autoStartSuppressionReason: reason }));
},
```

Do not add this field to `PersistedSettings`; it is session-derived.

- [ ] **Step 2: Wire App bootstrap**

In `src/lib/components/App.svelte`, import:

```ts
import { autoStartDecision } from '$lib/utils/status-intent';
```

After `engine = new MeasurementEngine();`, `setupPersistenceSync();`, `setupHistorySync();`, and `destroyShortcuts = initShortcuts();`, add:

```ts
const decision = autoStartDecision({
  endpoints: get(endpointStore),
  isSharedView: get(uiStore).isSharedView,
  sharedReportMode: get(uiStore).sharedReportMode,
  hasPendingShare: get(uiStore).pendingShare !== null,
});
uiStore.setAutoStartSuppressionReason(decision.reason);
if (decision.shouldStart) {
  engine.start();
}
```

Keep this after share/persistence initialization so shared reports and staged config links can suppress auto-start correctly.

- [ ] **Step 3: Update UI type coverage**

In `tests/unit/types.test.ts`, add `sharedReportMode`, `sharedReportContext`, `pendingShare`, `overviewSubtab`, and `autoStartSuppressionReason` to the two `UIState` object literals so they satisfy the full type. Then add:

```ts
it('UIState tracks auto-start suppression without persistence coupling', () => {
  const state: UIState = {
    activeView: 'overview',
    expandedCards: new Set(),
    showSettings: false,
    showShare: false,
    showKeyboardHelp: false,
    isSharedView: false,
    sharedReportMode: false,
    sharedReportContext: null,
    pendingShare: null,
    showEndpoints: false,
    focusedEndpointId: null,
    liveOptions: { split: false, timeRange: '5m' },
    terminalFilters: new Set(),
    overviewSubtab: 'racing',
    autoStartSuppressionReason: 'local-endpoint',
  };
  expect(state.autoStartSuppressionReason).toBe('local-endpoint');
});
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/unit/utils/status-intent.test.ts tests/unit/components/topbar.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/components/App.svelte src/lib/types.ts src/lib/stores/ui.ts tests/unit/utils/status-intent.test.ts tests/unit/components/topbar.test.ts tests/unit/types.test.ts
git commit -m "feat: auto-start safe public sessions"
```

## Task 4: View Switcher IA

**Files:**
- Modify: `src/lib/components/ViewSwitcher.svelte`
- Modify: `src/lib/utils/shortcuts.ts`
- Test: `tests/unit/utils/shortcuts.test.ts`
- Visual tests to update later: `tests/visual/*.spec.ts`

- [ ] **Step 1: Write the failing visible-IA test**

Create `tests/unit/components/view-switcher.test.ts`:

```ts
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ViewSwitcher from '../../../src/lib/components/ViewSwitcher.svelte';

describe('ViewSwitcher', () => {
  it('shows only shipped intent-oriented views', () => {
    const { queryByText, getByText } = render(ViewSwitcher);
    expect(getByText('Status')).toBeTruthy();
    expect(getByText('Live')).toBeTruthy();
    expect(getByText('Investigate')).toBeTruthy();
    expect(queryByText('Overview')).toBeNull();
    expect(queryByText('Diagnose')).toBeNull();
    expect(queryByText('Strata')).toBeNull();
    expect(queryByText('Terminal')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/unit/components/view-switcher.test.ts
```

Expected: FAIL because labels still show Overview/Diagnose and disabled tabs.

- [ ] **Step 3: Update view definitions**

In `src/lib/components/ViewSwitcher.svelte`, replace `VIEWS` with:

```ts
const VIEWS: readonly ViewDef[] = [
  { id: 'overview', key: '1', label: 'Status',      hint: 'Is everything okay?',          enabled: true },
  { id: 'live',     key: '2', label: 'Live',        hint: "What's happening right now?",  enabled: true },
  { id: 'diagnose', key: '3', label: 'Investigate', hint: 'Why does it look that way?',   enabled: true },
];
```

Remove `DISABLED_TOOLTIP` and the disabled-title/tabindex branches that are now unreachable. Keep `kbd` as `1·2·3`.

- [ ] **Step 4: Keep shortcuts aligned**

In `src/lib/utils/shortcuts.ts`, keep number mapping as:

```ts
const VIEW_BY_KEY: Record<string, ActiveView> = {
  '1': 'overview',
  '2': 'live',
  '3': 'diagnose',
};
```

Do not expose `4` or `5` as no-op visible shortcuts.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- tests/unit/components/view-switcher.test.ts tests/unit/utils/shortcuts.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/components/ViewSwitcher.svelte src/lib/utils/shortcuts.ts tests/unit/components/view-switcher.test.ts tests/unit/utils/shortcuts.test.ts
git commit -m "feat: simplify primary view navigation"
```

## Task 5: Verdict-First Status Layout

**Files:**
- Modify: `src/lib/components/Layout.svelte`
- Modify: `src/lib/components/OverviewView.svelte`
- Modify: `src/lib/components/CausalVerdictStrip.svelte`

- [ ] **Step 1: Pass start action to Status**

In `src/lib/components/Layout.svelte`, change:

```svelte
<OverviewView />
```

to:

```svelte
<OverviewView {onStart} />
```

Add props in `src/lib/components/OverviewView.svelte`:

```ts
let { onStart }: { onStart?: () => void } = $props();
```

- [ ] **Step 2: Move verdict above the dial**

In `OverviewView.svelte`, change markup to:

```svelte
<section class="overview status-view" aria-label="Status">
  <div class="status-shell">
    <CausalVerdictStrip
      diagnosis={diagnosticNarrative}
      {avgP50}
      {avgJitter}
      {avgLoss}
      {drillEndpoint}
      baselineInsight={historyBaselineInsight}
      autoStartSuppressionReason={$uiStore.autoStartSuppressionReason}
      onDrill={handleEnrichedDrill}
      onStart={onStart}
      variant="hero"
    />

    <div class="overview-grid">
      <div class="overview-left">
        <ChronographDial
          {score}
          {liveMedian}
          {threshold}
          endpoints={monitored}
          {lastLatencies}
          {paused}
          {scoreHistory}
          {baseline}
          {p99Across}
        />
      </div>
      <div class="overview-right" data-subtab={$uiStore.overviewSubtab}>
        <!-- keep existing OverviewSubtabStrip, RacingStrip, EventFeed markup here -->
      </div>
    </div>
  </div>
</section>
```

Keep the existing `RacingStrip` and `EventFeed` markup inside `overview-right`.

- [ ] **Step 3: Add CausalVerdictStrip props**

In `CausalVerdictStrip.svelte`, extend props:

```ts
import type { AutoStartSuppressionReason } from '$lib/types';

interface Props {
  diagnosis: DiagnosticNarrative;
  avgP50: number | null;
  avgJitter: number | null;
  avgLoss: number | null;
  drillEndpoint: Endpoint | null;
  baselineInsight?: HistoryBaselineInsight | null;
  autoStartSuppressionReason?: AutoStartSuppressionReason | null;
  variant?: 'normal' | 'hero';
  onDrill: (epId: string) => void;
  onStart?: () => void;
}
```

Default destructure:

```ts
let {
  diagnosis,
  avgP50,
  avgJitter,
  avgLoss,
  drillEndpoint,
  baselineInsight = null,
  autoStartSuppressionReason = null,
  variant = 'normal',
  onDrill,
  onStart,
}: Props = $props();
```

Add class binding:

```svelte
class:hero={variant === 'hero'}
```

When `autoStartSuppressionReason` is non-null and `diagnosis.kind === 'collecting'`, render:

```svelte
{#if autoStartSuppressionReason && diagnosis.kind === 'collecting'}
  <button type="button" class="verdict-drill verdict-start" onclick={() => onStart?.()}>
    <span class="verdict-drill-text">Start Measuring</span>
    <span class="verdict-drill-arrow" aria-hidden="true">→</span>
  </button>
{/if}
```

Do not render this button in shared report mode.

- [ ] **Step 4: Style Status hierarchy**

In `OverviewView.svelte`, update CSS:

```css
.overview {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 24px 16px;
  min-height: 0;
  overflow: hidden;
}

.status-shell {
  width: 100%;
  max-width: min(92vw, var(--content-max-w));
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.overview-grid {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 20px;
  align-items: start;
  min-height: 0;
}
```

In `CausalVerdictStrip.svelte`, add:

```css
.verdict.hero {
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 16px 20px;
  border-radius: 12px;
}

.verdict.hero .verdict-headline {
  font-size: var(--ts-xl);
}

.verdict.hero .verdict-explanation {
  font-size: var(--ts-md);
}
```

Mobile:

```css
@media (max-width: 767px) {
  .overview { padding: 8px 12px; }
  .status-shell { gap: 10px; }
  .overview-grid { grid-template-columns: 1fr; gap: 10px; }
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run typecheck
npm test -- tests/unit/components/ChronographDial.test.ts tests/unit/components/RacingStrip.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/components/Layout.svelte src/lib/components/OverviewView.svelte src/lib/components/CausalVerdictStrip.svelte
git commit -m "feat: make status view verdict first"
```

## Task 6: Investigate Auto-Selection

**Files:**
- Modify: `src/lib/components/DiagnoseView.svelte`
- Test: `tests/unit/utils/status-intent.test.ts`

- [ ] **Step 1: Import the helper**

In `DiagnoseView.svelte`, import:

```ts
import { selectInvestigationEndpointId } from '$lib/utils/status-intent';
```

- [ ] **Step 2: Add the auto-selection effect**

After `focusedEndpoint` derivation, add:

```ts
$effect(() => {
  if ($uiStore.activeView !== 'diagnose') return;
  const next = selectInvestigationEndpointId({
    monitored,
    stats,
    measurements,
    currentFocusedId: focusedId,
  });
  if (next !== null && next !== focusedId) {
    uiStore.setFocusedEndpoint(next);
  }
});
```

This preserves a valid existing focus and repairs missing/stale focus. Status CTAs still pass `worstEpId` through explicit drill actions; Diagnose fallback handles direct tab entry.

- [ ] **Step 3: Tighten empty-state copy**

Change the empty state to render only when `monitored.length === 0`:

```svelte
{#if monitored.length === 0}
  <div class="diagnose-empty" role="note">
    <p class="diagnose-empty-title">Enable an endpoint to investigate it closely.</p>
    <p class="diagnose-empty-hint">Chronoscope needs at least one monitored endpoint before it can compare distribution and correlation evidence.</p>
  </div>
{:else if !focusedEndpoint}
  <div class="diagnose-empty" role="note">
    <p class="diagnose-empty-title">Choosing the best endpoint to investigate...</p>
  </div>
{:else}
  <!-- existing detail content -->
{/if}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/unit/utils/status-intent.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/lib/components/DiagnoseView.svelte tests/unit/utils/status-intent.test.ts
git commit -m "feat: auto-select investigate endpoint"
```

## Task 7: Update Visual Tests and Browser Checks

**Files:**
- Modify: `tests/visual/latency-scale.spec.ts`
- Modify: `tests/visual/overview-no-raw-url.spec.ts`
- Modify: other `tests/visual/*.spec.ts` files that locate `Overview` or `Diagnose`

- [ ] **Step 1: Update helper names**

In visual tests, keep internal route names as `'overview' | 'live' | 'diagnose'`, but update visible locators:

```ts
await page.getByRole('button', { name: /^Investigate/ }).click();
await page.waitForSelector('section[aria-label="Diagnose"]');
```

For Status, use:

```ts
await page.getByRole('button', { name: /^Status/ }).click();
```

Do not change internal route strings unless `ActiveView` is migrated in a future PR.

- [ ] **Step 2: Add first-paint assertions**

Create or extend a visual spec with:

```ts
test('Status first paint shows verdict before the dial on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForSelector('#chronoscope-root');
  await expect(page.locator('.verdict.hero')).toBeVisible();
  const verdictBox = await page.locator('.verdict.hero').boundingBox();
  const dialBox = await page.locator('.dial').boundingBox();
  expect(verdictBox).not.toBeNull();
  expect(dialBox).not.toBeNull();
  expect(verdictBox!.y).toBeLessThan(dialBox!.y);
});
```

Add the same assertion at `390x844`.

- [ ] **Step 3: Add live-by-default assertion**

Add:

```ts
test('default public endpoint visit starts measuring', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#chronoscope-root');
  await expect(page.getByText('Measuring')).toBeVisible({ timeout: 3000 });
});
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:visual
```

Expected: PASS. If snapshots intentionally change, review them visually before updating.

Commit:

```bash
git add tests/visual src/lib/components
git commit -m "test: cover verdict-first status flow"
```

## Task 8: Final Verification

**Files:**
- No planned code changes. If verification fails, make the smallest targeted fix in the failing file and rerun the failing command before continuing.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Run targeted browser smoke**

Start the dev server if no existing Chronoscope dev server is already running:

```bash
npm run dev -- --host 127.0.0.1
```

Check desktop and mobile:

- `1440x900`: verdict card visible above dial, topbar says `Measuring`, nav labels are `Status`, `Live`, `Investigate`.
- `390x844`: verdict appears before the large dial/chart content.
- Click `Investigate`: endpoint detail appears without the old picker empty state.
- Click `Live`: focused endpoint state remains consistent if Investigate selected one.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: only intended tracked changes are committed; untracked screenshot files remain unmodified and unstaged.

- [ ] **Step 4: Prepare PR**

Use the repository's normal PR flow:

```bash
git push -u origin codex/verdict-first-status
gh pr create --title "[codex] Make Chronoscope verdict-first" --body "Implements the verdict-first Status UX slice from docs/superpowers/specs/2026-05-10-verdict-first-status-design.md."
```

Expected: PR opens from `codex/verdict-first-status` into `main`.

## Self-Review Checklist

- Spec coverage:
  - Status labels and hidden disabled tabs: Task 4.
  - Safe open-and-alive behavior: Tasks 2 and 3.
  - Verdict-first layout: Task 5.
  - Investigate auto-selection: Tasks 2 and 6.
  - Mobile and visual evidence: Task 7.
  - Compatibility with internal route IDs: Tasks 4 and 7.
- Completeness scan: this plan contains concrete implementation and verification steps for each requirement.
- Type consistency:
  - `AutoStartSuppressionReason` is defined in `types.ts` and used by `ui.ts`, `status-intent.ts`, and `CausalVerdictStrip.svelte`.
  - Internal route IDs remain `overview` and `diagnose`; user-facing labels become `Status` and `Investigate`.
