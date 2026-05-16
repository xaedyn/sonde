<!-- src/lib/components/ViewSwitcher.svelte -->
<!-- Figma-aligned top-level navigation. Sits below the topbar.                -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import type { ActiveView } from '$lib/types';

  interface ViewDef {
    readonly id: ActiveView;
    readonly key: string;
    readonly label: string;
    readonly icon: 'activity' | 'bars' | 'search' | 'share';
  }

  // Visible label list. Order matches the Figma alignment reference.
  // Numeric keys mirror this order: 1 Overview, 2 Live, 3 Investigate, 4 Report.
  const VIEWS: readonly ViewDef[] = [
    { id: 'overview', key: '1', label: 'Overview',    icon: 'activity' },
    { id: 'live',     key: '2', label: 'Live',        icon: 'bars' },
    { id: 'diagnose', key: '3', label: 'Investigate', icon: 'search' },
    { id: 'report',   key: '4', label: 'Report',      icon: 'share' },
  ];

  const activeView = $derived($uiStore.activeView);

  function isActive(id: ActiveView): boolean {
    return activeView === id;
  }

  function selectView(view: ViewDef): void {
    uiStore.setActiveView(view.id);
  }
</script>

<nav class="view-switcher" aria-label="Views">
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
      <span class="view-tab-key" aria-hidden="true">{view.key}</span>
    </button>
  {/each}
</nav>

<style>
  .view-switcher {
    min-height: 50px;
    display: flex;
    gap: 0;
    padding: 0 24px;
    align-items: stretch;
    border-bottom: 1px solid var(--shell-border);
    background: rgba(7, 11, 18, 0.68);
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
  .view-tab-key {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .view-tab, .view-tab::after { transition: none; }
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
    .view-tab-key { display: none; }
  }
</style>
