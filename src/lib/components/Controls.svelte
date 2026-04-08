<!-- src/lib/components/Controls.svelte -->
<!-- Start/Stop toggle, Settings gear, Share button.                           -->
<!-- State machine: idle/stopped/completed → Start | starting → Starting…     -->
<!--                running → Stop        | stopping → Stopping…              -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';

  // Derive button state from lifecycle
  $: lifecycle = $measurementStore.lifecycle;

  $: startStopLabel = (() => {
    switch (lifecycle) {
      case 'starting':  return 'Starting…';
      case 'running':   return 'Stop';
      case 'stopping':  return 'Stopping…';
      default:          return 'Start Test';
    }
  })();

  $: startStopDisabled = lifecycle === 'starting' || lifecycle === 'stopping';

  $: startStopVariant = lifecycle === 'running' ? 'stop' : 'start';

  $: statusAnnouncement = (() => {
    switch (lifecycle) {
      case 'running':   return 'Test running';
      case 'stopped':   return 'Test stopped';
      case 'completed': return 'Test complete';
      default:          return '';
    }
  })();

  function handleStartStop(): void {
    if (lifecycle === 'running') {
      measurementStore.setLifecycle('stopping');
    } else if (lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed') {
      measurementStore.setLifecycle('starting');
    }
    // 'starting' and 'stopping' states: button is disabled, no action
  }

  function handleSettings(): void {
    uiStore.toggleSettings();
  }

  function handleShare(): void {
    uiStore.toggleShare();
  }
</script>

<div
  class="controls"
  style:--accent={tokens.color.chrome.accent}
  style:--accent-hover={tokens.color.chrome.accentHover}
  style:--error={tokens.color.status.error}
  style:--border={tokens.color.chrome.border}
  style:--surface-raised={tokens.color.surface.raised}
  style:--text-primary={tokens.color.text.primary}
  style:--text-secondary={tokens.color.text.secondary}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
>
  <!-- ARIA live region for status announcements -->
  <div
    class="sr-only"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {statusAnnouncement}
  </div>

  <!-- Start / Stop -->
  <button
    type="button"
    class="btn-start-stop"
    class:variant-start={startStopVariant === 'start'}
    class:variant-stop={startStopVariant === 'stop'}
    disabled={startStopDisabled}
    aria-disabled={startStopDisabled}
    aria-label={startStopLabel}
    on:click={handleStartStop}
  >
    {startStopLabel}
  </button>

  <!-- Settings gear -->
  <button
    type="button"
    class="btn-icon"
    aria-label="Open settings"
    aria-expanded={$uiStore.showSettings}
    aria-controls="settings-drawer"
    on:click={handleSettings}
  >
    ⚙
  </button>

  <!-- Share -->
  <button
    type="button"
    class="btn-icon"
    aria-label="Share results"
    aria-expanded={$uiStore.showShare}
    aria-controls="share-popover"
    on:click={handleShare}
  >
    ↗
  </button>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  /* ── Start/Stop button ───────────────────────────────────────────────────── */
  .btn-start-stop {
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-sm);
    border: none;
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    cursor: pointer;
    min-height: 36px;
    min-width: 96px;
    transition: background 150ms ease, opacity 150ms ease;
  }

  .btn-start-stop.variant-start {
    background: var(--accent);
    color: #fff;
  }

  .btn-start-stop.variant-start:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-start-stop.variant-stop {
    background: var(--error);
    color: #fff;
  }

  .btn-start-stop.variant-stop:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-start-stop:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Icon buttons ────────────────────────────────────────────────────────── */
  .btn-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 16px;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .btn-icon:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  /* ── Screen-reader only ──────────────────────────────────────────────────── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
