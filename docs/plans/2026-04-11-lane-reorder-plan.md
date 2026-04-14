# Lane Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add drag-to-reorder for lane cards using pointer events + CSS transforms
**Architecture:** Grip handle in Lane.svelte, drag orchestration in LanesView.svelte, reorder method in endpoints store
**Tech Stack:** Svelte 5 runes, TypeScript, Vitest

---

## Pre-flight reads (required before any task begins)

Every task that modifies a file must re-read it immediately before editing. The list below is a consolidated reference; the per-task checklists repeat the relevant subset.

| File | Path |
|------|------|
| endpoints store | `src/lib/stores/endpoints.ts` |
| LanesView | `src/lib/components/LanesView.svelte` |
| Lane | `src/lib/components/Lane.svelte` |
| tokens | `src/lib/tokens.ts` |
| persistence | `src/lib/utils/persistence.ts` |
| endpoints cap test | `tests/unit/endpoints-cap.test.ts` |
| lane test | `tests/unit/components/lane.test.ts` |
| lanes-view test | `tests/unit/components/lanes-view.test.ts` |

---

## Task 1 — Add `reorderEndpoint` to the endpoints store + tests

### Pre-task reads
- [ ] `src/lib/stores/endpoints.ts`
- [ ] `tests/unit/endpoints-cap.test.ts` (for test conventions)

### Step 1.1 — Write failing tests

Create `tests/unit/stores/endpoints-reorder.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { endpointStore } from '../../../src/lib/stores/endpoints';

describe('endpointStore.reorderEndpoint', () => {
  beforeEach(() => {
    endpointStore.reset();
    // After reset, 2 default endpoints: index 0 = Google, index 1 = Cloudflare
  });

  it('moves an endpoint forward (0 → 1)', () => {
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;

    endpointStore.reorderEndpoint(0, 1);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idA);
  });

  it('moves an endpoint backward (1 → 0)', () => {
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;

    endpointStore.reorderEndpoint(1, 0);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idA);
  });

  it('no-ops when fromIndex === toIndex', () => {
    const before = get(endpointStore);
    const idsBefore = before.map(ep => ep.id);

    endpointStore.reorderEndpoint(0, 0);

    const after = get(endpointStore);
    expect(after.map(ep => ep.id)).toEqual(idsBefore);
  });

  it('no-ops when fromIndex is out of bounds', () => {
    const before = get(endpointStore);
    const idsBefore = before.map(ep => ep.id);

    endpointStore.reorderEndpoint(99, 0);

    const after = get(endpointStore);
    expect(after.map(ep => ep.id)).toEqual(idsBefore);
  });

  it('no-ops when toIndex is out of bounds', () => {
    const before = get(endpointStore);
    const idsBefore = before.map(ep => ep.id);

    endpointStore.reorderEndpoint(0, 99);

    const after = get(endpointStore);
    expect(after.map(ep => ep.id)).toEqual(idsBefore);
  });

  it('preserves all endpoint data after reorder', () => {
    const before = get(endpointStore);
    const epA = before[0]!;

    endpointStore.reorderEndpoint(0, 1);

    const after = get(endpointStore);
    // epA is now at index 1 — all fields intact
    expect(after[1]).toEqual(epA);
  });

  it('works with 3+ endpoints: moves middle to front', () => {
    endpointStore.addEndpoint('https://extra.example.com', 'Extra');
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;
    const idC = before[2]!.id;

    endpointStore.reorderEndpoint(1, 0);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idA);
    expect(after[2]!.id).toBe(idC);
  });

  it('works with 3+ endpoints: moves first to last', () => {
    endpointStore.addEndpoint('https://extra.example.com', 'Extra');
    const before = get(endpointStore);
    const idA = before[0]!.id;
    const idB = before[1]!.id;
    const idC = before[2]!.id;

    endpointStore.reorderEndpoint(0, 2);

    const after = get(endpointStore);
    expect(after[0]!.id).toBe(idB);
    expect(after[1]!.id).toBe(idC);
    expect(after[2]!.id).toBe(idA);
  });
});
```

