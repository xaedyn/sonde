<!-- src/lib/components/Topbar.svelte -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import type { TestLifecycleState } from '$lib/types';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  let lifecycle: TestLifecycleState = $derived($measurementStore.lifecycle);
  let roundCounter: number = $derived($measurementStore.roundCounter);

  let runLabel: string = $derived.by(() => {
    if (lifecycle === 'running') return `Running · Round ${roundCounter}`;
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    if (lifecycle === 'completed') return 'Complete';
    return 'Ready';
  });

  let isRunning: boolean = $derived(lifecycle === 'running');
  let isTransitioning: boolean = $derived(lifecycle === 'starting' || lifecycle === 'stopping');

  let startStopLabel: string = $derived.by(() => {
    if (lifecycle === 'running') return 'Stop';
    if (lifecycle === 'starting') return 'Starting…';
    if (lifecycle === 'stopping') return 'Stopping…';
    return 'Start';
  });

  function handleStartStop(): void {
    if (lifecycle === 'running') {
      onStop?.();
    } else if (lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed') {
      onStart?.();
    }
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
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--accent-green={tokens.color.accent.green}
  style:--green-glow={tokens.color.accent.greenGlow}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--topbar-height="{tokens.lane.topbarHeight}px"
  style:--btn-radius="{tokens.radius.btn}px"
  style:--timing-btn="{tokens.timing.btnHover}ms"
>
  <div class="logo" aria-label="Chronoscope">
    <span class="logo-text">Chronoscope</span>
  </div>

  <div class="sep" aria-hidden="true"></div>

  <div class="run-status" aria-live="polite" aria-atomic="true">
    {#if isRunning}
      <div class="pulse-dot" aria-hidden="true"></div>
    {/if}
    <span class="run-label">{runLabel}</span>
  </div>

  <div class="spacer"></div>

  <nav class="actions" aria-label="Test controls">
    <button type="button" class="btn" aria-label="Add or remove endpoints" aria-expanded={$uiStore.showEndpoints} aria-controls="endpoint-drawer" onclick={handleEndpoints}>+ Endpoint</button>
    <button type="button" class="btn" aria-label="Open settings" aria-expanded={$uiStore.showSettings} aria-controls="settings-drawer" onclick={handleSettings}>Settings</button>
    <button type="button" class="btn" aria-label="Share results" aria-expanded={$uiStore.showShare} aria-controls="share-popover" onclick={handleShare}>Share</button>
    <button type="button" class="btn btn-accent" class:btn-stop={isRunning} disabled={isTransitioning} aria-disabled={isTransitioning} aria-label={startStopLabel} onclick={handleStartStop}>{startStopLabel}</button>
  </nav>
</header>

<style>
  .topbar {
    height: var(--topbar-height);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 14px;
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
  }
  .sep {
    width: 1px; height: 16px;
    background: linear-gradient(180deg, transparent, var(--glass-highlight), transparent);
    flex-shrink: 0;
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
    border: 1px solid var(--glass-border);
    background: var(--topbar-bg);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    color: var(--t2); cursor: pointer;
    transition: all var(--timing-btn) ease;
    white-space: nowrap; min-height: 32px;
  }
  .btn:hover:not(:disabled) {
    background: var(--glass-highlight);
    border-color: var(--glass-highlight);
    color: var(--t1);
    box-shadow: 0 2px 12px rgba(0,0,0,.2);
    transform: translateY(-1px);
  }
  .btn-accent {
    border-color: rgba(249,168,212,.2);
    color: var(--accent-pink);
    background: rgba(249,168,212,.04);
  }
  .btn-accent:hover:not(:disabled) {
    background: rgba(249,168,212,.08);
    border-color: rgba(249,168,212,.35);
    box-shadow: 0 2px 16px rgba(249,168,212,.1);
  }
  .btn-stop { border-color: rgba(249,168,212,.2); color: var(--accent-pink); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  @media (max-width: 767px) {
    .topbar { padding: 0 12px; gap: 8px; }
  }
</style>
