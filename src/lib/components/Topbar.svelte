<!-- src/lib/components/Topbar.svelte -->
<!-- v2 chrome — pixel-aligned to v2/Chronoscope v2.html. Preserves every       -->
<!-- existing control (endpoints / settings / share / start-stop) and adds the -->
<!-- networkQualityStore-driven status pill required by the Phase 1 brief.     -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { networkQualityStore } from '$lib/stores/derived';
  import { LEVEL_STYLES, networkLevel } from '$lib/utils/classify';
  import type { TestLifecycleState } from '$lib/types';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  const lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  const roundCounter: number = $derived($measurementStore.roundCounter);
  const isSharedView: boolean = $derived($uiStore.isSharedView);

  const isRunning = $derived(lifecycle === 'running');
  const isTransitioning = $derived(lifecycle === 'starting' || lifecycle === 'stopping');

  const runText = $derived.by(() => {
    if (lifecycle === 'running')  return 'Measuring';
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return 'Halted';
  });

  const tickText = $derived(`T+${String(roundCounter).padStart(4, '0')}`);

  const startStopLabel = $derived.by(() => {
    if (lifecycle === 'running') return 'Halt';
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return 'Start';
  });
  const isStartButton = $derived(
    lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed',
  );

  // Status pill — driven by networkQualityStore, mapped through networkLevel().
  const score = $derived($networkQualityStore);
  const level = $derived(networkLevel(score));
  const pillStyle = $derived(LEVEL_STYLES[level]);

  function handleStartStop(): void {
    if (lifecycle === 'running') onStop?.();
    else if (isStartButton) onStart?.();
  }
  function handleRunOwn(): void {
    uiStore.clearSharedView();
    measurementStore.reset();
  }
  function handleSettings():  void { uiStore.toggleSettings();  }
  function handleShare():     void { uiStore.toggleShare();     }
  function handleEndpoints(): void { uiStore.toggleEndpoints(); }
</script>

<header class="topbar" data-level={level}>
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
      <div class="brand-sub">HTTP latency diagnostic · v2</div>
    </div>
  </div>

  <div class="topbar-divider brand-divider" aria-hidden="true"></div>

  <div
    class="status-pill"
    role="status"
    aria-live="polite"
    aria-label="Network quality: {pillStyle.label}{score !== null ? `, score ${score}` : ''}"
    style:--pill-color={pillStyle.color}
    style:--pill-glow={pillStyle.glow}
  >
    <span class="status-dot" class:on={isRunning && level !== 'unknown'}></span>
    <span class="status-label">{pillStyle.label}</span>
    <span class="status-tick" aria-hidden="true">{tickText}</span>
  </div>

  <div class="topbar-divider run-divider" aria-hidden="true"></div>

  <div class="run-state">
    <span class="run-state-label">{runText}</span>
  </div>

  <div class="spacer"></div>

  <nav class="actions" aria-label="Test controls">
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
      <button type="button" class="run-btn start" aria-label="Run your own test" onclick={handleRunOwn}>
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
        <span>{startStopLabel}</span>
      </button>
    {/if}
  </nav>
</header>

<style>
  .topbar {
    height: var(--topbar-height);
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    background: var(--surface-topbar-bg);
    backdrop-filter: blur(16px) saturate(1.3);
    -webkit-backdrop-filter: blur(16px) saturate(1.3);
    border-bottom: 1px solid var(--border-mid);
    color: var(--t1);
  }

  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(103,232,249,.15), rgba(249,168,212,.10));
    border: 1px solid var(--border-bright);
    display: grid; place-items: center;
    color: var(--accent-cyan);
    flex-shrink: 0;
  }
  .brand-meta { display: flex; flex-direction: column; gap: 1px; }
  .brand-name {
    font-family: var(--sans);
    font-weight: 600;
    font-size: var(--ts-lg);
    letter-spacing: var(--tr-tight);
    color: var(--t1);
  }
  .brand-sub {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }

  .topbar-divider {
    width: 1px; height: 28px;
    background: var(--border-mid);
    flex-shrink: 0;
  }

  .status-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 10px; border-radius: 999px;
    background: rgba(255,255,255,.03);
    border: 1px solid var(--border-mid);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t2);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--pill-color);
    box-shadow: 0 0 8px var(--pill-glow);
    transition: background 200ms ease, box-shadow 200ms ease;
  }
  .status-dot.on { animation: pulse 1.8s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .status-label { color: var(--t2); }
  .status-tick {
    color: var(--t3);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  .run-state { display: flex; align-items: center; }
  .run-state-label {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }

  .spacer { flex: 1; }

  .actions { display: flex; align-items: center; gap: 8px; }

  .icon-btn {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--border-mid);
    color: var(--t2);
    display: grid; place-items: center;
    cursor: pointer;
    transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
  }
  .icon-btn:hover {
    color: var(--t1);
    border-color: var(--border-bright);
    background: rgba(255,255,255,.03);
  }
  .icon-btn:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .run-btn {
    font-family: var(--sans);
    font-size: var(--ts-md);
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 8px 16px;
    border-radius: 8px;
    background: rgba(134,239,172,.12);
    border: 1px solid rgba(134,239,172,.30);
    color: var(--accent-green);
    display: inline-flex; align-items: center; gap: 6px;
    cursor: pointer;
    transition: filter 160ms ease;
  }
  .run-btn.stop {
    background: rgba(249,168,212,.10);
    border-color: rgba(249,168,212,.30);
    color: var(--accent-pink);
  }
  .run-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .run-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .run-btn:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .run-btn-icon { font-size: var(--ts-xs); }

  @media (prefers-reduced-motion: reduce) {
    .status-dot, .icon-btn, .run-btn { animation: none !important; transition: none; }
  }

  /* Mobile narrow: collapse the run-state label and brand-sub to keep the topbar
     usable below 768px. Status pill + action icons stay visible.
     Hides .run-divider explicitly — selector is class-based because the brand
     element is also a <div> and `:nth-of-type(2)` would match the wrong one.  */
  @media (max-width: 767px) {
    .brand-sub, .run-state, .run-divider { display: none; }
    .topbar { gap: 8px; padding: 0 12px; }
    .status-pill { padding: 6px 8px; }
  }
</style>
