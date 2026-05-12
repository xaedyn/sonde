<script lang="ts">
  import CompanionPanel from './CompanionPanel.svelte';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';

  interface Props {
    onOpenSettings?: () => void;
    onClose?: () => void;
  }

  let { onOpenSettings, onClose }: Props = $props();

  const selectedEndpoint = $derived(
    $endpointStore.find((endpoint) => endpoint.id === $uiStore.focusedEndpointId)
      ?? $endpointStore.find((endpoint) => endpoint.enabled)
      ?? $endpointStore[0]
      ?? null,
  );
  const targetLabel = $derived(selectedEndpoint?.label ?? 'selected endpoint');

  function handleOpenSettings(): void {
    onOpenSettings?.();
  }

  function handleClose(): void {
    onClose?.();
  }
</script>

<section class="local-proof-panel" aria-label="Focused local proof">
  <div class="local-proof-head">
    <div>
      <div class="section-kicker">Local proof</div>
      <h2>Focused local proof for {targetLabel}</h2>
      <p>Capture DNS, route, TLS, and Wi-Fi evidence from this computer without changing the report verdict.</p>
    </div>
    <button type="button" class="quiet-button" onclick={handleClose}>Hide</button>
  </div>

  <CompanionPanel title="Local companion proof" idPrefix="local-proof-companion" />

  <div class="local-proof-foot">
    <span>Full settings are still available for defaults, reset actions, and advanced setup.</span>
    <button type="button" class="secondary-button" onclick={handleOpenSettings}>Open full settings</button>
  </div>
</section>

<style>
  .local-proof-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0 0 18px;
    min-width: 0;
  }

  .local-proof-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;
  }

  .local-proof-head h2 {
    margin: 5px 0 0;
    font-size: var(--ts-xl);
    letter-spacing: 0;
  }

  .local-proof-head p {
    margin: 7px 0 0;
    color: var(--t2);
    line-height: 1.45;
  }

  .section-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }

  .local-proof-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.35;
  }

  .quiet-button,
  .secondary-button {
    flex: 0 0 auto;
    min-height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border-mid);
    background: rgba(255,255,255,.025);
    color: var(--t2);
    padding: 0 11px;
    font-family: var(--sans);
    font-size: var(--ts-sm);
    cursor: pointer;
  }

  .secondary-button {
    color: var(--accent-cyan);
    border-color: rgba(103,232,249,.3);
  }

  .quiet-button:hover,
  .secondary-button:hover {
    color: var(--t1);
    border-color: var(--border-bright);
  }

  @media (max-width: 640px) {
    .local-proof-head,
    .local-proof-foot {
      flex-direction: column;
      align-items: stretch;
    }

    .quiet-button,
    .secondary-button {
      width: 100%;
    }
  }
</style>