Run tests — expect all 8 to fail with `TypeError: endpointStore.reorderEndpoint is not a function`.

### Step 1.2 — Implement `reorderEndpoint` in the store

In `src/lib/stores/endpoints.ts`, add the method inside `createEndpointStore()`, after `updateEndpoint`:

```typescript
    reorderEndpoint(fromIndex: number, toIndex: number): void {
      update(endpoints => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= endpoints.length ||
          toIndex >= endpoints.length
        ) {
          return endpoints;
        }
        const next = [...endpoints];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved!);
        return next;
      });
    },
```

### Step 1.3 — Verify

```bash
npx vitest run tests/unit/stores/endpoints-reorder.test.ts
```

All 8 tests must pass. Then run the full suite to confirm no regressions:

```bash
npx vitest run
```

---

## Task 2 — Add grip handle to Lane.svelte (visual only)

### Pre-task reads
- [ ] `src/lib/components/Lane.svelte`
- [ ] `src/lib/tokens.ts` (easing, timing, color references)
- [ ] `tests/unit/components/lane.test.ts`

### Step 2.1 — Write failing tests

Append to `tests/unit/components/lane.test.ts` (inside the existing `describe('Lane', ...)` block):

```typescript
  // ── Grip handle (drag-to-reorder) ───────────────────────────────────────────

  it('renders a grip handle button in full mode', () => {
    const { container } = render(Lane, { props });
    const grip = container.querySelector('.lane-grip');
    expect(grip).not.toBeNull();
    expect(grip?.tagName.toLowerCase()).toBe('button');
  });

  it('grip handle has aria-label="Reorder lane"', () => {
    const { container } = render(Lane, { props });
    const grip = container.querySelector('.lane-grip');
    expect(grip?.getAttribute('aria-label')).toBe('Reorder lane');
  });

  it('renders grip handle in compact mode', () => {
    const { container } = render(Lane, { props: { ...props, compact: true } });
    const grip = container.querySelector('.lane-grip');
    expect(grip).not.toBeNull();
  });

  it('grip handle has data-endpoint-id matching endpointId', () => {
    const { container } = render(Lane, { props });
    const grip = container.querySelector('.lane-grip');
    expect(grip?.getAttribute('data-endpoint-id')).toBe('ep-test-1');
  });

  it('hides grip when showGrip is false', () => {
    const { container } = render(Lane, { props: { ...props, showGrip: false } });
    const grip = container.querySelector('.lane-grip');
    expect(grip).toBeNull();
  });
```

Run — expect 5 new failures.

### Step 2.2 — Add `showGrip` prop and grip handle markup to Lane.svelte

**Props block** — add `showGrip = true` to the destructured props:

```typescript
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
    showGrip = true,
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
    showGrip?: boolean;
    children?: import('svelte').Snippet;
  } = $props();
```

**Grip SVG helper** — add this inline constant after the `fmtLoss` function (still inside `<script>`):

```typescript
  // Six-dot grip icon (3×2 grid of circles), 10×14 viewport
  const GRIP_DOTS = [
    [2, 2], [8, 2],
    [2, 7], [8, 7],
    [2, 12], [8, 12],
  ] as const;
```

**Full-mode grip** — inside `.lane-panel`, add the grip button as the **first child** (before `.lane-url`):

```svelte
  <div class="lane-panel" class:sr-only={compact}>
    {#if showGrip}
      <button
        class="lane-grip"
        aria-label="Reorder lane"
        data-endpoint-id={endpointId}
        type="button"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {#each GRIP_DOTS as [cx, cy]}
            <circle {cx} {cy} r="1.5" fill="currentColor" />
          {/each}
        </svg>
      </button>
    {/if}
    <div class="lane-url">{url}</div>
    ...
```

**Compact-mode grip** — inside `.lane-compact-header`, add the grip button as the **first child** (before `.ch-dot`):

```svelte
  {#if compact}
    <div class="lane-compact-header" aria-hidden="true">
      {#if showGrip}
        <button
          class="lane-grip lane-grip--compact"
          aria-label="Reorder lane"
          data-endpoint-id={endpointId}
          type="button"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
            {#each GRIP_DOTS as [cx, cy]}
              <circle {cx} {cy} r="1.5" fill="currentColor" />
            {/each}
          </svg>
        </button>
      {/if}
      <span class="ch-dot" style:background={color}></span>
      ...
```

