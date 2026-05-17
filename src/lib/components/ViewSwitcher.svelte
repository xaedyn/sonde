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
  .view-switcher-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .view-switcher {
    min-height: 50px;
    display: flex;
    gap: 0;
    padding: 0 24px;
    align-items: stretch;
    border-bottom: 1px solid var(--shell-border);
    background: var(--shell-backdrop);
    flex-shrink: 0;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .view-switcher::-webkit-scrollbar { display: none; }
  .view-tab { scroll-snap-align: start; }
  .view-tab {
    background: transparent;
    border: 0;
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 0;
    position: relative;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
    color: var(--t3);
    font-family: var(--sans);
    cursor: pointer;
    flex-shrink: 0;
    min-width: 0;
    min-height: 50px;
  }
  .view-tab::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 0;
    background: transparent;
    transition: background 200ms ease, box-shadow 200ms ease;
  }
  .view-tab:hover {
    color: var(--t1);
    background: var(--shell-panel-hover);
  }
  .view-tab.active {
    color: var(--accent-cyan);
    background: var(--shell-panel-active);
  }
  .view-tab.active::after {
    background: var(--accent-cyan);
    box-shadow: 0 0 10px var(--glow-cyan);
  }
  .view-tab:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .view-tab-icon {
    width: 18px;
    height: 18px;
    color: currentColor;
    opacity: 0.9;
  }
  .view-tab-icon svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .view-tab-label {
    font-size: var(--ts-lg);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
    white-space: nowrap;
  }

  /* Mobile fade-affordance: visible only when content is clipped on the
     right. Hidden when nothing is being clipped or at desktop widths
     where all four tabs always fit. */
  .view-switcher-fade {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 1px;
    width: 36px;
    pointer-events: none;
    background: linear-gradient(to right, transparent, var(--shell-backdrop));
    opacity: 0;
    transition: opacity 160ms ease;
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
