<!-- src/lib/components/Topbar.svelte -->
<!-- v2 aesthetic alignment (v2 PR 4). Floating centred pill at desktop,
     2-row stacked pill at mobile. Single row holds: brand on the left,
     ViewSwitcher segmented control in the centre, Start/Stop + settings
     cog on the right. The run-summary chrome line and the "Measuring +
     T+MM:SS" affordance both retire in favour of v2's quieter pinging-dot
     Live indicator that lives adjacent to the Stop button only while a
     run is active. -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import type { TestLifecycleState } from '$lib/types';
  import { isStartLifecycle, runStatusText, startStopButtonLabel } from '$lib/utils/lifecycle-copy';
  import ViewSwitcher from './ViewSwitcher.svelte';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  const lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  const isSharedView: boolean = $derived($uiStore.isSharedView);

  const isRunning = $derived(lifecycle === 'running');
  const isTransitioning = $derived(lifecycle === 'starting' || lifecycle === 'stopping');
  const isMeasuring = $derived(isRunning || lifecycle === 'starting');

  const runText = $derived(runStatusText(lifecycle));

  // v2 Start/Stop label — drops the "Test" suffix per Arc C.
  const startStopLabel = $derived(startStopButtonLabel(lifecycle));
  const isStartButton = $derived(isStartLifecycle(lifecycle));
  const startStopText = $derived.by(() => {
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return isStartButton ? 'Start' : 'Stop';
  });

  function handleStartStop(): void {
    if (lifecycle === 'running') onStop?.();
    else if (isStartButton) onStart?.();
  }
  function handleRunOwn(): void {
    uiStore.clearSharedView();
    uiStore.setAutoStartSuppressionReason(null);
    measurementStore.reset();
  }
  function handleSettings(): void { uiStore.toggleSettings(); }
  function handleShare(): void { uiStore.toggleShare(); }
</script>

