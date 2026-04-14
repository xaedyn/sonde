<!-- src/lib/components/EndpointPanel.svelte -->
<!-- Lists all endpoints as EndpointRow components. Add-endpoint button.       -->
<!-- Subscribes to endpointStore and measurementStore.                          -->
<script lang="ts">
  import { endpointStore, MAX_ENDPOINTS } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { tokens } from '$lib/tokens';
  import EndpointRow from './EndpointRow.svelte';

  let isRunning = $derived($measurementStore.lifecycle === 'running' || $measurementStore.lifecycle === 'starting');

  function handleRemove(id: string): void {
    endpointStore.removeEndpoint(id);
  }

  function handleUpdate(id: string, patch: Record<string, unknown>): void {
    endpointStore.updateEndpoint(id, patch);
  }

  function addEndpoint(): void {
    endpointStore.addEndpoint('https://', '');
  }
</script>

<div
  class="endpoint-panel"
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-bg-strong={tokens.color.glass.bgStrong}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--sans={tokens.typography.sans.fontFamily}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
>
  <ul class="endpoint-list" aria-label="Endpoint list">
    {#each $endpointStore as endpoint (endpoint.id)}
      {@const epState = $measurementStore.endpoints[endpoint.id]}
      {@const enabledCount = $endpointStore.filter(e => e.enabled).length}
      <li>
        <EndpointRow
          {endpoint}
          {isRunning}
          isLast={$endpointStore.length === 1}
          isLastEnabled={endpoint.enabled && enabledCount === 1}
          lastLatency={epState?.lastLatency ?? null}
          lastStatus={epState?.lastStatus ?? null}
          lastErrorMessage={epState?.lastErrorMessage ?? null}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
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
      title={$endpointStore.length >= MAX_ENDPOINTS
        ? `Maximum ${MAX_ENDPOINTS} endpoints reached`
        : isRunning
          ? 'Cannot add endpoints while running'
          : 'Add endpoint'}
      onclick={addEndpoint}
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
    overflow: hidden;
  }

  .endpoint-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .endpoint-list > li {
    display: block;
  }

  /* ── Footer ──────────────────────────────────────────────────────────────── */
  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    margin-top: var(--spacing-sm);
    position: relative;
  }

  .panel-footer::before {
    content: '';
    position: absolute;
    top: 0; left: 10%; right: 10%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
  }

  /* ── Add endpoint button — matches topbar button exactly ────────────────── */
  .add-btn {
    padding: 7px 16px;
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: var(--topbar-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--t2);
    font-size: 11px;
    font-weight: 500;
    font-family: var(--sans);
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: all var(--timing-btn) ease;
    min-height: 32px;
    white-space: nowrap;
  }

  .add-btn:hover:not(:disabled) {
    background: var(--glass-highlight);
    border-color: var(--glass-highlight);
    color: var(--t1);
    transform: translateY(-1px);
    box-shadow: 0 2px 12px rgba(0,0,0,.2);
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Browser note ────────────────────────────────────────────────────────── */
  .browser-note {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--t3);
    text-align: right;
  }
</style>
