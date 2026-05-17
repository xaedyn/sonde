<!-- src/lib/components/Topbar.svelte -->
<!-- Figma-aligned top app bar. Brand left, primary run action right, compact  -->
<!-- utility controls nearby. Detailed run state lives in the Overview card.   -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import type { TestLifecycleState } from '$lib/types';
  import { formatElapsed } from '$lib/utils/format';
  import { isStartLifecycle, runStatusText, startStopButtonLabel } from '$lib/utils/lifecycle-copy';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  const lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  const roundCounter: number = $derived($measurementStore.roundCounter);
  const isSharedView: boolean = $derived($uiStore.isSharedView);
  const enabledEndpointCount = $derived($endpointStore.filter((ep) => ep.enabled).length);
  const cap = $derived($settingsStore.cap);
  const burstRounds = $derived($settingsStore.burstRounds);
  const monitorDelay = $derived($settingsStore.monitorDelay);
  const timeout = $derived($settingsStore.timeout);
  const startedAt = $derived($measurementStore.startedAt);
  const errorCount = $derived($measurementStore.errorCount);
  const timeoutCount = $derived($measurementStore.timeoutCount);

  let detailsOpen = $state(false);
  let now = $state(Date.now());

  const isRunning = $derived(lifecycle === 'running');
  const isTransitioning = $derived(lifecycle === 'starting' || lifecycle === 'stopping');

  const runText = $derived(runStatusText(lifecycle));

  const tickText = $derived(`T+${String(roundCounter).padStart(4, '0')}`);
  const endpointText = $derived(`${enabledEndpointCount} endpoint${enabledEndpointCount === 1 ? '' : 's'}`);
  const timeoutText = $derived(`${Math.round(timeout / 1000)}s timeout`);
  const progressText = $derived(`${roundCounter} of ${cap} samples`);
  const elapsedText = $derived(startedAt === null ? 'Not started' : `${formatElapsed(Math.max(0, now - startedAt))} elapsed`);
  const cadenceText = $derived(
    roundCounter < burstRounds
      ? `Burst ${Math.min(roundCounter, burstRounds)}/${burstRounds}`
      : `${Math.round(monitorDelay / 1000)}s interval`
  );
  const issueText = $derived(
    errorCount === 0 && timeoutCount === 0
      ? 'No request errors'
      : `${errorCount} error${errorCount === 1 ? '' : 's'} · ${timeoutCount} timeout${timeoutCount === 1 ? '' : 's'}`
  );
  const runSummaryText = $derived(`Browser test · ${endpointText} · ${timeoutText}`);

  const startStopLabel = $derived(startStopButtonLabel(lifecycle));
  const isStartButton = $derived(isStartLifecycle(lifecycle));
  const startStopText = $derived.by(() => {
    if (lifecycle === 'starting') return 'Starting...';
    if (lifecycle === 'stopping') return 'Stopping...';
    return isStartButton ? 'Start Test' : 'Stop Test';
  });

  $effect(() => {
    if (lifecycle !== 'running') return;
    const id = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(id);
  });

  function handleRunDetails(): void {
    detailsOpen = !detailsOpen;
  }
  function handleStartStop(): void {
    if (lifecycle === 'running') onStop?.();
    else if (isStartButton) onStart?.();
  }
  function handleRunOwn(): void {
    uiStore.clearSharedView();
    uiStore.setAutoStartSuppressionReason(null);
    measurementStore.reset();
  }
  function handleSettings():  void { uiStore.toggleSettings();  }
  function handleShare():     void { uiStore.toggleShare();     }
  function handleEndpoints(): void { uiStore.toggleEndpoints(); }
</script>

