<!-- src/lib/components/Layout.svelte -->
<!-- CSS Grid shell: header, sidebar (EndpointPanel), main area (viz + cards),  -->
<!-- and controls bar. Responsive across mobile/tablet/desktop.                   -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { tokens } from '$lib/tokens';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import Header from './Header.svelte';
  import EndpointPanel from './EndpointPanel.svelte';
  import VisualizationArea from './VisualizationArea.svelte';
  import SummaryCards from './SummaryCards.svelte';
  import Controls from './Controls.svelte';

  export let onStart: (() => void) | undefined = undefined;
  export let onStop: (() => void) | undefined = undefined;

  let announcer: HTMLDivElement;
  let prevLifecycle = get(measurementStore).lifecycle;
  let unsubLifecycle: (() => void) | null = null;

  function announce(msg: string): void {
    if (!announcer) return;
    announcer.textContent = '';
    // Force a DOM flush so screen readers pick up the change
    setTimeout(() => { announcer.textContent = msg; }, 50);
  }

  onMount(() => {
    unsubLifecycle = measurementStore.subscribe((state) => {
      const cur = state.lifecycle;
      const prev = prevLifecycle;

      if (prev !== 'running' && cur === 'running') {
        const n = get(endpointStore).filter(ep => ep.enabled).length;
        announce(`Test started with ${n} endpoint${n === 1 ? '' : 's'}`);
      } else if (prev === 'running' && cur === 'stopping') {
        const rounds = state.roundCounter;
        announce(`Test stopped after ${rounds} round${rounds === 1 ? '' : 's'}`);
      } else if (prev !== 'completed' && cur === 'completed') {
        const rounds = state.roundCounter;
        announce(`Test completed after ${rounds} round${rounds === 1 ? '' : 's'}`);
      }

      prevLifecycle = cur;
    });
  });

  onDestroy(() => {
    unsubLifecycle?.();
  });
</script>

<a href="#results" class="skip-link">Skip to results</a>

<div
  class="app-layout"
  style:--border={tokens.color.chrome.border}
  style:--surface-base={tokens.color.surface.base}
  style:--surface-canvas={tokens.color.surface.canvas}
  style:--surface-raised={tokens.color.surface.raised}
  style:--text-primary={tokens.color.text.primary}
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
>
  <!-- Top header bar -->
  <header class="layout-header">
    <Header />
    <!-- Controls inline on desktop -->
    <div class="header-controls desktop-only">
      <Controls {onStart} {onStop} />
    </div>
  </header>

  <!-- Main content area -->
  <div class="layout-body">
    <!-- Sidebar: EndpointPanel -->
    <aside class="layout-sidebar" aria-label="Endpoints">
      <EndpointPanel />
    </aside>

    <!-- Main column: visualization + summary cards -->
    <main id="results" class="layout-main">
      <div class="layout-viz">
        <VisualizationArea />
      </div>
      <div class="layout-cards">
        <SummaryCards />
      </div>
    </main>
  </div>

  <!-- Controls fixed at bottom on mobile -->
  <div class="layout-controls mobile-only" role="toolbar" aria-label="Test controls">
    <Controls {onStart} {onStop} />
  </div>
</div>

<!-- ARIA live region for test state announcements -->
<div
  bind:this={announcer}
  id="sonde-announcer"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
></div>

<style>
  /* ── Skip link ───────────────────────────────────────────────────────────── */
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    z-index: 9999;
    padding: 8px 16px;
    background: var(--accent, #4a90d9);
    color: #fff;
    font-weight: 600;
    text-decoration: none;
    border-radius: 0 0 4px 0;
    transition: top 100ms ease;
  }

  .skip-link:focus {
    top: 0;
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

  /* ── Root layout ─────────────────────────────────────────────────────────── */
  .app-layout {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
    background: var(--surface-base);
    overflow: hidden;
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .layout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    /* Header component handles its own padding/border */
  }

  .header-controls {
    padding-right: 16px;
  }

  /* ── Body (sidebar + main) ───────────────────────────────────────────────── */
  .layout-body {
    display: grid;
    /* Desktop: 280px sidebar + remaining main */
    grid-template-columns: 280px 1fr;
    grid-template-rows: 1fr;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Sidebar ─────────────────────────────────────────────────────────────── */
  .layout-sidebar {
    border-right: 1px solid var(--border);
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--surface-canvas);
    min-height: 0;
  }

  /* ── Main column ─────────────────────────────────────────────────────────── */
  .layout-main {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .layout-viz {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .layout-cards {
    flex-shrink: 0;
    overflow-y: auto;
    max-height: 40%;
    border-top: 1px solid var(--border);
  }

  /* ── Mobile controls bar ─────────────────────────────────────────────────── */
  .layout-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface-raised);
    flex-shrink: 0;
  }

  /* Visibility helpers */
  .desktop-only { display: flex; }
  .mobile-only  { display: none; }

  /* ── Tablet breakpoint (768px) ───────────────────────────────────────────── */
  @media (max-width: 1023px) {
    .layout-body {
      /* Sidebar collapses to full width above main on tablet */
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }

    .layout-sidebar {
      border-right: none;
      border-bottom: 1px solid var(--border);
      max-height: 180px;
    }
  }

  /* ── Mobile breakpoint (375px) ───────────────────────────────────────────── */
  @media (max-width: 767px) {
    .app-layout {
      grid-template-rows: auto 1fr auto;
    }

    .layout-cards {
      max-height: 50%;
    }

    .desktop-only { display: none; }
    .mobile-only  { display: flex; }
  }
</style>