Note: `.lane-compact-header` currently has `pointer-events: none`. The grip button inside it needs to override this. See CSS step below.

**CSS** — add to the `<style>` block in Lane.svelte:

```css
  /* Grip handle — shared */
  .lane-grip {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 32px; flex-shrink: 0;
    background: none; border: none; padding: 0;
    color: var(--t4);
    cursor: grab;
    touch-action: none;
    border-radius: 4px;
    transition: color var(--timing-hover) ease, background var(--timing-hover) ease;
    /* Removed from tab order — drag is pointer-only; keyboard reorder is out of scope */
    /* Keep in tab order for accessibility baseline */
  }
  .lane-grip:hover {
    color: var(--t2);
    background: rgba(255, 255, 255, 0.05);
  }
  .lane-grip:active {
    cursor: grabbing;
  }

  /* Full-mode grip: sits in the panel, offset left to align with panel edge */
  .lane-panel .lane-grip {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
  }

  /* Compact-mode grip: sits in the compact header — override pointer-events: none on parent */
  .lane-compact-header .lane-grip {
    pointer-events: auto;
    flex-shrink: 0;
  }
  .lane-grip--compact {
    height: 22px;
  }
```

Also, the `.lane-panel` needs `position: relative` for the absolute-positioned grip. It already has `position: relative; z-index: 2;` — no change needed.

### Step 2.3 — Verify

```bash
npx vitest run tests/unit/components/lane.test.ts
```

All tests (existing + 5 new) must pass. Then:

```bash
npx vitest run
```

Full suite must be green.

---

## Task 3 — Drag orchestration in LanesView.svelte

### Pre-task reads
- [ ] `src/lib/components/LanesView.svelte`
- [ ] `src/lib/stores/endpoints.ts` (confirm `reorderEndpoint` is present)
- [ ] `src/lib/tokens.ts` (easing.standard, timing.fadeIn for transition values)
- [ ] `tests/unit/components/lanes-view.test.ts`

### Step 3.1 — Write failing tests

Append to `tests/unit/components/lanes-view.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import LanesView from '../../../src/lib/components/LanesView.svelte';

// ... existing tests above ...

  it('grip handles are rendered for each lane', () => {
    const { container } = render(LanesView, { props: {} });
    const grips = container.querySelectorAll('.lane-grip');
    const lanes = container.querySelectorAll('.lane');
    // One grip per lane (full mode renders grip in the panel)
    expect(grips.length).toBeGreaterThanOrEqual(lanes.length);
  });

  it('pointerdown on a grip sets the dragging lane', () => {
    const { container } = render(LanesView, { props: {} });
    const grip = container.querySelector('.lane-grip') as HTMLElement;
    expect(grip).not.toBeNull();
    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 100 });
    // The dragged article should have data-dragging attribute
    const dragged = container.querySelector('[data-dragging="true"]');
    expect(dragged).not.toBeNull();
  });

  it('pointerup without move leaves order unchanged', () => {
    const before = get(endpointStore).map(ep => ep.id);
    const { container } = render(LanesView, { props: {} });
    const grip = container.querySelector('.lane-grip') as HTMLElement;
    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 100 });
    const after = get(endpointStore).map(ep => ep.id);
    expect(after).toEqual(before);
  });
```