<header class="topbar">
  <div class="brand">
    <div class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.2" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        <line x1="12" y1="12" x2="12" y2="4.5"  stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="12" y1="12" x2="17" y2="15"   stroke="currentColor" stroke-width="1"   stroke-linecap="round" opacity="0.7" />
      </svg>
    </div>
    <div class="brand-meta">
      <div class="brand-name">Chronoscope</div>
      <div class="brand-sub">HTTP latency monitor · multi-site</div>
    </div>
  </div>

  <div class="topbar-divider" aria-hidden="true"></div>

  <div class="run-status" role="status" aria-live="polite" aria-label={runText}>
    <span class="run-dot" class:on={isRunning} aria-hidden="true"></span>
    <span class="run-label">{runText}</span>
    <span class="run-tick" aria-hidden="true">{tickText}</span>
  </div>
  <span class="run-summary">{runSummaryText}</span>

  <div class="spacer"></div>

  <nav class="actions" aria-label="Test controls">
    <div class="run-details">
      <button
        type="button"
        class="icon-btn run-details-btn"
        aria-label="Run details"
        aria-expanded={detailsOpen}
        aria-controls="run-details-popover"
        onclick={handleRunDetails}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 7.25V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          <circle cx="8" cy="4.75" r=".75" fill="currentColor"/>
        </svg>
      </button>
      {#if detailsOpen}
        <div id="run-details-popover" class="run-details-popover" role="dialog" aria-label="Run details">
          <p class="run-details-title">Browser test</p>
          <dl class="run-details-list">
            <div>
              <dt>Endpoints</dt>
              <dd>{endpointText}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{progressText}</dd>
            </div>
            <div>
              <dt>Cadence</dt>
              <dd>{cadenceText}</dd>
            </div>
            <div>
              <dt>Timeout</dt>
              <dd>{timeoutText}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{elapsedText}</dd>
            </div>
            <div>
              <dt>Requests</dt>
              <dd>{issueText}</dd>
            </div>
          </dl>
        </div>
      {/if}
    </div>
    {#if isSharedView}
      <button
        type="button" class="icon-btn"
        aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover"
        onclick={handleShare}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 10V12.5C4 13.052 4.448 13.5 5 13.5H11C11.552 13.5 12 13.052 12 12.5V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 2.5V10M8 2.5L5.5 5M8 2.5L10.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button type="button" class="run-btn start run-own" aria-label="Run your own test" onclick={handleRunOwn}>
        Run Your Own Test
      </button>
    {:else}
      <button
        type="button" class="icon-btn"
        aria-label="Add or remove endpoints" aria-expanded={$uiStore.showEndpoints} aria-controls="endpoint-drawer"
        onclick={handleEndpoints}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 5V11M5 8H11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
      <button
        type="button" class="icon-btn"
        aria-label="Open settings" aria-expanded={$uiStore.showSettings} aria-controls="settings-drawer"
        onclick={handleSettings}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4H10.5M13.5 4H14M2 8H5M8 8H14M2 12H8M11 12H14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          <circle cx="12"  cy="4"  r="1.5" stroke="currentColor" stroke-width="1.3"/>
          <circle cx="6.5" cy="8"  r="1.5" stroke="currentColor" stroke-width="1.3"/>
          <circle cx="9.5" cy="12" r="1.5" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </button>
      <button
        type="button" class="icon-btn"
        aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover"
        onclick={handleShare}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 10V12.5C4 13.052 4.448 13.5 5 13.5H11C11.552 13.5 12 13.052 12 12.5V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 2.5V10M8 2.5L5.5 5M8 2.5L10.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button
        type="button"
        class="run-btn"
        class:start={isStartButton}
        class:stop={isRunning}
        disabled={isTransitioning}
        aria-disabled={isTransitioning}
        aria-label={startStopLabel}
        onclick={handleStartStop}
      >
        <span class="run-btn-icon" aria-hidden="true">{isRunning ? '■' : '▶'}</span>
        <span>{startStopText}</span>
      </button>
    {/if}
  </nav>
</header>

<style>
  .topbar {
    position: relative;
    z-index: 50;
    height: var(--shell-topbar-height, var(--topbar-height));
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    background: var(--shell-backdrop);
    backdrop-filter: var(--shell-topbar-backdrop);
    -webkit-backdrop-filter: var(--shell-topbar-backdrop);
    border-bottom: 1px solid var(--shell-border);
    color: var(--t1);
  }

  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .brand-mark {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent-cyan), color-mix(in srgb, var(--accent-cyan), black 40%));
    border: 0;
    display: grid; place-items: center;
    color: var(--shell-bg);
    flex-shrink: 0;
    box-shadow: 0 0 24px color-mix(in srgb, var(--accent-cyan) 22%, transparent);
  }
  .brand-mark svg circle { display: none; }
  .brand-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .brand-name {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 18px;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    color: var(--t1);
  }
  .brand-sub {
    display: none;
  }

  .topbar-divider {
    display: none;
  }

  .run-status {
    display: none;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .run-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--t4);
    transition: background 200ms ease, box-shadow 200ms ease;
    flex-shrink: 0;
  }
  .run-dot.on {
    background: var(--accent-green);
    box-shadow: 0 0 10px var(--green-glow);
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .run-label {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t2);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .run-tick {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t3);
    font-variant-numeric: tabular-nums;
    margin-left: 2px;
  }
  .run-summary {
    display: none;
  }

  .spacer { flex: 1; }

  .actions { display: flex; align-items: center; gap: 10px; }
  .run-details {
    display: none;
  }
  .run-details-popover {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 80;
    width: var(--shell-popover-width);
    padding: 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--shell-border-strong);
    background: var(--shell-popover);
    box-shadow: var(--shadow-popover);
    backdrop-filter: var(--shell-popover-backdrop);
    -webkit-backdrop-filter: var(--shell-popover-backdrop);
  }
  .run-details-title {
    margin: 0 0 9px;
    font-family: var(--sans);
    font-size: var(--ts-md);
    font-weight: 600;
    color: var(--t1);
  }
  .run-details-list {
    margin: 0;
    display: grid;
    gap: 7px;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    font-variant-numeric: tabular-nums;
  }
  .run-details-list div {
    display: flex;
    justify-content: space-between;
    gap: 14px;
  }
  .run-details-list dt {
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: var(--tr-kicker);
  }
  .run-details-list dd {
    margin: 0;
    color: var(--t1);
    text-align: right;
  }

  .icon-btn {
    width: var(--shell-control-size);
    height: var(--shell-control-size);
    min-width: var(--shell-control-size);
    min-height: var(--shell-control-size);
    border-radius: var(--radius-sm);
    background: var(--shell-panel);
    border: 1px solid var(--shell-border);
    color: var(--t2);
    display: grid; place-items: center;
    cursor: pointer;
    transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
  }
  .icon-btn:hover {
    color: var(--t1);
    border-color: var(--shell-border-strong);
    background: var(--shell-panel-hover);
  }
  .icon-btn:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .run-btn {
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 900;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    min-height: 44px;
    padding: 0 28px;
    border-radius: 8px;
    background: var(--accent-cyan);
    border: 1px solid var(--accent-cyan);
    color: var(--shell-bg);
    display: inline-flex; align-items: center; gap: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease, filter 160ms ease;
  }
  .run-btn.stop {
    background: var(--shell-stop-bg);
    border-color: var(--shell-stop-border);
    color: var(--accent-pink);
  }
  .run-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .run-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .run-btn:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .run-btn-icon { font-size: var(--ts-xs); }

  @media (prefers-reduced-motion: reduce) {
    .run-dot, .icon-btn, .run-btn { animation: none !important; transition: none !important; }
  }

  @media (max-width: 767px) {
    .brand-name { font-size: 14px; }
    .topbar { gap: 8px; padding: 0 12px; }
    .actions { gap: 6px; }
    .icon-btn {
      width: var(--shell-mobile-control-size);
      height: var(--shell-mobile-control-size);
      min-width: var(--shell-mobile-control-size);
      min-height: var(--shell-mobile-control-size);
      padding: 0;
    }
    .actions .run-btn:not(.run-own) {
      justify-content: center;
      min-width: 44px;
      width: 44px;
      min-height: var(--shell-mobile-control-size);
      padding: 0;
    }
    .actions .run-btn:not(.run-own) span:not(.run-btn-icon) { display: none; }
  }

  @media (max-width: 420px) {
    .brand { gap: 6px; }
    .brand-mark { width: 28px; height: 28px; }
    .run-btn { padding: 0 10px; }
  }

  @media (max-width: 374px) {
    .brand-meta { display: none; }
    .brand { gap: 0; }
  }
</style>
