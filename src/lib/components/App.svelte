<!-- src/lib/components/App.svelte -->
<!-- Root application component. Bootstraps tokens, persistence, engine, and    -->
<!-- wires all child components together.                                         -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { tokens } from '$lib/tokens';
  import { settingsStore } from '$lib/stores/settings';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { MeasurementEngine } from '$lib/engine/measurement-engine';
  import { loadPersistedSettings, saveSettings } from '$lib/utils/persistence';
  import { initHashRouter } from '$lib/share/hash-router';
  import { initShortcuts } from '$lib/utils/shortcuts';
  import type { PersistedSettings } from '$lib/types';
  import Layout from './Layout.svelte';
  import SettingsDrawer from './SettingsDrawer.svelte';
  import SharePopover from './SharePopover.svelte';
  import SharedResultsBanner from './SharedResultsBanner.svelte';
  import EndpointDrawer from './EndpointDrawer.svelte';
  import KeyboardOverlay from './KeyboardOverlay.svelte';

  let engine: MeasurementEngine | null = null;

  // ── Bridge tokens to CSS custom properties ──────────────────────────────────
  function bridgeTokensToCss(): void {
    const root = document.documentElement;

    // Background
    root.style.setProperty('--bg-base', tokens.color.surface.base);

    // Text opacity layers
    root.style.setProperty('--t1', tokens.color.text.t1);
    root.style.setProperty('--t2', tokens.color.text.t2);
    root.style.setProperty('--t3', tokens.color.text.t3);
    root.style.setProperty('--t4', tokens.color.text.t4);
    root.style.setProperty('--t5', tokens.color.text.t5);

    // Accent
    root.style.setProperty('--accent-cyan',   tokens.color.accent.cyan);
    root.style.setProperty('--accent-pink',   tokens.color.accent.pink);
    root.style.setProperty('--accent-green',  tokens.color.accent.green);
    root.style.setProperty('--green-glow',    tokens.color.accent.greenGlow);

    // Glass
    root.style.setProperty('--glass-bg',        tokens.color.glass.bg);
    root.style.setProperty('--glass-border',    tokens.color.glass.border);
    root.style.setProperty('--glass-highlight', tokens.color.glass.highlight);

    // Orbs
    root.style.setProperty('--orb-cyan',   tokens.color.orb.cyan);
    root.style.setProperty('--orb-pink',   tokens.color.orb.pink);
    root.style.setProperty('--orb-violet', tokens.color.orb.violet);

    // Fonts
    root.style.setProperty('--sans', tokens.typography.sans.fontFamily);
    root.style.setProperty('--mono', tokens.typography.mono.fontFamily);

    // Spacing
    root.style.setProperty('--spacing-xxs', `${tokens.spacing.xxs}px`);
    root.style.setProperty('--spacing-xs',  `${tokens.spacing.xs}px`);
    root.style.setProperty('--spacing-sm',  `${tokens.spacing.sm}px`);
    root.style.setProperty('--spacing-md',  `${tokens.spacing.md}px`);
    root.style.setProperty('--spacing-lg',  `${tokens.spacing.lg}px`);
    root.style.setProperty('--spacing-xl',  `${tokens.spacing.xl}px`);
    root.style.setProperty('--spacing-xxl', `${tokens.spacing.xxl}px`);

    // Radius
    root.style.setProperty('--radius-sm', `${tokens.radius.sm}px`);
    root.style.setProperty('--radius-md', `${tokens.radius.md}px`);
    root.style.setProperty('--radius-lg', `${tokens.radius.lg}px`);
    root.style.setProperty('--radius-btn', `${tokens.radius.btn}px`);

    // Timing
    root.style.setProperty('--timing-fade-in',   `${tokens.timing.fadeIn}ms`);
    root.style.setProperty('--easing-standard',  tokens.easing.standard);
    root.style.setProperty('--easing-decelerate',tokens.easing.decelerate);

    // Legacy properties (Settings/Share drawers not yet redesigned)
    root.style.setProperty('--surface-raised',   tokens.color.surface.raised);
    root.style.setProperty('--surface-elevated', tokens.color.surface.elevated);
    root.style.setProperty('--text-primary',     tokens.color.text.t1);
    root.style.setProperty('--text-secondary',   tokens.color.text.t2);
    root.style.setProperty('--text-muted',       tokens.color.text.t3);
    root.style.setProperty('--border',           tokens.color.chrome.border);
    root.style.setProperty('--accent',           tokens.color.chrome.accent);
    root.style.setProperty('--accent-hover',     tokens.color.chrome.accentHover);
    root.style.setProperty('--status-success',   tokens.color.status.success);
    root.style.setProperty('--status-error',     tokens.color.status.error);
    root.style.setProperty('--status-timeout',   tokens.color.status.timeout);
    root.style.setProperty('--surface-overlay', tokens.color.surface.overlay);
    root.style.setProperty('--spacing-lg2', `${tokens.spacing.lg2}px`);
    root.style.setProperty('--timing-loading-pulse', `${tokens.timing.loadingPulse}ms`);
    root.style.setProperty('--timing-loading-ring',  `${tokens.timing.loadingRingDuration}ms`);
    root.style.setProperty('--timing-btn',           `${tokens.timing.btnHover}ms`);
    root.style.setProperty('--shadow-low', tokens.shadow.low);
    root.style.setProperty('--radius-xs', `${tokens.radius.xs}px`);
  }

  // ── Apply persisted settings to stores ──────────────────────────────────────
  function applyPersistedSettings(persisted: PersistedSettings): void {
    // Settings
    settingsStore.set(persisted.settings);

    // Endpoints: replace defaults with persisted ones
    if (persisted.endpoints.length > 0) {
      endpointStore.setEndpoints([]);
      for (const ep of persisted.endpoints) {
        if (ep.url.trim()) {
          const id = endpointStore.addEndpoint(ep.url, ep.url);
          endpointStore.updateEndpoint(id, { enabled: ep.enabled });
        }
      }
    }

    // UI state
    if (persisted.ui.activeView) {
      uiStore.setActiveView(persisted.ui.activeView);
    }
    for (const cardId of persisted.ui.expandedCards) {
      // Only expand if not already expanded
      if (!get(uiStore).expandedCards.has(cardId)) {
        uiStore.toggleCard(cardId);
      }
    }
  }

  // ── Persistence save subscription ───────────────────────────────────────────
  let unsubSettings: (() => void) | null = null;
  let unsubEndpoints: (() => void) | null = null;
  let unsubUi: (() => void) | null = null;
  let destroyShortcuts: (() => void) | null = null;

  let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function setupPersistenceSync(): void {
    function persist(): void {
      // Skip saves when in shared view — don't overwrite user's settings with shared config
      const ui = get(uiStore);
      if (ui.isSharedView) return;

      const settings = get(settingsStore);
      const endpoints = get(endpointStore);

      const payload: PersistedSettings = {
        version: 3,
        endpoints: endpoints.map(ep => ({ url: ep.url, enabled: ep.enabled })),
        settings,
        ui: {
          expandedCards: [...ui.expandedCards],
          activeView: ui.activeView,
        },
      };
      saveSettings(payload);
    }

    function debouncedPersist(): void {
      if (persistDebounceTimer !== null) clearTimeout(persistDebounceTimer);
      persistDebounceTimer = setTimeout(persist, 500);
    }

    unsubSettings = settingsStore.subscribe(debouncedPersist);
    unsubEndpoints = endpointStore.subscribe(debouncedPersist);
    unsubUi = uiStore.subscribe(debouncedPersist);
  }

  // ── Engine lifecycle wiring ──────────────────────────────────────────────────
  // Controls.svelte transitions lifecycle to 'starting'/'stopping'.
  // We watch those transitions and drive the engine accordingly.
  // Note: engine.start() expects 'idle'|'stopped'; when Controls sets 'starting',
  // we call engine.start() from the previous tick, so we track prior lifecycle.
  function handleStart(): void {
    if (!engine) return;
    engine.start();
  }

  function handleStop(): void {
    if (!engine) return;
    engine.stop();
  }

  // ── Mount ────────────────────────────────────────────────────────────────────
  onMount(() => {
    // 1. Bridge tokens to CSS custom properties
    bridgeTokensToCss();

    // 2. Check for share URL — takes priority over persisted settings
    const handledShareURL = initHashRouter();

    // 3. Load persisted settings (skip if a share URL was processed)
    if (!handledShareURL) {
      const persisted = loadPersistedSettings();

      if (persisted) {
        // 3a. Apply persisted state
        applyPersistedSettings(persisted);
      }
    }
    // 3b. If no persisted settings and no share URL, defaults are already in stores

    // 4. Create engine
    engine = new MeasurementEngine();

    // 5. Setup persistence sync
    setupPersistenceSync();

    // 7. Register keyboard shortcuts
    destroyShortcuts = initShortcuts();
  });

  onDestroy(() => {
    engine?.stop();
    unsubSettings?.();
    unsubEndpoints?.();
    unsubUi?.();
    destroyShortcuts?.();
    if (persistDebounceTimer !== null) clearTimeout(persistDebounceTimer);
  });
</script>

<div id="chronoscope-root">
  {#if $uiStore.isSharedView}
    <SharedResultsBanner />
  {/if}
  <Layout onStart={handleStart} onStop={handleStop} />
  {#if $uiStore.showSettings}
    <SettingsDrawer />
  {/if}
  {#if $uiStore.showEndpoints}
    <EndpointDrawer />
  {/if}
  {#if $uiStore.showShare}
    <SharePopover />
  {/if}
  {#if $uiStore.showKeyboardHelp}
    <KeyboardOverlay />
  {/if}
</div>

<style>
  #chronoscope-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
