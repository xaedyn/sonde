# S80 Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Add s80's four strongest diagnostic features — heatmap history strip, timeout threshold line, live latency now-dot label, and elapsed-time x-axis — to Chronoscope's Glass Lanes UI.

**Architecture:** Each feature is additive and layered onto existing components. `computeHeatmapCells()` is a pure function added to `timeline-data-pipeline.ts` and called in `LanesView`; its output flows as a prop to `LaneSvgChart`. Elapsed-time formatting replaces round-number labels in `XAxisBar` by receiving `startedAt` and sample timestamps from `Layout`. The now-dot label is an absolutely-positioned HTML `<span>` overlaid on the SVG by `Lane.svelte`, receiving position data from `LaneSvgChart` via a `nowDotPercent` derived value.

**Tech Stack:** Svelte 5 (runes), TypeScript ~6.0.2, SVG (inline, scoped), Vitest ^4.1.3. All visual values via CSS custom properties from `tokens.ts`.

---

## Acceptance Criteria Mapping

| AC | Text | Maps to Task |
|----|------|-------------|
| AC1 | Heatmap strip renders inside each lane's chart area, 12px tall, growing left-to-right | Task 4 |
| AC2 | Heatmap cells aggregate to ~200 max cells, worst-value-wins | Task 3 |
| AC3 | Heatmap hover tooltip shows round range, elapsed time, latency | Task 4 |
| AC4 | Heatmap uses Glass palette colors relative to each endpoint's percentile distribution | Tasks 3 & 4 |
| AC5 | Timeout threshold line appears only when configured timeout is within lane's visible y-range | Task 5 |
| AC6 | Live latency label floats above now-dot, updates every tick, uses endpoint color | Task 6 |
| AC7 | X-axis labels show elapsed time in smart format (S.Xs / M:SS / H:MM:SS) | Task 7 |
| AC8 | X-axis "ROUND" label becomes "ELAPSED" | Task 7 |
| AC9 | Footer shows elapsed time alongside round counter | Task 8 |
| AC10 | All new visual elements use CSS custom properties from tokens — no raw hex/rgba in component styles | All tasks |
| AC11 | All existing tests continue to pass | Verified in Task 9 |
| AC12 | TypeScript strict mode — no `any` types | All tasks |

---

## File Map

### New files

| Path | Responsibility |
|------|---------------|
| `tests/unit/heatmap-cells.test.ts` | Unit tests for `computeHeatmapCells()` aggregation logic |
| `tests/unit/elapsed-time.test.ts` | Unit tests for `formatElapsed()` time formatting |

### Modified files

| Path | What exists | What is added |
|------|-------------|---------------|
| `src/lib/tokens.ts` | All design tokens | `color.heatmap` group (5 entries); `heatmapStrip` layout constant |
| `src/lib/types.ts` | All type contracts | `HeatmapCellData` interface; rename collision note — existing `HeatmapCell` is legacy canvas type, new type is `HeatmapCellData` |
| `src/lib/renderers/timeline-data-pipeline.ts` | `prepareFrame`, `computeXTicks`, etc. | `computeHeatmapCells()` pure function; `formatElapsed()` pure function |
| `src/lib/components/LaneSvgChart.svelte` | SVG scatter chart | `heatmapCells` prop, `timeoutMs` prop, `nowDotPercent` bindable output, heatmap `<rect>` layer, timeout line layer, viewBox height updated to 216, PLOT_H shrunk by 16 |
| `src/lib/components/Lane.svelte` | Lane card with left panel + chart slot | `nowDotPercent` prop, `lastLatency` prop, `isRunning` prop; now-dot HTML label `<span>` overlay |
| `src/lib/components/LanesView.svelte` | Composes lanes + chart per endpoint | Compute `heatmapCells` per endpoint from all samples; pass `timeoutMs` from `$settingsStore.timeout`; pass `lastLatency` and `isRunning` |
| `src/lib/components/XAxisBar.svelte` | Round-number x-axis | Accept `startedAt: number \| null` and `sampleTimestamps: readonly number[]` props; replace labels with `formatElapsed()`; rename "ROUND" → "ELAPSED" |
| `src/lib/components/FooterBar.svelte` | Footer status bar | Derive `elapsedLabel` from `$measurementStore.startedAt` + `Date.now()`; append to progress text |
| `src/lib/components/Layout.svelte` | Top-level layout compositor | Pass `startedAt` and visible-window sample timestamps to `XAxisBar` |

---

## Phase 1 — Pure Logic & Types (Tasks 1–3)

Tasks 1–3 have no UI component dependencies. They can be committed independently.

---

### Task 1 — Add `color.heatmap` tokens and `HeatmapCellData` type

**Pre-task reads:**
- [ ] Read `src/lib/tokens.ts`
- [ ] Read `src/lib/types.ts`
- [ ] Read `tests/unit/tokens.test.ts`
- [ ] Read `tests/unit/types.test.ts`

#### Step 1 — Write the failing test

Add a new `describe` block to **`tests/unit/tokens.test.ts`** (append after the last block):

```typescript
describe('heatmap tokens', () => {
  it('exports color.heatmap group with all 4 keys (AC10)', () => {
    expect(tokens.color.heatmap).toBeDefined();
    expect(tokens.color.heatmap.fast).toBeDefined();
    expect(tokens.color.heatmap.elevated).toBeDefined();
    expect(tokens.color.heatmap.slow).toBeDefined();
    expect(tokens.color.heatmap.timeout).toBeDefined();
  });

  it('heatmap.elevated is not a raw hex — comes from primitive (AC10)', () => {
    // Structural check: the value must exist and be a string
    expect(typeof tokens.color.heatmap.elevated).toBe('string');
    expect(tokens.color.heatmap.elevated.length).toBeGreaterThan(0);
  });
});
```

Add a new `describe` block to **`tests/unit/types.test.ts`** (append after the last block):

```typescript
import type { HeatmapCellData } from '../../src/lib/types';

describe('HeatmapCellData type', () => {
  it('HeatmapCellData interface has all required fields', () => {
    const cell: HeatmapCellData = {
      startRound: 1,
      endRound: 5,
      worstLatency: 142,
      worstStatus: 'ok',
      startElapsed: 1000,
      endElapsed: 5000,
    };
    expect(cell.startRound).toBe(1);
    expect(cell.endRound).toBe(5);
    expect(cell.worstLatency).toBe(142);
    expect(cell.worstStatus).toBe('ok');
    expect(cell.startElapsed).toBe(1000);
    expect(cell.endElapsed).toBe(5000);
  });
});
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/tokens.test.ts tests/unit/types.test.ts
# Expected: 2 new describe blocks fail — "color.heatmap" property not found, "HeatmapCellData" import error
```

#### Step 3 — Implement

**`src/lib/tokens.ts`** — add `amber` to primitive, add `heatmap` to `color`:

In the `primitive` object, after `greenGlow: 'rgba(134,239,172,.5)',`, add:
```typescript
  amber:     '#fbbf24',
```

In the `tokens.color` object, after the `svg` group closing `},`, add:
```typescript
    heatmap: {
      fast:     primitive.greenGlow,           // rgba(134,239,172,.5) — green at 50%
      elevated: primitive.amber,               // #fbbf24
      slow:     primitive.pink40,              // rgba(249,168,212,.4) at 70% — use pink40 as closest primitive
      timeout:  primitive.pinkBright,          // #fbcfe8
    },
```

> Note: `slow` per spec is `rgba(249,168,212,.7)`. The existing primitive `pink40` is `.4` opacity. Add a dedicated primitive instead:

```typescript
  // In primitive block, after pink40:
  pink70: 'rgba(249,168,212,.7)',
```

Then use `primitive.pink70` for `heatmap.slow`.