Run — expect 3 new failures (the drag-state tests will fail since the logic doesn't exist yet).

### Step 3.2 — Implement drag orchestration in LanesView.svelte

**Imports to add** (at the top of `<script>`):

```typescript
  import { endpointStore } from '$lib/stores/endpoints';
  // (already imported — confirm present, do not duplicate)
```

No new imports needed beyond what is already in LanesView.

**Drag state variables** — add after the existing `let lanesEl: HTMLDivElement;` declaration:

```typescript
  // ── Drag-to-reorder state ──────────────────────────────────────────────────
  interface DragState {
    pointerId: number;
    fromIndex: number;
    startY: number;
    currentY: number;
    cardHeight: number;
    toIndex: number;
  }

  let dragState = $state<DragState | null>(null);

  /** Map from endpoint index → translateY offset applied to that lane (in px) */
  let dragOffsets = $state<Record<number, number>>({});
```

**Helper: index from endpoint ID** — add after `getLaneProps`:

```typescript
  function indexOfEndpoint(id: string): number {
    return endpoints.findIndex(ep => ep.id === id);
  }
```

**Drag handlers** — add after `handleMouseLeave`:

```typescript
  function handleGripPointerDown(e: PointerEvent): void {
    // Only respond to primary pointer (left-click / single touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const grip = e.currentTarget as HTMLElement;
    const endpointId = grip.dataset['endpointId'];
    if (!endpointId) return;

    const fromIndex = indexOfEndpoint(endpointId);
    if (fromIndex === -1) return;

    // Measure the card height from the article element
    const article = lanesEl.querySelector(`#lane-${endpointId}`) as HTMLElement | null;
    if (!article) return;
    const cardHeight = article.getBoundingClientRect().height + tokens.lane.gapPx;

    grip.setPointerCapture(e.pointerId);
    e.preventDefault();

    dragState = {
      pointerId: e.pointerId,
      fromIndex,
      startY: e.clientY,
      currentY: e.clientY,
      cardHeight,
      toIndex: fromIndex,
    };
    dragOffsets = {};
  }

  function handleGripPointerMove(e: PointerEvent): void {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();

    const deltaY = e.clientY - dragState.startY;
    const count = endpoints.length;

    // Clamp drag displacement to container bounds
    const maxUp = -(dragState.fromIndex * dragState.cardHeight);
    const maxDown = (count - 1 - dragState.fromIndex) * dragState.cardHeight;
    const clampedDelta = Math.max(maxUp, Math.min(maxDown, deltaY));

    // Determine target index
    const rawOffset = clampedDelta / dragState.cardHeight;
    const sign = rawOffset >= 0 ? 1 : -1;
    const newToIndex = Math.max(
      0,
      Math.min(count - 1, dragState.fromIndex + Math.round(rawOffset)),
    );

    // Recompute neighbor shifts
    const offsets: Record<number, number> = {};
    for (let i = 0; i < count; i++) {
      if (i === dragState.fromIndex) continue;
      const isInRange =
        sign > 0
          ? i > dragState.fromIndex && i <= newToIndex
          : i < dragState.fromIndex && i >= newToIndex;
      if (isInRange) {
        offsets[i] = -sign * dragState.cardHeight;
      }
    }
    // Dragged card offset
    offsets[dragState.fromIndex] = clampedDelta;

    dragOffsets = offsets;
    dragState = { ...dragState, currentY: e.clientY, toIndex: newToIndex };
  }

  function handleGripPointerUp(e: PointerEvent): void {
    if (!dragState || e.pointerId !== dragState.pointerId) return;

    const { fromIndex, toIndex } = dragState;
    dragState = null;
    dragOffsets = {};

    if (fromIndex !== toIndex) {
      endpointStore.reorderEndpoint(fromIndex, toIndex);
    }
  }
```

**Bind drag handlers to `.lanes` container** — the grip buttons use `setPointerCapture`, so `pointermove` / `pointerup` are received on the grip element itself after capture. However, to keep logic in LanesView (the container), we attach the move/up handlers on the container and guard by `dragState`. Update the `<div class="lanes">` opening tag:

```svelte
<div
  class="lanes"
  id="lanes"
  role="region"
  aria-label="Endpoint lanes"
  bind:this={lanesEl}
  class:grid-2col={layoutMode === 'compact-2col'}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onpointermove={handleGripPointerMove}
  onpointerup={handleGripPointerUp}
  style:--lanes-gap="{tokens.lane.gapPx}px"
  style:--lanes-pad-x="{tokens.lane.paddingX}px"
  style:--lanes-pad-y="{tokens.lane.paddingY}px"
