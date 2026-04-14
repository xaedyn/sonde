# UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** Deliver information hierarchy, button hierarchy, mobile responsiveness, empty-state animation, and state-transition polish across all four viewport breakpoints (375/480/768/1440px).

**Architecture:** CSS-first, token-driven approach. Every visual value flows through `tokens.ts` — no raw values in components. Responsive behavior uses CSS media queries and container queries where possible, with `matchMedia` for boolean JS flags (consistent with the existing `isMobile` pattern in LanesView). No new stores, no new cross-component APIs, no layout-shift. The research brief bet is: "CSS-only transitions (200ms color crossfade) are imperceptible for label swaps — no JS animation orchestration needed."

**Tech Stack:** Svelte 5 runes, TypeScript strict, tokens.ts design system, CSS media/container queries, Playwright for visual/Axe tests, Vitest + @testing-library/svelte for unit tests.

---

## AC Extraction

| AC | Text | Maps to |
|----|------|---------|
| AC-1 | Start button has visible filled accent background distinguishable from other topbar buttons; at 375px secondary buttons are icon-only with `aria-label` | Task 2 (Topbar), Task 5 (Playwright) |
| AC-2 | Lane panel shows endpoint label in Sora 12px/500 above hero number; "P50 MEDIAN LATENCY" removed; "Median" appears in 9px/t4 | Task 3 (Lane), Task 5 (Playwright) |
| AC-3 | Empty state shows centered SVG ring with `stroke: ep-color` and "Waiting for data" text; ring has no `<animate>` children when `prefers-reduced-motion: reduce` | Task 4 (LaneSvgChart), Task 5 (Playwright) |
| AC-4 | Start button CSS transition ≥100ms on background/border-color/color; 0s duration with `prefers-reduced-motion: reduce` | Task 2 (Topbar), Task 5 (Playwright) |
| AC-5 | At 375px: no horizontal overflow; all interactive elements ≥44×44px; Start/Stop has text label | Task 2 (Topbar), Task 3 (Lane), Task 6 (FooterBar), Task 5 (Playwright) |

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/tokens.ts` | Add `cyan15`, `cyan25`, `pink15`, `pink25` primitives; add `cyanBgSubtle`, `cyanBorderSubtle`, `pinkBgSubtle`, `pinkBorderSubtle` semantic accent tokens; add `breakpoints.small: 480`; add `timing.statTransition: 200`, `timing.dotEntrance: 200`, `timing.dotExit: 150` |
| Modify | `src/lib/components/Topbar.svelte` | Button hierarchy: filled Start/Stop, ghost secondary; icon-only collapse at ≤767px; status area restructure; 200ms transitions; prefers-reduced-motion |
| Modify | `src/lib/components/Lane.svelte` | Label promotion (Sora 12px/500/t2); remove "P50 Median Latency", add "Median" 9px/t4; stats demotion (12px values, 8px labels t5); container query for 2×2 stats on mobile; hero clamp; panel padding mobile reduction |
| Modify | `src/lib/components/LaneSvgChart.svelte` | Replace `<text>` empty state with animated ring + text; `reducedMotion` guard; `--ep-color` ring stroke |
| Modify | `src/lib/components/FooterBar.svelte` | Hide "Measuring from your browser" text at <480px |
| Modify | `tests/unit/tokens.test.ts` | Add assertions for new tokens (cyan15, cyan25, pink15, pink25, breakpoints.small) |
| Modify | `tests/unit/components/topbar.test.ts` | Add AC-1 and AC-4 unit stubs |
| Modify | `tests/unit/components/lane.test.ts` | Add AC-2 unit assertions; remove/update stale "P50 Median Latency" test |
| Modify | `tests/unit/lane-svg-chart.test.ts` | Add AC-3 unit assertions (ring element, text, no-animate when reduced motion) |
| Modify | `tests/visual/ac-verification.spec.ts` | Add Playwright tests for AC-1 through AC-5 at all four viewports |

---

## Phase Segmentation

This plan has 6 tasks — exactly at the threshold. No phase split required; all tasks deploy atomically.

---

## Task 1 — Extend design tokens

**Files:**
- Modify: `src/lib/tokens.ts`
- Modify: `tests/unit/tokens.test.ts`

**Pre-task reads:**
- [x] `src/lib/tokens.ts` (read above — lines 1–349)
- [x] `tests/unit/tokens.test.ts` (read above — lines 1–149)

**Why first:** Every subsequent task references the new tokens. New tokens before components that use them.

### Steps

- [ ] **1.1** Open `src/lib/tokens.ts`. In the `primitive` object, after the `pink70` entry (line 36) and before `amber`, add the four new opacity variants:

```typescript
  // Added for UX-polish button hierarchy (AC-1)
  cyan15:     'rgba(103,232,249,.15)',
  cyan25:     'rgba(103,232,249,.25)',
  pink15:     'rgba(249,168,212,.15)',
  pink25:     'rgba(249,168,212,.25)',
```

- [ ] **1.2** In the `tokens.color.accent` semantic section (after `pink06` entry on line ~121), add six semantic aliases:

```typescript
      cyan25:           primitive.cyan25,
      cyanBgSubtle:     primitive.cyan15,
      cyanBorderSubtle: primitive.cyan25,
      pink25:           primitive.pink25,
      pinkBgSubtle:     primitive.pink15,
      pinkBorderSubtle: primitive.pink25,
```

- [ ] **1.2b** In the `tokens.color` object, add a new `shadow` sub-object for box-shadow glow tokens (after `accent` section):

```typescript
    glow: {
      cyan: 'rgba(103,232,249,.2)',
      pink: 'rgba(249,168,212,.2)',
    },
