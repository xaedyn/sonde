<!-- src/lib/components/SettingsDrawer.svelte -->
<!-- Slide-in settings drawer. Uses <dialog> for a11y. Closes on Escape or      -->
<!-- backdrop click. All values bound to settingsStore.                          -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { uiStore } from '$lib/stores/ui';
  import { settingsStore } from '$lib/stores/settings';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { tokens } from '$lib/tokens';


  let dialogEl: HTMLDialogElement;

  let isRunning = $derived($measurementStore.lifecycle === 'running' || $measurementStore.lifecycle === 'starting');
  let showSettings = $derived($uiStore.showSettings);

  // Local copies of settings for binding
  let timeout: number = $state(get(settingsStore).timeout);
  let delay: number = $state(get(settingsStore).delay);
  let cap: number = $state(get(settingsStore).cap);
  let corsMode: 'no-cors' | 'cors' = $state(get(settingsStore).corsMode);

  // Sync local state when store changes externally (e.g. loaded from persistence)
  $effect(() => {
    timeout = $settingsStore.timeout;
    delay = $settingsStore.delay;
    cap = $settingsStore.cap;
    corsMode = $settingsStore.corsMode;
  });

  // Manage dialog open/close
  $effect(() => {
    if (dialogEl) {
      if (showSettings && !dialogEl.open) {
        dialogEl.showModal();
      } else if (!showSettings && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  onMount(() => {
    // Since this component only mounts when showSettings is true, open immediately.
    if (!dialogEl.open) {
      dialogEl.showModal();
    }
    dialogEl.addEventListener('close', () => {
      if ($uiStore.showSettings) uiStore.toggleSettings();
    });
  });

  function close(): void {
    uiStore.toggleSettings();
  }

  function handleBackdropClick(event: MouseEvent): void {
    // Click on the dialog backdrop (not the content)
    if (event.target === dialogEl) {
      close();
    }
  }

  function applyTimeout(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) settingsStore.update(s => ({ ...s, timeout: val }));
  }

  function applyDelay(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) settingsStore.update(s => ({ ...s, delay: val }));
  }

  function applyCap(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) settingsStore.update(s => ({ ...s, cap: val }));
  }

  function applyCorsMode(mode: 'no-cors' | 'cors'): void {
    if (!isRunning) settingsStore.update(s => ({ ...s, corsMode: mode }));
  }

  let showClearConfirm = $state(false);

  function requestClear(): void {
    showClearConfirm = true;
  }

  function confirmClear(): void {
    if (isRunning) return;
    showClearConfirm = false;
    measurementStore.reset();
    // Re-init endpoints in measurement store so empty data exists
    const endpoints = get(endpointStore);
    for (const ep of endpoints) {
      measurementStore.initEndpoint(ep.id);
    }
  }

  function cancelClear(): void {
    showClearConfirm = false;
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog
  bind:this={dialogEl}
  id="settings-drawer"
  class="settings-dialog"
  style:--surface-base={tokens.color.surface.base}
  style:--surface-raised={tokens.color.surface.raised}
  style:--surface-elevated={tokens.color.surface.elevated}
  style:--border={tokens.color.chrome.border}
  style:--accent={tokens.color.chrome.accent}
  style:--accent-hover={tokens.color.chrome.accentHover}
  style:--text-primary={tokens.color.text.primary}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-muted={tokens.color.text.muted}
  style:--error={tokens.color.status.error}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--radius-md="{tokens.radius.md}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--spacing-xl="{tokens.spacing.xl}px"
  aria-label="Settings"
  onclick={handleBackdropClick}
>
  <div class="drawer-content" role="document">
    <!-- Header -->
    <div class="drawer-header">
      <h2 class="drawer-title">Settings</h2>
      <button
        type="button"
        class="close-btn"
        aria-label="Close settings"
        onclick={close}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="drawer-body">
      <!-- Timeout -->
      <div class="field">
        <label class="field-label" for="setting-timeout">
          Timeout
          <span class="field-hint">(ms, 1000–30000)</span>
        </label>
        <input
          id="setting-timeout"
          type="number"
          class="field-input"
          min="1000"
          max="30000"
          step="500"
          bind:value={timeout}
          onchange={applyTimeout}
          aria-describedby="timeout-desc"
        />
        <p id="timeout-desc" class="field-description">Maximum time to wait for a response before marking it as a timeout.</p>
      </div>

      <!-- Delay -->
      <div class="field">
        <label class="field-label" for="setting-delay">
          Delay between rounds
          <span class="field-hint">(ms, 0–10000)</span>
        </label>
        <input
          id="setting-delay"
          type="number"
          class="field-input"
          min="0"
          max="10000"
          step="100"
          bind:value={delay}
          onchange={applyDelay}
          aria-describedby="delay-desc"
        />
        <p id="delay-desc" class="field-description">Wait time between measurement rounds for all endpoints.</p>
      </div>

      <!-- Request cap -->
      <div class="field">
        <label class="field-label" for="setting-cap">
          Request cap
          <span class="field-hint">(0 = unlimited)</span>
        </label>
        <input
          id="setting-cap"
          type="number"
          class="field-input"
          min="0"
          max="10000"
          step="1"
          bind:value={cap}
          onchange={applyCap}
          aria-describedby="cap-desc"
        />
        <p id="cap-desc" class="field-description">Stop the test after this many rounds. Set to 0 to run indefinitely.</p>
      </div>

      <!-- CORS mode -->
      <div class="field">
        <fieldset class="cors-fieldset" disabled={isRunning}>
          <legend class="field-label">
            CORS mode
            {#if isRunning}
              <span class="running-note" aria-live="polite">Requires stop</span>
            {/if}
          </legend>
          <div class="cors-options" aria-describedby="cors-desc">
            <label class="radio-label" class:radio-disabled={isRunning}>
              <input
                type="radio"
                name="cors-mode"
                value="no-cors"
                checked={corsMode === 'no-cors'}
                disabled={isRunning}
                onchange={() => applyCorsMode('no-cors')}
              />
              <span class="radio-text">no-cors</span>
              <span class="radio-hint">Opaque requests — timing data limited</span>
            </label>
            <label class="radio-label" class:radio-disabled={isRunning}>
              <input
                type="radio"
                name="cors-mode"
                value="cors"
                checked={corsMode === 'cors'}
                disabled={isRunning}
                onchange={() => applyCorsMode('cors')}
              />
              <span class="radio-text">cors</span>
              <span class="radio-hint">Full CORS — requires server headers</span>
            </label>
          </div>
          <p id="cors-desc" class="field-description">CORS mode affects which timing data is available. Changing this requires stopping the test.</p>
        </fieldset>
      </div>

      <!-- Divider -->
      <hr class="divider" aria-hidden="true" />

      <!-- Clear results -->
      <div class="field">
        <span class="field-label">Danger zone</span>
        {#if !showClearConfirm}
          <button
            type="button"
            class="btn-danger"
            disabled={isRunning}
            aria-disabled={isRunning}
            onclick={requestClear}
          >
            Clear results
          </button>
        {:else}
          <div class="confirm-group" role="alert" aria-live="assertive">
            <p class="confirm-text">This will reset all measurements. Are you sure?</p>
            <div class="confirm-actions">
              <button type="button" class="btn-danger" disabled={isRunning} onclick={confirmClear}>Yes, clear all</button>
              <button type="button" class="btn-secondary" onclick={cancelClear}>Cancel</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</dialog>

<style>
  /* ── Dialog / backdrop ───────────────────────────────────────────────────── */
  .settings-dialog {
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

  .settings-dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  /* Drawer content slides in from right on desktop, full-width on mobile */
  .drawer-content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: 100vw;
    background: var(--surface-raised);
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
    font-family: 'Inter', sans-serif;
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
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  /* ── Fields ──────────────────────────────────────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .field-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .field-hint {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
  }

  .field-input {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    width: 100%;
    transition: border-color 150ms ease;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .field-description {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* ── CORS fieldset ───────────────────────────────────────────────────────── */
  .cors-fieldset {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .cors-fieldset:disabled .cors-options {
    opacity: 0.5;
  }

  .cors-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .radio-label {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    align-items: center;
    gap: 0 var(--spacing-sm);
    cursor: pointer;
    padding: var(--spacing-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color 150ms ease, background 150ms ease;
  }

  .radio-label:not(.radio-disabled):hover {
    border-color: var(--accent);
    background: var(--surface-elevated);
  }

  .radio-label input[type="radio"] {
    grid-row: 1 / 3;
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .radio-label.radio-disabled {
    cursor: not-allowed;
  }

  .radio-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-primary);
  }

  .radio-hint {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: var(--text-muted);
  }

  .running-note {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: var(--error);
    background: rgba(201, 97, 152, 0.12);
    border-radius: 10px;
    padding: 1px 6px;
  }

  /* ── Divider ─────────────────────────────────────────────────────────────── */
  .divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 0;
  }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn-danger {
    padding: var(--spacing-sm) var(--spacing-md);
    background: transparent;
    border: 1px solid var(--error);
    border-radius: var(--radius-sm);
    color: var(--error);
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease;
    min-height: 36px;
  }

  .btn-danger:hover {
    background: rgba(201, 97, 152, 0.12);
  }

  .btn-secondary {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
    min-height: 36px;
  }

  .btn-secondary:hover {
    border-color: var(--accent);
    color: var(--text-primary);
  }

  /* ── Confirm ─────────────────────────────────────────────────────────────── */
  .confirm-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border: 1px solid var(--error);
    border-radius: var(--radius-sm);
    background: rgba(201, 97, 152, 0.06);
  }

  .confirm-text {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .confirm-actions {
    display: flex;
    gap: var(--spacing-sm);
  }
</style>
