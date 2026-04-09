<!-- src/lib/components/EndpointDrawer.svelte -->
<!-- Slide-in endpoint drawer. Uses <dialog> for a11y. Closes on Escape or      -->
<!-- backdrop click. Embeds EndpointPanel.                                       -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '$lib/stores/ui';
  import EndpointPanel from './EndpointPanel.svelte';

  let dialogEl: HTMLDialogElement;

  let showEndpoints = $derived($uiStore.showEndpoints);

  // Manage dialog open/close
  $effect(() => {
    if (dialogEl) {
      if (showEndpoints && !dialogEl.open) {
        dialogEl.showModal();
      } else if (!showEndpoints && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  onMount(() => {
    // Since this component only mounts when showEndpoints is true, open immediately.
    if (!dialogEl.open) {
      dialogEl.showModal();
    }
    dialogEl.addEventListener('close', () => {
      if ($uiStore.showEndpoints) uiStore.toggleEndpoints();
    });
  });

  function close(): void {
    uiStore.toggleEndpoints();
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === dialogEl) {
      close();
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog
  bind:this={dialogEl}
  id="endpoint-drawer"
  class="endpoint-dialog"
  aria-label="Endpoints"
  onclick={handleBackdropClick}
>
  <div class="drawer-content" role="document">
    <!-- Header -->
    <div class="drawer-header">
      <h2 class="drawer-title">Endpoints</h2>
      <button
        type="button"
        class="close-btn"
        aria-label="Close endpoints"
        onclick={close}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="drawer-body">
      <EndpointPanel />
    </div>
  </div>
</dialog>

<style>
  /* ── Dialog / backdrop ───────────────────────────────────────────────────── */
  .endpoint-dialog {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    overflow: hidden;
  }

  .endpoint-dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }

  /* Drawer content slides in from right */
  .drawer-content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: 100vw;
    background: var(--surface-raised);
    backdrop-filter: blur(30px) saturate(1.3);
    -webkit-backdrop-filter: blur(30px) saturate(1.3);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  @media (max-width: 767px) {
    .drawer-content {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--border);
      top: auto;
      height: 80vh;
      border-radius: 12px 12px 0 0;
    }
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-md);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .drawer-title {
    font-family: var(--sans);
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }

  .close-btn:hover {
    color: var(--text-primary);
    background: var(--surface-elevated);
  }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
  }
</style>
