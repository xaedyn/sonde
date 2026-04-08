<!-- src/lib/components/Layout.svelte -->
<!-- CSS Grid shell: header, sidebar (EndpointPanel), main area (viz + cards),  -->
<!-- and controls bar. Responsive across mobile/tablet/desktop.                   -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import Header from './Header.svelte';
  import EndpointPanel from './EndpointPanel.svelte';
  import VisualizationArea from './VisualizationArea.svelte';
  import SummaryCards from './SummaryCards.svelte';
  import Controls from './Controls.svelte';

  // No props needed — Controls is self-contained via lifecycle store.
</script>

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
      <Controls />
    </div>
  </header>

  <!-- Main content area -->
  <div class="layout-body">
    <!-- Sidebar: EndpointPanel -->
    <aside class="layout-sidebar" aria-label="Endpoints">
      <EndpointPanel />
    </aside>

    <!-- Main column: visualization + summary cards -->
    <main class="layout-main">
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
    <Controls />
  </div>
</div>

<style>
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