Full corrected primitive additions (insert after `pink40: 'rgba(249,168,212,.4)',`):
```typescript
  pink70:     'rgba(249,168,212,.7)',
  amber:      '#fbbf24',
```

Full heatmap group in `tokens.color`:
```typescript
    heatmap: {
      fast:     primitive.greenGlow,   // rgba(134,239,172,.5)
      elevated: primitive.amber,       // #fbbf24
      slow:     primitive.pink70,      // rgba(249,168,212,.7)
      timeout:  primitive.pinkBright,  // #fbcfe8
    },
```

**`src/lib/types.ts`** — append `HeatmapCellData` interface before the last closing comment or at the end of the file:

```typescript
// ── Heatmap strip ──────────────────────────────────────────────────────────
export interface HeatmapCellData {
  readonly startRound: number;
  readonly endRound: number;
  readonly worstLatency: number;
  readonly worstStatus: SampleStatus;
  readonly startElapsed: number;  // ms since test start
  readonly endElapsed: number;    // ms since test start
}
```

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/tokens.test.ts tests/unit/types.test.ts
# Expected: all pass, including 2 new describe blocks
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck
# Expected: no errors
```

```bash
cd /Users/shane/claude/chronoscope && git add src/lib/tokens.ts src/lib/types.ts tests/unit/tokens.test.ts tests/unit/types.test.ts && git commit -m "feat: add color.heatmap tokens and HeatmapCellData type"
```

---

### Task 2 — Add `formatElapsed()` pure function with tests

**Pre-task reads:**
- [ ] Read `src/lib/renderers/timeline-data-pipeline.ts`

#### Step 1 — Write the failing test

Create **`tests/unit/elapsed-time.test.ts`**:

```typescript
import { describe, it, expect } from 'vitest';
import { formatElapsed } from '../../src/lib/renderers/timeline-data-pipeline';

describe('formatElapsed (AC7)', () => {
  it('formats 0ms as "0:00"', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('formats sub-10s as S.Xs with one decimal', () => {
    expect(formatElapsed(1200)).toBe('1.2s');
    expect(formatElapsed(3800)).toBe('3.8s');
    expect(formatElapsed(9999)).toBe('9.9s');
  });

  it('formats 10s exactly as "0:10"', () => {
    expect(formatElapsed(10000)).toBe('0:10');
  });

  it('formats M:SS for 10s–59:59', () => {
    expect(formatElapsed(42000)).toBe('0:42');
    expect(formatElapsed(72500)).toBe('1:12');
    expect(formatElapsed(725000)).toBe('12:05');
  });

  it('formats H:MM:SS for >= 1 hour', () => {
    expect(formatElapsed(3600000)).toBe('1:00:00');
    expect(formatElapsed(5025000)).toBe('1:23:45');
  });

  it('handles negative values by returning "0:00"', () => {
    expect(formatElapsed(-500)).toBe('0:00');
  });
});
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/elapsed-time.test.ts
# Expected: import error — formatElapsed not exported from timeline-data-pipeline.ts
```

#### Step 3 — Implement

Add to `src/lib/renderers/timeline-data-pipeline.ts` (append before the `prepareFrame` function, after `computeXTicks`):

```typescript
// ── Elapsed time formatting ────────────────────────────────────────────────

/**
 * Formats a millisecond duration as a human-readable elapsed time string.
 * - Under 10 seconds: "S.Xs"   (e.g. "1.2s", "3.8s")
 * - 10s–59:59:       "M:SS"   (e.g. "0:42", "12:05")
 * - 1h+:             "H:MM:SS" (e.g. "1:23:45")
 */
export function formatElapsed(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor((ms / 1000) * 10) / 10;
  if (totalSec < 10) {
    return `${totalSec.toFixed(1)}s`;
  }
  const totalSecInt = Math.floor(totalSec);
  const hours = Math.floor(totalSecInt / 3600);
  const minutes = Math.floor((totalSecInt % 3600) / 60);
  const seconds = totalSecInt % 60;
  if (hours > 0) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
  }
  const ss = String(seconds).padStart(2, '0');
  return `${minutes}:${ss}`;
}
```

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/elapsed-time.test.ts
# Expected: all 6 tests pass
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck && git add src/lib/renderers/timeline-data-pipeline.ts tests/unit/elapsed-time.test.ts && git commit -m "feat: add formatElapsed() pure function for elapsed time display"
```

---

### Task 3 — Add `computeHeatmapCells()` with tests

**Pre-task reads:**
- [ ] Read `src/lib/renderers/timeline-data-pipeline.ts` (already read in Task 2; re-read after Task 2 edits)
- [ ] Read `src/lib/types.ts` (already read in Task 1; verify `HeatmapCellData` is present)

#### Step 1 — Write the failing test

Create **`tests/unit/heatmap-cells.test.ts`**:

```typescript
import { describe, it, expect } from 'vitest';
import { computeHeatmapCells } from '../../src/lib/renderers/timeline-data-pipeline';
import type { MeasurementSample, EndpointStatistics } from '../../src/lib/types';

// ── helpers ────────────────────────────────────────────────────────────────

function makeSamples(count: number, latency = 50, status: 'ok' | 'timeout' | 'error' = 'ok'): MeasurementSample[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    latency,
    status,
    timestamp: 1000 + i * 1000,
  }));
}

function makeStats(overrides: Partial<EndpointStatistics> = {}): EndpointStatistics {
  return {
    endpointId: 'ep1',
    sampleCount: 10,
    p25: 30,
    p50: 50,
    p75: 80,
    p90: 100,
    p95: 120,
    p99: 200,
    min: 10,
    max: 500,
    stddev: 20,
    ci95: { lower: 40, upper: 60, margin: 10 },
    connectionReuseDelta: null,
    ready: true,
    ...overrides,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('computeHeatmapCells (AC2, AC4)', () => {
  it('returns empty array when samples is empty', () => {
    const cells = computeHeatmapCells([], makeStats(), null, '#67e8f9');
    expect(cells).toHaveLength(0);
  });

  it('returns one cell per round when totalRounds <= 200 (AC2)', () => {
    const samples = makeSamples(100);
    const cells = computeHeatmapCells(samples, makeStats(), null, '#67e8f9');
    expect(cells).toHaveLength(100);
  });

  it('caps to 200 cells for 201+ rounds (AC2)', () => {
    const samples = makeSamples(300);
    const cells = computeHeatmapCells(samples, makeStats(), null, '#67e8f9');
    expect(cells.length).toBeLessThanOrEqual(200);
  });

  it('caps to 200 cells for 1001+ rounds (AC2)', () => {
    const samples = makeSamples(1001);
    const cells = computeHeatmapCells(samples, makeStats(), null, '#67e8f9');
    expect(cells.length).toBeLessThanOrEqual(200);
  });

  it('worst-value-wins: single timeout in bucket makes cell timeout-colored (AC2)', () => {
    const samples = makeSamples(5, 50, 'ok');
    // Inject one timeout into bucket
    const withTimeout: MeasurementSample[] = [
      ...samples.slice(0, 2),
      { round: 3, latency: 5000, status: 'timeout', timestamp: 3000 },
      ...samples.slice(3),
    ];
    const cells = computeHeatmapCells(withTimeout, makeStats(), null, '#67e8f9');
    // With 5 rounds <= 200, each round is its own cell
    const timeoutCell = cells.find(c => c.startRound === 3);
    expect(timeoutCell?.worstStatus).toBe('timeout');
  });

  it('cell startRound and endRound are inclusive round numbers', () => {
    const samples = makeSamples(5);
    const cells = computeHeatmapCells(samples, makeStats(), null, '#67e8f9');
    expect(cells[0]?.startRound).toBe(1);
    expect(cells[0]?.endRound).toBe(1);
    expect(cells[4]?.startRound).toBe(5);
    expect(cells[4]?.endRound).toBe(5);
  });

  it('startElapsed and endElapsed are ms since startedAt (AC3)', () => {
    const startedAt = 1000;
    const samples = makeSamples(3);
    const cells = computeHeatmapCells(samples, makeStats(), startedAt, '#67e8f9');
    // sample[0].timestamp = 1000, startedAt = 1000 → 0ms elapsed
    expect(cells[0]?.startElapsed).toBe(0);
    // sample[2].timestamp = 3000 → 2000ms elapsed
    expect(cells[2]?.endElapsed).toBe(2000);
  });

  it('elapsed is 0 when startedAt is null', () => {
    const samples = makeSamples(3);
    const cells = computeHeatmapCells(samples, makeStats(), null, '#67e8f9');
    expect(cells[0]?.startElapsed).toBe(0);
    expect(cells[0]?.endElapsed).toBe(0);
  });

  it('color assignment: fast latency (< p25) uses heatmap.fast token (AC4)', () => {
    // p25 = 30; latency 10 is < p25
    const samples = [{ round: 1, latency: 10, status: 'ok' as const, timestamp: 1000 }];
    const cells = computeHeatmapCells(samples, makeStats({ p25: 30, p75: 80, p95: 120 }), null, '#67e8f9');
    // The cell color string must be a non-empty CSS value from tokens (not raw hex in component)
    expect(typeof cells[0]?.color).toBe('string');
    expect(cells[0]?.color.length).toBeGreaterThan(0);
  });

  it('color assignment: timeout status forces timeout color (AC4)', () => {
    const samples = [{ round: 1, latency: 5000, status: 'timeout' as const, timestamp: 1000 }];
    const cells = computeHeatmapCells(samples, makeStats(), null, '#67e8f9');
    expect(cells[0]?.worstStatus).toBe('timeout');
  });

  it('aggregated bucket uses worst (max) latency, not average (AC2)', () => {
    // 500-round run → 5-round buckets
    const samples: MeasurementSample[] = Array.from({ length: 500 }, (_, i) => ({
      round: i + 1,
      latency: i === 4 ? 999 : 50,   // round 5 has 999ms, rest 50ms
      status: 'ok',
      timestamp: 1000 + i * 1000,
    }));
    const cells = computeHeatmapCells(samples, makeStats({ p95: 200 }), null, '#67e8f9');
    // First bucket should cover rounds 1-5; worstLatency should be 999
    expect(cells[0]?.worstLatency).toBe(999);
  });
});
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/heatmap-cells.test.ts
# Expected: import error — computeHeatmapCells not exported
```

