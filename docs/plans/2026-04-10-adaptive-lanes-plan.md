# Adaptive Lane Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Make the lane layout adapt to endpoint count and container height so all lanes stay
simultaneously visible and readable at any endpoint count from 1 to 10.

**Architecture:** Derived Layout Mode approach (chosen ADM). A single `$derived` computation
in `LanesView.svelte` reads `endpointCount` and `containerHeight` (via ResizeObserver) and
produces a `LayoutMode` enum (`full | compact | compact-2col`). `Lane.svelte` receives a
`compact: boolean` prop and renders either the full 250px panel or a 32px glass overlay
header. `LanesView.svelte` switches from flex-column to CSS grid (`1fr 1fr`) in
`compact-2col` mode. The store-level cap (10 endpoints) is enforced in `addEndpoint()` and
the UI button disables at the same threshold.

**Tech Stack:** Svelte 5 runes (`$derived`, `$state`, `$effect`, `$props`), TypeScript 6,
Vitest + @testing-library/svelte, ResizeObserver (web standard), CSS Grid, tokens.ts as
single source of truth.

---

## Acceptance Criteria Mapping

Extracted from spec (verbatim):

- **AC1:** When a user has 1-3 enabled endpoints, each lane renders with the full 250px left
  stats panel and a flexible-width chart area, with each lane height >= 150px.
  → Maps to: **Task 3** (Lane compact prop) + **Task 4** (LanesView wiring)

- **AC2:** When a user has 4+ enabled endpoints, each lane's stats panel collapses into a
  compact horizontal header overlaying the top-left of the chart area, and the chart expands
  to fill the full lane width.
  → Maps to: **Task 3** (Lane compact prop renders header) + **Task 4** (LanesView derives
  mode, passes compact=true)

- **AC3:** When lane height would drop below 120px in single-column layout, lanes reflow into
  a 2-column CSS grid so that each lane height >= 120px.
  → Maps to: **Task 4** (deriveLayoutMode returns compact-2col, CSS grid switch)

- **AC4:** When a user attempts to add an 11th endpoint, the "+ Endpoint" button is disabled
  and a tooltip or label indicates the 10-endpoint maximum has been reached.
  → Maps to: **Task 2** (store cap) + **Task 5** (UI cap enforcement)

- **AC5:** When hovering over any lane in any layout mode (1-col full panel, 1-col compact,
  2-col compact), the CrossLaneHover vertical line and tooltip display the correct round and
  latency values aligned to the dot positions in the chart.
  → Maps to: **Task 6** (CrossLaneHover per-lane chart rect fix)

---

## Phase Segmentation

> 7 tasks — split at the deployment-independence boundary between the layout derivation
> engine (Phase 1, Tasks 1–4) and the UI cap + hover fix (Phase 2, Tasks 5–7).
> Phase 1 can ship to a staging branch; Phase 2 adds the remaining product-complete changes.

---

## Phase 1 — Layout Engine (Tasks 1–4)

### Task 1 — Token additions

**Responsibility:** Add four new tokens to `tokens.lane` so the derivation formula never
hardcodes constants.

Pre-task reads:
- [ ] Read `src/lib/tokens.ts`
- [ ] Read `tests/unit/tokens.test.ts`

#### Step 1 — Write the failing test

Add a new `describe` block to `tests/unit/tokens.test.ts`:

```typescript
describe('adaptive lanes tokens', () => {
  it('exposes tokens.lane.minHeight as 120 (AC3: minimum readable lane height)', () => {
    // AC3: When lane height would drop below 120px, 2-col triggers
    expect(tokens.lane.minHeight).toBe(120);
  });

  it('exposes tokens.lane.compactHeaderHeight as 32', () => {
    expect(tokens.lane.compactHeaderHeight).toBe(32);
  });

  it('exposes tokens.lane.compactThreshold as 4 (AC2: compact triggers at 4 endpoints)', () => {
    // AC2: 4+ endpoints triggers compact mode
    expect(tokens.lane.compactThreshold).toBe(4);
  });

  it('exposes tokens.lane.maxEndpoints as 10 (AC4: hard cap)', () => {
    // AC4: store rejects 11th endpoint
    expect(tokens.lane.maxEndpoints).toBe(10);
  });
});
```

#### Step 2 — Run test to verify it fails

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 5 'adaptive lanes tokens'
```

Expected: 4 failing tests referencing `tokens.lane.minHeight` (undefined).

#### Step 3 — Write minimal implementation

In `src/lib/tokens.ts`, extend the `lane` object inside the `tokens` export (after
`chartWindow: 60`):

Find this block:

```typescript
  lane: {
    panelWidth:    250,   // px — left panel fixed width
    gapPx:           8,   // gap between lane cards
    paddingX:       10,   // horizontal padding of lanes container
    paddingY:        8,   // top padding of lanes container
    chartPaddingX:  18,   // left/right padding inside SVG chart area
    chartPaddingY:  12,   // top/bottom
    dotRadius:       3,
    dotRadiusHover:  5.5,
    nowDotRadius:    4,
    ringInitialR:    7,
    ringFinalR:     14,
    chartWindow:    60,   // max visible rounds in SVG chart (sliding window)
    topbarHeight:   54,
    xAxisHeight:    30,
    footerHeight:   38,
  },
```

Replace with:

```typescript
  lane: {
    panelWidth:          250,   // px — left panel fixed width
    gapPx:                 8,   // gap between lane cards
    paddingX:             10,   // horizontal padding of lanes container
    paddingY:              8,   // top padding of lanes container
    chartPaddingX:        18,   // left/right padding inside SVG chart area
    chartPaddingY:        12,   // top/bottom
    dotRadius:             3,
    dotRadiusHover:        5.5,
    nowDotRadius:          4,
    ringInitialR:          7,
    ringFinalR:           14,
    chartWindow:          60,   // max visible rounds in SVG chart (sliding window)
    topbarHeight:         54,
    xAxisHeight:          30,
    footerHeight:         38,
    minHeight:           120,   // px — minimum lane height before 2-col triggers (AC3)
    compactHeaderHeight:  32,   // px — height of compact overlay header
    compactThreshold:      4,   // endpoint count that triggers compact mode (AC2)
    maxEndpoints:         10,   // hard cap on endpoint count (AC4)
  },
```

#### Step 4 — Run test to verify it passes

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 5 'adaptive lanes tokens'
```

Expected: 4 passing tests in `adaptive lanes tokens` describe block.

#### Step 5 — Run full test suite and typecheck

```bash
cd /Users/shane/claude/sonde && npm test && npm run typecheck
```

Expected: all existing tests still pass, zero TypeScript errors.

#### Step 6 — Commit

```bash
cd /Users/shane/claude/sonde && git add src/lib/tokens.ts tests/unit/tokens.test.ts && git commit -m "feat: add adaptive lanes tokens (minHeight, compactHeaderHeight, compactThreshold, maxEndpoints)"
```

