<!-- src/lib/components/EndpointDrawer.svelte -->
<!-- Slide-in endpoint drawer. Uses <dialog> for a11y. Closes on Escape or      -->
<!-- backdrop click. Embeds EndpointPanel.                                       -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import EndpointPanel from './EndpointPanel.svelte';

  let dialogEl: HTMLDialogElement;
  let isClosing = $state(false);
  let closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  let showEndpoints = $derived($uiStore.showEndpoints);

  // Manage dialog open/close
  $effect(() => {
    if (dialogEl) {
      if (showEndpoints && !dialogEl.open) {
        dialogEl.showModal();
      } else if (!showEndpoints && dialogEl.open && !isClosing) {
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
    dialogEl.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
  });

  onDestroy(() => {
    if (closeTimeoutId !== null) clearTimeout(closeTimeoutId);
  });

  function close(): void {
    if (isClosing) return;
    isClosing = true;
    closeTimeoutId = setTimeout(() => {
      isClosing = false;
      closeTimeoutId = null;
      uiStore.toggleEndpoints();
    }, 150);
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === dialogEl) {
      close();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  id="endpoint-drawer"
  class="endpoint-dialog"
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--radius-md="{tokens.radius.md}px"
  style:--radius-lg="{tokens.radius.lg}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--spacing-xl="{tokens.spacing.xl}px"
  style:--sans={tokens.typography.sans.fontFamily}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
  aria-label="Endpoints"
  onclick={handleBackdropClick}
>
  <div class="drawer-content" class:closing={isClosing} role="document">
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
    background: rgba(0,0,0,.4);
    animation: panelFadeIn 200ms ease-out forwards;
  }

  @keyframes panelFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Drawer content — glass panel ────────────────────────────────────────── */
  .drawer-content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: 100vw;
    background: rgba(12,10,20,.75);
    backdrop-filter: blur(40px) saturate(1.4);
    -webkit-backdrop-filter: blur(40px) saturate(1.4);
    border-left: 1px solid var(--glass-border);
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: panelSlideIn 220ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
    box-shadow: -8px 0 40px rgba(0,0,0,.3);
  }

  .drawer-content.closing {
    animation: panelSlideOut 150ms ease-in forwards;
  }

  /* Desktop: slide from right */
  @keyframes panelSlideIn {
    from { opacity: 0; transform: translateX(100%); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes panelSlideOut {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(100%); }
  }

  /* Top-edge gradient highlight */
  .drawer-content::before {
    content: '';
    position: absolute;
    top: 0; left: 10%; right: 10%;
    height: 1px; z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  /* Left-edge cyan glow */
  .drawer-content::after {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0; width: 80px; z-index: 1;
    pointer-events: none;
    background: linear-gradient(90deg, rgba(103,232,249,.03), transparent);
  }

  @media (max-width: 767px) {
    .drawer-content {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--glass-border);
      top: auto;
      height: 80vh;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      animation: panelSlideUp 220ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
      box-shadow: 0 -8px 40px rgba(0,0,0,.3);
    }
    .drawer-content.closing {
      animation: panelSlideDown 150ms ease-in forwards;
    }
    .drawer-content::after {
      display: none;
    }

    @keyframes panelSlideUp {
      from { opacity: 0; transform: translateY(100%); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @keyframes panelSlideDown {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(100%); }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer-content,
    .drawer-content.closing {
      animation: none !important;
      opacity: 1;
      transform: none;
    }
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-xl) var(--spacing-xl) var(--spacing-lg);
    flex-shrink: 0;
    position: relative;
  }

  .drawer-header::after {
    content: '';
    position: absolute;
    bottom: 0; left: 10%; right: 10%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
  }

  .drawer-title {
    font-family: var(--sans);
    font-size: 18px;
    font-weight: 600;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-pink));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--glass-border);
    border-radius: 50%;
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--t3);
    cursor: pointer;
    transition: all var(--timing-btn) ease;
  }

  .close-btn:hover {
    color: var(--t1);
    background: var(--glass-highlight);
    border-color: rgba(103,232,249,.2);
    box-shadow: 0 0 12px rgba(103,232,249,.2);
  }

  .close-btn:active {
    transform: scale(0.94);
    transition-duration: 50ms;
  }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xl);
    position: relative;
    z-index: 2;
  }
</style>