<header class="shell-floating">
  <div class="shell-pill">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
          <line x1="12" y1="12" x2="12" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="12" y1="12" x2="17" y2="15"  stroke="currentColor" stroke-width="1"   stroke-linecap="round" opacity="0.7"/>
        </svg>
      </div>
      <span class="brand-name">Chronoscope</span>
    </div>

    <!-- Segmented control nav (desktop only — mobile shows the standalone
         ViewSwitcher row below this pill). -->
    <div class="nav-slot">
      <ViewSwitcher />
    </div>

    <!-- Actions -->
    <nav class="actions" aria-label="Test controls">
      {#if isMeasuring}
        <span class="live-indicator" role="status" aria-live="polite" aria-label={runText}>
          <span class="live-dot" aria-hidden="true">
            <span class="live-dot-ping"></span>
            <span class="live-dot-core"></span>
          </span>
          Live
        </span>
      {/if}

      {#if isSharedView}
        <button
          type="button" class="icon-btn"
          aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover"
          onclick={handleShare}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 10V12.5C4 13.052 4.448 13.5 5 13.5H11C11.552 13.5 12 13.052 12 12.5V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 2.5V10M8 2.5L5.5 5M8 2.5L10.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="run-btn start" aria-label="Run your own test" onclick={handleRunOwn}>
          Run your own test
        </button>
      {:else}
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
        <button
          type="button" class="icon-btn"
          aria-label="Open settings" aria-expanded={$uiStore.showSettings} aria-controls="settings-drawer"
          onclick={handleSettings}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6M12.6 12.6L11.5 11.5M4.5 4.5L3.4 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      {/if}
    </nav>
  </div>

  <!-- Mobile-only horizontal nav scroll. ViewSwitcher renders its tabs the
       same way regardless of which slot it lives in; CSS hides this copy at
       desktop where the segmented control inside the pill takes over. -->
  <div class="mobile-nav-row">
    <ViewSwitcher />
  </div>
</header>

<style>
  /* Outer container — full-width sticky header that doesn't carry visual
     weight itself. The floating pill below is the actual visible element. */
  .shell-floating {
    position: sticky;
    top: 0;
    z-index: 50;
    width: 100%;
    padding: 16px 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--t1);
  }

  /* The floating pill itself — v2's bg-[#1C1C1E]/80 backdrop-blur-2xl
     border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50, centred
     with a max width so the surface doesn't span the full viewport. */
  .shell-pill {
    width: 100%;
    max-width: 1024px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 8px 14px;
    background: var(--shell-backdrop);
    backdrop-filter: var(--shell-topbar-backdrop);
    -webkit-backdrop-filter: var(--shell-topbar-backdrop);
    border: 1px solid var(--shell-border);
    border-radius: 18px;
    box-shadow: 0 25px 50px -12px color-mix(in srgb, black 60%, transparent);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding-left: 4px;
  }
  .brand-mark {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: linear-gradient(to bottom, color-mix(in srgb, var(--t1) 18%, var(--shell-panel)), var(--shell-panel-raised));
    border: 1px solid color-mix(in srgb, var(--t1) 10%, transparent);
    color: var(--accent-cyan);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: inset 0 1px 1px color-mix(in srgb, var(--t1) 20%, transparent);
  }
  .brand-name {
    font-family: var(--sans);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: var(--tr-tight);
    color: var(--t1);
  }

  /* The nav slot wraps ViewSwitcher so we can centre it inside the grid
     middle column. ViewSwitcher owns its own segmented-control styling. */
  .nav-slot {
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 4px;
  }

  /* v2 Live indicator — pinging dot + "Live" text. No pill, no border;
     the dot itself carries the live-state signal. */
  .live-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-cyan);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
    padding-right: 4px;
  }
  .live-dot {
    position: relative;
    display: inline-flex;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
  }
  .live-dot-ping {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--accent-cyan);
    opacity: 0.55;
    animation: live-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
  .live-dot-core {
    position: relative;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-cyan);
  }
  @keyframes live-ping {
    0% { transform: scale(1); opacity: 0.6; }
    75%, 100% { transform: scale(2.2); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot-ping { animation: none; opacity: 0.4; }
  }

  /* Settings cog — v2 quiet icon button, no border, hover lifts colour
     and adds a faint surface tint. */
  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    border: 0;
    background: transparent;
    color: var(--t3);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 160ms ease, color 160ms ease;
  }
  .icon-btn:hover {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
    color: var(--t1);
  }
  .icon-btn:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  /* Start/Stop — v2 styling. Start: bg-zinc-100 text-black. Stop: rose-
     tinted text + bg + border. Padding/sizing matches v2's px-4 py-1.5. */
  .run-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid transparent;
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, transform 160ms ease;
  }
  .run-btn.start {
    background: var(--t1);
    color: var(--shell-bg);
  }
  .run-btn.start:hover { transform: translateY(-1px); }
  .run-btn.stop {
    background: color-mix(in srgb, var(--accent-pink) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent-pink) 20%, transparent);
    color: var(--accent-pink);
  }
  .run-btn.stop:hover {
    background: color-mix(in srgb, var(--accent-pink) 16%, transparent);
  }
  .run-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  .run-btn-icon { font-size: 10px; line-height: 1; }
  .run-btn:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  /* Hide the mobile-only nav row at desktop. At mobile, hide the inline
     nav slot inside the pill (it would crowd the brand + actions). */
  .mobile-nav-row { display: none; }

  @media (max-width: 767px) {
    .shell-floating {
      padding: 12px 12px 8px;
      gap: 6px;
    }
    .shell-pill {
      grid-template-columns: auto 1fr;
      gap: 8px;
      padding: 6px 10px;
    }
    .nav-slot { display: none; }
    .mobile-nav-row {
      display: block;
      width: 100%;
      max-width: 1024px;
      margin: 0 auto;
    }
    .brand-name { display: none; }
    .live-indicator { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn, .run-btn { transition: none; }
    .run-btn.start:hover { transform: none; }
  }
</style>
