<!-- src/lib/components/EndpointDrawer.svelte -->
<!-- Slide-in endpoint drawer. Uses <dialog> for a11y. Closes on Escape or      -->
<!-- backdrop click. Embeds EndpointPanel.                                       -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
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
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--radius-md="{tokens.radius.md}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--sans={tokens.typography.sans.fontFamily}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
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
    background: rgba(0,0,0,.6);
  }

  /* ── Drawer content — glass panel ────────────────────────────────────────── */
  .drawer-content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: 100vw;
    background: rgba(12,10,20,.92);
    backdrop-filter: blur(40px) saturate(1.4);
    -webkit-backdrop-filter: blur(40px) saturate(1.4);
    border-left: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .drawer-content::before {
    content: '';
    position: absolute;
    top: 0; left: 10%; right: 10%;
    height: 1px; z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  @media (max-width: 767px) {
    .drawer-content {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--glass-border);
      top: auto;
      height: 80vh;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-md);
    border-bottom: 1px solid var(--glass-border);
    flex-shrink: 0;
  }

  .drawer-title {
    font-family: var(--sans);
    font-size: 18px;
    font-weight: 600;
    color: var(--t1);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: var(--topbar-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--t3);
    cursor: pointer;
    transition: all var(--timing-btn) ease;
  }

  .close-btn:hover {
    color: var(--t1);
    background: var(--glass-highlight);
    border-color: var(--glass-highlight);
    transform: translateY(-1px);
    box-shadow: 0 2px 12px rgba(0,0,0,.2);
  }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
  }
</style>