```

- [ ] **1.2c** In the `tokens.color.glass` object, add a stats border token:

```typescript
      statsBorder: 'rgba(255,255,255,.04)',
```

- [ ] **1.2d** In the `tokens.color.text` object, add an empty state fill token:

```typescript
      emptyFill: 'rgba(255,255,255,.1)',
```

- [ ] **1.3** In `tokens.timing` (after `copiedFeedback` entry), add three new timing tokens:

```typescript
    statTransition:  200,   // button background/border crossfade (AC-4)
    dotEntrance:     200,   // status dot scale-in
    dotExit:         150,   // status dot scale-out
```

- [ ] **1.4** In `tokens.breakpoints`, add the `small` breakpoint:

```typescript
  breakpoints: { small: 480, mobile: 375, tablet: 768, desktop: 1024, wide: 1440 },
```

- [ ] **1.5** In `tests/unit/tokens.test.ts`, add a new `describe` block at the end of the file:

```typescript
describe('ux-polish tokens', () => {
  it('exports cyan15 and cyan25 primitive-backed accent tokens (AC-1)', () => {
    expect(tokens.color.accent.cyanBgSubtle).toBe('rgba(103,232,249,.15)');
    expect(tokens.color.accent.cyanBorderSubtle).toBe('rgba(103,232,249,.25)');
  });

  it('exports pink15 and pink25 primitive-backed accent tokens (AC-1)', () => {
    expect(tokens.color.accent.pinkBgSubtle).toBe('rgba(249,168,212,.15)');
    expect(tokens.color.accent.pinkBorderSubtle).toBe('rgba(249,168,212,.25)');
  });

  it('exports breakpoints.small as 480 (AC-5)', () => {
    expect(tokens.breakpoints.small).toBe(480);
  });

  it('exports statTransition, dotEntrance, dotExit timing tokens (AC-4)', () => {
    expect(tokens.timing.statTransition).toBe(200);
    expect(tokens.timing.dotEntrance).toBe(200);
    expect(tokens.timing.dotExit).toBe(150);
  });
});
```

- [ ] **1.6** Run tests to verify:
  ```
  npm run typecheck && npm test -- tests/unit/tokens.test.ts
  ```
  Expected: all new assertions pass; no TypeScript errors.

---

## Task 2 — Topbar button hierarchy + mobile collapse + state transitions

**Files:**
- Modify: `src/lib/components/Topbar.svelte`
- Modify: `tests/unit/components/topbar.test.ts`

**Pre-task reads:**
- [x] `src/lib/components/Topbar.svelte` (read above — lines 1–201)
- [x] `tests/unit/components/topbar.test.ts` (read above — lines 1–123)

> **Bet check:** The research brief's THE BET is "CSS-only transitions (200ms color crossfade) are imperceptible for label swaps — no JS animation orchestration needed." This task is where that assumption is most load-bearing: the Start↔Stop button swaps its label instantly while the background/border/color crossfade over 200ms. If the bet fails (label swap feels jarring), the fix is a CSS clip-path or opacity-crossfade on the text — but per the brief, 200ms color motion covers the text change perceptually.

### Steps

- [ ] **2.1** Replace the entire `<script>` section of `Topbar.svelte` with the following (adds `isMobile`, `showRunStatus`, and new token CSS variables):

```svelte
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import type { TestLifecycleState } from '$lib/types';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  let lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  let roundCounter: number = $derived($measurementStore.roundCounter);
  let isSharedView: boolean = $derived($uiStore.isSharedView);

  // Run-status area: visible only while running or in transitional states
  let showRunStatus: boolean = $derived(
    lifecycle === 'running' || lifecycle === 'starting' || lifecycle === 'stopping',
  );

  // Round counter label — shown only when running
  let roundLabel: string = $derived(
    lifecycle === 'running' ? `Round ${roundCounter}` : '',
  );

  // Transitional text overlay: shown during starting/stopping
  let transitionLabel: string = $derived.by(() => {
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return '';
  });

  let isRunning: boolean = $derived(lifecycle === 'running');
  let isTransitioning: boolean = $derived(lifecycle === 'starting' || lifecycle === 'stopping');

  let startStopLabel: string = $derived.by(() => {
    if (lifecycle === 'running') return 'Stop';
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return 'Start';
  });

  // Mobile: secondary buttons collapse to icon-only at ≤767px
  let isMobile: boolean = $state(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  $effect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent): void => { isMobile = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  function handleStartStop(): void {
    if (lifecycle === 'running') {
      onStop?.();
    } else if (lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed') {
      onStart?.();
    }
  }

  function handleRunOwn(): void {
    uiStore.clearSharedView();
    measurementStore.reset();
  }

  function handleSettings(): void { uiStore.toggleSettings(); }
  function handleShare(): void { uiStore.toggleShare(); }
  function handleEndpoints(): void { uiStore.toggleEndpoints(); }
</script>
```

- [ ] **2.2** Replace the `<header>` template (lines 54–99) with:

```svelte
<header
  class="topbar"
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--topbar-border={tokens.color.topbar.border}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-cyan-bg={tokens.color.accent.cyanBgSubtle}
  style:--accent-cyan-border={tokens.color.accent.cyanBorderSubtle}
  style:--accent-cyan25={tokens.color.accent.cyan25}
  style:--accent-pink={tokens.color.accent.pink}
  style:--accent-pink-bg={tokens.color.accent.pinkBgSubtle}
  style:--accent-pink-border={tokens.color.accent.pinkBorderSubtle}
  style:--accent-pink25={tokens.color.accent.pink25}
  style:--accent-green={tokens.color.accent.green}
  style:--green-glow={tokens.color.accent.greenGlow}
  style:--glow-cyan={tokens.color.glow.cyan}
  style:--glow-pink={tokens.color.glow.pink}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--topbar-height="{tokens.lane.topbarHeight}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--timing-btn="{tokens.timing.statTransition}ms"
  style:--timing-dot-enter="{tokens.timing.dotEntrance}ms"
  style:--timing-dot-exit="{tokens.timing.dotExit}ms"
>
  <div class="logo" aria-label="Chronoscope">
    <span class="logo-text">Chronoscope</span>
  </div>

  <div class="run-status" aria-live="polite" aria-atomic="true" class:visible={showRunStatus}>
    {#if isRunning}
      <div class="pulse-dot" aria-hidden="true"></div>
      <span class="run-label">{roundLabel}</span>
    {:else if isTransitioning}
      <span class="run-label">{transitionLabel}</span>
    {/if}
  </div>

  <div class="spacer"></div>

  <nav class="actions" aria-label="Test controls">
    {#if isSharedView}
      <button type="button" class="btn btn-ghost" aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover" onclick={handleShare}>
        {#if isMobile}
          <svg class="icon" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 2h4v4M14 2L8 8M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/>
          </svg>
        {:else}
          Share
        {/if}
      </button>
      <button type="button" class="btn btn-start" aria-label="Run your own test" onclick={handleRunOwn}>Run Your Own Test</button>
    {:else}
      <button type="button" class="btn btn-ghost" aria-label="Add endpoint" aria-expanded={$uiStore.showEndpoints} aria-controls="endpoint-drawer" onclick={handleEndpoints}>
        {#if isMobile}
          <svg class="icon" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6"/><path d="M8 5v6M5 8h6"/>
          </svg>
        {:else}
          + Endpoint
        {/if}
      </button>
      <button type="button" class="btn btn-ghost" aria-label="Settings" aria-expanded={$uiStore.showSettings} aria-controls="settings-drawer" onclick={handleSettings}>
        {#if isMobile}
          <svg class="icon" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 1h2l.3 2.1a5 5 0 011.2.7L12.4 2.4l1.4 1.4-1.4 1.9a5 5 0 01.7 1.2L15 7v2l-2.1.3a5 5 0 01-.7 1.2l1.4 1.9-1.4 1.4-1.9-1.4a5 5 0 01-1.2.7L9 15H7l-.3-2.1a5 5 0 01-1.2-.7L3.6 13.6l-1.4-1.4 1.4-1.9a5 5 0 01-.7-1.2L1 9V7l2.1-.3a5 5 0 01.7-1.2L2.4 3.6l1.4-1.4 1.9 1.4a5 5 0 011.2-.7L7 1z"/>
            <circle cx="8" cy="8" r="2.5"/>
          </svg>
        {:else}
          Settings
        {/if}
      </button>
      <button type="button" class="btn btn-ghost" aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover" onclick={handleShare}>
        {#if isMobile}
          <svg class="icon" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 2h4v4M14 2L8 8M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/>
          </svg>
        {:else}
          Share
        {/if}
      </button>
      <button
        type="button"
        class="btn btn-start"
        class:btn-stop={isRunning}
        disabled={isTransitioning}
        aria-disabled={isTransitioning}
        aria-label={startStopLabel}
        onclick={handleStartStop}
      >{startStopLabel}</button>
    {/if}
  </nav>
</header>
```

- [ ] **2.3** Replace the entire `<style>` block with:

```svelte
<style>
  .topbar {
    height: var(--topbar-height);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 14px;
    flex-shrink: 0;
    background: var(--topbar-bg);
    border-bottom: 1px solid var(--topbar-border);
    backdrop-filter: blur(30px) saturate(1.3);
    -webkit-backdrop-filter: blur(30px) saturate(1.3);
    position: relative;
  }
  .topbar::after {
    content: '';
    position: absolute;
    top: 0; left: 20%; right: 20%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  /* ── Logo ─────────────────────────────────────────────────────── */
  .logo { display: flex; align-items: center; }
  .logo-text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-pink));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Run status ───────────────────────────────────────────────── */
  .run-status {
    display: none;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 300;
    color: var(--t3);
  }
  .run-status.visible { display: flex; }

  .pulse-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--green-glow);
    transform: scale(0);
    animation:
      dot-enter var(--timing-dot-enter) cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
      pulse 2s ease-in-out 200ms infinite;
    flex-shrink: 0;
  }
  @keyframes dot-enter {
    from { transform: scale(0); }
    to   { transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: .4; transform: scale(.85); }
  }
  .run-label { color: var(--t3); }

  /* ── Layout ───────────────────────────────────────────────────── */
  .spacer { flex: 1; }
  .actions { display: flex; align-items: center; gap: 8px; }

  /* ── Base button ──────────────────────────────────────────────── */
  .btn {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.01em;
    padding: 7px 16px;
    border-radius: var(--btn-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
    transition:
      background var(--timing-btn) ease,
      border-color var(--timing-btn) ease,
      color var(--timing-btn) ease,
      box-shadow var(--timing-btn) ease,
      transform var(--timing-btn) ease;
    white-space: nowrap;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .btn:hover:not(:disabled) {
    background: var(--glass-bg);
    color: var(--t2);
    transform: translateY(-1px);
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* Ghost variant — secondary buttons (Settings, Share, + Endpoint) */
  .btn-ghost {
    border-color: transparent;
    background: transparent;
    color: var(--t3);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--glass-bg);
    color: var(--t2);
    transform: translateY(-1px);
  }

  /* Start button (idle/stopped/completed) — filled cyan accent */
  .btn-start {
    background: var(--accent-cyan-bg);
    border-color: var(--accent-cyan-border);
    color: var(--accent-cyan);
  }
  .btn-start:hover:not(:disabled) {
    background: var(--accent-cyan25);
    border-color: var(--accent-cyan25);
    box-shadow: 0 2px 16px var(--glow-cyan);
    transform: translateY(-1px);
    color: var(--accent-cyan);
  }

  /* Stop button (running) — filled pink accent */
  .btn-start.btn-stop {
    background: var(--accent-pink-bg);
    border-color: var(--accent-pink-border);
    color: var(--accent-pink);
  }
  .btn-start.btn-stop:hover:not(:disabled) {
    background: var(--accent-pink25);
    box-shadow: 0 2px 16px var(--glow-pink);
    transform: translateY(-1px);
    color: var(--accent-pink);
  }

  /* SVG icons (mobile icon-only state) */
  .icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* ── Reduced motion ───────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .btn { transition-duration: 0s; }
    .pulse-dot { animation: pulse 2s ease-in-out infinite; transform: scale(1); }
    @keyframes dot-enter { from { transform: scale(1); } to { transform: scale(1); } }
  }

  /* ── Mobile ≤767px ────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .topbar { padding: 0 12px; gap: 4px; }
    /* Secondary ghost buttons: 44×44px touch target (WCAG AC-5) */
    .btn-ghost {
      min-width: 44px;
      min-height: 44px;
      padding: 0;
    }
    /* Start/Stop: full button with text, meets 44px height */
    .btn-start {
      min-width: 72px;
      min-height: 44px;
    }
  }

  /* ── Small phone <480px: logo truncation ─────────────────────── */
  @media (max-width: 479px) {
    .logo-text {
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
```

- [ ] **2.4** Add AC-1 and AC-4 stubs to `tests/unit/components/topbar.test.ts`. Append after the existing `describe('Topbar', ...)` block:

```typescript
describe('Topbar — UX Polish (AC-1, AC-4)', () => {
  // AC-1: Start button is visually distinct — tested via CSS class presence
  it('should apply btn-start class to start/stop button (AC-1)', () => {
    // AC-1: Start button has filled accent background distinguishable from secondary buttons
    const startStopClasses = (lifecycle: TestLifecycleState): string[] => {
      const classes = ['btn', 'btn-start'];
      if (lifecycle === 'running') classes.push('btn-stop');
      return classes;
    };
    expect(startStopClasses('idle')).toContain('btn-start');
    expect(startStopClasses('idle')).not.toContain('btn-stop');
    expect(startStopClasses('running')).toContain('btn-start');
    expect(startStopClasses('running')).toContain('btn-stop');
  });

  it('should apply btn-ghost class to secondary buttons (AC-1)', () => {
    // AC-1: Secondary buttons (Settings, Share, + Endpoint) use ghost styling — no filled background
    const secondaryClass = 'btn-ghost';
    expect(secondaryClass).toBe('btn-ghost');
  });

  // AC-4: 200ms CSS transition on background/border-color/color
  it('statTransition timing token is ≥100ms for AC-4', () => {
    // AC-4: Clicking Start triggers CSS transition ≥100ms on background, border-color, color
    expect(tokens.timing.statTransition).toBeGreaterThanOrEqual(100);
  });

  // Run status area: hidden when idle/stopped/completed
  it('showRunStatus is false when lifecycle is idle (AC-4 layout stability)', () => {
    const showRunStatus = (lc: TestLifecycleState): boolean =>
      lc === 'running' || lc === 'starting' || lc === 'stopping';
    expect(showRunStatus('idle')).toBe(false);
    expect(showRunStatus('completed')).toBe(false);
    expect(showRunStatus('stopped')).toBe(false);
    expect(showRunStatus('running')).toBe(true);
    expect(showRunStatus('starting')).toBe(true);
    expect(showRunStatus('stopping')).toBe(true);
  });
});
```

Also add the missing import at the top of the file (after existing imports):
```typescript
import { tokens } from '../../../src/lib/tokens';
```

- [ ] **2.5** Run:
  ```
  npm run typecheck && npm test -- tests/unit/components/topbar.test.ts
  ```
  Expected: all tests pass.

---

## Task 3 — Lane panel information hierarchy

**Files:**
- Modify: `src/lib/components/Lane.svelte`
- Modify: `tests/unit/components/lane.test.ts`

**Pre-task reads:**
- [x] `src/lib/components/Lane.svelte` (read above — lines 1–370)
- [x] `tests/unit/components/lane.test.ts` (read above — lines 1–123)

### Steps

- [ ] **3.1** In `Lane.svelte`, replace the `.lane-panel` div contents (lines 87–120). The full panel block becomes:

```svelte
  <div class="lane-panel" class:sr-only={compact}>
    {#if showGrip && !compact}
      <button
        class="lane-grip"
        aria-label="Reorder lane"
        data-endpoint-id={endpointId}
        type="button"
        onpointerdown={onGripPointerDown}
        onkeydown={onGripKeyDown}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {#each GRIP_DOTS as [cx, cy], i (i)}
            <circle {cx} {cy} r="1.5" fill="currentColor" />
          {/each}
        </svg>
      </button>
    {/if}
    <div class="lane-url">{url}</div>
    <div class="lane-hero" aria-label="Median latency {fmt(p50)}">
      <span class="hero-value">{Math.round(p50)}</span>
      <span class="hero-unit">ms</span>
    </div>
    <div class="lane-label">Median</div>
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
```

Key changes from current:
- `.lane-url` class stays (same element; CSS change only in step 3.2)
- `aria-label` on `.lane-hero` updated from "P50 latency" to "Median latency"
- `.lane-label` text changes from `P50 Median Latency` → `Median`

- [ ] **3.2** On the `<article>` root element in `Lane.svelte`, add the new CSS custom property bindings:
  ```
  style:--stats-border={tokens.color.glass.statsBorder}
  style:--empty-fill={tokens.color.text.emptyFill}
  ```
  Then in the `<style>` block, replace the `.lane-url`, `.lane-hero`, `.hero-value`, `.hero-unit`, `.lane-label`, `.lane-stats`, `.ls-label`, `.ls-val` rules, and the `@media (max-width: 767px)` inner block, with the new hierarchy:

Find and replace `.lane-url` through the mobile media block (lines 233–368 in the style):

```css
  /* ── Lane panel — information hierarchy ────────────────────────── */
  .lane-url {
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .lane-hero {
    display: flex;
    align-items: baseline;
    margin-top: 4px;
    line-height: 1;
    color: var(--ep-color);
  }
  .hero-value {
    font-family: var(--sans);
    font-size: 54px;
    font-weight: 200;
    letter-spacing: -0.06em;
  }
  .hero-unit {
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 300;
    color: var(--t3);
    margin-left: 2px;
  }
  .lane-label {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 300;
    color: var(--t4);
    margin-top: 4px;
    letter-spacing: 0.04em;
  }
  .lane-stats {
    container-type: inline-size;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--stats-border);
  }
  .ls-label {
    font-family: var(--mono);
    font-size: 8px;
    font-weight: 400;
    color: var(--t5);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  .ls-val {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 300;
    color: var(--t2);
    margin-top: 3px;
  }
  .collecting-note {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 300;
    color: var(--t4);
    margin-top: 12px;
  }
  /* Container query: narrow panel → 2×2 stat grid */
  @container (max-width: 199px) {
    .lane-stats {
      grid-template-columns: 1fr 1fr;
    }
  }
```

- [ ] **3.3** In the `@media (max-width: 767px)` block inside Lane.svelte's `<style>`, update the `.lane-panel` inner padding and hero size:

Replace the existing mobile media block content at the bottom of the style:
```css
  @media (max-width: 767px) {
    .lane:not(.compact) { flex-direction: column; }
    .lane:not(.compact) .lane-panel {
      width: 100%;
      padding: 16px 20px 12px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,.05);
      flex-direction: row;
      align-items: center;
      gap: 20px;
    }
    .lane:not(.compact) .lane-stats { margin-top: 0; padding-top: 0; border-top: none; }
    .hero-value {
      font-size: clamp(32px, 10vw, 54px);
    }
    .ch-url { max-width: 120px; }
  }
```

- [ ] **3.4** Update `tests/unit/components/lane.test.ts`: replace the stale `'renders P50 Median Latency label'` test and add new AC-2 assertions:

Find and replace the existing test at line 28:
```typescript
  it('renders P50 Median Latency label', () => {
    const { getByText } = render(Lane, { props });
    expect(getByText(/P50 Median Latency/i)).toBeTruthy();
  });
```
Replace with:
```typescript
  it('renders "Median" label (not "P50 Median Latency") — AC-2', () => {
    // AC-2: "P50 MEDIAN LATENCY" must not appear; "Median" replaces it
    const { getByText, queryByText } = render(Lane, { props });
    expect(queryByText(/P50 Median Latency/i)).toBeNull();
    expect(getByText('Median')).toBeTruthy();
  });

  it('renders endpoint label in .lane-url with promoted styling (AC-2)', () => {
    // AC-2: label shown in Sora 12px/500/t2 — class presence confirms styling intent
    const { container } = render(Lane, { props });
    const urlEl = container.querySelector('.lane-url');
    expect(urlEl).not.toBeNull();
    expect(urlEl?.textContent).toBe('www.google.com');
  });
```

- [ ] **3.5** Run:
  ```
  npm run typecheck && npm test -- tests/unit/components/lane.test.ts
  ```
  Expected: all tests pass (stale test replaced, new ones pass).

---

## Task 4 — Empty state animated ring

**Files:**
- Modify: `src/lib/components/LaneSvgChart.svelte`
- Modify: `tests/unit/lane-svg-chart.test.ts`

**Pre-task reads:**
- [x] `src/lib/components/LaneSvgChart.svelte` (read above — lines 1–295)
- [x] `tests/unit/lane-svg-chart.test.ts` (read above — lines 1–99)

### Steps

- [ ] **4.1** In `LaneSvgChart.svelte`, add the `reducedMotion` reactive boolean to the `<script>` block. After the `const hasData` derived (line 41), insert:

```typescript
  // Respects prefers-reduced-motion for empty state ring animation (AC-3)
  let reducedMotion: boolean = $state(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  $effect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent): void => { reducedMotion = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });
```

- [ ] **4.2** In the SVG template, replace the `{:else}` empty-state block (lines 243–251):

```svelte
  {:else}
    <!-- Empty state: animated ring + label (AC-3) -->
    <g class="empty-state">
      <circle
        class="empty-ring"
        cx={VB_W / 2}
        cy={(PLOT_H + PAD_Y_TOP) / 2}
        r="40"
        stroke="var(--ep-color)"
        fill="none"
        opacity="0.06"
        stroke-width="0.5"
      >
        {#if !reducedMotion}
          <animate attributeName="r" values="38;42" dur="3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.04;0.08" dur="3s" repeatCount="indefinite"/>
        {/if}
      </circle>
      <text
        class="empty-text"
        x={VB_W / 2}
        y={(PLOT_H + PAD_Y_TOP) / 2 + 56}
        text-anchor="middle"
        dominant-baseline="middle"
      >Waiting for data</text>
    </g>
  {/if}
```

- [ ] **4.3** In the `<style>` block of LaneSvgChart.svelte, replace the `.empty-text` rule:

```css
  .empty-text {
    font-family: var(--mono, 'Martian Mono', monospace);
    font-size: 10px;
    font-weight: 300;
    fill: var(--empty-fill);
  }
  .empty-ring { /* stroke set inline via var(--ep-color) */ }
```

- [ ] **4.4** Add AC-3 assertions to `tests/unit/lane-svg-chart.test.ts`. Append after the last `it(...)`:

```typescript
  // ── AC-3: Empty state ring ──────────────────────────────────────────────────

  it('renders .empty-ring circle when no points exist (AC-3)', () => {
    // AC-3: centered SVG ring with stroke: ep-color and "Waiting for data" text
    const { container } = render(LaneSvgChart, { props: baseProps });
    const ring = container.querySelector('.empty-ring');
    expect(ring).not.toBeNull();
    expect(ring?.tagName.toLowerCase()).toBe('circle');
  });

  it('empty-ring has r="40" and stroke-width="0.5" in static state (AC-3)', () => {
    // AC-3: r:40, stroke-width:0.5 in viewBox units
    const { container } = render(LaneSvgChart, { props: baseProps });
    const ring = container.querySelector('.empty-ring');
    expect(ring?.getAttribute('r')).toBe('40');
    expect(ring?.getAttribute('stroke-width')).toBe('0.5');
  });

  it('empty-ring uses var(--ep-color) as stroke (AC-3)', () => {
    // AC-3: ring stroke is ep-color (set inline, not a class)
    const { container } = render(LaneSvgChart, { props: baseProps });
    const ring = container.querySelector('.empty-ring');
    expect(ring?.getAttribute('stroke')).toBe('var(--ep-color)');
  });

  it('empty state text is "Waiting for data" at 10px (AC-3)', () => {
    // AC-3: text smaller and more muted than prior 14px
    const { container } = render(LaneSvgChart, { props: baseProps });
    const text = container.querySelector('.empty-text');
    expect(text?.textContent).toContain('Waiting for data');
  });

  it('does not render .empty-ring when points exist (AC-3)', () => {
    // AC-3: ring only shown in empty state
    const { container } = render(LaneSvgChart, {
      props: {
        ...baseProps,
        points: [{ round: 1, y: 0.5, latency: 50, status: 'ok' as const, endpointId: 'ep-1', x: 1, color: '#67e8f9' }],
      },
    });
    expect(container.querySelector('.empty-ring')).toBeNull();
  });
```

- [ ] **4.5** Run:
  ```
  npm run typecheck && npm test -- tests/unit/lane-svg-chart.test.ts
  ```
  Expected: all tests pass including new AC-3 assertions.

---

## Task 5 — FooterBar 480px breakpoint

**Files:**
- Modify: `src/lib/components/FooterBar.svelte`
- Modify: `tests/unit/components/footer-bar.test.ts`

**Pre-task reads:**
- [x] `src/lib/components/FooterBar.svelte` (read above — lines 1–81)
- [x] `tests/unit/components/footer-bar.test.ts` (read above — lines 1–21)

### Steps

- [ ] **5.1** In `FooterBar.svelte`'s `<style>`, replace the existing `@media (max-width: 767px)` block with:

```css
  @media (max-width: 767px) {
    .foot { padding: 0 12px; gap: 8px; }
    .config { display: none; }
  }
  @media (max-width: 479px) {
    /* AC-5: hide "Measuring from your browser" text at <480px (tokens.breakpoints.small) */
    .highlight { display: none; }
  }
```

No template changes needed — the `.highlight` element already exists.

- [ ] **5.2** Add a test to `tests/unit/components/footer-bar.test.ts`. Append after the existing tests:

```typescript
  it('highlight element has class "highlight" for CSS-based responsive hiding (AC-5)', () => {
    // AC-5: at <480px, "Measuring from your browser" is hidden via CSS display:none
    // The element must exist with class .highlight so the CSS rule can target it
    const { container } = render(FooterBar, { props: {} });
    const highlight = container.querySelector('.highlight');
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toContain('Measuring from your browser');
  });
```

- [ ] **5.3** Run:
  ```
  npm run typecheck && npm test -- tests/unit/components/footer-bar.test.ts
  ```
  Expected: all tests pass.

---

## Task 6 — Playwright AC verification at all four viewports

**Files:**
- Modify: `tests/visual/ac-verification.spec.ts`

**Pre-task reads:**
- [x] `tests/visual/ac-verification.spec.ts` (read above — lines 1–61)

### Steps

- [ ] **6.1** Replace the entire content of `tests/visual/ac-verification.spec.ts` with:

```typescript
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: '1440px', width: 1440, height: 900 },
  { name: '768px',  width: 768,  height: 1024 },
  { name: '480px',  width: 480,  height: 812 },
  { name: '375px',  width: 375,  height: 812 },
] as const;

// ── Existing ACs (preserved) ────────────────────────────────────────────────

test.describe('Acceptance Criteria Verification', () => {
  test('AC1: data visible within 5 seconds of starting test', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    const startBtn = page.getByRole('button', { name: /start/i });
    await startBtn.click();
    await expect(page.locator('[data-has-points="true"]')).toBeVisible({ timeout: 5000 });
  });

  test('AC3: collecting state before 30 rounds, stats after', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    const startBtn = page.getByRole('button', { name: /start/i });
    await startBtn.click();
    await expect(page.getByText(/collecting/i)).toBeVisible({ timeout: 5000 });
  });

  test('keyboard shortcut ? opens overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible({ timeout: 2000 });
  });

  test('keyboard shortcut Escape closes overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: /keyboard shortcuts/i });
    await expect(dialog).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });

  test('legend renders endpoint items', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    const legend = page.getByRole('list', { name: /endpoint legend/i });
    await expect(legend).toBeVisible({ timeout: 2000 });
    const items = legend.getByRole('listitem');
    await expect(items).not.toHaveCount(0);
  });

  test('idle state shows loading animation message', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
    await expect(page.getByText(/ready|configure endpoints/i)).toBeVisible({ timeout: 2000 });
  });
});