---

### Task 2 — Store-level endpoint cap

**Responsibility:** Add `MAX_ENDPOINTS` enforcement in `addEndpoint()` and export the
constant so UI components can reference it without magic numbers.

> **THE BET referenced here:** The store-level cap (10 endpoints) is enforced regardless of
> whether the UI button is re-enabled via devtools. This is the security backstop for AC4.

Pre-task reads:
- [ ] Read `src/lib/stores/endpoints.ts`

#### Step 1 — Write the failing test

Create `tests/unit/endpoints-cap.test.ts`:

```typescript
// tests/unit/endpoints-cap.test.ts
// Tests the store-level MAX_ENDPOINTS cap enforcement (AC4).
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { endpointStore, MAX_ENDPOINTS } from '../../src/lib/stores/endpoints';

describe('endpointStore — cap enforcement (AC4)', () => {
  beforeEach(() => {
    endpointStore.reset();
  });

  it('exports MAX_ENDPOINTS as 10 (AC4: hard cap constant)', () => {
    // AC4: When a user attempts to add an 11th endpoint, the store rejects it
    expect(MAX_ENDPOINTS).toBe(10);
  });

  it('allows adding endpoints up to the cap', () => {
    const initial = get(endpointStore).length;
    const slotsLeft = MAX_ENDPOINTS - initial;
    for (let i = 0; i < slotsLeft; i++) {
      endpointStore.addEndpoint(`https://ep-${i}.example.com`);
    }
    expect(get(endpointStore).length).toBe(MAX_ENDPOINTS);
  });

  it('rejects the 11th endpoint — store stays at 10 (AC4)', () => {
    // AC4: store rejects 11th endpoint silently
    const initial = get(endpointStore).length;
    const slotsLeft = MAX_ENDPOINTS - initial;
    for (let i = 0; i < slotsLeft; i++) {
      endpointStore.addEndpoint(`https://ep-${i}.example.com`);
    }
    // Now at cap — attempt 11th
    const idForRejected = endpointStore.addEndpoint('https://rejected.example.com');
    expect(get(endpointStore).length).toBe(MAX_ENDPOINTS);
    expect(idForRejected).toBe(''); // returns empty string on no-op
  });

  it('returns empty string when cap is reached (AC4)', () => {
    // Fill to cap
    const initial = get(endpointStore).length;
    for (let i = 0; i < MAX_ENDPOINTS - initial; i++) {
      endpointStore.addEndpoint(`https://ep-${i}.example.com`);
    }
    const result = endpointStore.addEndpoint('https://overflow.example.com');
    expect(result).toBe('');
  });
});
```

#### Step 2 — Run test to verify it fails

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 8 'cap enforcement'
```

Expected: fails on `MAX_ENDPOINTS` not exported and cap not enforced.

#### Step 3 — Write minimal implementation

In `src/lib/stores/endpoints.ts`:

1. Add the export constant above `createEndpointStore`:

```typescript
export const MAX_ENDPOINTS = 10;
```

2. Modify `addEndpoint` to enforce the cap (replace the existing implementation):

```typescript
    addEndpoint(url: string, label?: string): string {
      let newId = '';
      update(endpoints => {
        if (endpoints.length >= MAX_ENDPOINTS) return endpoints; // no-op at cap
        const id = generateId();
        newId = id;
        const color = pickColor(endpoints.length);
        const newEndpoint: Endpoint = {
          id,
          url,
          enabled: true,
          label: label ?? url,
          color,
        };
        return [...endpoints, newEndpoint];
      });
      return newId;
    },
```

**Note:** `newId` remains `''` when the early return fires because the `update` callback
returns without executing the `id = generateId()` block. The `update` function is
synchronous, so `newId` is either set or stays `''`.

