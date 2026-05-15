<!-- src/lib/components/OverviewSubtabStrip.svelte -->
<!-- Two-button segmented control that selects between the racing-strip and   -->
<!-- timeline cards in OverviewView's right column. Rendered on narrow        -->
<!-- viewports only (≤1023 px) where both cards don't fit above the fold;     -->
<!-- the parent hides this strip via CSS at desktop widths.                   -->
<script lang="ts">
  type Subtab = 'racing' | 'events';

  let {
    selected,
    onSelect,
  }: {
    selected: Subtab;
    onSelect: (next: Subtab) => void;
  } = $props();

  // `panelId` is the DOM id of the corresponding tabpanel; the parent
  // (OverviewView) owns those elements and uses these same ids on its
  // `.card-slot` wrappers so `aria-controls` / `aria-labelledby` forms a
  // proper WAI-ARIA tabs relationship.
  const TABS: readonly { readonly id: Subtab; readonly label: string; readonly tabId: string; readonly panelId: string }[] = [
    { id: 'racing', label: 'Per-endpoint', tabId: 'overview-subtab-racing', panelId: 'overview-panel-racing' },
    { id: 'events', label: 'Timeline', tabId: 'overview-subtab-events', panelId: 'overview-panel-events' },
  ];

  function onKeydown(e: KeyboardEvent, idx: number): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = (idx + dir + TABS.length) % TABS.length;
    onSelect(TABS[nextIdx].id);
    // Focus the newly-selected tab to match tablist conventions.
    const buttons = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
    buttons?.[nextIdx]?.focus();
  }
</script>

<div class="subtab-strip" role="tablist" aria-label="Status detail">
  {#each TABS as tab, idx (tab.id)}
    {@const active = tab.id === selected}
    <button
      type="button"
      role="tab"
      id={tab.tabId}
      aria-controls={tab.panelId}
      aria-selected={active}
      tabindex={active ? 0 : -1}
      class:active
      onclick={() => onSelect(tab.id)}
      onkeydown={(e) => onKeydown(e, idx)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .subtab-strip {
    display: flex;
    gap: 2px;
    padding: 0;
    border-bottom: 1px solid var(--border-mid);
  }
  button[role="tab"] {
    background: transparent;
    border: none;
    border-radius: 7px 7px 0 0;
    color: var(--t3);
    font-family: var(--sans);
    font-size: var(--ts-sm);
    letter-spacing: var(--tr-label);
    padding: 8px 12px 10px;
    cursor: pointer;
    position: relative;
    transition: color 120ms ease;
  }
  button[role="tab"]::after {
    content: '';
    position: absolute;
    left: 8px; right: 8px; bottom: -1px;
    height: 2px;
    background: transparent;
  }
  button[role="tab"].active,
  button[role="tab"][aria-selected="true"] {
    background: rgba(103, 232, 249, 0.08);
    box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.18);
    color: var(--t1);
  }
  button[role="tab"].active::after,
  button[role="tab"][aria-selected="true"]::after {
    background: var(--accent-cyan);
  }
  button[role="tab"]:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
    border-radius: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    button[role="tab"], button[role="tab"]::after { transition: none; }
  }

  @media (max-width: 767px) and (max-height: 760px) {
    button[role="tab"] {
      padding: 5px 9px 6px;
    }
  }
</style>
