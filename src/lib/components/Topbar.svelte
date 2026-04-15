<!-- src/lib/components/Topbar.svelte -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import type { TestLifecycleState } from '$lib/types';
  import { onMount, onDestroy } from 'svelte';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  let lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  let roundCounter: number = $derived($measurementStore.roundCounter);
  let isSharedView: boolean = $derived($uiStore.isSharedView);

  let showRunStatus: boolean = $derived(
    lifecycle === 'running' || lifecycle === 'starting' || lifecycle === 'stopping'
  );

  let runLabel: string = $derived.by(() => {
    if (isSharedView) return 'Shared Results';
    if (lifecycle === 'running') return `Round ${roundCounter}`;
    if (lifecycle === 'starting') return 'Starting\u2026';
    if (lifecycle === 'stopping') return 'Stopping\u2026';
    return '';
  });

  let isRunning: boolean = $derived(lifecycle === 'running');
  let isTransitioning: boolean = $derived(lifecycle === 'starting' || lifecycle === 'stopping');

  let startStopLabel: string = $derived.by(() => {
    if (lifecycle === 'running') return 'Stop';
    if (lifecycle === 'starting') return 'Starting\u2026';
    if (lifecycle === 'stopping') return 'Stopping\u2026';
    return 'Start';
  });

  let isStartButton: boolean = $derived(
    lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed'
  );

  let isMobile: boolean = $state(false);
  let mql: MediaQueryList | null = null;

  function handleMqlChange(e: MediaQueryListEvent | MediaQueryList): void {
    isMobile = e.matches;
  }

  onMount(() => {
    mql = window.matchMedia('(max-width: 767px)');
    isMobile = mql.matches;
    mql.addEventListener('change', handleMqlChange as EventListener);
  });

  onDestroy(() => {
    mql?.removeEventListener('change', handleMqlChange as EventListener);
  });

  function handleStartStop(): void {
    if (lifecycle === 'running') {
      onStop?.();
    } else if (lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed') {
      onStart?.();
    }
  }

  function handleRunOwn(): void {
    uiStore.clearSharedView();
    measurementStore.reset();
  }

  function handleSettings(): void { uiStore.toggleSettings(); }
  function handleShare(): void { uiStore.toggleShare(); }
  function handleEndpoints(): void { uiStore.toggleEndpoints(); }
</script>

<header
  class="topbar"
  style:--topbar-bg={tokens.color.topbar.bg}
  style:--topbar-border={tokens.color.topbar.border}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--glass-bg={tokens.color.glass.bg}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--accent-green={tokens.color.accent.green}
  style:--green-glow={tokens.color.accent.greenGlow}
  style:--cyan-bg-subtle={tokens.color.accent.cyanBgSubtle}
  style:--cyan-border-subtle={tokens.color.accent.cyanBorderSubtle}
  style:--cyan25={tokens.color.accent.cyan25}
  style:--glow-cyan={tokens.color.glow.cyan}
  style:--pink-bg-subtle={tokens.color.accent.pinkBgSubtle}
  style:--pink-border-subtle={tokens.color.accent.pinkBorderSubtle}
  style:--pink25={tokens.color.accent.pink25}
  style:--glow-pink={tokens.color.glow.pink}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--topbar-height="{tokens.lane.topbarHeight}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--timing-btn="{tokens.timing.btnHover}ms"
  style:--timing-stat="{tokens.timing.statTransition}ms"
  style:--timing-dot-enter="{tokens.timing.dotEntrance}ms"
  style:--timing-dot-exit="{tokens.timing.dotExit}ms"
  style:--easing-spring={tokens.easing.spring}
  style:--breakpoint-small="{tokens.breakpoints.small}px"