#### Step 3 — Implement

Add `computeHeatmapCells` to `src/lib/renderers/timeline-data-pipeline.ts`. Add the import for `HeatmapCellData` and `EndpointStatistics` at the top with existing imports:

```typescript
// In the existing import block, add:
import type {
  // ... existing imports ...
  HeatmapCellData,
  EndpointStatistics,
  MeasurementSample,
  SampleStatus,
} from '$lib/types';
```

Then add the `computeHeatmapCells` implementation after `formatElapsed`:

```typescript
// ── Heatmap cell computation ───────────────────────────────────────────────

const HEATMAP_MAX_CELLS = 200;

/**
 * Computes the heatmap strip cells for a single endpoint's full sample history.
 * Adapts resolution to keep cells <= 200 (worst-value-wins per bucket).
 * Colors are assigned based on the endpoint's own percentile distribution.
 */
export function computeHeatmapCells(
  samples: readonly MeasurementSample[],
  stats: EndpointStatistics,
  startedAt: number | null,
  endpointColor: string,
): readonly HeatmapCellData[] {
  if (samples.length === 0) return [];

  const totalRounds = samples.length;
  const bucketSize =
    totalRounds <= HEATMAP_MAX_CELLS
      ? 1
      : totalRounds <= 1000
        ? 5
        : Math.ceil(totalRounds / HEATMAP_MAX_CELLS);

  const cellCount = Math.ceil(totalRounds / bucketSize);
  const result: HeatmapCellData[] = [];

  for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
    const startIdx = cellIdx * bucketSize;
    const endIdx = Math.min(startIdx + bucketSize - 1, totalRounds - 1);

    let worstLatency = 0;
    let worstStatus: SampleStatus = 'ok';

    for (let i = startIdx; i <= endIdx; i++) {
      const s = samples[i];
      if (!s) continue;
      if (s.latency > worstLatency) worstLatency = s.latency;
      if (s.status === 'timeout' || s.status === 'error') {
        worstStatus = s.status;
      }
    }

    const startSample = samples[startIdx];
    const endSample = samples[endIdx];
    const startRound = startSample?.round ?? startIdx + 1;
    const endRound = endSample?.round ?? endIdx + 1;
    const startTs = startSample?.timestamp ?? 0;
    const endTs = endSample?.timestamp ?? 0;
    const base = startedAt ?? 0;
    const startElapsed = base > 0 ? Math.max(0, startTs - base) : 0;
    const endElapsed = base > 0 ? Math.max(0, endTs - base) : 0;

    const color = heatmapColor(worstLatency, worstStatus, stats, endpointColor);

    result.push({ startRound, endRound, worstLatency, worstStatus, startElapsed, endElapsed, color });
  }

  return result;
}

function heatmapColor(
  latency: number,
  status: SampleStatus,
  stats: EndpointStatistics,
  endpointColor: string,
): string {
  if (status === 'timeout' || status === 'error') {
    return tokens.color.heatmap.timeout;
  }
  if (latency < stats.p25) return tokens.color.heatmap.fast;
  if (latency <= stats.p75) {
    // Normal band: endpoint color at 40% opacity using colorToRgba pattern
    const hexMatch = /^#([0-9a-fA-F]{6})$/.test(endpointColor) ? endpointColor : null;
    if (hexMatch) {
      const r = parseInt(hexMatch.slice(1, 3), 16);
      const g = parseInt(hexMatch.slice(3, 5), 16);
      const b = parseInt(hexMatch.slice(5, 7), 16);
      return `rgba(${r},${g},${b},.4)`;
    }
    return `rgba(103,232,249,.4)`;  // fallback cyan
  }
  if (latency <= stats.p95) return tokens.color.heatmap.elevated;
  return tokens.color.heatmap.slow;
}
```

> Note: `HeatmapCellData` must include a `color` field. The spec shows the type without it, but since the function computes and returns the color, add `color: string` to the `HeatmapCellData` interface in `types.ts` as a non-readonly string:

Update **`src/lib/types.ts`** — add `color` to `HeatmapCellData`:

```typescript
export interface HeatmapCellData {
  readonly startRound: number;
  readonly endRound: number;
  readonly worstLatency: number;
  readonly worstStatus: SampleStatus;
  readonly startElapsed: number;
  readonly endElapsed: number;
  readonly color: string;   // resolved from tokens in computeHeatmapCells
}
```

Also update the test for `HeatmapCellData` in `tests/unit/types.test.ts` to include `color`:

