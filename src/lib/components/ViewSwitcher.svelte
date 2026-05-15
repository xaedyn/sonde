<!-- src/lib/components/ViewSwitcher.svelte -->
<!-- Three-tab view picker. Sits below the topbar, above the main content area. -->
<!-- Route IDs remain stable while labels present the verdict-first IA.         -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import type { ActiveView } from '$lib/types';

  interface ViewDef {
    readonly id: ActiveView;
    readonly key: string;
    readonly label: string;
    readonly hint: string;
  }

  // Visible label list. Order matches the shipped intent-oriented navigation.
  // Numeric keys mirror this order: 1 Status, 2 Live, 3 Investigate.
  const VIEWS: readonly ViewDef[] = [
    { id: 'overview', key: '1', label: 'Status',      hint: 'Is everything okay?' },
    { id: 'live',     key: '2', label: 'Live',        hint: "What's happening right now?" },
    { id: 'diagnose', key: '3', label: 'Investigate', hint: 'Why does it look that way?' },
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
      <span class="view-tab-key" aria-hidden="true">{view.key}</span>
      <span class="view-tab-body">
        <span class="view-tab-label">{view.label}</span>
        <span class="view-tab-sub">{view.hint}</span>
      </span>
    </button>
  {/each}
  <div class="view-switcher-trailing" aria-hidden="true">
    <span class="kbd">⌨ 1·2·3</span>
  </div>
</nav>

<style>
  .view-switcher {
    height: var(--shell-nav-height);
    display: flex;
    gap: 6px;
    padding: 7px 18px 0;
    align-items: stretch;
    border-bottom: 1px solid var(--shell-border);
    background: linear-gradient(180deg, var(--shell-panel), var(--shell-bg));
    flex-shrink: 0;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .view-switcher::-webkit-scrollbar { display: none; }
  .view-tab { scroll-snap-align: start; }
  .view-tab {
    background: transparent;
    border: 1px solid transparent;
    padding: 6px 11px 9px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    position: relative;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
    color: var(--t3);
    font-family: var(--sans);
    cursor: pointer;
    flex-shrink: 1;
    min-width: 0;
  }
  .view-tab::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 8px;
    right: 8px;
    height: 2px;
    border-radius: var(--radius-sm);
    background: transparent;
    transition: background 200ms ease, box-shadow 200ms ease;
  }
  .view-tab:hover {
    color: var(--t1);
    background: var(--shell-panel-hover);
    border-color: var(--shell-border);
  }
  .view-tab.active {
    color: var(--t1);
    background: var(--shell-panel-active);
    border-color: var(--shell-border);
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

  .view-tab-key {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    background: var(--shell-panel-raised);
    border: 1px solid var(--shell-border);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    flex-shrink: 0;
  }
  .view-tab.active .view-tab-key {
    background: var(--shell-panel-active);
    border-color: var(--shell-border-strong);
    color: var(--accent-cyan);
  }

  .view-tab-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
    min-width: 0;
  }
  .view-tab-label {
    font-size: var(--ts-md);
    font-weight: 600;
    white-space: nowrap;
  }
  .view-tab-sub {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t2);
    letter-spacing: var(--tr-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .view-tab.active .view-tab-sub { color: var(--t2); }

  .view-switcher-trailing {
    margin-left: auto;
    display: flex;
    align-items: center;
    padding-right: 4px;
    flex-shrink: 0;
  }
  .kbd {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-label);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .view-tab, .view-tab::after { transition: none; }
  }

  /* Mobile: drop the keyboard-shortcut kicker (keyboard isn't reachable
     anyway) and hide the tab sub-label so tabs pack tighter. */
  @media (max-width: 767px) {
    .view-switcher {
      height: 44px;
      padding: 6px 12px 0;
      gap: 4px;
    }
    .view-switcher-trailing { display: none; }
    .view-tab { padding: 6px 8px 9px 6px; }
    .view-tab-sub { display: none; }
    .view-tab-key { width: 18px; height: 18px; }
  }
</style>