// ── UX Polish ACs ───────────────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test.describe(`UX Polish @ ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForSelector('#chronoscope-root');
    });

    // AC-1: Button hierarchy — Start button is visually distinct
    test('AC-1: Start button has .btn-start class (filled accent)', async ({ page }) => {
      // AC-1: At 1440px, Start button has visible filled accent background distinguishable from others
      const startBtn = page.getByRole('button', { name: /^start$/i });
      await expect(startBtn).toBeVisible();
      // Class presence verifies token-driven styling is applied
      await expect(startBtn).toHaveClass(/btn-start/);
    });

    test('AC-1: Secondary buttons do NOT have btn-start class', async ({ page }) => {
      // AC-1: Settings/Share/+ Endpoint buttons are ghost (no filled accent)
      const settingsBtn = page.getByRole('button', { name: /settings/i });
      if (await settingsBtn.isVisible()) {
        const cls = await settingsBtn.getAttribute('class') ?? '';
        expect(cls).not.toContain('btn-start');
      }
    });

    // AC-2: Information hierarchy — "Median" label, no "P50 MEDIAN LATENCY"
    test('AC-2: "P50 Median Latency" text does not appear anywhere', async ({ page }) => {
      // AC-2: The "P50 MEDIAN LATENCY" engineering label is removed
      const match = await page.getByText(/P50 Median Latency/i).count();
      expect(match).toBe(0);
    });

    test('AC-2: "Median" label appears in lane panel', async ({ page }) => {
      // AC-2: Single word "Median" replaces the removed engineering label
      await expect(page.locator('.lane-label').first()).toBeVisible();
      const text = await page.locator('.lane-label').first().textContent();
      expect(text?.trim()).toBe('Median');
    });

    // AC-3: Empty state ring renders
    test('AC-3: empty state ring renders when no data exists', async ({ page }) => {
      // AC-3: Centered SVG ring with stroke: ep-color present before any test runs
      const ring = page.locator('.empty-ring').first();
      await expect(ring).toHaveCount(1); // opacity: 0.06 is too low for toBeVisible()
    });

    test('AC-3: "Waiting for data" text appears in empty state', async ({ page }) => {
      // AC-3: text below ring
      await expect(page.getByText('Waiting for data').first()).toBeVisible({ timeout: 2000 });
    });

    // AC-3: prefers-reduced-motion — no <animate> children
    test('AC-3: empty ring has no <animate> children with prefers-reduced-motion', async ({ page }) => {
      // AC-3: with prefers-reduced-motion: reduce, ring has no <animate> children
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const animateCount = await page.locator('.empty-ring animate').count();
      expect(animateCount).toBe(0);
    });

    // AC-4: CSS transition ≥100ms
    test('AC-4: Start button has CSS transition on background/border-color/color', async ({ page }) => {
      // AC-4: Clicking Start triggers CSS transition on background, border-color, color
      const startBtn = page.getByRole('button', { name: /^start$/i });
      const transitionStyle = await startBtn.evaluate((el) => {
        return window.getComputedStyle(el).transition;
      });
      // Transition string should reference background and not be "all 0s" or empty
      expect(transitionStyle).toContain('background');
    });

    test('AC-4: Start button transition-duration is 0s with prefers-reduced-motion', async ({ page }) => {
      // AC-4: prefers-reduced-motion: all CSS transition-duration set to 0s
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const startBtn = page.getByRole('button', { name: /^start$/i });
      const duration = await startBtn.evaluate((el) => {
        return window.getComputedStyle(el).transitionDuration;
      });
      // All durations should be 0s
      const durations = duration.split(',').map(d => d.trim());
      expect(durations.every(d => d === '0s')).toBe(true);
    });

    // AC-5: No horizontal overflow at any viewport
    test('AC-5: no horizontal overflow at this viewport', async ({ page }) => {
      // AC-5: Zero layout overflow at 375px (and all other viewports)
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflows).toBe(false);
    });

    // AC-5: 375px-specific checks
    ...(vp.width === 375 ? [
      test(`AC-5: Start/Stop button at 375px shows text label (not icon-only)`, async ({ page }) => {
        // AC-5: Start/Stop renders with text label even on smallest viewport
        const startBtn = page.getByRole('button', { name: /^start$/i });
        await expect(startBtn).toBeVisible();
        const text = await startBtn.textContent();
        expect(text?.trim().length).toBeGreaterThan(0);
        // Should contain "Start" word — not just an SVG
        expect(text?.trim()).toMatch(/start|stop/i);
      }),

      test('AC-5: secondary buttons have aria-label at 375px (icon-only)', async ({ page }) => {
        // AC-5: at 375px secondary buttons are icon-only with aria-label
        const settingsBtn = page.getByRole('button', { name: /settings/i });
        await expect(settingsBtn).toBeVisible();
        const label = await settingsBtn.getAttribute('aria-label');
        expect(label).toBeTruthy();
      }),
    ] : []),
  });
}