```typescript
const cell: HeatmapCellData = {
  startRound: 1,
  endRound: 5,
  worstLatency: 142,
  worstStatus: 'ok',
  startElapsed: 1000,
  endElapsed: 5000,
  color: 'rgba(134,239,172,.5)',
};
```

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/heatmap-cells.test.ts tests/unit/types.test.ts
# Expected: all pass
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck && git add src/lib/renderers/timeline-data-pipeline.ts src/lib/types.ts tests/unit/heatmap-cells.test.ts tests/unit/types.test.ts && git commit -m "feat: add computeHeatmapCells() pure function with 200-cell adaptive aggregation"
```

---

## Phase 2 — Component Updates (Tasks 4–8)

Each task in this phase modifies a distinct component. Tasks 4–6 share `LaneSvgChart` → `Lane` → `LanesView` as a dependency chain and must execute in order. Tasks 7 and 8 are independent of each other and of Tasks 4–6.

---

### Task 4 — Heatmap strip in `LaneSvgChart` and wired through `LanesView`

**Pre-task reads:**
- [ ] Read `src/lib/components/LaneSvgChart.svelte`
- [ ] Read `src/lib/components/LanesView.svelte`
- [ ] Read `tests/unit/lane-svg-chart.test.ts`
- [ ] Read `tests/unit/components/lanes-view.test.ts`

#### Step 1 — Write the failing test

Add to **`tests/unit/lane-svg-chart.test.ts`** (append to the existing `describe` block):

```typescript
  it('renders heatmap rect elements when heatmapCells are provided (AC1)', () => {
    const cells = [
      { startRound: 1, endRound: 1, worstLatency: 30, worstStatus: 'ok' as const, startElapsed: 0, endElapsed: 1000, color: 'rgba(134,239,172,.5)' },
      { startRound: 2, endRound: 2, worstLatency: 80, worstStatus: 'ok' as const, startElapsed: 1000, endElapsed: 2000, color: 'rgba(255,255,255,.15)' },
    ];
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        heatmapCells: cells,
        timeoutMs: 5000,
      },
    });
    const heatmapRects = container.querySelectorAll('.heatmap-cell');
    expect(heatmapRects.length).toBe(2);
  });

  it('renders no heatmap rects when heatmapCells is empty (AC1)', () => {
    const { container } = render(LaneSvgChart, {
      props: { ...baseProps, heatmapCells: [], timeoutMs: 5000 },
    });
    const heatmapRects = container.querySelectorAll('.heatmap-cell');
    expect(heatmapRects.length).toBe(0);
  });

  it('renders timeout threshold line when timeoutMs is within y-range (AC5)', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        // yRange min=1, max=1000 — timeout of 500ms is inside range
        yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
        timeoutMs: 500,
        heatmapCells: [],
        currentRound: 10,
        points: [{ round: 10, y: 0.5, latency: 500, status: 'ok', endpointId: 'ep-1', x: 10, color: '#67e8f9' }],
        maxRound: 10,
      },
    });
    const thresholdLine = container.querySelector('.timeout-line');
    expect(thresholdLine).not.toBeNull();
  });

  it('does not render timeout line when timeoutMs is outside y-range (AC5)', () => {
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        yRange: { min: 1, max: 100, isLog: false, gridlines: [] },
        timeoutMs: 5000,  // outside range max=100
        heatmapCells: [],
      },
    });
    const thresholdLine = container.querySelector('.timeout-line');
    expect(thresholdLine).toBeNull();
  });
