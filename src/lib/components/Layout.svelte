<!-- src/lib/components/Layout.svelte -->
<!-- v2 shell. Topbar (top) | { Rail (264px) | { ViewSwitcher + main content } }. -->
<!-- Routes activeView to OverviewView / LiveView / DiagnoseView. The legacy    -->
<!-- Lanes family was retired in Phase 7 — the v6→v7 migration rewrites         -->
<!-- 'lanes' / 'timeline' / 'heatmap' / 'split' to 'overview' so nothing        -->
<!-- reaches here.                                                              -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';
  import Topbar from './Topbar.svelte';
  import EndpointRail from './EndpointRail.svelte';
  import ViewSwitcher from './ViewSwitcher.svelte';
  import OverviewView from './OverviewView.svelte';
  import LiveView from './LiveView.svelte';
  import DiagnoseView from './DiagnoseView.svelte';
  import ReportView from './ReportView.svelte';

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

  const activeView = $derived($uiStore.activeView);
  const sharedReportMode = $derived($uiStore.isSharedView && $uiStore.sharedReportMode);

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

<div
  class="bg"
  aria-hidden="true"
  style:--bg-base={tokens.color.surface.base}
  style:--shell-bg={tokens.color.shell.base}
  style:--shell-bg-cyan={tokens.color.shell.bgCyan}
  style:--shell-bg-amber={tokens.color.shell.bgAmber}
></div>

<div
  class="app"
  style:--bg-base={tokens.color.surface.base}
  style:--shell-bg={tokens.color.shell.base}
  style:--shell-bg-cyan={tokens.color.shell.bgCyan}
  style:--shell-bg-amber={tokens.color.shell.bgAmber}
  style:--t1={tokens.color.text.t1}
>
  <Topbar {onStart} {onStop} />

  {#if sharedReportMode}
    <main id="main-content" class="shell-main report-main" tabindex="-1">
      <ReportView />
    </main>
  {:else}
    <div class="shell-body">
      <EndpointRail />

      <div class="shell-main-wrap">
        <ViewSwitcher />

        <main id="main-content" class="shell-main" tabindex="-1">
          {#if activeView === 'live'}
            <LiveView />
          {:else if activeView === 'diagnose'}
            <DiagnoseView />
          {:else}
            <!--
              Fallback: overview renders here as the default. Legacy route IDs
              may still exist in ActiveView or persisted payloads for backwards
              compatibility, but the primary ViewSwitcher exposes only Status,
              Live, and Investigate.
            -->
            <OverviewView {onStart} />
          {/if}
        </main>
      </div>
    </div>
  {/if}
</div>

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
    background:
      linear-gradient(180deg, var(--shell-bg), var(--bg-base));
  }

  .bg::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(ellipse 70% 42% at 18% -10%, var(--shell-bg-cyan), transparent 62%),
      radial-gradient(ellipse 55% 38% at 92% 105%, var(--shell-bg-amber), transparent 68%);
  }

  .app {
    position: relative; z-index: 1;
    /* 100svh is the "small" viewport height — worst-case browser chrome shown.
       Using svh (not dvh) keeps the shell static during scroll-driven URL-bar
       animations on iOS Safari, which would otherwise re-flow text every
       frame. 100vh was wrong on iOS (calculated against URL-bar-hidden
       viewport, so shells clipped on first paint). */
    height: 100svh;
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
  .report-main {
    flex: 1;
    min-height: 0;
  }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: 0;
  }
</style>
