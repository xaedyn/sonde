<!-- src/lib/components/Layout.svelte -->
<!-- v2 shell. Topbar (top) | { Rail (264px) | { ViewSwitcher + main content } } | FooterBar (bottom). -->
<!-- Routes activeView to OverviewView (Phase 1 stub) or the legacy LanesView   -->
<!-- (which still hosts Glass Lanes + XAxisBar) for the deprecated splits.     -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore, incrementalTimestampTracker } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import Topbar from './Topbar.svelte';
  import EndpointRail from './EndpointRail.svelte';
  import ViewSwitcher from './ViewSwitcher.svelte';
  import OverviewView from './OverviewView.svelte';
  import LiveView from './LiveView.svelte';
  import AtlasView from './AtlasView.svelte';
  import LanesView from './LanesView.svelte';
  import XAxisBar from './XAxisBar.svelte';
  import FooterBar from './FooterBar.svelte';
  import CrossLaneHover from './CrossLaneHover.svelte';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  let announcerText = $state('');
  let prevLifecycle = get(measurementStore).lifecycle;
  let unsubLifecycle: (() => void) | null = null;

  function announce(msg: string): void {
    announcerText = '';
    setTimeout(() => { announcerText = msg; }, 50);
  }

  const CHART_WINDOW = tokens.lane.chartWindow; // 60
  const configuredCap = $derived($settingsStore.cap > 0 ? $settingsStore.cap : Infinity);
  const currentRound = $derived($measurementStore.roundCounter);

  const visibleSpan  = $derived(Math.min(CHART_WINDOW, configuredCap || CHART_WINDOW));
  const visibleStart = $derived(Math.max(1, currentRound - visibleSpan + 1));
  const visibleEnd   = $derived(Math.max(visibleSpan, currentRound));

  const sampleTimestamps: readonly number[] = $derived.by(() => {
    void $measurementStore.roundCounter; // reactive subscription trigger
    return incrementalTimestampTracker.timestamps;
  });

  // Map activeView → which content renderer to mount. The deprecated
  // 'timeline'/'heatmap'/'split' values still arrive from non-migrated tabs;
  // they all flow through the legacy lanes path until Phase 7 removes them.
  const activeView = $derived($uiStore.activeView);
  const showLegacyLanes = $derived(
    activeView === 'lanes'
      || activeView === 'timeline'
      || activeView === 'heatmap'
      || activeView === 'split'
  );

  onMount(() => {
    unsubLifecycle = measurementStore.subscribe((state) => {
      const cur = state.lifecycle;
      const prev = prevLifecycle;
      if (prev !== 'running' && cur === 'running') {
        const n = get(endpointStore).filter(ep => ep.enabled).length;
        announce(`Test started with ${n} endpoint${n === 1 ? '' : 's'}`);
      } else if (prev === 'running' && cur === 'stopping') {
        announce(`Test stopped after ${state.roundCounter} ${state.roundCounter === 1 ? 'round' : 'rounds'}`);
      } else if (prev !== 'completed' && cur === 'completed') {
        announce(`Test completed after ${state.roundCounter} ${state.roundCounter === 1 ? 'round' : 'rounds'}`);
      }
      prevLifecycle = cur;
    });
  });

  onDestroy(() => { unsubLifecycle?.(); });
</script>

<a href="#main-content" class="skip-link">Skip to main content</a>

<div class="bg" aria-hidden="true"></div>

<div
  class="app"
  style:--bg-base={tokens.color.surface.base}
  style:--t1={tokens.color.text.t1}
>
  <Topbar {onStart} {onStop} />

  <div class="shell-body">
    <EndpointRail />

    <div class="shell-main-wrap">
      <ViewSwitcher />

      <main id="main-content" class="shell-main" tabindex="-1">
        {#if showLegacyLanes}
          <div class="legacy-stack">
            <LanesView {visibleStart} {visibleEnd} />
            <XAxisBar
              startRound={visibleStart}
              endRound={visibleEnd}
              {currentRound}
              startedAt={$measurementStore.startedAt}
              {sampleTimestamps}
            />
          </div>
        {:else if activeView === 'live'}
          <LiveView />
        {:else if activeView === 'atlas'}
          <AtlasView />
        {:else}
          <OverviewView />
        {/if}
      </main>
    </div>
  </div>

  <FooterBar />
</div>

{#if showLegacyLanes}
  <CrossLaneHover {visibleStart} {visibleEnd} />
{/if}

<div
  id="chronoscope-announcer"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>{announcerText}</div>

<style>
  .skip-link {
    position: absolute; top: -40px; left: 0; z-index: 9999;
    padding: 8px 16px; background: var(--accent-cyan); color: var(--bg-base);
    font-weight: 600; text-decoration: none;
    border-radius: 0 0 4px 0; transition: top 100ms ease;
  }
  .skip-link:focus { top: 0; }

  .bg {
    position: fixed; inset: 0; z-index: 0;
    background: var(--bg-base);
  }
  /* Subtle cyan/pink atmosphere — matches v2 prototype background pass.       */
  .bg::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(ellipse 70% 50% at 15% 0%,  rgba(103,232,249,.05), transparent 60%),
      radial-gradient(ellipse 60% 45% at 90% 100%, rgba(249,168,212,.04), transparent 65%);
  }

  .app {
    position: relative; z-index: 1;
    height: 100vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: var(--t1);
  }

  .shell-body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .shell-main-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .shell-main {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .shell-main:focus { outline: none; }

  .legacy-stack {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: 0;
  }
</style>