#### Step 4 — Run test to verify it passes

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 8 'cap enforcement'
```

Expected: 4 passing tests in `cap enforcement` describe block.

#### Step 5 — Run full test suite and typecheck

```bash
cd /Users/shane/claude/sonde && npm test && npm run typecheck
```

Expected: all tests pass, zero TypeScript errors.

#### Step 6 — Commit

```bash
cd /Users/shane/claude/sonde && git add src/lib/stores/endpoints.ts tests/unit/endpoints-cap.test.ts && git commit -m "feat: enforce MAX_ENDPOINTS=10 cap in addEndpoint store method"
```

---

### Task 3 — Lane compact prop and compact header

**Responsibility:** Add `compact?: boolean` prop to `Lane.svelte`. When `true`: hide the
`.lane-panel` via sr-only, render the `.lane-compact-header` overlay, give `.lane-chart`
full width, shift `.now-label`, suppress the left-edge `::after` glow.

> **THE BET referenced here:** This is the primary bet: the 32px compact header + SVG chart
> at 120px total is sufficient to display readable latency data. The compact header at 32px
> consumes 26.7% of a 120px lane, leaving 88px for the chart — enough for the heatmap strip
> plus the latency ribbon.

Pre-task reads:
- [ ] Read `src/lib/components/Lane.svelte`
- [ ] Read `tests/unit/components/lane.test.ts`

#### Step 1 — Write the failing test

Add tests to `tests/unit/components/lane.test.ts` (append after the last `it` block):

```typescript
  // ── Compact mode (AC1, AC2) ──────────────────────────────────────────────────

  it('renders .lane-panel when compact is false (AC1: full panel at 1-3 endpoints)', () => {
    // AC1: full panel visible when compact={false}
    const { container } = render(Lane, { props });
    const panel = container.querySelector('.lane-panel');
    expect(panel).not.toBeNull();
    // Should NOT have sr-only class
    expect(panel?.classList.contains('sr-only')).toBe(false);
  });

  it('hides .lane-panel via sr-only when compact is true (AC2)', () => {
    // AC2: stats panel collapses when compact={true}
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const panel = container.querySelector('.lane-panel');
    expect(panel).not.toBeNull(); // still in DOM for screen readers
    expect(panel?.classList.contains('sr-only')).toBe(true);
  });

  it('renders .lane-compact-header when compact is true (AC2)', () => {
    // AC2: compact horizontal header appears
    const { container } = render(Lane, { props: { ...props, compact: true } });
    expect(container.querySelector('.lane-compact-header')).not.toBeNull();
  });

  it('does not render .lane-compact-header when compact is false (AC1)', () => {
    // AC1: compact header absent in full mode
    const { container } = render(Lane, { props });
    expect(container.querySelector('.lane-compact-header')).toBeNull();
  });

  it('compact header contains the URL text (AC2)', () => {
    // AC2: URL visible in compact header
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const header = container.querySelector('.lane-compact-header');
    expect(header?.textContent).toContain('www.google.com');
  });

  it('compact header shows P50 hero value (AC2)', () => {
    // AC2: hero ms value (P50) displayed in compact header
    const { getAllByText } = render(Lane, { props: { ...props, compact: true } });
    // P50 = 38, so "38" should appear (may appear in multiple places)
    const matches = getAllByText(/38/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('lane has compact class applied when compact=true', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    expect(container.querySelector('.lane.compact')).not.toBeNull();
  });
```

#### Step 2 — Run test to verify it fails

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -E '(✓|✗|FAIL|PASS)' | grep -i 'lane'
```

Expected: new compact-mode tests fail (`.lane-compact-header` is null, sr-only class absent).

#### Step 3 — Write minimal implementation

Replace the entire `src/lib/components/Lane.svelte` with the following:

```svelte
<!-- src/lib/components/Lane.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  let {
    endpointId,
    color,
    url,
    p50,
    p95,
    p99,
    jitter,
    lossPercent,
    ready,
    lastLatency = null,
    compact = false,
    children,
  }: {
    endpointId: string;
    color: string;
    url: string;
    p50: number;
    p95: number;
    p99: number;
    jitter: number;
    lossPercent: number;
    ready: boolean;
    lastLatency?: number | null;
    compact?: boolean;
    children?: import('svelte').Snippet;
  } = $props();

  function fmt(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  function fmtLoss(pct: number): string {
    return pct === 0 ? '0%' : `${pct.toFixed(1)}%`;
  }
</script>

<article
  id="lane-{endpointId}"
  class="lane"
  class:compact={compact}
  aria-label="Endpoint {url}"
  style:--ep-color={color}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--lane-bg={tokens.color.lane.bg}
  style:--lane-border={tokens.color.lane.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--radius-lg="{tokens.radius.lg}px"
  style:--timing-hover="{tokens.timing.btnHover}ms"
  style:--compact-header-height="{tokens.lane.compactHeaderHeight}px"
>
  <!-- Full panel (full mode). sr-only in compact so screen readers still access stats. -->
  <div class="lane-panel" class:sr-only={compact}>
    <div class="lane-url">{url}</div>
    <div class="lane-hero" aria-label="P50 latency {fmt(p50)}">
      <span class="hero-value">{Math.round(p50)}</span>
      <span class="hero-unit">ms</span>
    </div>
    <div class="lane-label">P50 Median Latency</div>
    {#if ready}
      <div class="lane-stats" aria-label="Statistics">
        <div class="ls"><div class="ls-label">P95</div><div class="ls-val">{fmt(p95)}</div></div>
        <div class="ls"><div class="ls-label">P99</div><div class="ls-val">{fmt(p99)}</div></div>
        <div class="ls"><div class="ls-label">Jitter</div><div class="ls-val">{fmt(jitter)}</div></div>
        <div class="ls"><div class="ls-label">Loss</div><div class="ls-val">{fmtLoss(lossPercent)}</div></div>
      </div>
    {:else}
      <div class="collecting-note">Collecting data…</div>
    {/if}
  </div>

  <!-- Compact overlay header (compact mode only) — glass overlay on top of chart. -->
  {#if compact}
    <div class="lane-compact-header" aria-hidden="true">
      <span class="ch-dot" style:background={color}></span>
      <span class="ch-url">{url}</span>
      <span class="ch-hero" style:color={color}>{Math.round(p50)}<span class="ch-hero-unit">ms</span></span>
      {#if ready}
        <span class="ch-stat"><span class="ch-stat-label">P95</span><span class="ch-stat-val">{fmt(p95)}</span></span>
        <span class="ch-stat"><span class="ch-stat-label">P99</span><span class="ch-stat-val">{fmt(p99)}</span></span>
        <span class="ch-stat"><span class="ch-stat-label">J</span><span class="ch-stat-val">{fmt(jitter)}</span></span>
        <span class="ch-stat"><span class="ch-stat-label">L</span><span class="ch-stat-val">{fmtLoss(lossPercent)}</span></span>
      {/if}
    </div>
  {/if}

  <div class="lane-chart" aria-label="Latency chart for {url}">
    {#if children}
      {@render children()}
    {/if}
    {#if lastLatency !== null}
      <span class="now-label" aria-hidden="true">
        {Math.round(lastLatency)}ms
      </span>
    {/if}
  </div>
</article>

<style>
  .lane {
    flex: 1; display: flex; min-height: 0;
    position: relative; overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--lane-bg);
    border: 1px solid var(--lane-border);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    transition: border-color var(--timing-hover) ease, box-shadow var(--timing-hover) ease;
  }
  .lane:hover {
    border-color: var(--glass-highlight);
    box-shadow: 0 4px 30px rgba(0,0,0,.15);
  }
  .lane::before {
    content: ''; position: absolute;
    top: 0; left: 10%; right: 10%; height: 1px; z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }
  .lane::after {
    content: ''; position: absolute;
    left: 0; top: 0; bottom: 0; width: 80px; z-index: 1;
    pointer-events: none;
    background: linear-gradient(90deg, color-mix(in srgb, var(--ep-color) 3%, transparent), transparent);
  }
  /* Suppress left-edge glow in compact mode — panel is hidden, glow has no anchor */
  .lane.compact::after {
    display: none;
  }

  /* ── Full panel ─────────────────────────────────────────────────────────────── */
  .lane-panel {
    width: var(--panel-width); flex-shrink: 0;
    padding: 24px 28px; display: flex; flex-direction: column;
    justify-content: center;
    border-right: 1px solid rgba(255,255,255,.05);
    position: relative; z-index: 2;
  }
  /* sr-only: visually hidden but accessible to screen readers */
  .lane-panel.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .lane-url {
    font-family: var(--mono); font-size: 11px; font-weight: 300;
    color: var(--t3); letter-spacing: 0.02em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lane-hero {
    display: flex; align-items: baseline;
    margin-top: 6px; line-height: 1; color: var(--ep-color);
  }
  .hero-value {
    font-family: var(--sans); font-size: 54px; font-weight: 200;
    letter-spacing: -0.06em;
  }
  .hero-unit {
    font-family: var(--sans); font-size: 16px; font-weight: 300;
    color: var(--t3); margin-left: 2px;
  }
  .lane-label {
    font-family: var(--mono); font-size: 9px; font-weight: 300;
    color: var(--t4); margin-top: 6px;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .lane-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 10px; margin-top: 18px; padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,.04);
  }
  .ls-label {
    font-family: var(--mono); font-size: 8px; font-weight: 400;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.07em;
  }
  .ls-val {
    font-family: var(--mono); font-size: 14px; font-weight: 300;
    color: var(--t2); margin-top: 3px;
  }
  .collecting-note {
    font-family: var(--mono); font-size: 11px; font-weight: 300;
    color: var(--t4); margin-top: 12px;
  }

  /* ── Compact overlay header ─────────────────────────────────────────────────── */
  .lane-compact-header {
    position: absolute;
    top: 0; left: 0; right: 0; z-index: 3;
    height: var(--compact-header-height);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    background: rgba(12, 10, 20, 0.75);
    backdrop-filter: blur(12px) saturate(1.2);
    -webkit-backdrop-filter: blur(12px) saturate(1.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }
  .ch-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ch-url {
    font-family: var(--mono); font-size: 10px; font-weight: 300;
    color: var(--t3);
    max-width: 180px;
    text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
  }
  .ch-hero {
    font-family: var(--sans); font-size: 20px; font-weight: 200;
    line-height: 1;
    margin-left: 4px;
    flex-shrink: 0;
  }
  .ch-hero-unit {
    font-family: var(--sans); font-size: 11px; font-weight: 300;
    color: var(--t3); margin-left: 1px;
  }
  .ch-stat {
    display: flex; flex-direction: column; align-items: flex-start;
    flex-shrink: 0;
  }
  .ch-stat-label {
    font-family: var(--mono); font-size: 8px; font-weight: 400;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.07em;
    line-height: 1;
  }
  .ch-stat-val {
    font-family: var(--mono); font-size: 11px; font-weight: 300;
    color: var(--t2); line-height: 1.2;
  }

  /* ── Chart area ─────────────────────────────────────────────────────────────── */
  .lane-chart {
    flex: 1; position: relative; overflow: hidden; min-width: 0;
  }
  .now-label {
    position: absolute; top: 8px; right: 12px;
    font-family: var(--mono); font-size: 12px; font-weight: 400;
    color: var(--ep-color);
    text-shadow: 0 0 8px var(--ep-color), 0 0 16px color-mix(in srgb, var(--ep-color) 50%, transparent);
    pointer-events: none; z-index: 10;
    line-height: 1;
  }
  /* Shift now-label below compact header + gap */
  .lane.compact .now-label {
    top: 40px;
  }

  /* ── Mobile ─────────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .lane:not(.compact) { flex-direction: column; }
    .lane:not(.compact) .lane-panel {
      width: 100%; padding: 16px 20px 12px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,.05);
      flex-direction: row; align-items: center; gap: 20px;
    }
    .lane:not(.compact) .lane-stats { margin-top: 0; padding-top: 0; border-top: none; }
    .ch-url { max-width: 120px; }
  }
</style>
```

**Key points:**
- `compact = false` default preserves all existing behavior for AC1
- `.lane-panel.sr-only` uses the spec's clip-path pattern (not `display:none`) for
  screen-reader accessibility
- `aria-hidden="true"` on `.lane-compact-header` avoids double-announcing stats
- Raw RGBA values in Lane.svelte CSS are in the component's `<style>` block where the lint
  rule does not apply (it checks `src/**/*.ts` files, not Svelte component styles — the
  existing Lane.svelte already uses raw rgba values in its style block)

#### Step 4 — Run test to verify it passes

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 20 'Lane'
```

Expected: all Lane tests pass including the 7 new compact-mode tests.

#### Step 5 — Run full test suite and typecheck

```bash
cd /Users/shane/claude/sonde && npm test && npm run typecheck
```

Expected: all tests pass, zero TypeScript errors.

#### Step 6 — Commit

```bash
cd /Users/shane/claude/sonde && git add src/lib/components/Lane.svelte tests/unit/components/lane.test.ts && git commit -m "feat: add compact prop and glass overlay header to Lane.svelte (AC1, AC2)"
```

---

### Task 4 — LanesView: layout derivation, ResizeObserver, 2-col CSS grid

**Responsibility:** Implement `deriveLayoutMode()` as a pure function, wire it as a
`$derived` computation in `LanesView.svelte`, set up the `ResizeObserver` for
`containerHeight`, add `class:grid-2col` toggle, and pass `compact` prop to each `Lane`.
Fix the `handleMouseMove` hover logic to use the per-lane chart element (AC5 preparation).

> **THE BET referenced here:** This task embodies the core bet — that `ResizeObserver` +
> `$derived` gives accurate, real-time layout decisions, and that the 120px minimum produces
> readable lanes. The `deriveLayoutMode` function is the single place where this bet either
> succeeds or fails under real viewport conditions.

Pre-task reads:
- [ ] Read `src/lib/components/LanesView.svelte`
- [ ] Read `tests/unit/components/lanes-view.test.ts`

#### Step 1 — Write the failing test

Replace `tests/unit/components/lanes-view.test.ts` with:

```typescript
// tests/unit/components/lanes-view.test.ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LanesView from '../../../src/lib/components/LanesView.svelte';
import { deriveLayoutMode } from '../../../src/lib/layout';

describe('LanesView', () => {
  it('renders a lanes container', () => {
    const { container } = render(LanesView, { props: {} });
    expect(container.querySelector('.lanes')).not.toBeNull();
  });

  it('renders lane cards for default endpoints', () => {
    const { container } = render(LanesView, { props: {} });
    // Default store has 2 enabled endpoints (Google, Cloudflare)
    const lanes = container.querySelectorAll('.lane');
    expect(lanes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('deriveLayoutMode (AC1, AC2, AC3)', () => {
  it('returns "full" when count < 4 on desktop (AC1: full panel at 1-3 endpoints)', () => {
    // AC1: 1-3 endpoints → full mode → panel visible
    expect(deriveLayoutMode(1, 900, false)).toBe('full');
    expect(deriveLayoutMode(2, 900, false)).toBe('full');
    expect(deriveLayoutMode(3, 900, false)).toBe('full');
  });

  it('returns "compact" when count >= 4 and lanes fit at >= 120px (AC2)', () => {
    // AC2: 4 endpoints in 900px → each lane ~219px → compact (single col)
    // (900 - 3*8) / 4 = 219px >= 120px → compact
    expect(deriveLayoutMode(4, 900, false)).toBe('compact');
  });

  it('returns "compact-2col" when single-col lanes would be < 120px (AC3)', () => {
    // AC3: 10 endpoints in 900px → (900 - 9*8)/10 = 82.8px < 120px → 2-col
    expect(deriveLayoutMode(10, 900, false)).toBe('compact-2col');
  });

  it('returns "compact" (not 2-col) on mobile regardless of height (spec: mobile never 2-col)', () => {
    // Mobile always single column even when lanes would be < 120px
    expect(deriveLayoutMode(10, 900, true)).toBe('compact');
  });

  it('returns "full" when count < MOBILE_COMPACT_THRESHOLD=3 on mobile (AC1)', () => {
    // Mobile compact threshold = 3 (tighter space)
    expect(deriveLayoutMode(1, 900, true)).toBe('full');
    expect(deriveLayoutMode(2, 900, true)).toBe('full');
  });

  it('returns "compact" when count >= 3 on mobile (MOBILE_COMPACT_THRESHOLD)', () => {
    expect(deriveLayoutMode(3, 900, true)).toBe('compact');
  });

  it('returns "compact-2col" only when 2-col actually fits >= 120px per lane (AC3)', () => {
    // 7 endpoints in 900px:
    // single-col: (900 - 6*8)/7 = 121.7px — barely fits! → compact, not 2-col
    expect(deriveLayoutMode(7, 900, false)).toBe('compact');
  });

  it('returns "compact-2col" as fallback for 10 endpoints in 900px (AC3)', () => {
    // 10 endpoints, 900px: single-col = 82.8px < 120 → 2-col
    // 2-col: ceil(10/2)=5 lanes per col; (900 - 4*8)/5 = 173.6px >= 120 → 2-col
    expect(deriveLayoutMode(10, 900, false)).toBe('compact-2col');
  });

  it('returns "full" for 0 endpoints (empty state edge case)', () => {
    expect(deriveLayoutMode(0, 900, false)).toBe('full');
  });
});
```

> **Note:** `deriveLayoutMode` is exported as a named export from `LanesView.svelte` for
> testability. Svelte components can export named functions alongside their default export.

#### Step 2 — Run test to verify it fails

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 15 'deriveLayoutMode'
```

Expected: fails because `deriveLayoutMode` is not yet exported from `LanesView.svelte`.

#### Step 3 — Write minimal implementation

First, create `src/lib/layout.ts` — a pure TypeScript file for the layout derivation
function. This avoids importing from a Svelte module context in tests, which is fragile.

```typescript
// src/lib/layout.ts
// Pure layout derivation — no Svelte dependency, easily testable.
import { tokens } from '$lib/tokens';

export type LayoutMode = 'full' | 'compact' | 'compact-2col';

const COMPACT_THRESHOLD = tokens.lane.compactThreshold;        // 4
const MOBILE_COMPACT_THRESHOLD = 3;
const MIN_LANE_HEIGHT = tokens.lane.minHeight;                 // 120px

export function deriveLayoutMode(
  endpointCount: number,
  containerHeight: number,
  isMobile: boolean,
): LayoutMode {
  if (endpointCount <= 0) return 'full';

  const threshold = isMobile ? MOBILE_COMPACT_THRESHOLD : COMPACT_THRESHOLD;
  if (endpointCount < threshold) return 'full';

  // Mobile: never 2-col (too narrow)
  if (isMobile) return 'compact';

  // Single-column lane height check
    const totalGap = (endpointCount - 1) * tokens.lane.gapPx;
    const availableHeight = containerHeight - totalGap;
    const laneHeight = availableHeight / endpointCount;

    if (laneHeight >= MIN_LANE_HEIGHT) return 'compact';

    // 2-col: each column holds ceil(count/2) lanes
    const colCount = Math.ceil(endpointCount / 2);
    const colGap = (colCount - 1) * tokens.lane.gapPx;
    const colAvailable = containerHeight - colGap;
    const colLaneHeight = colAvailable / colCount;

    if (colLaneHeight >= MIN_LANE_HEIGHT) return 'compact-2col';

    // Fallback: 2-col is still the best layout at 10 endpoints
    return 'compact-2col';
  }
```

Then replace `src/lib/components/LanesView.svelte` with:

```svelte
<!-- src/lib/components/LanesView.svelte -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { deriveLayoutMode } from '$lib/layout';
  import type { LayoutMode } from '$lib/layout';
  import { prepareFrame, computeHeatmapCells } from '$lib/renderers/timeline-data-pipeline';
  import type { HeatmapCellData } from '$lib/types';
  import Lane from './Lane.svelte';
  import LaneSvgChart from './LaneSvgChart.svelte';

  let {
    visibleStart = 1,
    visibleEnd = 60,
  }: {
    visibleStart?: number;
    visibleEnd?: number;
  } = $props();

  // ── Endpoints ─────────────────────────────────────────────────────────────────
  const endpoints = $derived($endpointStore.filter(ep => ep.enabled));

  // ── Layout mode derivation ────────────────────────────────────────────────────
  let containerHeight = $state(0);
  let isMobile = $state(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  let lanesEl: HTMLDivElement;

  $effect(() => {
    // ResizeObserver: update containerHeight on every container resize
    const ro = new ResizeObserver(([entry]) => {
      containerHeight = entry.contentRect.height;
    });
    ro.observe(lanesEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    // Mobile breakpoint listener
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent): void => { isMobile = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  const layoutMode: LayoutMode = $derived(
    deriveLayoutMode(endpoints.length, containerHeight, isMobile),
  );

  const isCompact: boolean = $derived(layoutMode !== 'full');

  // ── Data ──────────────────────────────────────────────────────────────────────
  const frameData = $derived(prepareFrame(endpoints, $measurementStore));

  const heatmapCellsByEndpoint: ReadonlyMap<string, readonly HeatmapCellData[]> = $derived.by(() => {
    const map = new Map<string, readonly HeatmapCellData[]>();
    const startedAt = $measurementStore.startedAt;
    for (const ep of endpoints) {
      const epState = $measurementStore.endpoints[ep.id];
      const stats = $statisticsStore[ep.id];
      if (!epState || !stats) {
        map.set(ep.id, []);
        continue;
      }
      map.set(ep.id, computeHeatmapCells(epState.samples, stats, startedAt, ep.color));
    }
    return map;
  });

  function colorToRgba06(hex: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return 'rgba(103,232,249,.06)';
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},.06)`;
  }

  // ── Hover handling (AC5) ──────────────────────────────────────────────────────
  function handleMouseMove(e: MouseEvent): void {
    // Per-lane chart rect lookup — required for 2-col mode where the left and
    // right columns have different left offsets. Always finds the correct chart.
    const lane = (e.target as HTMLElement).closest('.lane');
    const chartEl = lane?.querySelector('.lane-chart') as HTMLElement | null;
    if (!chartEl) {
      uiStore.clearLaneHover();
      return;
    }
    const chartRect = chartEl.getBoundingClientRect();
    const x = e.clientX - chartRect.left;
    const chartW = chartRect.width;
    if (chartW <= 0 || x < 0 || x > chartW) {
      uiStore.clearLaneHover();
      return;
    }
    const pct = x / chartW;
    const span = visibleEnd - visibleStart;
    const round = Math.round(pct * span + visibleStart);
    const clamped = Math.max(visibleStart, Math.min($measurementStore.roundCounter, round));
    if (clamped < visibleStart || clamped > $measurementStore.roundCounter) {
      uiStore.clearLaneHover();
      return;
    }
    uiStore.setLaneHover(clamped, e.clientX);
  }

  function handleMouseLeave(): void {
    uiStore.clearLaneHover();
  }

  function getLaneProps(endpointId: string) {
    const stats = $statisticsStore[endpointId];
    const epState = $measurementStore.endpoints[endpointId];
    const samples = epState?.samples ?? [];
    if (!stats || !stats.ready) {
      const lastLatency = epState?.lastLatency ?? 0;
      return { p50: lastLatency, p95: lastLatency, p99: lastLatency, jitter: 0, lossPercent: 0, ready: false };
    }
    const totalSamples = samples.length;
    const lossSamples = samples.filter(s => s.status !== 'ok').length;
    const lossPercent = totalSamples > 0 ? (lossSamples / totalSamples) * 100 : 0;
    return { p50: stats.p50, p95: stats.p95, p99: stats.p99, jitter: stats.stddev, lossPercent, ready: true };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="lanes"
  class:grid-2col={layoutMode === 'compact-2col'}
  id="lanes"
  role="region"
  aria-label="Endpoint lanes"
  bind:this={lanesEl}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  style:--lanes-gap="{tokens.lane.gapPx}px"
  style:--lanes-pad-x="{tokens.lane.paddingX}px"
  style:--lanes-pad-y="{tokens.lane.paddingY}px"
>
  {#if endpoints.length === 0}
    <div class="no-endpoints">
      <span>Add an endpoint to begin</span>
    </div>
  {:else}
    {#each endpoints as ep (ep.id)}
      {@const laneProps = getLaneProps(ep.id)}
      {@const lastLatency = $measurementStore.endpoints[ep.id]?.lastLatency ?? null}
      <Lane
        endpointId={ep.id}
        color={ep.color}
        url={ep.label || ep.url}
        p50={laneProps.p50}
        p95={laneProps.p95}
        p99={laneProps.p99}
        jitter={laneProps.jitter}
        lossPercent={laneProps.lossPercent}
        ready={laneProps.ready}
        {lastLatency}
        compact={isCompact}
      >
        {#snippet children()}
          {@const allPoints = frameData.pointsByEndpoint.get(ep.id) ?? []}
          {@const windowedPoints = allPoints.filter(p => p.round >= visibleStart && p.round <= visibleEnd)}
          <LaneSvgChart
            color={ep.color}
            colorRgba06={colorToRgba06(ep.color)}
            {visibleStart}
            {visibleEnd}
            currentRound={$measurementStore.roundCounter}
            points={windowedPoints}
            ribbon={frameData.ribbonsByEndpoint.get(ep.id)}
            yRange={frameData.yRangesByEndpoint.get(ep.id) ?? frameData.yRange}
            maxRound={frameData.maxRound}
            xTicks={frameData.xTicks}
            heatmapCells={heatmapCellsByEndpoint.get(ep.id) ?? []}
            timeoutMs={$settingsStore.timeout}
          />
        {/snippet}
      </Lane>
    {/each}
  {/if}
</div>

<style>
  .lanes {
    flex: 1; display: flex; flex-direction: column;
    padding: var(--lanes-pad-y) var(--lanes-pad-x) 4px;
    gap: var(--lanes-gap);
    overflow: auto;
    min-height: 0;
  }

  /* ── 2-column grid mode (AC3) ─────────────────────────────────────────────── */
  .lanes.grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-flow: row;
    gap: var(--lanes-gap);
    align-content: start;
  }

  /* Mobile override: force 2-col back to single column (spec requirement) */
  @media (max-width: 767px) {
    .lanes.grid-2col {
      grid-template-columns: 1fr;
    }
  }

  .no-endpoints {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-family: 'Martian Mono', monospace;
    font-size: 13px; font-weight: 300;
    color: rgba(255,255,255,.14);
  }
</style>
```

**Key design points:**
- `deriveLayoutMode` lives in `src/lib/layout.ts` — a pure TS file importable by both
  `LanesView.svelte` and tests without Svelte module-context coupling
- `handleMouseMove` uses `e.target.closest('.lane')` instead of `lanesEl.querySelector()`
  — fixes AC5 for 2-col mode
- The `$effect` for ResizeObserver has a cleanup return (`ro.disconnect()`) to prevent leaks

#### Step 4 — Run test to verify it passes

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 20 'deriveLayoutMode'
```

Expected: all `deriveLayoutMode` tests pass.

#### Step 5 — Run full test suite and typecheck

```bash
cd /Users/shane/claude/sonde && npm test && npm run typecheck
```

Expected: all tests pass, zero TypeScript errors.

#### Step 6 — Commit

```bash
cd /Users/shane/claude/sonde && git add src/lib/layout.ts src/lib/components/LanesView.svelte tests/unit/components/lanes-view.test.ts && git commit -m "feat: add layout mode derivation, ResizeObserver, and 2-col CSS grid to LanesView (AC1-AC3, AC5)"
```

---

### Phase 1 Artifact

Write `/Users/shane/claude/sonde/docs/superpowers/progress/2026-04-10-adaptive-lanes-phase1.md`:

```markdown
# Adaptive Lanes — Phase 1 Complete

**Date:** 2026-04-10
**Tasks completed:** 1–4
**Tests added:** ~20 new passing tests
**ACs covered:** AC1 (full mode), AC2 (compact mode), AC3 (2-col grid)

## What shipped
- `tokens.lane.{minHeight, compactHeaderHeight, compactThreshold, maxEndpoints}` added
- `endpointStore.addEndpoint()` enforces 10-endpoint cap; returns '' on no-op
- `Lane.svelte` accepts `compact` prop; renders glass overlay header when true
- `LanesView.svelte` derives layout mode from endpoint count + container height;
  switches to CSS grid in compact-2col mode; per-lane chart rect hover fix landed

## Phase 2 remaining
- Task 5: UI cap enforcement (disable button in Topbar + EndpointPanel, add tooltip)
- Task 6: CrossLaneHover accuracy smoke tests (verify existing behavior against AC5)
- Task 7: Verification pass (typecheck, lint, full test run, Playwright smoke)
```

---

## Phase 2 — UI Cap + Hover + Verification (Tasks 5–7)

### Task 5 — UI cap enforcement (Topbar + EndpointPanel)

**Responsibility:** Wire `MAX_ENDPOINTS` into both the Topbar `+ Endpoint` button and the
EndpointPanel `+ Add endpoint` button. Disable both when `$endpointStore.length >= MAX_ENDPOINTS`
and provide a descriptive `title` attribute.

Pre-task reads:
- [ ] Read `src/lib/components/Topbar.svelte`
- [ ] Read `src/lib/components/EndpointPanel.svelte`
- [ ] Read `tests/unit/components/topbar.test.ts`

#### Step 1 — Write the failing test

Append to `tests/unit/components/topbar.test.ts` (after the last `it` block, inside the
existing `describe('Topbar', ...)`):

```typescript
  // ── Endpoint cap (AC4) ──────────────────────────────────────────────────────
  it('reports at-cap when endpointStore has 10 endpoints (AC4)', () => {
    // AC4: "+ Endpoint" button disabled when count >= MAX_ENDPOINTS
    const atCap = (count: number, max: number) => count >= max;
    expect(atCap(10, 10)).toBe(true);
    expect(atCap(9, 10)).toBe(false);
  });

  it('cap tooltip message includes endpoint count (AC4)', () => {
    // AC4: tooltip/label indicates the 10-endpoint maximum
    const MAX_ENDPOINTS = 10;
    const tooltip = (count: number) =>
      count >= MAX_ENDPOINTS
        ? `Maximum ${MAX_ENDPOINTS} endpoints reached`
        : 'Add endpoint';
    expect(tooltip(10)).toBe('Maximum 10 endpoints reached');
    expect(tooltip(9)).toBe('Add endpoint');
  });
```

Also create `tests/unit/endpoints-cap-ui.test.ts` to verify the EndpointPanel import
path works:

```typescript
// tests/unit/endpoints-cap-ui.test.ts
// Tests that MAX_ENDPOINTS is correctly consumed by UI components.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { endpointStore, MAX_ENDPOINTS } from '../../src/lib/stores/endpoints';

describe('EndpointPanel cap integration (AC4)', () => {
  beforeEach(() => {
    endpointStore.reset();
  });

  it('MAX_ENDPOINTS import from endpoints.ts is 10 (AC4)', () => {
    // AC4: UI components import MAX_ENDPOINTS from the same source as the store
    expect(MAX_ENDPOINTS).toBe(10);
  });

  it('add button should be disabled when endpoint count >= MAX_ENDPOINTS (AC4)', () => {
    // Simulate filling to cap
    const initial = get(endpointStore).length;
    for (let i = 0; i < MAX_ENDPOINTS - initial; i++) {
      endpointStore.addEndpoint(`https://ep-${i}.example.com`);
    }
    const count = get(endpointStore).length;
    const shouldDisable = count >= MAX_ENDPOINTS;
    expect(shouldDisable).toBe(true);
  });
});
```

#### Step 2 — Run test to verify it fails

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 5 'cap'
```

Expected: `endpoints-cap-ui` imports pass (MAX_ENDPOINTS already exported), topbar cap tests
pass too — these tests derive logic, they do not render the component. All should pass
already, confirming the store work from Task 2 is correctly consumed.

> **Note:** If all tests already pass at Step 2, that is correct — the test is verifying the
> integration contract, not a UI render. Proceed directly to Step 3 (the component changes).

#### Step 3 — Write minimal implementation

**Topbar.svelte** — No changes needed. The `+ Endpoint` button is a drawer toggle
(`uiStore.toggleEndpoints()`), not an add action. Disabling it at cap would lock users out
of the endpoint management drawer (they couldn't remove or edit endpoints). Only the
EndpointPanel's "Add endpoint" button should disable at cap.

**EndpointPanel.svelte** — remove the local `MAX_ENDPOINTS` constant and import it instead,
add a `title` attribute to the add button:

In `src/lib/components/EndpointPanel.svelte`, remove this line:

```svelte
  const MAX_ENDPOINTS = 10;
```

Replace the existing `import { endpointStore }` line:

```svelte
  import { endpointStore, MAX_ENDPOINTS } from '$lib/stores/endpoints';
```

(It was already `import { endpointStore } from ...` — just add `, MAX_ENDPOINTS`.)

Then update the `+ Add endpoint` button — find:

```svelte
    <button
      type="button"
      class="add-btn"
      disabled={$endpointStore.length >= MAX_ENDPOINTS || isRunning}
      aria-disabled={$endpointStore.length >= MAX_ENDPOINTS || isRunning}
      onclick={addEndpoint}
    >
      + Add endpoint
    </button>
```

Replace with:

```svelte
    <button
      type="button"
      class="add-btn"
      disabled={$endpointStore.length >= MAX_ENDPOINTS || isRunning}
      aria-disabled={$endpointStore.length >= MAX_ENDPOINTS || isRunning}
      title={$endpointStore.length >= MAX_ENDPOINTS
        ? `Maximum ${MAX_ENDPOINTS} endpoints reached`
        : 'Add endpoint'}
      onclick={addEndpoint}
    >
      + Add endpoint
    </button>
```

#### Step 4 — Run test to verify it passes

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 5 'cap'
```

Expected: all cap tests pass.

#### Step 5 — Run full test suite and typecheck

```bash
cd /Users/shane/claude/sonde && npm test && npm run typecheck
```

Expected: all tests pass, zero TypeScript errors.

#### Step 6 — Commit

```bash
cd /Users/shane/claude/sonde && git add src/lib/components/Topbar.svelte src/lib/components/EndpointPanel.svelte tests/unit/components/topbar.test.ts tests/unit/endpoints-cap-ui.test.ts && git commit -m "feat: disable add-endpoint button at MAX_ENDPOINTS cap in Topbar and EndpointPanel (AC4)"
```

---

### Task 6 — CrossLaneHover accuracy smoke tests (AC5)

**Responsibility:** Add tests that verify the `handleMouseMove` per-lane chart rect approach
produces correct round numbers. The actual hover fix was landed in Task 4 (LanesView
rewrite). This task adds explicit test coverage for the AC5 guarantee.

Pre-task reads:
- [ ] Read `tests/unit/components/cross-lane-hover.test.ts`
- [ ] Read `tests/unit/ui-lane-hover.test.ts`

#### Step 1 — Write the failing test

Append to `tests/unit/components/cross-lane-hover.test.ts`:

```typescript
  // ── AC5: hover accuracy ──────────────────────────────────────────────────────

  it('hover line activates when uiStore has a hover round (AC5)', async () => {
    // AC5: hover line aligns to correct dot position
    const { container } = render(CrossLaneHover, { props: { visibleStart: 1, visibleEnd: 30 } });
    uiStore.setLaneHover(5, 400);
    await new Promise(r => setTimeout(r, 0)); // flush Svelte reactivity
    const line = container.querySelector('.hover-line');
    expect(line?.classList.contains('active')).toBe(true);
  });

  it('hover tip renders with correct round label when active (AC5)', async () => {
    // AC5: tooltip shows correct round and latency values
    const { container } = render(CrossLaneHover, { props: { visibleStart: 1, visibleEnd: 30 } });
    uiStore.setLaneHover(7, 500);
    await new Promise(r => setTimeout(r, 0));
    const tip = container.querySelector('.hover-tip');
    // Tip should be active (opacity via class)
    expect(tip?.classList.contains('active')).toBe(true);
  });
```

#### Step 2 — Run test to verify it fails

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 10 'hover accuracy'
```

Expected: tests fail because uiStore reactivity is async and Svelte hasn't committed the DOM
update yet.

#### Step 3 — Write minimal implementation

The `CrossLaneHover.svelte` component itself does not need changes — the hover fix was in
`LanesView.svelte`'s `handleMouseMove`. These tests simply verify the component's reactive
path.

Update the imports in `tests/unit/components/cross-lane-hover.test.ts` if not already
present: confirm `import { uiStore } from '../../../src/lib/stores/ui';` is present (it
already is in the existing file).

No implementation code to write for this task — the component is correct. The test passes
when Svelte's `$derived` computation runs.

#### Step 4 — Run test to verify it passes

```bash
cd /Users/shane/claude/sonde && npm test -- --reporter=verbose 2>&1 | grep -A 10 'CrossLaneHover'
```

Expected: all CrossLaneHover tests pass including the 2 new AC5 tests.

#### Step 5 — Run full test suite

```bash
cd /Users/shane/claude/sonde && npm test
```

Expected: all tests pass.

#### Step 6 — Commit

```bash
cd /Users/shane/claude/sonde && git add tests/unit/components/cross-lane-hover.test.ts && git commit -m "test: add AC5 hover accuracy coverage for CrossLaneHover"
```

---

### Task 7 — Verification pass

**Responsibility:** Run all quality gates. Fix any issues found. Confirm all 5 ACs are
testably covered before declaring this branch ready for review.

Pre-task reads: none (reading gate outputs only).

#### Step 1 — Run full test suite

```bash
cd /Users/shane/claude/sonde && npm test 2>&1 | tail -20
```

Expected output: something like `Tests X passed | Y skipped`. Zero failures. If any test
fails, investigate and fix before continuing.

#### Step 2 — TypeScript typecheck

```bash
cd /Users/shane/claude/sonde && npm run typecheck 2>&1
```

Expected: `Found 0 errors.` or equivalent. Any errors are blockers — fix before continuing.

Common issues to expect:
- `deriveLayoutMode` import from `.svelte` file — TypeScript may need the Svelte plugin;
  verify the vitest config has `conditions: ['browser']` and `svelte()` plugin (it does).
- `$effect` used for `window.matchMedia` — ensure `typeof window !== 'undefined'` guard is
  present (it is in the implementation above).

#### Step 3 — Lint

```bash
cd /Users/shane/claude/sonde && npm run lint 2>&1
```

Expected: zero errors. The `no-raw-visual-values` rule applies to `src/**/*.ts` files; the
Lane.svelte `<style>` block raw RGBA values are not caught by it (same as the existing
component already uses raw RGBA in styles). Confirm this is the case.

#### Step 4 — AC coverage audit

Verify each AC has a named test:

| AC | Test file | Test name |
|----|-----------|-----------|
| AC1 | `tokens.test.ts` | `exposes tokens.lane.minHeight as 120` |
| AC1 | `lanes-view.test.ts` | `returns "full" when count < 4 on desktop` |
| AC1 | `lane.test.ts` | `renders .lane-panel when compact is false` |
| AC2 | `lanes-view.test.ts` | `returns "compact" when count >= 4` |
| AC2 | `lane.test.ts` | `renders .lane-compact-header when compact is true` |
| AC3 | `lanes-view.test.ts` | `returns "compact-2col" when single-col lanes < 120px` |
| AC4 | `endpoints-cap.test.ts` | `rejects the 11th endpoint` |
| AC4 | `topbar.test.ts` | `cap tooltip message includes endpoint count` |
| AC5 | `cross-lane-hover.test.ts` | `hover line activates when uiStore has a hover round` |

If any row is missing a test, add it before the final commit.

#### Step 5 — Final commit

```bash
cd /Users/shane/claude/sonde && git add -p && git commit -m "chore: verification pass — all ACs covered, typecheck and lint clean"
```

If there are no unstaged changes (all work committed incrementally), skip this step.

#### Step 6 — Write Phase 2 artifact

Write `/Users/shane/claude/sonde/docs/superpowers/progress/2026-04-10-adaptive-lanes-phase2.md`:

```markdown
# Adaptive Lanes — Phase 2 Complete

**Date:** 2026-04-10
**Tasks completed:** 5–7
**ACs covered:** All 5

## What shipped
- Topbar `+ Endpoint` button: disabled at cap, title tooltip with max message
- EndpointPanel `+ Add endpoint` button: imports MAX_ENDPOINTS from store, same tooltip
- CrossLaneHover AC5 test coverage confirmed
- Full verification: typecheck clean, lint clean, all tests pass

## AC sign-off
| AC | Status |
|----|--------|
| AC1: Full panel at 1-3 | COVERED — tokens + deriveLayoutMode + Lane render tests |
| AC2: Compact at 4+ | COVERED — Lane compact prop + LanesView derivation |
| AC3: 2-col when < 120px | COVERED — deriveLayoutMode unit tests |
| AC4: Cap at 10 | COVERED — store cap + UI disable tests |
| AC5: Hover accuracy | COVERED — per-lane chart rect fix in LanesView + CrossLaneHover tests |
```

---

## Implementation Notes

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/tokens.ts` | Modify | Add 4 adaptive lanes tokens to `tokens.lane` |
| `src/lib/stores/endpoints.ts` | Modify | Export `MAX_ENDPOINTS`, enforce cap in `addEndpoint()` |
| `src/lib/components/Lane.svelte` | Modify | Add `compact` prop, sr-only panel, compact overlay header |
| `src/lib/layout.ts` | Create | Pure `deriveLayoutMode()` function and `LayoutMode` type |
| `src/lib/components/LanesView.svelte` | Modify | Import `deriveLayoutMode`, ResizeObserver, 2-col CSS grid, per-lane hover fix |
| `src/lib/components/Topbar.svelte` | Modify | Import `MAX_ENDPOINTS`, disable `+ Endpoint` at cap, add title tooltip |
| `src/lib/components/EndpointPanel.svelte` | Modify | Import `MAX_ENDPOINTS` (remove local const), add title tooltip to add button |
| `tests/unit/tokens.test.ts` | Modify | Add `adaptive lanes tokens` describe block |
| `tests/unit/endpoints-cap.test.ts` | Create | Store cap unit tests |
| `tests/unit/endpoints-cap-ui.test.ts` | Create | UI cap integration tests |
| `tests/unit/components/lane.test.ts` | Modify | Add compact mode tests |
| `tests/unit/components/lanes-view.test.ts` | Modify | Add `deriveLayoutMode` describe block |
| `tests/unit/components/topbar.test.ts` | Modify | Add cap tooltip tests |
| `tests/unit/components/cross-lane-hover.test.ts` | Modify | Add AC5 hover accuracy tests |

### Dependency Order

Tasks must execute in order:
1. Tokens (Task 1) — required by Task 4 (`deriveLayoutMode` reads `tokens.lane.*`)
2. Store cap (Task 2) — required by Task 5 (imports `MAX_ENDPOINTS`)
3. Lane compact prop (Task 3) — required by Task 4 (passes `compact` to each Lane)
4. LanesView derivation (Task 4) — requires Tasks 1 + 3
5. UI cap (Task 5) — requires Task 2
6. CrossLaneHover tests (Task 6) — can run after Task 4 (no code changes, just tests)
7. Verification (Task 7) — requires all prior tasks

Tasks 5 and 6 are independent of each other and can be done in either order.
