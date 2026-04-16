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

  async function copyToClipboard(url: string): Promise<boolean> {
    fallbackUrl = null;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
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
    return true;
  }

  function close(): void {
    uiStore.toggleShare();
    fallbackUrl = null;
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab' && popoverEl) {
      const focusable = popoverEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
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

<div
  class="share-overlay"
  role="presentation"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-bg-strong={tokens.color.glass.bgStrong}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--accent-green={tokens.color.accent.green}
  style:--radius-lg="{tokens.radius.lg}px"
  style:--radius-sm="{tokens.radius.sm}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--sans={tokens.typography.sans.fontFamily}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
>
  <div
    bind:this={popoverEl}
    id="share-popover"
    class="share-popover"
    role="dialog"
    aria-modal="true"
    aria-label="Share Chronoscope"
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
    background: rgba(0,0,0,.4);
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: var(--spacing-lg);
    z-index: 200;
    animation: panelFadeIn 200ms ease-out forwards;
  }

  @keyframes panelFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .share-popover {
    position: relative;
    background: rgba(12,10,20,.75);
    backdrop-filter: blur(40px) saturate(1.4);
    -webkit-backdrop-filter: blur(40px) saturate(1.4);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    width: 320px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 8px 32px rgba(0,0,0,.4);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    animation: panelAppear 180ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
    overflow: hidden;
  }

  @keyframes panelAppear {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* Top-edge gradient highlight */
  .share-popover::before {
    content: '';
    position: absolute;
    top: 0; left: 10%; right: 10%;
    height: 1px; z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  /* Subtle top-left corner glow */
  .share-popover::after {
    content: '';
    position: absolute;
    top: 0; left: 0; width: 100px; height: 100px; z-index: 1;
    pointer-events: none;
    background: radial-gradient(ellipse at top left, rgba(103,232,249,.04), transparent 70%);
  }

  /* ── Header ────────────────────────────────────────────────────────────── */
  .share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 2;
  }

  .share-title {
    margin: 0;
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 600;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-pink));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .btn-close {
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
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition: all var(--timing-btn) ease;
  }

  .btn-close:hover {
    background: var(--glass-highlight);
    border-color: rgba(103,232,249,.2);
    color: var(--t1);
    box-shadow: 0 0 12px rgba(103,232,249,.2);
  }

  /* ── Warning ───────────────────────────────────────────────────────────── */
  .warning {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: rgba(255,140,0,.08);
    border: 1px solid rgba(255,140,0,.25);
    border-radius: var(--btn-radius);
    font-family: var(--sans);
    font-size: 12px;
    color: var(--t2);
    position: relative;
    z-index: 2;
  }

  /* ── Actions ───────────────────────────────────────────────────────────── */
  .share-actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    position: relative;
    z-index: 2;
  }

  .share-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: var(--glass-bg);
    position: relative;
    overflow: hidden;
    transition: border-color var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  /* Top-edge highlight on action cards */
  .share-action::before {
    content: '';
    position: absolute;
    top: 0; left: 15%; right: 15%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }

  .share-action:hover {
    border-color: var(--glass-highlight);
    box-shadow: 0 2px 16px rgba(0,0,0,.15);
  }

  .action-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .action-label {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .action-desc {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--t3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-copy {
    flex-shrink: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: var(--topbar-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--accent-cyan);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--timing-btn) ease;
    white-space: nowrap;
  }

  .btn-copy:hover:not(:disabled) {
    background: var(--glass-highlight);
    border-color: var(--glass-highlight);
    color: var(--t1);
    transform: translateY(-1px);
    box-shadow: 0 2px 12px rgba(103,232,249,.15);
  }

  .btn-copy:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: var(--glass-border);
    color: var(--t3);
  }

  .btn-copy.copied {
    background: var(--accent-green);
    border-color: var(--accent-green);
    color: rgba(12,10,20,.9);
  }

  /* ── Clipboard fallback ─────────────────────────────────────────────────── */
  .fallback {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    position: relative;
    z-index: 2;
  }

  .fallback-label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .fallback-input {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    background: rgba(0,0,0,.2);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    color: var(--t1);
    font-size: 12px;
    font-family: var(--mono);
    box-sizing: border-box;
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3);
    transition: border-color var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  .fallback-input:focus {
    outline: none;
    border-color: var(--accent-cyan);
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3), 0 0 12px rgba(103,232,249,.15);
  }

  @media (prefers-reduced-motion: reduce) {
    .share-popover { animation: none; opacity: 1; transform: none; }
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
