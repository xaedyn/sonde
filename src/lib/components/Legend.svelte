<!-- src/lib/components/Legend.svelte -->
<!-- Horizontal legend showing each endpoint's color and truncated URL.         -->
<!-- Click or Enter to toggle endpoint visibility.                               -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { tokens } from '$lib/tokens';

  const MAX_LABEL_LEN = 30;

  function truncate(text: string): string {
    if (text.length <= MAX_LABEL_LEN) return text;
    return text.slice(0, MAX_LABEL_LEN - 1) + '…';
  }

  function toggleEndpoint(id: string): void {
    const ep = $endpointStore.find(e => e.id === id);
    if (!ep) return;
    endpointStore.updateEndpoint(id, { enabled: !ep.enabled });
  }

  function handleKeydown(e: KeyboardEvent, id: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleEndpoint(id);
    }
  }
</script>

<div
  class="legend"
  role="list"
  aria-label="Endpoint legend — click to toggle visibility"
  style:--border={tokens.color.chrome.border}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-muted={tokens.color.text.muted}
  style:--surface-raised={tokens.color.surface.raised}
  style:--spacing-xxs="{tokens.spacing.xxs}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--radius-sm="{tokens.radius.sm}px"
>
  {#each $endpointStore as ep (ep.id)}
    <div
      class="legend-item"
      class:disabled={!ep.enabled}
      role="listitem"
      tabindex="0"
      aria-label="{ep.label || ep.url} — {ep.enabled ? 'visible, click to hide' : 'hidden, click to show'}"
      aria-pressed={ep.enabled}
      on:click={() => toggleEndpoint(ep.id)}
      on:keydown={(e) => handleKeydown(e, ep.id)}
    >
      <span
        class="swatch"
        aria-hidden="true"
        style:background={ep.enabled ? ep.color : 'transparent'}
        style:border-color={ep.color}
      ></span>
      <span class="label">{truncate(ep.label || ep.url)}</span>
    </div>
  {/each}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xxs);
    padding: var(--spacing-xxs) var(--spacing-xs);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    user-select: none;
    transition: background 150ms ease;
    outline: none;
  }

  .legend-item:hover,
  .legend-item:focus-visible {
    background: var(--surface-raised);
  }

  .legend-item:focus-visible {
    outline: 2px solid var(--accent, #4a90d9);
    outline-offset: 1px;
  }

  .legend-item.disabled {
    opacity: 0.45;
  }

  .swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    flex-shrink: 0;
  }

  .label {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }
</style>
