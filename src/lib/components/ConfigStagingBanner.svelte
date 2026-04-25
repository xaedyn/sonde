<!-- src/lib/components/ConfigStagingBanner.svelte -->
<!-- Visible when a config-mode share payload has been staged (uiStore.pendingShare). -->
<!-- The user must explicitly Accept (move endpoints into the rail) or Dismiss        -->
<!-- (drop the staged payload). See issue #79: pre-fix, attacker URLs auto-loaded     -->
<!-- on page load and one Start click weaponized the browser as a small-scale flood.  -->
<!-- The banner gates that path by requiring explicit consent before any URL          -->
<!-- reaches endpointStore. Cadence settings are never touched, accepted or not.      -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import { acceptPendingShare, dismissPendingShare } from '$lib/share/hash-router';
  import { displayLabel } from '$lib/endpoint/displayLabel';

  const pending = $derived($uiStore.pendingShare);
  const count = $derived(pending?.endpoints.length ?? 0);
</script>

{#if pending}
  <div class="staging-banner" role="alert" aria-live="polite">
    <div class="banner-header">
      <span class="banner-icon" aria-hidden="true">⚠</span>
      <span class="banner-text">
        Shared link with {count} endpoint{count === 1 ? '' : 's'}. Accepting replaces your current rail.
      </span>
      <div class="banner-actions">
        <button type="button" class="btn-dismiss" onclick={dismissPendingShare}>
          Dismiss
        </button>
        <button type="button" class="btn-accept" onclick={acceptPendingShare}>
          Accept
        </button>
      </div>
    </div>
    <ul class="endpoint-list" aria-label="Endpoints proposed by the shared link">
      {#each pending.endpoints as ep (ep.url)}
        <li class="endpoint-item">
          <span class="endpoint-pip" aria-hidden="true" class:disabled={!ep.enabled}></span>
          <span class="endpoint-identity">
            <span class="endpoint-label">{displayLabel({ url: ep.url })}</span>
            <span class="endpoint-url">{ep.url}</span>
          </span>
          {#if !ep.enabled}
            <span class="endpoint-badge">disabled</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .staging-banner {
    /* z-index lifts the banner above Layout's fixed .bg backdrop. Without
       this the banner paints correctly but its buttons are hit-tested
       behind the .bg layer and clicks are intercepted. */
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-md);
    background: rgba(12, 10, 20, 0.78);
    backdrop-filter: blur(24px) saturate(1.3);
    -webkit-backdrop-filter: blur(24px) saturate(1.3);
    border-bottom: 1px solid var(--border-bright, rgba(255, 255, 255, 0.18));
    flex-shrink: 0;
  }

  .banner-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 0;
  }

  .banner-icon {
    font-size: 14px;
    color: var(--accent-pink, #f9a8d4);
    flex-shrink: 0;
  }

  .banner-text {
    font-family: var(--sans);
    font-size: 13px;
    color: var(--t1, rgba(255, 255, 255, 0.94));
    flex: 1;
    min-width: 0;
  }

  .banner-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  .btn-dismiss,
  .btn-accept {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--timing-btn) ease, color var(--timing-btn) ease, border-color var(--timing-btn) ease;
    white-space: nowrap;
    min-height: 32px;
    display: flex;
    align-items: center;
  }

  .btn-dismiss {
    border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--t2, rgba(255, 255, 255, 0.74));
  }
  .btn-dismiss:hover {
    border-color: var(--border-bright, rgba(255, 255, 255, 0.24));
    color: var(--t1, rgba(255, 255, 255, 0.94));
  }

  .btn-accept {
    border: 1px solid var(--accent-cyan, #67e8f9);
    background: transparent;
    color: var(--accent-cyan, #67e8f9);
  }
  .btn-accept:hover {
    background: var(--accent-cyan, #67e8f9);
    color: var(--bg-base, #0c0a14);
  }

  .endpoint-list {
    list-style: none;
    margin: 0;
    padding: 0 0 0 calc(var(--spacing-sm) + 14px);
    /* MAX_ENDPOINTS = 10 × ~17px row height = ~170px; 200px fits all 10
       comfortably without forcing the user to scroll past hidden URLs
       before clicking Accept. Scroll fallback retained for safety, but
       in practice it shouldn't trigger. */
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .endpoint-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-family: var(--mono);
    font-size: 12px;
    color: var(--t2, rgba(255, 255, 255, 0.74));
    min-width: 0;
  }

  .endpoint-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-cyan, #67e8f9);
    flex-shrink: 0;
  }
  .endpoint-pip.disabled {
    background: var(--t4, rgba(255, 255, 255, 0.32));
  }

  .endpoint-identity {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .endpoint-label {
    font-family: var(--sans, sans-serif);
    font-size: 12px;
    font-weight: 500;
    color: var(--t1, rgba(255, 255, 255, 0.94));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .endpoint-url {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3, rgba(255, 255, 255, 0.54));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .endpoint-badge {
    font-family: var(--sans);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--t4, rgba(255, 255, 255, 0.32));
    flex-shrink: 0;
  }

  /* Mobile — stack actions under text. */
  @media (max-width: 767px) {
    .banner-header {
      flex-wrap: wrap;
    }
    .banner-text {
      flex-basis: 100%;
    }
  }
</style>
