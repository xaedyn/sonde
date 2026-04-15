<!-- src/lib/components/SharedResultsBanner.svelte -->
<!-- Visible when viewing a shared results link. Informs the user they are       -->
<!-- seeing a read-only snapshot and offers a "Run Again" button to start fresh. -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import { measurementStore } from '$lib/stores/measurements';

  function handleRunAgain(): void {
    uiStore.clearSharedView();
    measurementStore.reset();
  }
</script>

<div
  class="shared-banner"
  role="alert"
  aria-live="polite"
>
  <div class="banner-content">
    <span class="banner-icon" aria-hidden="true">↗</span>
    <span class="banner-text">Shared results — read only. Run your own test to measure from your location.</span>
  </div>
  <button
    type="button"
    class="btn-run-again"
    onclick={handleRunAgain}
  >
    Run Your Own Test
  </button>
</div>

<style>
  .shared-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background: rgba(12,10,20,.65);
    backdrop-filter: blur(24px) saturate(1.3);
    -webkit-backdrop-filter: blur(24px) saturate(1.3);
    border-bottom: 1px solid var(--glass-border);
    flex-shrink: 0;
  }

  .banner-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 0;
  }

  .banner-icon {
    font-size: 14px;
    color: var(--accent-cyan);
    flex-shrink: 0;
  }

  .banner-text {
    font-family: var(--sans);
    font-size: 13px;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-run-again {
    flex-shrink: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--accent-cyan);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent-cyan);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--timing-btn) ease, color var(--timing-btn) ease;
    white-space: nowrap;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .btn-run-again:hover {
    background: var(--accent-cyan);
    color: var(--t1);
  }

  /* ── Mobile ────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .shared-banner {
      flex-direction: column;
      align-items: flex-start;
    }

    .banner-text {
      white-space: normal;
    }
  }
</style>
