<!-- src/lib/components/KeyboardOverlay.svelte -->
<!-- Modal showing all keyboard shortcuts. Triggered by '?' key.               -->
<!-- Close via Escape, click outside, or dedicated close button.                -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';

  const shortcuts: { keys: string; description: string }[] = [
    { keys: 'Space / Enter', description: 'Start or stop the test' },
    { keys: '?', description: 'Show / hide this overlay' },
    { keys: 'Escape', description: 'Close overlay / clear selection' },
    { keys: '1 \u2013 9', description: 'Toggle endpoint 1\u20139 visibility' },
    { keys: '0', description: 'Toggle endpoint 10 visibility' },
  ];

  let dialogEl: HTMLDivElement | undefined = $state();
  let previouslyFocused: HTMLElement | null = null;

  const FOCUSABLE_SELECTORS =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function getFocusableElements(): HTMLElement[] {
    if (!dialogEl) return [];
    return Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
  }

  function trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  $effect(() => {
    if (!dialogEl) return;
    previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      dialogEl.focus();
    }
  });

  function close(): void {
    const toRestore = previouslyFocused;
    uiStore.toggleKeyboardHelp();
    requestAnimationFrame(() => {
      toRestore?.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      close();
    } else {
      trapFocus(e);
    }
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={handleBackdropClick}
>
  <div
    bind:this={dialogEl}
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Keyboard shortcuts"
    tabindex="-1"
  >
    <header class="dialog-header">
      <h2 class="dialog-title">Keyboard Shortcuts</h2>
      <button
        class="close-btn"
        type="button"
        aria-label="Close keyboard shortcuts"
        onclick={close}
      >
        &#x2715;
      </button>
    </header>

    <table class="shortcut-table" aria-label="Keyboard shortcut reference">
      <thead>
        <tr>
          <th scope="col">Key</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {#each shortcuts as { keys, description } (keys)}
          <tr>
            <td><kbd>{keys}</kbd></td>
            <td>{description}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="hint">Press <kbd>Escape</kbd> or click outside to close.</p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--surface-overlay);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-md);
  }

  .dialog {
    background: rgba(12,10,20,.75);
    backdrop-filter: blur(40px) saturate(1.4);
    -webkit-backdrop-filter: blur(40px) saturate(1.4);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-xl);
    min-width: 360px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    outline: none;
    position: relative;
    overflow: hidden;
  }
  .dialog::before {
    content: '';
    position: absolute;
    top: 0; left: 10%; right: 10%;
    height: 1px; z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
  }

  .dialog-title {
    margin: 0;
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 600;
    color: var(--t1);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--t3);
    font-size: 16px;
    cursor: pointer;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    line-height: 1;
    transition: color 150ms ease;
    min-height: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: var(--t1);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .shortcut-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--sans);
    font-size: 13px;
  }

  .shortcut-table th {
    text-align: left;
    color: var(--t3);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--glass-border);
  }

  .shortcut-table td {
    padding: var(--spacing-sm) var(--spacing-sm);
    color: var(--t2);
    vertical-align: middle;
  }

  .shortcut-table tr:not(:last-child) td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  kbd {
    display: inline-block;
    padding: 2px var(--spacing-xs);
    background: var(--surface-overlay);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-xs);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t1);
    white-space: nowrap;
  }

  .hint {
    margin: var(--spacing-md) 0 0;
    font-family: var(--sans);
    font-size: 11px;
    color: var(--t3);
    text-align: center;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .dialog {
      min-width: unset;
    }
  }
</style>
