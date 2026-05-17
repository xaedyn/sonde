<!-- src/lib/components/ViewSwitcher.svelte -->
<!-- Figma-aligned top-level navigation. Sits below the topbar.                -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import type { ActiveView } from '$lib/types';

  import { navigateTo } from '$lib/router';

  // ViewSwitcher only navigates to non-endpoint top-level routes. Narrowing
  // the union so TypeScript knows endpointId is always null here.
  type SwitcherRoute = 'overview' | 'live' | 'investigate' | 'report';

  interface ViewDef {
    readonly id: ActiveView;
    readonly route: SwitcherRoute;
    readonly label: string;
    readonly icon: 'activity' | 'bars' | 'search' | 'share';
  }

  // Visible label list. Order matches the Figma alignment reference.
  // Numeric key suffixes that used to appear after each label were removed
  // per the synthesis design contract — they crept into the accessible name
  // even with aria-hidden because WAI-ARIA's name-from-content rules for
  // buttons still include aria-hidden descendant text.
  const VIEWS: readonly ViewDef[] = [
    { id: 'overview', route: 'overview',    label: 'Overview',    icon: 'activity' },
    { id: 'live',     route: 'live',        label: 'Live',        icon: 'bars' },
    { id: 'diagnose', route: 'investigate', label: 'Investigate', icon: 'search' },
    { id: 'report',   route: 'report',      label: 'Report',      icon: 'share' },
  ];

  const activeView = $derived($uiStore.activeView);

  function isActive(id: ActiveView): boolean {
    return activeView === id;
  }

  function selectView(view: ViewDef): void {
    // Route through the router so the URL stays in sync.
    navigateTo({ name: view.route, endpointId: null });
  }

  // Mobile fade-affordance state — true when the scroll strip can scroll
  // right (i.e. the rightmost tab is partially or fully off-screen).
  let switcherEl: HTMLElement | null = $state(null);
  let canScrollRight = $state(false);
  let canScrollLeft = $state(false);

  function updateScrollAffordance(): void {
    if (switcherEl === null) return;
    const max = switcherEl.scrollWidth - switcherEl.clientWidth;
    canScrollRight = switcherEl.scrollLeft < max - 1;
    canScrollLeft = switcherEl.scrollLeft > 1;
  }
</script>

<div
  class="view-switcher-wrap"
  data-scroll-left={canScrollLeft ? 'true' : 'false'}
  data-scroll-right={canScrollRight ? 'true' : 'false'}
>
  <nav
    class="view-switcher"
    aria-label="Views"
    bind:this={switcherEl}
    onscroll={updateScrollAffordance}
  >
    {#each VIEWS as view (view.id)}
      {@const active = isActive(view.id)}
      <button
        type="button"
        class="view-tab"
        class:active
        aria-current={active ? 'page' : undefined}
        aria-pressed={active}
        onclick={() => selectView(view)}
      >
        <span class="view-tab-icon" aria-hidden="true" data-icon={view.icon}>
          {#if view.icon === 'activity'}
            <svg viewBox="0 0 16 16"><path d="M1.8 8h2.4l1.2-3.8 2 7.6L9.1 8h2.1l.8-2.2.9 2.2h1.3" /></svg>
          {:else if view.icon === 'bars'}
            <svg viewBox="0 0 16 16"><path d="M3.5 12V7.5M8 12V4M12.5 12V2.5" /></svg>
          {:else if view.icon === 'search'}
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 14 14" /></svg>
          {:else}
            <svg viewBox="0 0 16 16"><path d="M5 8.5V12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M8 4l3-3m0 0 3 3m-3-3v9" /></svg>
          {/if}
        </span>
        <span class="view-tab-label">{view.label}</span>
      </button>
    {/each}
  </nav>
  <!-- Mobile fade-affordance: visible only at <420px when content is clipped on the right. -->
  <span class="view-switcher-fade" aria-hidden="true"></span>
</div>

<style>
  /* v2 segmented control. No underline, no panel-active fill — the active
     tab is a filled rectangle inside a tinted track. Inactive tabs hover
     to t1. The wrap stays scrollable at mobile for ≤375 px viewports. */
  .view-switcher-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .view-switcher {
    display: inline-flex;
    align-items: stretch;
    gap: 0;
    padding: 4px;
    background: color-mix(in srgb, black 50%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1) 4%, transparent);
    border-radius: 12px;
    box-shadow: inset 0 1px 2px color-mix(in srgb, black 40%, transparent);
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .view-switcher::-webkit-scrollbar { display: none; }
  .view-tab { scroll-snap-align: start; }
  .view-tab {
    background: transparent;
    border: 1px solid transparent;
    padding: 6px 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    position: relative;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
    color: var(--t3);
    font-family: var(--sans);
    cursor: pointer;
    flex-shrink: 0;
    min-width: 0;
    min-height: 32px;
  }
  .view-tab:hover {
    color: var(--t2);
  }
  .view-tab.active {
    color: var(--t1);
    background: var(--shell-panel-raised);
    border-color: color-mix(in srgb, var(--t1) 5%, transparent);
  }
  .view-tab:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .view-tab-icon {
    width: 16px;
    height: 16px;
    color: currentColor;
    opacity: 0.95;
  }
  .view-tab-icon svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .view-tab-label {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.01em;
    text-transform: none;
    white-space: nowrap;
  }

  /* Mobile fade-affordance: visible only when content is clipped on the
     right. Tinted to match the segmented-control track so it reads as a
     continuation of the track surface rather than a foreign overlay. */
  .view-switcher-fade {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 32px;
    pointer-events: none;
    background: linear-gradient(to right, transparent, color-mix(in srgb, black 50%, transparent));
    opacity: 0;
    transition: opacity 160ms ease;
    border-radius: 0 12px 12px 0;
  }
  .view-switcher-wrap[data-scroll-right='true'] .view-switcher-fade {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .view-tab,
    .view-tab::after,
    .view-switcher-fade { transition: none; }
  }

  /* Desktop / laptop: all 4 tabs always fit; fade affordance is forced off. */
  @media (min-width: 420px) {
    .view-switcher-fade { display: none; }
  }

  @media (max-width: 767px) {
    .view-switcher {
      min-height: 44px;
      padding: 0 16px;
    }
    .view-tab {
      min-height: 44px;
      padding: 0 14px;
    }
    .view-tab-label { font-size: var(--ts-md); }
  }
</style>
