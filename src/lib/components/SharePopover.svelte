<!-- src/lib/components/SharePopover.svelte -->
<!-- Share popover with config and results URL generation.                      -->
<!-- Shown when uiStore.showShare is true. Closes on Escape or click outside.   -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { uiStore } from '$lib/stores/ui';
  import { endpointStore } from '$lib/stores/endpoints';
  import { settingsStore } from '$lib/stores/settings';
  import { measurementStore } from '$lib/stores/measurements';
  import { buildShareURL, estimateShareSize, truncatePayload } from '$lib/share/share-manager';
  import { tokens } from '$lib/tokens';
  import type { SharePayload } from '$lib/types';

  const MAX_URL_CHARS = 8000;

  let popoverEl: HTMLDivElement;
  let copiedConfig = $state(false);
  let copiedResults = $state(false);
  let fallbackUrl: string | null = $state(null);
  let fallbackInputEl: HTMLInputElement;

  let hasResults = $derived(
    Object.keys($measurementStore.endpoints).length > 0 &&
    Object.values($measurementStore.endpoints).some(ep => ep.samples.length > 0)
  );

  let configPayload = $derived(buildConfigPayload());
  let resultsPayload = $derived(hasResults ? buildResultsPayload() : null);
  let configSize = $derived(estimateShareSize(configPayload));
  let resultsSize = $derived(resultsPayload ? estimateShareSize(resultsPayload) : 0);
  let resultsTruncated = $derived(resultsSize > MAX_URL_CHARS);

  function buildConfigPayload(): SharePayload {
    const endpoints = get(endpointStore);
    const settings = get(settingsStore);
    return {
      v: 1,
      mode: 'config',
      endpoints: endpoints.map(ep => ({ url: ep.url, enabled: ep.enabled })),
      settings,
    };
  }

  function buildResultsPayload(): SharePayload {
    const endpoints = get(endpointStore);
    const settings = get(settingsStore);
    const mstate = get(measurementStore);

    const results = endpoints.map(ep => {
      const epState = mstate.endpoints[ep.id];
      return {
        samples: (epState?.samples ?? []).map(s => ({
          round: s.round,
          latency: s.latency,
          status: s.status,
          ...(s.tier2 ? { tier2: s.tier2 } : {}),
        })),
      };
    });

    const payload: SharePayload = {
      v: 1,
      mode: 'results',
      endpoints: endpoints.map(ep => ({ url: ep.url, enabled: ep.enabled })),
      settings,
      results,
    };

    // Auto-truncate if too large
    if (estimateShareSize(payload) > MAX_URL_CHARS) {
      return truncatePayload(payload, MAX_URL_CHARS);
    }

    return payload;
  }

  async function handleCopyConfig(): Promise<void> {
    const url = buildShareURL(configPayload);
    await copyToClipboard(url);
    copiedConfig = true;
    setTimeout(() => { copiedConfig = false; }, 2000);
  }

  async function handleCopyResults(): Promise<void> {
    if (!resultsPayload) return;
    const url = buildShareURL(resultsPayload);
    await copyToClipboard(url);
    copiedResults = true;
    setTimeout(() => { copiedResults = false; }, 2000);
  }

  async function copyToClipboard(url: string): Promise<void> {
    fallbackUrl = null;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        return;
      } catch {
        // fall through to fallback
      }
    }
    // Fallback: show readonly input
    fallbackUrl = url;
    // Wait for DOM then select
    setTimeout(() => {
      if (fallbackInputEl) {
        fallbackInputEl.select();
      }
    }, 50);
  }

  function close(): void {
    uiStore.toggleShare();
    fallbackUrl = null;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      close();
    }
  }

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    // Focus first focusable element in popover
    const firstFocusable = popoverEl?.querySelector<HTMLElement>('button, input, [tabindex]');
    firstFocusable?.focus();
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="share-overlay"
  role="presentation"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
  style:--surface-overlay={tokens.color.surface.overlay}
  style:--surface-elevated={tokens.color.surface.elevated}
  style:--surface-raised={tokens.color.surface.raised}
  style:--border={tokens.color.chrome.border}
  style:--accent={tokens.color.chrome.accent}
  style:--text-primary={tokens.color.text.primary}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-muted={tokens.color.text.muted}
  style:--status-error={tokens.color.status.error}
  style:--status-success={tokens.color.status.success}
  style:--radius-md="{tokens.radius.md}px"
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
>
  <div
    bind:this={popoverEl}
    id="share-popover"
    class="share-popover"
    role="dialog"
    aria-modal="true"
    aria-label="Share Sonde"
  >
    <!-- Header -->
    <div class="share-header">
      <h2 class="share-title">Share</h2>
      <button
        type="button"
        class="btn-close"
        aria-label="Close share dialog"
        onclick={close}
      >
        ×
      </button>
    </div>

    <!-- Truncation warning -->
    {#if resultsTruncated}
      <div class="warning" role="alert">
        Results were trimmed to fit URL limits. Newest rounds are kept.
      </div>
    {/if}

    <!-- Buttons -->
    <div class="share-actions">
      <!-- Config link -->
      <div class="share-action">
        <div class="action-info">
          <span class="action-label">Configuration link</span>
          <span class="action-desc">Shares endpoints and settings only</span>
        </div>
        <button
          type="button"
          class="btn-copy"
          class:copied={copiedConfig}
          onclick={handleCopyConfig}
        >
          {copiedConfig ? 'Copied!' : 'Copy Config Link'}
        </button>
      </div>

      <!-- Results link -->
      <div class="share-action">
        <div class="action-info">
          <span class="action-label">Results link</span>
          <span class="action-desc">
            {hasResults ? 'Shares measurement results' : 'Run a test first to share results'}
          </span>
        </div>
        <button
          type="button"
          class="btn-copy"
          class:copied={copiedResults}
          disabled={!hasResults}
          aria-disabled={!hasResults}
          onclick={handleCopyResults}
        >
          {copiedResults ? 'Copied!' : 'Copy Results Link'}
        </button>
      </div>
    </div>

    <!-- Clipboard fallback -->
    {#if fallbackUrl !== null}
      <div class="fallback">
        <label for="fallback-url" class="fallback-label">Copy this URL:</label>
        <input
          bind:this={fallbackInputEl}
          id="fallback-url"
          class="fallback-input"
          type="text"
          readonly
          value={fallbackUrl}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .share-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: var(--spacing-lg);
    z-index: 200;
  }

  .share-popover {
    background: var(--surface-elevated);
    backdrop-filter: blur(30px) saturate(1.3);
    -webkit-backdrop-filter: blur(30px) saturate(1.3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    width: 320px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* ── Header ────────────────────────────────────────────────────────────── */
  .share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .share-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .btn-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 20px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    line-height: 1;
    padding: 0;
  }

  .btn-close:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  /* ── Warning ───────────────────────────────────────────────────────────── */
  .warning {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: rgba(255, 140, 0, 0.12);
    border: 1px solid rgba(255, 140, 0, 0.4);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* ── Actions ───────────────────────────────────────────────────────────── */
  .share-actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .share-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
  }

  .action-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .action-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .action-desc {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-copy {
    flex-shrink: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
    white-space: nowrap;
  }

  .btn-copy:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
  }

  .btn-copy:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: var(--border);
    color: var(--text-muted);
  }

  .btn-copy.copied {
    background: var(--status-success);
    border-color: var(--status-success);
    color: #fff;
  }

  /* ── Clipboard fallback ─────────────────────────────────────────────────── */
  .fallback {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .fallback-label {
    font-size: 12px;
    color: var(--text-muted);
  }

  .fallback-input {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--mono);
    box-sizing: border-box;
  }

  .fallback-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* ── Mobile ────────────────────────────────────────────────────────────── */
  @media (max-width: 767px) {
    .share-overlay {
      align-items: flex-end;
      justify-content: center;
      padding: var(--spacing-md);
    }

    .share-popover {
      width: 100%;
      max-width: 100%;
    }
  }
</style>
