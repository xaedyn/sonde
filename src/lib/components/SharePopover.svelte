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
  import { remoteVantageStore } from '$lib/stores/remote-vantage';
  import { buildShareURL } from '$lib/share/share-manager';
  import {
    buildConfigSharePayload,
    buildResultsSharePayload,
    MAX_SHARE_URL_CHARS,
  } from '$lib/share/share-payload-builder';
  import { tokens } from '$lib/tokens';
  import type { SharePayload } from '$lib/types';

  const MAX_HOSTED_REPORT_CHARS = 100_000;

  let popoverEl: HTMLDivElement;
  let copiedReport = $state(false);
  let copiedConfig = $state(false);
  let copiedResults = $state(false);
  let reportBusy = $state(false);
  let reportNotice = $state<string | null>(null);
  let fallbackUrl: string | null = $state(null);
  let fallbackInputEl: HTMLInputElement | undefined = $state();

  let hasResults = $derived(
    Object.keys($measurementStore.endpoints).length > 0 &&
    Object.values($measurementStore.endpoints).some(ep => ep.samples.length > 0)
  );

  let configPayload = $derived(buildConfigPayload());
  let builtHostedReport = $derived(hasResults ? buildResultsPayload(MAX_HOSTED_REPORT_CHARS) : null);
  let builtResults = $derived(hasResults ? buildResultsPayload() : null);
  let hostedReportPayload = $derived(builtHostedReport?.payload ?? null);
  let resultsPayload = $derived(builtResults?.payload ?? null);
  let hostedReportTruncated = $derived(builtHostedReport?.truncated ?? false);
  let resultsTruncated = $derived(builtResults?.truncated ?? false);

  function buildConfigPayload(): SharePayload {
    return buildConfigSharePayload(get(endpointStore), get(settingsStore));
  }

  function buildResultsPayload(maxChars = MAX_SHARE_URL_CHARS) {
    return buildResultsSharePayload(
      get(endpointStore),
      get(settingsStore),
      get(measurementStore),
      maxChars,
      Date.now(),
      undefined,
      get(remoteVantageStore).lastProbe,
    );
  }

  async function handleCreateReport(): Promise<void> {
    if (!hostedReportPayload || reportBusy) return;

    reportBusy = true;
    reportNotice = null;
    try {
      const hostedUrl = await remoteVantageStore.createHostedReport(hostedReportPayload);
      const fallbackShareUrl = resultsPayload ? buildShareURL(resultsPayload) : buildShareURL(hostedReportPayload);
      await copyToClipboard(hostedUrl ?? fallbackShareUrl);

      if (hostedUrl === null) {
        reportNotice = 'Hosted report was unavailable, so Chronoscope copied a compact results URL instead.';
      } else if (hostedReportTruncated) {
        reportNotice = 'Report was trimmed to fit hosted report limits. Newest rounds are kept.';
      }
      copiedReport = true;
      setTimeout(() => { copiedReport = false; }, 2000);
    } finally {
      reportBusy = false;
    }
  }

  async function handleCopyConfig(): Promise<void> {
    reportNotice = null;
    const url = buildShareURL(configPayload);
    await copyToClipboard(url);
    copiedConfig = true;
    setTimeout(() => { copiedConfig = false; }, 2000);
  }

  async function handleCopyResults(): Promise<void> {
    if (!resultsPayload) return;
    reportNotice = null;
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

    <!-- Report status -->
    {#if reportNotice}
      <div class="notice" role="status">
        {reportNotice}
      </div>
    {/if}

    <!-- Truncation warning -->
    {#if resultsTruncated}
      <div class="warning" role="note">
        Compact URL results are trimmed to fit browser URL limits. Newest rounds are kept.
      </div>
    {/if}

    <!-- Buttons -->
    <div class="share-actions">
      <!-- Hosted support report -->
      <div class="share-action share-action-primary">
        <div class="action-info">
          <span class="action-label">Support report</span>
          <span class="action-desc">
            {hasResults ? 'Hosted read-only report with samples, verdict, and browser visibility' : 'Run a test first to create a support report'}
          </span>
        </div>
        <button
          type="button"
          class="btn-copy btn-primary"
          class:copied={copiedReport}
          disabled={!hasResults || reportBusy}
          aria-disabled={!hasResults || reportBusy}
          onclick={handleCreateReport}
        >
          {#if reportBusy}
            Creating…
          {:else if copiedReport}
            Copied Report Link
          {:else}
            Create Support Report
          {/if}
        </button>
      </div>

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
          <span class="action-label">Compact results URL</span>
          <span class="action-desc">
            {hasResults ? 'Fallback link packed into the URL hash' : 'Run a test first to share results'}
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
          {copiedResults ? 'Copied!' : 'Copy URL Link'}
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

  /* ── Notices ───────────────────────────────────────────────────────────── */
  .notice,
  .warning {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--btn-radius);
    font-family: var(--sans);
    font-size: 12px;
    position: relative;
    z-index: 2;
  }

  .notice {
    background: rgba(103,232,249,.08);
    border: 1px solid rgba(103,232,249,.25);
    color: var(--t2);
  }

  .warning {
    background: rgba(255,140,0,.08);
    border: 1px solid rgba(255,140,0,.25);
    color: var(--t2);
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

  .share-action-primary {
    border-color: rgba(103,232,249,.22);
    background: rgba(103,232,249,.055);
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
    line-height: 1.35;
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

  .btn-primary {
    background: rgba(103,232,249,.14);
    border-color: rgba(103,232,249,.34);
    color: var(--t1);
    box-shadow: 0 0 14px rgba(103,232,249,.08);
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
