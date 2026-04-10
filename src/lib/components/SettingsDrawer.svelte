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
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--glass-bg-strong={tokens.color.glass.bgStrong}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--t5={tokens.color.text.t5}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--pink12={tokens.color.accent.pink12}
  style:--pink06={tokens.color.accent.pink06}
  style:--pink20={tokens.color.accent.pink20}
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--radius-lg="{tokens.radius.lg}px"
  style:--radius-sm="{tokens.radius.sm}px"
  style:--radius-md="{tokens.radius.md}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--spacing-xl="{tokens.spacing.xl}px"
  style:--sans={tokens.typography.sans.fontFamily}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
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
      <div class="divider" aria-hidden="true"></div>

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
    background: rgba(0,0,0,.5);
    animation: backdropFade 300ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
  }

  @keyframes backdropFade {
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
    animation: drawerSlideIn 300ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
    box-shadow: -8px 0 40px rgba(0,0,0,.3);
  }

  @keyframes drawerSlideIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
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
      animation: drawerSlideUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
      box-shadow: 0 -8px 40px rgba(0,0,0,.3);
    }
    .drawer-content::after {
      display: none;
    }
    @keyframes drawerSlideUp {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
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

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xl);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
    position: relative;
    z-index: 2;
  }

  /* ── Fields ──────────────────────────────────────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--glass-bg);
    border-radius: var(--btn-radius);
  }

  .field-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--t2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .field-hint {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 300;
    color: var(--t3);
    text-transform: none;
    letter-spacing: 0.02em;
  }

  .field-input {
    padding: var(--spacing-sm) var(--spacing-md);
    background: rgba(0,0,0,.2);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    color: var(--t1);
    font-family: var(--mono);
    font-size: 13px;
    width: 100%;
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3);
    transition: border-color var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--accent-cyan);
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3), 0 0 12px rgba(103,232,249,.15);
  }

  .field-description {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--t3);
    line-height: 1.6;
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
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: rgba(0,0,0,.15);
    position: relative;
    overflow: hidden;
    transition: border-color var(--timing-btn) ease, background var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  /* Top-edge highlight on radio cards */
  .radio-label::before {
    content: '';
    position: absolute;
    top: 0; left: 15%; right: 15%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  .radio-label:not(.radio-disabled):hover {
    border-color: var(--glass-highlight);
    background: var(--glass-bg-strong);
  }

  /* Selected radio card — left-edge cyan glow */
  .radio-label:has(input:checked) {
    border-color: rgba(103,232,249,.15);
    box-shadow: -4px 0 16px rgba(103,232,249,.08);
  }

  .radio-label:has(input:checked)::after {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0; width: 40px;
    pointer-events: none;
    background: linear-gradient(90deg, rgba(103,232,249,.06), transparent);
  }

  .radio-label input[type="radio"] {
    grid-row: 1 / 3;
    accent-color: var(--accent-cyan);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .radio-label.radio-disabled {
    cursor: not-allowed;
  }

  .radio-text {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--t1);
  }

  .radio-hint {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--t3);
  }

  .running-note {
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 400;
    color: var(--accent-pink);
    background: var(--pink12);
    border-radius: 10px;
    padding: 1px 6px;
    text-transform: none;
    letter-spacing: 0;
  }

  /* ── Divider ─────────────────────────────────────────────────────────────── */
  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    border: none;
    margin: 0;
  }

  /* ── Danger zone — pink left-edge glow ──────────────────────────────────── */
  .field:last-child {
    background: rgba(249,168,212,.02);
    position: relative;
    overflow: hidden;
  }

  .field:last-child::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0; width: 60px;
    pointer-events: none;
    background: linear-gradient(90deg, rgba(249,168,212,.04), transparent);
  }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn-danger {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--glass-bg);
    border: 1px solid var(--pink20);
    border-radius: var(--btn-radius);
    color: var(--accent-pink);
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--timing-btn) ease;
    min-height: 36px;
    position: relative;
    z-index: 1;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--pink06);
    box-shadow: 0 0 16px var(--pink12);
    transform: translateY(-1px);
  }

  .btn-danger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    color: var(--t2);
    font-family: var(--sans);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--timing-btn) ease;
    min-height: 36px;
    position: relative;
    z-index: 1;
  }

  .btn-secondary:hover {
    border-color: var(--glass-highlight);
    color: var(--t1);
    background: var(--glass-bg-strong);
    transform: translateY(-1px);
  }

  /* ── Confirm ─────────────────────────────────────────────────────────────── */
  .confirm-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border: 1px solid var(--pink20);
    border-radius: var(--btn-radius);
    background: var(--pink06);
    position: relative;
    z-index: 1;
  }

  .confirm-text {
    font-family: var(--sans);
    font-size: 13px;
    color: var(--t2);
  }

  .confirm-actions {
    display: flex;
    gap: var(--spacing-sm);
  }
</style>