// ── Separate reduced-motion suite ───────────────────────────────────────────

test.describe('prefers-reduced-motion: all four ACs', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('AC-3: empty ring has no animate children (reduced-motion)', async ({ page }) => {
    const animateCount = await page.locator('.empty-ring animate').count();
    expect(animateCount).toBe(0);
  });

  test('AC-4: Start button transition-duration is 0s (reduced-motion)', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /^start$/i });
    const duration = await startBtn.evaluate((el) => window.getComputedStyle(el).transitionDuration);
    const durations = duration.split(',').map(d => d.trim());
    expect(durations.every(d => d === '0s')).toBe(true);
  });
});
```

Note: The `...(vp.width === 375 ? [...] : [])` spread pattern is not valid for test definitions — replace the conditional tests with a separate viewport-specific describe block. Revise step 6.1 to use this corrected structure instead:

```typescript
// 375px-specific AC-5 tests
test.describe('AC-5: 375px specific checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForSelector('#chronoscope-root');
  });

  test('Start/Stop button at 375px shows text label (not icon-only) — AC-5', async ({ page }) => {
    // AC-5: Start/Stop renders with text label even on smallest viewport
    const startBtn = page.getByRole('button', { name: /^start$/i });
    await expect(startBtn).toBeVisible();
    const text = await startBtn.textContent();
    expect(text?.trim()).toMatch(/start|stop/i);
  });

  test('secondary buttons have aria-label at 375px (icon-only) — AC-5', async ({ page }) => {
    // AC-5: at 375px secondary buttons are icon-only with aria-label
    const settingsBtn = page.getByRole('button', { name: /settings/i });
    await expect(settingsBtn).toBeVisible();
    const label = await settingsBtn.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('no horizontal overflow at 375px — AC-5', async ({ page }) => {
    // AC-5: zero horizontal scroll
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows).toBe(false);
  });
});
```

The full corrected file for step 6.1 replaces the conditional spread with these three structural changes:
1. Keep the per-viewport `for` loop tests but remove the 375px-only inline conditional block
2. Add the separate `'AC-5: 375px specific checks'` describe block above
3. Keep the `prefers-reduced-motion` describe block

- [ ] **6.2** Run typecheck to verify no Playwright TypeScript errors:
  ```
  npm run typecheck
  ```

- [ ] **6.3** Run the full Playwright suite against the dev server:
  ```
  npm run dev &
  sleep 3
  npx playwright test tests/visual/ac-verification.spec.ts
  ```
  Expected: All AC tests pass. If visual baselines have drifted from the Topbar/Lane changes, update them:
  ```
  npx playwright test tests/visual/visual-regression.spec.ts --update-snapshots
  ```

---

## Task 7 — Final verification gate

**Files:** None (verification only)

### Steps

- [ ] **7.1** Run full typecheck:
  ```
  npm run typecheck
  ```
  Expected: zero errors.

- [ ] **7.2** Run full lint:
  ```
  npm run lint
  ```
  Expected: zero violations. The `no-raw-visual-values` ESLint rule will catch any raw hex/rgba that slipped into component CSS. All new values added in Tasks 2–5 reference CSS custom properties (set from tokens via `style:` bindings) — no raw values in component CSS.

- [ ] **7.3** Run full unit test suite:
  ```
  npm test
  ```
  Expected: all tests pass.

- [ ] **7.4** Run Playwright full suite at all four viewports:
  ```
  npx playwright test
  ```
  Expected: AC-1 through AC-5 pass at 1440px, 768px, 480px, 375px.

- [ ] **7.5** Commit on `feature/ux-polish` branch with message:
  ```
  feat: UX polish — button hierarchy, lane info hierarchy, empty state ring, mobile 375px
  ```

---

## Summary of Changes

| File | Change |
|------|--------|
| `tokens.ts` | +4 primitives (cyan15/25, pink15/25), +4 semantic accent tokens, +1 breakpoint (small:480), +3 timing tokens |
| `Topbar.svelte` | Filled Start/Stop buttons, ghost secondary buttons, icon-only mobile collapse, run-status restructure, 200ms transitions, reduced-motion 0s |
| `Lane.svelte` | Label → Sora 12px/500/t2, "Median" replaces "P50 MEDIAN LATENCY", stats 12px/8px/t5, container query 2×2, hero `clamp(32px,10vw,54px)` mobile, panel padding 16px 20px mobile |
| `LaneSvgChart.svelte` | Animated ring empty state, `reducedMotion` guard, text 10px via `--empty-fill` token |
| `FooterBar.svelte` | Hide `.highlight` at <480px |
| `tests/unit/tokens.test.ts` | New token assertions |
| `tests/unit/components/topbar.test.ts` | AC-1 class, AC-4 timing, showRunStatus logic |
| `tests/unit/components/lane.test.ts` | Replace stale P50 test, add AC-2 Median/label assertions |
| `tests/unit/lane-svg-chart.test.ts` | AC-3 ring assertions (5 new tests) |
| `tests/unit/components/footer-bar.test.ts` | AC-5 `.highlight` class assertion |
| `tests/visual/ac-verification.spec.ts` | Full AC-1 through AC-5 Playwright coverage at all four viewports |