>
```

**Thread drag props through Lane** — update the `{#each}` block to pass derived props:

```svelte
    {#each endpoints as ep, i (ep.id)}
      {@const laneProps = getLaneProps(ep.id)}
      {@const lastLatency = $measurementStore.endpoints[ep.id]?.lastLatency ?? null}
      {@const isDragging = dragState?.fromIndex === i}
      {@const offset = dragOffsets[i] ?? 0}
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
        showGrip={endpoints.length > 1}
        dragging={isDragging}
        translateY={offset}
        onGripPointerDown={handleGripPointerDown}
      >
```

Note: `i` is now used in the loop — change `as ep (ep.id)` to `as ep, i (ep.id)`.

**Add drag props to Lane.svelte** — update the Lane props type (Task 2 already added `showGrip`; add these three new props):

```typescript
    dragging?: boolean;
    translateY?: number;
    onGripPointerDown?: (e: PointerEvent) => void;
```

And in the destructure:

```typescript
    dragging = false,
    translateY = 0,
    onGripPointerDown = undefined,
```

**Apply transforms and z-index to the `<article>` in Lane.svelte:**

```svelte
<article
  id="lane-{endpointId}"
  class="lane"
  class:compact={compact}
  class:is-dragging={dragging}
  aria-label="Endpoint {url}"
  data-dragging={dragging ? 'true' : undefined}
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
  style:--compact-header-height="{tokens.lane.compactHeaderHeight}px"
  style:--radius-lg="{tokens.radius.lg}px"
  style:--timing-hover="{tokens.timing.btnHover}ms"
  style:transform={translateY !== 0 ? `translateY(${translateY}px)` : undefined}
  style:z-index={dragging ? 10 : undefined}
>
```

**Wire up the grip pointerdown** — update both grip button instances in Lane.svelte to call `onGripPointerDown`:

Full-mode grip:
```svelte
      <button
        class="lane-grip"
        aria-label="Reorder lane"
        data-endpoint-id={endpointId}
        type="button"
        onpointerdown={onGripPointerDown}
      >
```

Compact-mode grip:
```svelte
        <button
          class="lane-grip lane-grip--compact"
          aria-label="Reorder lane"
          data-endpoint-id={endpointId}
          type="button"
          onpointerdown={onGripPointerDown}
        >
```

**CSS for dragging state** — add to Lane.svelte `<style>`:

```css
  /* Dragging state: lifted card */
  .lane.is-dragging {
    opacity: 0.92;
    transform-origin: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    /* scale is applied additively via JS translateY; keep transform on the element */
  }

  /* Neighbor shift transition — applied to all non-dragged lanes */
  .lane:not(.is-dragging) {
    transition:
      transform 200ms cubic-bezier(0.4, 0.0, 0.2, 1),
      border-color var(--timing-hover) ease,
      box-shadow var(--timing-hover) ease;
  }
```

Note: The `style:transform` on `<article>` uses `translateY(Xpx)` — this replaces the existing `transform` property on `.is-dragging`. The `scale(1.01)` visual lift can be composed in the `is-dragging` class using `scale()` while the JS sets only `translateY`. To avoid clobbering the JS-set transform with the CSS class, express the dragging visual as a CSS filter/box-shadow enhancement only; the scale is applied separately via a CSS variable or omitted for simplicity. The approved design calls for "subtle scale(1.01)" — implement via the `is-dragging` rule using `scale(1.01)` composed with the JS `translateY` by using a `--drag-translate` CSS custom property:

Replace `style:transform` on `<article>` with:

```svelte
  style:--drag-translate="{translateY}px"
```

And in CSS:

```css
  .lane {
    /* ... existing rules ... */
    transform: translateY(var(--drag-translate, 0px));
  }

  .lane.is-dragging {
    opacity: 0.92;
    transform: translateY(var(--drag-translate, 0px)) scale(1.01);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    z-index: 10;
  }

  .lane:not(.is-dragging) {
    transition:
      transform 200ms cubic-bezier(0.4, 0.0, 0.2, 1),
      border-color var(--timing-hover) ease,
      box-shadow var(--timing-hover) ease;
  }
```

Remove `style:transform` and `style:z-index` from the `<article>` tag — the CSS custom property approach handles both.

### Step 3.3 — Verify

```bash
npx vitest run tests/unit/components/lanes-view.test.ts
npx vitest run tests/unit/components/lane.test.ts
npx vitest run
```

All tests must pass. TypeScript must compile:

```bash
npx tsc --noEmit
```

---

## Task 4 — Hide grip when only 1 endpoint (edge case guard)

### Pre-task reads
- [ ] `src/lib/components/LanesView.svelte` (confirm `showGrip={endpoints.length > 1}` from Task 3)
- [ ] `tests/unit/components/lanes-view.test.ts`
- [ ] `tests/unit/components/lane.test.ts`

### Step 4.1 — Write failing test

Append to `tests/unit/components/lanes-view.test.ts`:

```typescript
  it('hides grip when only one endpoint is visible', () => {
    // Remove all but one endpoint
    endpointStore.reset();
    const eps = get(endpointStore);
    // Disable all but the first
    eps.slice(1).forEach(ep => endpointStore.updateEndpoint(ep.id, { enabled: false }));

    const { container } = render(LanesView, { props: {} });
    const grips = container.querySelectorAll('.lane-grip');
    expect(grips.length).toBe(0);
  });
```

Note: this test may already pass if Task 3 correctly passes `showGrip={endpoints.length > 1}`. Run it to confirm.

### Step 4.2 — Confirm implementation

If the test passes with no code change (expected), that is correct — Task 3 already implemented `showGrip={endpoints.length > 1}`. The test is the deliverable; it enforces the behavior permanently.

If the test fails, verify `LanesView.svelte` has `showGrip={endpoints.length > 1}` in the `<Lane>` invocation and that `Lane.svelte` does not render `.lane-grip` when `showGrip` is `false`.

### Step 4.3 — Final verification

```bash
npx vitest run
npx tsc --noEmit
npx eslint src/lib/components/LanesView.svelte src/lib/components/Lane.svelte src/lib/stores/endpoints.ts
```

All commands must exit 0.

---

## Acceptance criteria checklist

- [ ] `endpointStore.reorderEndpoint(from, to)` splices correctly for forward, backward, and multi-step moves
- [ ] Out-of-bounds and no-op calls are silent (no throw, no state mutation)
- [ ] `.lane-grip` button renders in both full and compact modes
- [ ] `aria-label="Reorder lane"` present on every grip button
- [ ] `data-endpoint-id` attribute set to the endpoint ID
- [ ] Grip is absent (not rendered) when `showGrip` is `false`
- [ ] Grip is absent when only 1 endpoint is visible
- [ ] `pointerdown` on grip initiates drag state; `data-dragging="true"` set on article
- [ ] Dragged card gets `is-dragging` class, `scale(1.01)`, elevated shadow
- [ ] Neighbor cards shift with `transform: translateY(±cardHeight)` and 200ms transition
- [ ] `pointerup` calls `reorderEndpoint` only when `fromIndex !== toIndex`
- [ ] Drag does not interfere with mousemove chart hover (pointer capture scoped to grip, not `.lanes`)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx eslint` exits 0
- [ ] `npx vitest run` exits 0 (all tests green)

---

## Design token references (do not hardcode these values)

| Usage | Token path | Value |
|-------|-----------|-------|
| Neighbor transition easing | `tokens.easing.standard` | `cubic-bezier(0.4, 0.0, 0.2, 1)` |
| Neighbor transition duration | 200ms (per spec) | hardcode `200ms` once in CSS |
| Hover/grab cursor color transition | `tokens.timing.btnHover` | `200ms` |
| Lane gap (for cardHeight calculation) | `tokens.lane.gapPx` | `8` |
| Dragged shadow | `tokens.shadow.high` | `0 8px 32px rgba(0,0,0,.6)` |
| Grip icon color (default) | `tokens.color.text.t4` (via CSS var `--t4`) | `rgba(255,255,255,.32)` |
| Grip icon color (hover) | `tokens.color.text.t2` (via CSS var `--t2`) | `rgba(255,255,255,.58)` |

Raw hex/rgba values are **only** permitted in `src/lib/tokens.ts`. Any new color values needed must be added there first.
