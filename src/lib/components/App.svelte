<!-- src/lib/components/App.svelte -->
<!-- Root application component. Bootstraps tokens, persistence, engine, and    -->
<!-- wires all child components together.                                         -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { tokens } from '$lib/tokens';
  import { settingsStore } from '$lib/stores/settings';
  import { endpointStore } from '$lib/stores/endpoints';
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { MeasurementEngine } from '$lib/engine/measurement-engine';
  import { loadPersistedSettings, saveSettings } from '$lib/utils/persistence';
  import type { PersistedSettings } from '$lib/types';
  import Layout from './Layout.svelte';
  import SettingsDrawer from './SettingsDrawer.svelte';

  let engine: MeasurementEngine | null = null;

  // ── Bridge tokens to CSS custom properties ──────────────────────────────────
  function bridgeTokensToCss(): void {
    const root = document.documentElement;

    // Surface colors
    root.style.setProperty('--surface-base', tokens.color.surface.base);
    root.style.setProperty('--surface-canvas', tokens.color.surface.canvas);
    root.style.setProperty('--surface-raised', tokens.color.surface.raised);
    root.style.setProperty('--surface-overlay', tokens.color.surface.overlay);
    root.style.setProperty('--surface-elevated', tokens.color.surface.elevated);

    // Text colors
    root.style.setProperty('--text-primary', tokens.color.text.primary);
    root.style.setProperty('--text-secondary', tokens.color.text.secondary);
    root.style.setProperty('--text-muted', tokens.color.text.muted);
    root.style.setProperty('--text-inverse', tokens.color.text.inverse);
    root.style.setProperty('--text-data', tokens.color.text.data);

    // Chrome
    root.style.setProperty('--border', tokens.color.chrome.border);
    root.style.setProperty('--border-hover', tokens.color.chrome.borderHover);
    root.style.setProperty('--border-focus', tokens.color.chrome.borderFocus);
    root.style.setProperty('--accent', tokens.color.chrome.accent);
    root.style.setProperty('--accent-hover', tokens.color.chrome.accentHover);

    // Status
    root.style.setProperty('--status-timeout', tokens.color.status.timeout);
    root.style.setProperty('--status-error', tokens.color.status.error);
    root.style.setProperty('--status-success', tokens.color.status.success);
    root.style.setProperty('--status-idle', tokens.color.status.idle);

    // Tier 2
    root.style.setProperty('--tier2-dns', tokens.color.tier2.dns);
    root.style.setProperty('--tier2-tcp', tokens.color.tier2.tcp);
    root.style.setProperty('--tier2-tls', tokens.color.tier2.tls);
    root.style.setProperty('--tier2-ttfb', tokens.color.tier2.ttfb);
    root.style.setProperty('--tier2-transfer', tokens.color.tier2.transfer);

    // Spacing
    root.style.setProperty('--spacing-xxs', `${tokens.spacing.xxs}px`);
    root.style.setProperty('--spacing-xs', `${tokens.spacing.xs}px`);
    root.style.setProperty('--spacing-sm', `${tokens.spacing.sm}px`);
    root.style.setProperty('--spacing-md', `${tokens.spacing.md}px`);
    root.style.setProperty('--spacing-lg', `${tokens.spacing.lg}px`);
    root.style.setProperty('--spacing-xl', `${tokens.spacing.xl}px`);
    root.style.setProperty('--spacing-xxl', `${tokens.spacing.xxl}px`);

    // Radius
    root.style.setProperty('--radius-sm', `${tokens.radius.sm}px`);
    root.style.setProperty('--radius-md', `${tokens.radius.md}px`);

    // Timing
    root.style.setProperty('--timing-fade-in', `${tokens.timing.fadeIn}ms`);
    root.style.setProperty('--timing-disclosure', `${tokens.timing.progressiveDisclosure}ms`);
    root.style.setProperty('--easing-standard', tokens.easing.standard);
    root.style.setProperty('--easing-decelerate', tokens.easing.decelerate);
  }

  // ── Apply persisted settings to stores ──────────────────────────────────────
  function applyPersistedSettings(persisted: PersistedSettings): void {
    // Settings
    settingsStore.set(persisted.settings);

    // Endpoints: replace defaults with persisted ones
    if (persisted.endpoints.length > 0) {
      const currentEndpoints = get(endpointStore);
      // Clear existing and add persisted ones using stored URLs
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

  function setupPersistenceSync(): void {
    function persist(): void {
      const settings = get(settingsStore);
      const endpoints = get(endpointStore);
      const ui = get(uiStore);

      const payload: PersistedSettings = {
        version: 2,
        endpoints: endpoints.map(ep => ({ url: ep.url, enabled: ep.enabled })),
        settings,
        ui: {
          expandedCards: [...ui.expandedCards],
          activeView: ui.activeView,
        },
      };
      saveSettings(payload);
    }

    unsubSettings = settingsStore.subscribe(persist);
    unsubEndpoints = endpointStore.subscribe(persist);
    unsubUi = uiStore.subscribe(persist);
  }

  // ── Engine lifecycle wiring ──────────────────────────────────────────────────
  // Controls.svelte transitions lifecycle to 'starting'/'stopping'.
  // We watch those transitions and drive the engine accordingly.
  // Note: engine.start() expects 'idle'|'stopped'; when Controls sets 'starting',
  // we call engine.start() from the previous tick, so we track prior lifecycle.
  let unsubLifecycle: (() => void) | null = null;
  let prevLifecycle: string = get(measurementStore).lifecycle;

  function setupEngineWiring(): void {
    unsubLifecycle = measurementStore.subscribe((state) => {
      if (!engine) return;
      const cur = state.lifecycle;

      // React to Controls-driven transitions only
      if (prevLifecycle !== 'starting' && cur === 'starting') {
        // Controls set 'starting' — engine.start() guards against non-idle/stopped,
        // but the store is now 'starting'. Reset to 'idle' briefly so engine can proceed.
        measurementStore.setLifecycle('idle');
        engine.start();
      } else if (prevLifecycle !== 'stopping' && cur === 'stopping') {
        // Controls set 'stopping' — engine.stop() sets lifecycle itself
        engine.stop();
      }

      prevLifecycle = cur;
    });
  }

  // ── Mount ────────────────────────────────────────────────────────────────────
  onMount(() => {
    // 1. Bridge tokens to CSS custom properties
    bridgeTokensToCss();

    // 2. Load persisted settings
    const persisted = loadPersistedSettings();

    if (persisted) {
      // 3a. Apply persisted state
      applyPersistedSettings(persisted);
    }
    // 3b. If no persisted settings, default endpoints are already in the store
    // (endpointStore initializes with DEFAULT_ENDPOINTS)

    // 4. Create engine
    engine = new MeasurementEngine();

    // 5. Wire engine to lifecycle
    setupEngineWiring();

    // 6. Setup persistence sync
    setupPersistenceSync();
  });

  onDestroy(() => {
    engine?.stop();
    unsubSettings?.();
    unsubEndpoints?.();
    unsubUi?.();
    unsubLifecycle?.();
  });
</script>

<div id="sonde-root">
  <Layout />
  {#if $uiStore.showSettings}
    <SettingsDrawer />
  {/if}
</div>

<style>
  #sonde-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
