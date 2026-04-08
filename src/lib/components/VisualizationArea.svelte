<!-- src/lib/components/VisualizationArea.svelte -->
<!-- Container: shows TimelineCanvas, HeatmapCanvas, or split view based on    -->
<!-- $uiStore.activeView. Mobile (<768px) split shows one at a time with toggle. -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import TimelineCanvas from './TimelineCanvas.svelte';
  import HeatmapCanvas from './HeatmapCanvas.svelte';
  import type { ActiveView } from '$lib/types';

  // On mobile, when in 'split' mode, toggle which panel is visible
  let mobileSplitTab: 'timeline' | 'heatmap' = 'timeline';

  function setView(view: ActiveView): void {
    uiStore.setActiveView(view);
  }

  function toggleMobileSplit(): void {
    mobileSplitTab = mobileSplitTab === 'timeline' ? 'heatmap' : 'timeline';
  }
</script>

<div
  class="visualization-area"
  style:--border={tokens.color.chrome.border}
  style:--accent={tokens.color.chrome.accent}
  style:--surface-raised={tokens.color.surface.raised}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-primary={tokens.color.text.primary}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
>
  <!-- View toggle controls -->
  <div class="view-controls" role="tablist" aria-label="Visualization view">
    <button
      role="tab"
      aria-selected={$uiStore.activeView === 'timeline'}
      aria-controls="panel-timeline"
      class="view-btn"
      class:active={$uiStore.activeView === 'timeline'}
      on:click={() => setView('timeline')}
    >
      Timeline
    </button>
    <button
      role="tab"
      aria-selected={$uiStore.activeView === 'heatmap'}
      aria-controls="panel-heatmap"
      class="view-btn"
      class:active={$uiStore.activeView === 'heatmap'}
      on:click={() => setView('heatmap')}
    >
      Heatmap
    </button>
    <button
      role="tab"
      aria-selected={$uiStore.activeView === 'split'}
      class="view-btn"
      class:active={$uiStore.activeView === 'split'}
      on:click={() => setView('split')}
    >
      Split
    </button>
  </div>

  <!-- Canvas panels -->
  <div class="panels-container" class:split={$uiStore.activeView === 'split'}>

    {#if $uiStore.activeView === 'timeline'}
      <div id="panel-timeline" class="panel panel-full" role="tabpanel">
        <TimelineCanvas />
      </div>

    {:else if $uiStore.activeView === 'heatmap'}
      <div id="panel-heatmap" class="panel panel-full" role="tabpanel">
        <HeatmapCanvas />
      </div>

    {:else}
      <!-- Split view -->
      <!-- Desktop: side by side (60/40). Mobile: one at a time with sub-toggle. -->
      <div class="split-wrapper">
        <!-- Mobile sub-toggle (only visible on narrow viewports) -->
        <div class="mobile-split-toggle" aria-label="Switch split panel">
          <button
            class="split-tab-btn"
            class:active={mobileSplitTab === 'timeline'}
            on:click={() => { mobileSplitTab = 'timeline'; }}
          >
            Timeline
          </button>
          <button
            class="split-tab-btn"
            class:active={mobileSplitTab === 'heatmap'}
            on:click={() => { mobileSplitTab = 'heatmap'; }}
          >
            Heatmap
          </button>
        </div>

        <div class="split-panels">
          <!-- Timeline: 60% on desktop, full-width on mobile when selected -->
          <div
            id="panel-timeline"
            class="panel split-timeline"
            class:mobile-hidden={mobileSplitTab !== 'timeline'}
            role="tabpanel"
            aria-label="Timeline panel"
          >
            <TimelineCanvas />
          </div>

          <!-- Heatmap: 40% on desktop, full-width on mobile when selected -->
          <div
            id="panel-heatmap"
            class="panel split-heatmap"
            class:mobile-hidden={mobileSplitTab !== 'heatmap'}
            role="tabpanel"
            aria-label="Heatmap panel"
          >
            <HeatmapCanvas />
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .visualization-area {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: transparent;
  }

  /* ── View toggle bar ─────────────────────────────────────────────────────── */
  .view-controls {
    display: flex;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .view-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .view-btn:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  .view-btn.active {
    background: var(--surface-raised);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  /* ── Panels ──────────────────────────────────────────────────────────────── */
  .panels-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .panel {
    height: 100%;
  }

  .panel-full {
    width: 100%;
  }

  /* ── Split layout ────────────────────────────────────────────────────────── */
  .split-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .split-panels {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 1px;
    background: var(--border);
  }

  .split-timeline {
    flex: 0 0 60%;
    min-width: 0;
  }

  .split-heatmap {
    flex: 0 0 40%;
    min-width: 0;
  }

  /* ── Mobile sub-toggle (hidden on desktop) ───────────────────────────────── */
  .mobile-split-toggle {
    display: none;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--border);
  }

  .split-tab-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
  }

  .split-tab-btn.active {
    background: var(--surface-raised);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .mobile-split-toggle {
      display: flex;
    }

    .split-panels {
      flex-direction: column;
    }

    .split-timeline,
    .split-heatmap {
      flex: 1;
    }

    .mobile-hidden {
      display: none;
    }
  }
</style>
