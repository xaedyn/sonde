<!-- src/lib/components/EndpointPanel.svelte -->
<!-- Lists all endpoints as EndpointRow components. Add-endpoint button.       -->
<!-- Subscribes to endpointStore and measurementStore.                          -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { tokens } from '$lib/tokens';
  import EndpointRow from './EndpointRow.svelte';

  const MAX_ENDPOINTS = 10;

  $: isRunning = $measurementStore.lifecycle === 'running' || $measurementStore.lifecycle === 'starting';

  function handleRemove(event: CustomEvent<{ id: string }>): void {
    endpointStore.removeEndpoint(event.detail.id);
  }

  function handleUpdate(event: CustomEvent<{ id: string; patch: Record<string, unknown> }>): void {
    endpointStore.updateEndpoint(event.detail.id, event.detail.patch);
  }

  function addEndpoint(): void {
    endpointStore.addEndpoint('https://', '');
  }
</script>

<div
  class="endpoint-panel"
  style:--border={tokens.color.chrome.border}
  style:--accent={tokens.color.chrome.accent}
  style:--surface-raised={tokens.color.surface.raised}
  style:--surface-canvas={tokens.color.surface.canvas}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-muted={tokens.color.text.muted}
  style:--text-primary={tokens.color.text.primary}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
>
  <ul class="endpoint-list" aria-label="Endpoint list">
    {#each $endpointStore as endpoint (endpoint.id)}
      {@const epState = $measurementStore.endpoints[endpoint.id]}
      <li>
        <EndpointRow
          {endpoint}
          {isRunning}
          isLast={$endpointStore.length === 1}
          lastLatency={epState?.lastLatency ?? null}
          lastStatus={epState?.lastStatus ?? null}
          on:remove={handleRemove}
          on:update={handleUpdate}
        />
      </li>
    {/each}
  </ul>

  <div class="panel-footer">
    <button
      type="button"
      class="add-btn"
      disabled={$endpointStore.length >= MAX_ENDPOINTS || isRunning}
      aria-disabled={$endpointStore.length >= MAX_ENDPOINTS || isRunning}
      on:click={addEndpoint}
    >
      + Add endpoint
    </button>

    <p class="browser-note" aria-live="polite">
      Requests are sent from your browser
    </p>
  </div>
</div>

<style>
  .endpoint-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--surface-canvas);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .endpoint-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .endpoint-list > li {
    display: contents;
  }

  /* ── Footer ──────────────────────────────────────────────────────────────── */
  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 1px solid var(--border);
  }

  /* ── Add endpoint button ─────────────────────────────────────────────────── */
  .add-btn {
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
    min-height: 32px;
  }

  .add-btn:hover:not(:disabled) {
    background: var(--surface-raised);
    border-color: var(--accent);
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Browser note ────────────────────────────────────────────────────────── */
  .browser-note {
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    color: var(--text-muted);
    text-align: right;
  }
</style>