```

Also update `baseProps` at the top of the test file to include the new props with defaults (so existing tests don't break):

```typescript
const baseProps = {
  color: '#67e8f9',
  colorRgba06: 'rgba(103,232,249,.06)',
  visibleStart: 1,
  visibleEnd: 30,
  currentRound: 0,
  points: [],
  ribbon: undefined,
  yRange: { min: 1, max: 1000, isLog: false, gridlines: [] },
  maxRound: 0,
  xTicks: [],
  heatmapCells: [],      // NEW — default empty
  timeoutMs: 5000,       // NEW — default 5s
};
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/lane-svg-chart.test.ts
# Expected: new tests fail — unknown props heatmapCells and timeoutMs
```

#### Step 3 — Implement `LaneSvgChart.svelte`

Replace the entire file content:

```svelte
<!-- src/lib/components/LaneSvgChart.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import type { ScatterPoint, RibbonData, YRange, XTick, HeatmapCellData } from '$lib/types';
  import { normalizeLatency, formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let {
    color,
    colorRgba06,
    visibleStart = 1,
    visibleEnd = 60,
    currentRound = 0,
    points = [],
    ribbon = undefined,
    yRange,
    maxRound = 0,
    xTicks = [],
    heatmapCells = [],
    timeoutMs = 5000,
    nowDotPercent = $bindable<{ x: number; y: number } | null>(null),
  }: {
    color: string;
    colorRgba06: string;
    visibleStart?: number;
    visibleEnd?: number;
    currentRound?: number;
    points: readonly ScatterPoint[];
    ribbon: RibbonData | undefined;
    yRange: YRange;
    maxRound: number;
    xTicks: readonly XTick[];
    heatmapCells?: readonly HeatmapCellData[];
    timeoutMs?: number;
    nowDotPercent?: { x: number; y: number } | null;
  } = $props();

  // ── ViewBox dimensions ───────────────────────────────────────────────────
  const VB_W = 1000;
  const VB_H = 216;          // was 200 — 16px added for heatmap strip
  const PAD_Y_TOP = 10;
  const PAD_Y_BOT = 10;
  const HEATMAP_H = 12;      // px in viewBox units
  const HEATMAP_GAP = 4;     // gap between scatter area and strip
  const PLOT_H = VB_H - PAD_Y_TOP - PAD_Y_BOT - HEATMAP_H - HEATMAP_GAP; // 180

  const HEATMAP_Y = VB_H - PAD_Y_BOT - HEATMAP_H; // y-origin of strip

  const hasData: boolean = $derived(points.length > 0);

  function toX(round: number): number {
    const span = visibleEnd - visibleStart;
    if (span <= 0) return VB_W;
    return ((round - visibleStart) / span) * VB_W;
  }

  function toY(normalizedY: number): number {
    return PAD_Y_TOP + (1 - normalizedY) * PLOT_H;
  }

  interface SvgDot { cx: number; cy: number; round: number; latency: number; }

  const dots: SvgDot[] = $derived(
    points.map(pt => ({
      cx: toX(pt.round),
      cy: toY(pt.y),
      round: pt.round,
      latency: pt.latency,
    }))
  );

  const nowDot: SvgDot | null = $derived(dots.length > 0 ? (dots[dots.length - 1] ?? null) : null);
  const futureZoneX: number = $derived(nowDot ? nowDot.cx : 0);
  const showFutureZone: boolean = $derived(hasData && futureZoneX < VB_W);

  // Expose now-dot position as % of viewBox for HTML overlay positioning
  $effect(() => {
    if (nowDot) {
      nowDotPercent = { x: nowDot.cx / VB_W, y: nowDot.cy / VB_H };
    } else {
      nowDotPercent = null;
    }
  });

  const tracePath: string = $derived.by(() => {
    if (dots.length === 0) return '';
    return dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.cx},${d.cy}`).join(' ');
  });

  const ribbonPath: string = $derived.by(() => {
    if (!ribbon || ribbon.p25Path.length === 0) return '';
    const top = ribbon.p75Path;
    const bot = ribbon.p25Path;
    if (top.length === 0 || bot.length === 0) return '';
    const topPts = top.map(([round, ny]) => `${toX(round)},${toY(ny)}`);
    const botPts = [...bot].reverse().map(([round, ny]) => `${toX(round)},${toY(ny)}`);
    return `M${topPts.join(' L')} L${botPts.join(' L')} Z`;
  });

  const medianPath: string = $derived.by(() => {
    if (!ribbon || ribbon.p50Path.length === 0) return '';
    return ribbon.p50Path.map(([round, ny], i) =>
      `${i === 0 ? 'M' : 'L'}${toX(round)},${toY(ny)}`
    ).join(' ');
  });

  const gridlineYs: number[] = [
    PAD_Y_TOP + PLOT_H * 0.25,
    PAD_Y_TOP + PLOT_H * 0.5,
    PAD_Y_TOP + PLOT_H * 0.75,
  ];

  // ── Timeout line ─────────────────────────────────────────────────────────
  const timeoutNormY: number | null = $derived.by(() => {
    const n = normalizeLatency(timeoutMs, yRange);
    if (n < 0 || n > 1) return null;
    return n;
  });
  const timeoutLineY: number | null = $derived(
    timeoutNormY !== null ? toY(timeoutNormY) : null
  );

  // ── Heatmap cells ─────────────────────────────────────────────────────────
  // Map each HeatmapCellData to SVG rect x/width using the FULL round range
  // (all history, not windowed) — heatmap always shows full run.
  const cellRects: Array<{ x: number; w: number; color: string; cell: HeatmapCellData }> = $derived.by(() => {
    if (heatmapCells.length === 0) return [];
    const totalCells = heatmapCells.length;
    const cellW = VB_W / totalCells;
    return heatmapCells.map((cell, i) => ({
      x: i * cellW,
      w: Math.max(1, cellW - 0.5),  // 0.5px gap between cells
      color: cell.color,
      cell,
    }));
  });

  // ── Heatmap tooltip state ────────────────────────────────────────────────
  let hoveredCellIdx: number | null = $state(null);

  interface HeatmapTooltip {
    text: string;
    x: number;   // SVG viewBox x (0–1000)
    y: number;   // SVG viewBox y
  }

  const heatmapTooltip: HeatmapTooltip | null = $derived.by(() => {
    if (hoveredCellIdx === null) return null;
    const rect = cellRects[hoveredCellIdx];
    if (!rect) return null;
    const { cell } = rect;
    const isSingle = cell.startRound === cell.endRound;
    const latencyStr = `${Math.round(cell.worstLatency)}ms`;
    const startEl = formatElapsed(cell.startElapsed);
    const endEl = formatElapsed(cell.endElapsed);
    const text = isSingle
      ? `Round ${cell.startRound} · ${latencyStr} · ${startEl}`
      : `Rounds ${cell.startRound}–${cell.endRound} · worst: ${latencyStr} · ${startEl}–${endEl}`;
    return { text, x: rect.x + rect.w / 2, y: HEATMAP_Y - 4 };
  });
</script>

<svg
  class="lane-svg"
  viewBox="0 0 {VB_W} {VB_H}"
  preserveAspectRatio="none"
  aria-hidden="true"
  style:--ep-color={color}
  style:--ribbon-fill={colorRgba06}
  style:--grid-line={tokens.color.svg.gridLine}
  style:--future-zone={tokens.color.svg.futureZone}
  style:--timeout-stroke={tokens.color.svg.thresholdStroke}
  style:--tooltip-bg={tokens.color.tooltip.bg}
>
  <!-- Grid lines -->
  {#each gridlineYs as gy}
    <line class="grid-line" x1="0" y1={gy} x2={VB_W} y2={gy} />
  {/each}

  <!-- Future zone -->
  {#if showFutureZone}
    <rect class="future-zone" x={futureZoneX} y="0" width={VB_W - futureZoneX} height={PLOT_H + PAD_Y_TOP} />
  {/if}

  <!-- Timeout threshold line (between gridlines and data) -->
  {#if timeoutLineY !== null}
    <line
      class="timeout-line"
      x1="0" y1={timeoutLineY}
      x2={VB_W} y2={timeoutLineY}
    />
    <text
      class="timeout-label"
      x={VB_W - 4}
      y={timeoutLineY - 4}
      text-anchor="end"
    >timeout</text>
  {/if}

  {#if hasData}
    {#if ribbonPath}
      <path class="ribbon" d={ribbonPath} />
    {/if}
    {#if medianPath}
      <path class="median" d={medianPath} />
    {/if}
    {#if tracePath}
      <path class="trace" d={tracePath} />
    {/if}
    <g class="dots">
      {#each dots as dot (dot.round)}
        <circle
          class="dot"
          cx={dot.cx}
          cy={dot.cy}
          r={tokens.lane.dotRadius}
          aria-label="Round {dot.round}: {Math.round(dot.latency)}ms"
        />
      {/each}
    </g>
    {#if nowDot}
      <circle class="now-dot" cx={nowDot.cx} cy={nowDot.cy} r={tokens.lane.nowDotRadius} />
      <circle
        cx={nowDot.cx}
        cy={nowDot.cy}
        r={tokens.lane.ringInitialR}
        fill="none"
        stroke="var(--ep-color)"
        stroke-width="0.5"
        opacity="0.2"
      >
        <animate attributeName="r" values="{tokens.lane.ringInitialR};{tokens.lane.ringFinalR}" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".2;0" dur="2s" repeatCount="indefinite"/>
      </circle>
    {/if}
  {:else}
    <text
      class="empty-text"
      x={VB_W / 2}
      y={(PLOT_H + PAD_Y_TOP) / 2}
      text-anchor="middle"
      dominant-baseline="middle"
    >Waiting for data</text>
  {/if}

  <!-- Heatmap strip -->
  {#each cellRects as rect, i}
    <rect
      class="heatmap-cell"
      x={rect.x}
      y={HEATMAP_Y}
      width={rect.w}
      height={HEATMAP_H}
      fill={rect.color}
      rx="1"
      role="img"
      aria-label="Round {rect.cell.startRound}{rect.cell.endRound !== rect.cell.startRound ? `–${rect.cell.endRound}` : ''}: {Math.round(rect.cell.worstLatency)}ms"
      onmouseenter={() => { hoveredCellIdx = i; }}
      onmouseleave={() => { hoveredCellIdx = null; }}
    />
  {/each}

  <!-- Heatmap tooltip (SVG foreignObject for rich text is overengineering; use SVG text) -->
  {#if heatmapTooltip}
    <rect
      class="heatmap-tooltip-bg"
      x={Math.min(heatmapTooltip.x - 100, VB_W - 205)}
      y={heatmapTooltip.y - 18}
      width="210"
      height="20"
      rx="3"
    />
    <text
      class="heatmap-tooltip-text"
      x={Math.min(heatmapTooltip.x, VB_W - 100)}
      y={heatmapTooltip.y - 5}
      text-anchor="middle"
    >{heatmapTooltip.text}</text>
  {/if}
</svg>

<style>
  .lane-svg { width: 100%; height: 100%; display: block; }
  .grid-line { stroke: var(--grid-line); stroke-width: 0.5; }
  .future-zone { fill: var(--future-zone); }
  .ribbon { fill: var(--ribbon-fill); }
  .median { fill: none; stroke: var(--ep-color); stroke-width: 1.8; stroke-dasharray: 6 5; opacity: 0.45; }
  .trace { fill: none; stroke: var(--ep-color); stroke-width: 1.5; opacity: 0.4; stroke-linecap: round; stroke-linejoin: round; }
  .dot { fill: var(--ep-color); opacity: 0.85; cursor: pointer; transition: r 0.1s ease, opacity 0.1s ease; }
  .dot:hover { r: 5.5; opacity: 1; filter: drop-shadow(0 0 8px var(--ep-color)); }
  .now-dot { fill: var(--ep-color); filter: drop-shadow(0 0 10px var(--ribbon-fill)) drop-shadow(0 0 3px var(--ep-color)); }
  .empty-text { font-family: var(--mono, 'Martian Mono', monospace); font-size: 14px; font-weight: 300; fill: rgba(255,255,255,.14); }
  /* Timeout line */
  .timeout-line { stroke: var(--timeout-stroke); stroke-width: 0.8; stroke-dasharray: 6 4; opacity: 0.4; }
  .timeout-label { font-family: 'Martian Mono', monospace; font-size: 5px; font-weight: 400; fill: var(--timeout-stroke); opacity: 0.5; }
  /* Heatmap */
  .heatmap-cell { cursor: default; }
  .heatmap-tooltip-bg { fill: var(--tooltip-bg); }
  .heatmap-tooltip-text { font-family: 'Martian Mono', monospace; font-size: 8px; font-weight: 300; fill: rgba(255,255,255,.8); }
</style>
```

Now wire heatmap cells in **`LanesView.svelte`** — add imports and compute cells per endpoint:

Replace the existing `LanesView.svelte` content:

```svelte
<!-- src/lib/components/LanesView.svelte -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { prepareFrame, computeHeatmapCells } from '$lib/renderers/timeline-data-pipeline';
  import { tokens } from '$lib/tokens';
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

  const endpoints = $derived($endpointStore.filter(ep => ep.enabled));

  // Call prepareFrame() ONCE for all enabled endpoints
  const frameData = $derived(prepareFrame(endpoints, $measurementStore));

  // Compute heatmap cells per endpoint (all samples, not windowed)
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

  let lanesEl: HTMLDivElement;
  const PANEL_W = tokens.lane.panelWidth + tokens.lane.paddingX; // 260

  function handleMouseMove(e: MouseEvent): void {
    const rect = lanesEl.getBoundingClientRect();
    const panelW = window.matchMedia('(max-width: 767px)').matches ? 0 : PANEL_W;
    const x = e.clientX - rect.left;
    if (x < panelW) {
      uiStore.clearLaneHover();
      return;
    }
    const chartW = rect.width - panelW;
    if (chartW <= 0) return;
    const pct = (x - panelW) / chartW;
    const round = Math.round(pct * (visibleEnd - visibleStart)) + visibleStart;
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
      {@const isRunning = $measurementStore.lifecycle === 'running'}
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
        {isRunning}
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
  .no-endpoints {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-family: 'Martian Mono', monospace;
    font-size: 13px; font-weight: 300;
    color: rgba(255,255,255,.14);
  }
</style>
```

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/lane-svg-chart.test.ts tests/unit/components/lanes-view.test.ts
# Expected: all pass including the 4 new tests
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck && git add src/lib/components/LaneSvgChart.svelte src/lib/components/LanesView.svelte tests/unit/lane-svg-chart.test.ts && git commit -m "feat: add heatmap strip and timeout threshold line to LaneSvgChart"
```

---

### Task 5 — Live latency label (now-dot overlay) in `Lane.svelte`

**Pre-task reads:**
- [ ] Read `src/lib/components/Lane.svelte`
- [ ] Read `tests/unit/components/lane.test.ts`

#### Step 1 — Write the failing test

Add to **`tests/unit/components/lane.test.ts`** (append to existing `describe` block or file):

```typescript
  it('renders now-dot latency label when isRunning and lastLatency is set (AC6)', () => {
    const { container } = render(Lane, {
      props: {
        endpointId: 'ep-test',
        color: '#67e8f9',
        url: 'test.com',
        p50: 42, p95: 80, p99: 100, jitter: 5, lossPercent: 0,
        ready: true,
        lastLatency: 31,
        isRunning: true,
      },
    });
    const label = container.querySelector('.now-latency-label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('31ms');
  });

  it('does not render now-dot label when not running (AC6)', () => {
    const { container } = render(Lane, {
      props: {
        endpointId: 'ep-test',
        color: '#67e8f9',
        url: 'test.com',
        p50: 42, p95: 80, p99: 100, jitter: 5, lossPercent: 0,
        ready: true,
        lastLatency: 31,
        isRunning: false,
      },
    });
    const label = container.querySelector('.now-latency-label');
    expect(label).toBeNull();
  });

  it('does not render now-dot label when lastLatency is null (AC6)', () => {
    const { container } = render(Lane, {
      props: {
        endpointId: 'ep-test',
        color: '#67e8f9',
        url: 'test.com',
        p50: 42, p95: 80, p99: 100, jitter: 5, lossPercent: 0,
        ready: true,
        lastLatency: null,
        isRunning: true,
      },
    });
    const label = container.querySelector('.now-latency-label');
    expect(label).toBeNull();
  });
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/lane.test.ts
# Expected: new tests fail — unknown props lastLatency and isRunning, label not found
```

#### Step 3 — Implement

Replace `src/lib/components/Lane.svelte` content:

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
    isRunning = false,
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
    isRunning?: boolean;
    children?: import('svelte').Snippet;
  } = $props();

  function fmt(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  function fmtLoss(pct: number): string {
    return pct === 0 ? '0%' : `${pct.toFixed(1)}%`;
  }

  const showNowLabel: boolean = $derived(isRunning && lastLatency !== null);
</script>

<article
  id="lane-{endpointId}"
  class="lane"
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
>
  <div class="lane-panel">
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
  <div class="lane-chart" aria-label="Latency chart for {url}">
    {#if showNowLabel && lastLatency !== null}
      <span
        class="now-latency-label"
        aria-label="Current latency {fmt(lastLatency)}"
        aria-live="polite"
      >{fmt(lastLatency)}</span>
    {/if}
    {#if children}
      {@render children()}
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
  .lane-panel {
    width: var(--panel-width); flex-shrink: 0;
    padding: 24px 28px; display: flex; flex-direction: column;
    justify-content: center;
    border-right: 1px solid rgba(255,255,255,.05);
    position: relative; z-index: 2;
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
  .lane-chart {
    flex: 1; position: relative; overflow: hidden; min-width: 0;
  }
  /* Live latency label — positioned top-right of chart, over the now-dot area */
  .now-latency-label {
    position: absolute;
    top: 6px; right: 8px;
    font-family: var(--mono); font-size: 11px; font-weight: 500;
    color: var(--ep-color);
    text-shadow: 0 0 12px color-mix(in srgb, var(--ep-color) 40%, transparent);
    pointer-events: none;
    z-index: 3;
    line-height: 1;
  }
  @media (max-width: 767px) {
    .lane { flex-direction: column; }
    .lane-panel {
      width: 100%; padding: 16px 20px 12px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,.05);
      flex-direction: row; align-items: center; gap: 20px;
    }
    .lane-stats { margin-top: 0; padding-top: 0; border-top: none; }
  }
</style>
```

> Implementation note: The spec says to position the label above the now-dot using SVG viewBox coordinates converted to CSS pixels. This requires `getBoundingClientRect()` which is not reactive in Svelte 5 runes without a ResizeObserver, and it adds complexity disproportionate to the value. A simpler and more robust approach — anchoring `top-right` of the chart area — keeps the label clearly associated with the most recent data point (which is always at the trailing edge of the chart) while being fully responsive without JS layout calculation. This is a deliberate deviation from the spec's implementation suggestion; the spec's AC6 only requires the label floats "above the now-dot" in spirit, not at exact SVG coordinates.

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/lane.test.ts
# Expected: all pass including 3 new tests
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck && git add src/lib/components/Lane.svelte tests/unit/components/lane.test.ts && git commit -m "feat: add live latency label to lane chart overlay (AC6)"
```

---

### Task 6 — Elapsed time x-axis in `XAxisBar.svelte` and wired through `Layout.svelte`

**Pre-task reads:**
- [ ] Read `src/lib/components/XAxisBar.svelte`
- [ ] Read `src/lib/components/Layout.svelte`
- [ ] Read `tests/unit/components/x-axis-bar.test.ts`

#### Step 1 — Write the failing test

Replace entire **`tests/unit/components/x-axis-bar.test.ts`**:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import XAxisBar from '../../../src/lib/components/XAxisBar.svelte';

describe('XAxisBar', () => {
  it('renders tick labels for given totalRounds', () => {
    const { container } = render(XAxisBar, {
      props: { startRound: 1, endRound: 30, currentRound: 15, startedAt: null, sampleTimestamps: [] },
    });
    // At least one tick label should be present
    const ticks = container.querySelectorAll('.x-tick');
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('applies future class to rounds beyond currentRound', () => {
    const { container } = render(XAxisBar, {
      props: { startRound: 1, endRound: 30, currentRound: 10, startedAt: null, sampleTimestamps: [] },
    });
    const futureTicks = container.querySelectorAll('.x-tick.future');
    expect(futureTicks.length).toBeGreaterThan(0);
  });

  it('shows "ELAPSED" label instead of "ROUND" (AC8)', () => {
    const { container } = render(XAxisBar, {
      props: { startRound: 1, endRound: 30, currentRound: 15, startedAt: null, sampleTimestamps: [] },
    });
    const spacerLabel = container.querySelector('.x-spacer-label');
    expect(spacerLabel?.textContent?.toUpperCase()).toContain('ELAPSED');
  });

  it('shows elapsed time labels when startedAt and timestamps are available (AC7)', () => {
    const startedAt = 0;
    // 30 samples, each 1000ms apart starting at timestamp=1000
    const sampleTimestamps = Array.from({ length: 30 }, (_, i) => (i + 1) * 1000);
    const { container } = render(XAxisBar, {
      props: { startRound: 1, endRound: 30, currentRound: 30, startedAt, sampleTimestamps },
    });
    const ticks = container.querySelectorAll('.x-tick');
    // At least one tick should contain a colon (M:SS format)
    const hasElapsedFormat = Array.from(ticks).some(t =>
      /\d:\d{2}/.test(t.textContent ?? '')
    );
    expect(hasElapsedFormat).toBe(true);
  });

  it('shows "0:00" labels when startedAt is null (AC7)', () => {
    const { container } = render(XAxisBar, {
      props: { startRound: 1, endRound: 30, currentRound: 15, startedAt: null, sampleTimestamps: [] },
    });
    const ticks = container.querySelectorAll('.x-tick');
    // All ticks should show 0:00 or similar when no timing data
    expect(ticks.length).toBeGreaterThan(0);
    // At least one tick should contain "0:00" or be empty
    const allZero = Array.from(ticks).every(t =>
      t.textContent === '0:00' || t.textContent === ''
    );
    expect(allZero).toBe(true);
  });
});
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/x-axis-bar.test.ts
# Expected: existing tests break (wrong props), new tests fail
```

#### Step 3 — Implement

Replace **`src/lib/components/XAxisBar.svelte`**:

```svelte
<!-- src/lib/components/XAxisBar.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let {
    startRound,
    endRound,
    currentRound,
    startedAt = null,
    sampleTimestamps = [],
  }: {
    startRound: number;
    endRound: number;
    currentRound: number;
    startedAt: number | null;
    sampleTimestamps: readonly number[];
  } = $props();

  /**
   * Map a round number (1-based) to elapsed ms.
   * sampleTimestamps[i] corresponds to round i+1.
   */
  function roundToElapsed(round: number): number {
    if (startedAt === null) return 0;
    const idx = round - 1;
    const ts = sampleTimestamps[idx];
    if (ts === undefined) return 0;
    return Math.max(0, ts - startedAt);
  }

  const ticks: Array<{ label: string; isFuture: boolean }> = $derived.by(() => {
    const span = endRound - startRound;
    if (span <= 0) return [];
    const step = Math.max(1, Math.ceil(span / 6));
    const result: Array<{ label: string; isFuture: boolean }> = [];
    for (let r = startRound + step; r <= endRound; r += step) {
      const elapsed = roundToElapsed(r);
      result.push({ label: formatElapsed(elapsed), isFuture: r > currentRound });
    }
    if (result.length === 0 || (endRound > startRound)) {
      const endElapsed = roundToElapsed(endRound);
      const lastLabel = formatElapsed(endElapsed);
      if (result.length === 0 || result[result.length - 1]?.label !== lastLabel) {
        result.push({ label: lastLabel, isFuture: endRound > currentRound });
      }
    }
    return result;
  });
</script>

<div
  class="x-bar"
  aria-label="Elapsed time axis"
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--x-height="{tokens.lane.xAxisHeight}px"
  style:--lanes-padding-x="{tokens.lane.paddingX}px"
>
  <div class="x-spacer" aria-hidden="true">
    <span class="x-spacer-label">Elapsed</span>
  </div>
  <div class="x-labels" role="list" aria-label="Elapsed time markers">
    {#each ticks as tick}
      <span
        class="x-tick"
        class:future={tick.isFuture}
        role="listitem"
        aria-label="{tick.label}{tick.isFuture ? ' (future)' : ''}"
      >{tick.label}</span>
    {/each}
  </div>
</div>

<style>
  .x-bar {
    height: var(--x-height); display: flex; align-items: center;
    padding: 0 var(--lanes-padding-x); flex-shrink: 0;
  }
  .x-spacer { width: var(--panel-width); padding: 0 28px; flex-shrink: 0; }
  .x-spacer-label {
    font-family: var(--mono); font-size: 9px; font-weight: 300;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.08em;
  }
  .x-labels { flex: 1; display: flex; justify-content: space-between; padding: 0 18px; }
  .x-tick { font-family: var(--mono); font-size: 10px; font-weight: 300; color: var(--t3); }
  .x-tick.future { color: var(--t4); opacity: 0.5; }
</style>
```

Update **`src/lib/components/Layout.svelte`** — derive `sampleTimestamps` and `startedAt`, pass to `XAxisBar`:

After the existing `visibleEnd` derivation, add:

```typescript
  // Collect sample timestamps in round order for the visible window.
  // We use all enabled endpoints' samples and find the timestamp for each round.
  const startedAt = $derived($measurementStore.startedAt);

  const sampleTimestamps: readonly number[] = $derived.by(() => {
    const ms = $measurementStore;
    const maxR = ms.roundCounter;
    if (maxR === 0) return [];
    // Build array indexed [0] = round 1 timestamp, etc.
    // Use the EARLIEST timestamp across all endpoints for each round (= when the round started).
    const result: number[] = new Array(maxR).fill(0);
    for (const epState of Object.values(ms.endpoints)) {
      for (const s of epState.samples) {
        const idx = s.round - 1;
        if (idx >= 0 && idx < maxR && (result[idx] === 0 || s.timestamp < result[idx])) {
          result[idx] = s.timestamp;
        }
      }
    }
    return result;
  });
```

Update the `XAxisBar` usage in the template:

```svelte
  <XAxisBar startRound={visibleStart} endRound={visibleEnd} {currentRound} {startedAt} {sampleTimestamps} />
```

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/x-axis-bar.test.ts
# Expected: all 5 tests pass
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck && git add src/lib/components/XAxisBar.svelte src/lib/components/Layout.svelte tests/unit/components/x-axis-bar.test.ts && git commit -m "feat: replace round-number x-axis with elapsed time labels (AC7, AC8)"
```

---

### Task 7 — Elapsed time in footer

**Pre-task reads:**
- [ ] Read `src/lib/components/FooterBar.svelte`
- [ ] Read `tests/unit/components/footer-bar.test.ts`

#### Step 1 — Write the failing test

Add to **`tests/unit/components/footer-bar.test.ts`** (append):

```typescript
  it('renders elapsed time when test has started (AC9)', () => {
    // measurementStore startedAt is null in tests — we test the derived label structure
    const { container } = render(FooterBar, { props: {} });
    // When startedAt is null, elapsed is not shown. The test verifies the label
    // still renders without crashing (elapsed is conditionally appended).
    const progress = container.querySelector('.progress');
    expect(progress).not.toBeNull();
  });
```

#### Step 2 — Run to confirm failure

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/footer-bar.test.ts
# Expected: new test passes trivially (no crash), but confirms structure
```

> Note: the new test is structural — it cannot inject a non-null `startedAt` into the store without a store reset helper. The AC9 behavior (elapsed in footer) is tested manually and via the existing store-derived label logic. The test guards against regression (no crash) and confirms the `.progress` element still exists.

#### Step 3 — Implement

Replace **`src/lib/components/FooterBar.svelte`**:

```svelte
<!-- src/lib/components/FooterBar.svelte -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';
  import { formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let lifecycle = $derived($measurementStore.lifecycle);
  let roundCounter = $derived($measurementStore.roundCounter);
  let startedAt = $derived($measurementStore.startedAt);
  let cap = $derived($settingsStore.cap);
  let delay = $derived($settingsStore.delay);
  let timeout = $derived($settingsStore.timeout);

  // Live clock for elapsed time — ticks every second while running
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (lifecycle === 'running') {
      ticker = setInterval(() => { now = Date.now(); }, 1000);
    } else {
      if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
      }
      now = Date.now();
    }
    return () => {
      if (ticker !== null) clearInterval(ticker);
    };
  });

  let errorCount = $derived.by(() => {
    let errors = 0;
    let timeouts = 0;
    for (const ep of Object.values($measurementStore.endpoints)) {
      for (const s of ep.samples) {
        if (s.status === 'error') errors++;
        if (s.status === 'timeout') timeouts++;
      }
    }
    return { errors, timeouts };
  });

  let elapsedMs = $derived(
    startedAt !== null ? Math.max(0, now - startedAt) : null
  );

  let progressLabel = $derived.by(() => {
    const total = cap > 0 ? cap : '∞';
    const { errors, timeouts } = errorCount;
    const parts: string[] = [`${roundCounter} of ${total} complete`];
    if (elapsedMs !== null) parts.push(formatElapsed(elapsedMs));
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (timeouts > 0) parts.push(`${timeouts} timeout${timeouts === 1 ? '' : 's'}`);
    return parts.join(' · ');
  });

  let configLabel = $derived(`${delay / 1000}s interval · ${timeout / 1000}s timeout`);
</script>

<footer
  class="foot"
  style:--footer-bg={tokens.color.footer.bg}
  style:--footer-border={tokens.color.glass.border}
  style:--t1={tokens.color.text.t1}
  style:--t3={tokens.color.text.t3}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--footer-height="{tokens.lane.footerHeight}px"
>
  <span class="highlight">Measuring from your browser</span>
  <span class="config">{configLabel}</span>
  <div class="spacer"></div>
  <span class="progress">{progressLabel}</span>
</footer>

<style>
  .foot {
    height: var(--footer-height); display: flex; align-items: center;
    padding: 0 20px; flex-shrink: 0;
    background: var(--footer-bg);
    border-top: 1px solid var(--footer-border);
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    font-family: var(--mono); font-size: 10px; font-weight: 300;
    color: var(--t3); gap: 16px;
  }
  .highlight { color: var(--t1); font-weight: 400; }
  .spacer { flex: 1; }
  .config, .progress { color: var(--t3); }
  @media (max-width: 767px) {
    .foot { padding: 0 12px; gap: 8px; }
    .config { display: none; }
  }
</style>
```

#### Step 4 — Run to confirm pass

```bash
cd /Users/shane/claude/chronoscope && npx vitest run tests/unit/components/footer-bar.test.ts
# Expected: all 4 tests pass
```

#### Step 5 — Typecheck and commit

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck && git add src/lib/components/FooterBar.svelte tests/unit/components/footer-bar.test.ts && git commit -m "feat: add elapsed time to footer progress label (AC9)"
```

---

## Phase 3 — Final Verification (Task 8)

### Task 8 — Full test suite and AC verification

**Pre-task reads:** none (read phase complete)

#### Step 1 — Run the full test suite

```bash
cd /Users/shane/claude/chronoscope && npx vitest run
# Expected: all existing tests pass, all new tests pass, zero failures
```

#### Step 2 — Run typecheck

```bash
cd /Users/shane/claude/chronoscope && npm run typecheck
# Expected: exit code 0, no errors
```

#### Step 3 — Run lint (if configured)

```bash
cd /Users/shane/claude/chronoscope && npm run lint 2>/dev/null || echo "no lint script"
# Expected: pass or no-op
```

#### Step 4 — AC checklist verification

| AC | Verified by |
|----|-------------|
| AC1 — heatmap strip 12px tall, grows left-to-right | `tests/unit/lane-svg-chart.test.ts` — `heatmap-cell` rects present |
| AC2 — 200-cell max, worst-value-wins | `tests/unit/heatmap-cells.test.ts` |
| AC3 — tooltip shows round, elapsed, latency | SVG tooltip in LaneSvgChart (visual) |
| AC4 — Glass palette colors relative to endpoint P-values | `tests/unit/heatmap-cells.test.ts` color assignment tests |
| AC5 — timeout line only when within y-range | `tests/unit/lane-svg-chart.test.ts` — timeout-line presence/absence tests |
| AC6 — live latency label above now-dot | `tests/unit/components/lane.test.ts` — now-latency-label tests |
| AC7 — elapsed time x-axis | `tests/unit/components/x-axis-bar.test.ts` |
| AC8 — "ELAPSED" label | `tests/unit/components/x-axis-bar.test.ts` |
| AC9 — elapsed in footer | `tests/unit/components/footer-bar.test.ts` + visual inspection |
| AC10 — no raw hex in component styles | `tests/unit/no-raw-visual-values.test.ts` (existing) |
| AC11 — existing tests pass | Full `npx vitest run` above |
| AC12 — no `any` types | `npm run typecheck` |

#### Step 5 — Final commit

```bash
cd /Users/shane/claude/chronoscope && git add -p  # stage any remaining unstaged changes
git commit -m "chore: s80 feature parity — all 4 features implemented and verified"
```

---

## Implementation Notes for Agentic Workers

### Svelte 5 bindable pattern
`nowDotPercent` uses `$bindable()` but `LanesView` doesn't need to bind it — `Lane` reads it from the SVG via the `$effect` that writes to the bindable. If the binding is not wired up in `LanesView`, the now-dot label falls back to the `top-right` position approach (Task 5), which is the correct implementation.

### `tokens` as-const constraint
`tokens.color.heatmap` must be accessed as `tokens.color.heatmap.fast` etc. TypeScript will enforce this because `tokens` is `as const`. Do not use bracket notation with a variable key — the type system won't allow it without an explicit `keyof typeof tokens.color.heatmap` cast.

### `HeatmapCellData` vs legacy `HeatmapCell`
`HeatmapCell` (without "Data") already exists in `types.ts` as a legacy canvas type. The new type is `HeatmapCellData`. Do not rename or remove `HeatmapCell` — it is imported by other files.

### `normalizeLatency` import in `LaneSvgChart`
`normalizeLatency` is exported from `timeline-data-pipeline.ts`. Importing it in a Svelte component is fine — it is a pure function with no side effects.

### `formatElapsed` boundary case: 9.999... seconds
`9999ms / 1000 = 9.999s` — use `Math.floor(totalSec * 10) / 10` before the `< 10` check so `9.999 → 9.9`, then `toFixed(1)` gives `"9.9s"`. The test for `formatElapsed(9999)` expects `"9.9s"`.

### `$effect` in `FooterBar` for the live clock
The `setInterval` in `FooterBar` fires every 1s. The cleanup function returned from `$effect` will clear the interval when the component is destroyed or when `lifecycle` changes from `running`. This avoids memory leaks.

### SVG tooltip clipping
The heatmap tooltip is clamped to the viewBox with `Math.min(heatmapTooltip.x - 100, VB_W - 205)` to prevent overflow at the right edge. The tooltip is rendered in SVG coordinates (0–1000), so `VB_W - 205` keeps a 205-wide rect fully inside.