>
  <div class="logo" aria-label="Chronoscope">
    <span class="logo-text">Chronoscope</span>
  </div>

  {#if showRunStatus}
    <div class="run-status">
      <div
        class="pulse-dot"
        class:dot-enter={isRunning}
        class:dot-exit={!isRunning}
        aria-hidden="true"
      ></div>
      <span class="run-label" aria-hidden="true">{runLabel}</span>
    </div>
  {/if}

  <div class="spacer"></div>

  <nav class="actions" aria-label="Test controls">
    {#if isSharedView}
      <button type="button" class="btn btn-ghost" aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover" onclick={handleShare}>
        {#if isMobile}
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 10V12.5C4 13.052 4.448 13.5 5 13.5H11C11.552 13.5 12 13.052 12 12.5V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 2.5V10M8 2.5L5.5 5M8 2.5L10.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          Share
        {/if}
      </button>
      <button type="button" class="btn btn-start-stop start" aria-label="Run your own test" onclick={handleRunOwn}>Run Your Own Test</button>
    {:else}
      <button type="button" class="btn btn-ghost" aria-label="Add or remove endpoints" aria-expanded={$uiStore.showEndpoints} aria-controls="endpoint-drawer" onclick={handleEndpoints}>
        {#if isMobile}
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 5V11M5 8H11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        {:else}
          + Endpoint
        {/if}
      </button>
      <button type="button" class="btn btn-ghost" aria-label="Open settings" aria-expanded={$uiStore.showSettings} aria-controls="settings-drawer" onclick={handleSettings}>
        {#if isMobile}
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6M12.6 12.6L11.5 11.5M4.5 4.5L3.4 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        {:else}
          Settings
        {/if}
      </button>
      <button type="button" class="btn btn-ghost" aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover" onclick={handleShare}>
        {#if isMobile}
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 10V12.5C4 13.052 4.448 13.5 5 13.5H11C11.552 13.5 12 13.052 12 12.5V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 2.5V10M8 2.5L5.5 5M8 2.5L10.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          Share
        {/if}
      </button>
      <button
        type="button"
        class="btn btn-start-stop"
        class:start={isStartButton}
        class:stop={!isStartButton && lifecycle === 'running'}
        disabled={isTransitioning}
        aria-disabled={isTransitioning}
        aria-label={startStopLabel}
        onclick={handleStartStop}
      >{startStopLabel}</button>
    {/if}
  </nav>
</header>

<style>
  .topbar {
    height: var(--topbar-height);
    display: flex;
    align-items: center;
    padding: 0 var(--spacing-lg2);
    gap: var(--spacing-md);
    flex-shrink: 0;
    background: var(--topbar-bg);
    border-bottom: 1px solid var(--topbar-border);
    backdrop-filter: blur(30px) saturate(1.3);
    -webkit-backdrop-filter: blur(30px) saturate(1.3);
    position: relative;
  }
  .topbar::after {
    content: '';
    position: absolute;
    top: 0; left: 20%; right: 20%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }
  .logo { display: flex; align-items: center; }
  .logo-text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-pink));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
  }
  .run-status {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--mono); font-size: 11px; font-weight: 300; color: var(--t2);
  }
  .pulse-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent-green);
    box-shadow: 0 0 8px var(--green-glow);
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
    transform: scale(0);
  }
  .dot-enter {
    animation: dot-entrance var(--timing-dot-enter) var(--easing-spring) forwards, pulse 2s ease-in-out infinite var(--timing-dot-enter);
  }
  .dot-exit {
    animation: dot-exit-anim var(--timing-dot-exit) ease-out forwards;
  }
  @keyframes dot-entrance {
    from { transform: scale(0); }
    to { transform: scale(1); }
  }
  @keyframes dot-exit-anim {
    from { transform: scale(1); opacity: 1; }
    to { transform: scale(0); opacity: 0; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .4; transform: scale(.85); }
  }
  .run-label { color: var(--t2); }
  .spacer { flex: 1; }
  .actions { display: flex; align-items: center; gap: 8px; }
  .btn {
    font-family: var(--sans); font-size: 11px; font-weight: 500;
    letter-spacing: 0.01em; padding: 7px 16px;
    border-radius: var(--btn-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--t2); cursor: pointer;
    transition: background var(--timing-stat) ease,
                border-color var(--timing-stat) ease,
                color var(--timing-stat) ease,
                box-shadow var(--timing-stat) ease,
                transform 100ms ease;
    white-space: nowrap; min-height: 44px;
    display: flex; align-items: center; justify-content: center;
  }

  /* Ghost buttons — secondary actions */
  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--t3);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--glass-bg);
    border-color: transparent;
    color: var(--t2);
  }

  /* Start/Stop — single node, class toggles for CSS crossfade */
  .btn-start-stop {
    background: var(--cyan-bg-subtle);
    border-color: var(--cyan-border-subtle);
    color: var(--accent-cyan);
  }
  .btn-start-stop.stop {
    background: var(--pink-bg-subtle);
    border-color: var(--pink-border-subtle);
    color: var(--accent-pink);
  }
  .btn-start-stop:hover:not(:disabled) {
    background: var(--cyan25);
    border-color: var(--cyan-border-subtle);
    box-shadow: 0 0 12px var(--glow-cyan);
    color: var(--accent-cyan);
  }
  .btn-start-stop.stop:hover:not(:disabled) {
    background: var(--pink25);
    border-color: var(--pink-border-subtle);
    box-shadow: 0 0 12px var(--glow-pink);
    color: var(--accent-pink);
  }

  .btn:active:not(:disabled) {
    transform: scale(0.97);
    transition-duration: 50ms;
  }

  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-icon { display: block; flex-shrink: 0; }

  @media (prefers-reduced-motion: reduce) {
    .btn, .pulse-dot, .dot-enter {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
    }
  }

  @media (max-width: 767px) {
    .topbar { padding: 0 var(--spacing-md); gap: var(--spacing-sm); }
    .btn-ghost { padding: 7px; min-width: 44px; }
  }

  @media (max-width: 479px) {
    .logo-text {
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
