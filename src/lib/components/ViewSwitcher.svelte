<!-- src/lib/components/ViewSwitcher.svelte -->
<!-- Five-tab view picker. Sits below the topbar, above the main content area. -->
<!-- Overview / Live / Atlas are shipped; Strata / Terminal stay               -->
<!-- disabled-with-tooltip until their prototypes land (issues #50, #51).      -->
<!-- The Lanes tab was retired in Phase 7.                                     -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import type { ActiveView } from '$lib/types';

  interface ViewDef {
    readonly id: ActiveView;
    readonly key: string;
    readonly label: string;
    readonly hint: string;
    readonly enabled: boolean;
  }

  // Visible label list. Order matches the prototype's left-to-right reading.
  const VIEWS: readonly ViewDef[] = [
    { id: 'overview', key: '1', label: 'Overview', hint: 'At a glance',     enabled: true  },
    { id: 'live',     key: '2', label: 'Live',     hint: 'Real-time scope', enabled: true  },
    { id: 'atlas',    key: '3', label: 'Atlas',    hint: 'Phase breakdown', enabled: true  },
    { id: 'strata',   key: '4', label: 'Strata',   hint: 'Distribution',    enabled: false },
    { id: 'terminal', key: '5', label: 'Terminal', hint: 'Event log',       enabled: false },
  ];

  const DISABLED_TOOLTIP = 'Prototype in progress — not yet available.';

  const activeView = $derived($uiStore.activeView);

  function isActive(id: ActiveView): boolean {
    return activeView === id;
  }

  function selectView(view: ViewDef): void {
    if (!view.enabled) return;
    uiStore.setActiveView(view.id);
  }
</script>

<nav class="view-switcher" role="group" aria-label="Views">
  {#each VIEWS as view (view.id)}
    {@const active = isActive(view.id)}
    <button
      type="button"
      class="view-tab"
      class:active
      class:disabled={!view.enabled}
      aria-current={active ? 'page' : undefined}
      aria-pressed={active}
      aria-disabled={!view.enabled}
      title={view.enabled ? '' : DISABLED_TOOLTIP}
      tabindex={view.enabled ? 0 : -1}
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
    <span class="kbd">⌨ 1·2·3·4·5</span>
  </div>
</nav>

<style>
  .view-switcher {
    display: flex;
    gap: 3px;
    padding: 10px 18px 0;
    align-items: stretch;
    border-bottom: 1px solid var(--border-mid);
    background: rgba(10, 9, 18, 0.3);
    flex-shrink: 0;
  }
  .view-tab {
    background: transparent;
    border: none;
    padding: 8px 10px 12px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 6px 6px 0 0;
    position: relative;
    transition: background 160ms ease, color 160ms ease;
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
    left: 0;
    right: 0;
    height: 2px;
    background: transparent;
    transition: background 200ms ease, box-shadow 200ms ease;
  }
  .view-tab:hover:not(.disabled) {
    color: var(--t1);
    background: rgba(255, 255, 255, 0.02);
  }
  .view-tab.active {
    color: var(--t1);
    background: rgba(103, 232, 249, 0.05);
  }
  .view-tab.active::after {
    background: var(--accent-cyan);
    box-shadow: 0 0 10px var(--glow-cyan);
  }
  .view-tab.disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .view-tab:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .view-tab-key {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-mid);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
  }
  .view-tab.active .view-tab-key {
    background: rgba(103, 232, 249, 0.15);
    border-color: rgba(103, 232, 249, 0.3);
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
    font-weight: 500;
    white-space: nowrap;
  }
  .view-tab-sub {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .view-tab.active .view-tab-sub { color: var(--t3); }

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
    color: var(--t4);
    letter-spacing: var(--tr-label);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .view-tab, .view-tab::after { transition: none; }
  }
</style>
