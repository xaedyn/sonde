<!-- src/lib/components/Layout.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';
  import Topbar from './Topbar.svelte';
  import LanesView from './LanesView.svelte';
  import XAxisBar from './XAxisBar.svelte';
  import FooterBar from './FooterBar.svelte';
  import CrossLaneHover from './CrossLaneHover.svelte';

  let { onStart, onStop }: {
    onStart?: () => void;
    onStop?: () => void;
  } = $props();

  let announcer: HTMLDivElement;
  let prevLifecycle = get(measurementStore).lifecycle;
  let unsubLifecycle: (() => void) | null = null;

  function announce(msg: string): void {
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 50);
  }

  const CHART_WINDOW = tokens.lane.chartWindow; // 60
  const configuredCap = $derived($settingsStore.cap > 0 ? $settingsStore.cap : Infinity);
  const currentRound = $derived($measurementStore.roundCounter);

  // Sliding window: show at most CHART_WINDOW rounds
  const visibleSpan = $derived(Math.min(CHART_WINDOW, configuredCap || CHART_WINDOW));
  const visibleStart = $derived(Math.max(1, currentRound - visibleSpan + 1));
  const visibleEnd = $derived(Math.max(visibleSpan, currentRound));

  // Earliest timestamp per round (index i = round i+1) across all endpoints
  const sampleTimestamps = $derived.by((): readonly number[] => {
    const endpoints = Object.values($measurementStore.endpoints);
    const byRound = new Map<number, number>();
    for (const ep of endpoints) {
      for (const sample of ep.samples) {
        const prev = byRound.get(sample.round);
        if (prev === undefined || sample.timestamp < prev) {
          byRound.set(sample.round, sample.timestamp);
        }
      }
    }
    const maxRound = currentRound;
    const result: number[] = [];
    for (let r = 1; r <= maxRound; r++) {
      result.push(byRound.get(r) ?? 0);
    }
    return result;
  });

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

<a href="#lanes" class="skip-link">Skip to lanes</a>

<div class="bg" aria-hidden="true"></div>
<div class="orb orb-1" aria-hidden="true"></div>
<div class="orb orb-2" aria-hidden="true"></div>
<div class="orb orb-3" aria-hidden="true"></div>

<div
  class="app"
  style:--bg-base={tokens.color.surface.base}
  style:--orb-cyan={tokens.color.orb.cyan}
  style:--orb-pink={tokens.color.orb.pink}
  style:--orb-violet={tokens.color.orb.violet}
  style:--t1={tokens.color.text.t1}
>
  <Topbar {onStart} {onStop} />
  <LanesView {visibleStart} {visibleEnd} />
  <XAxisBar startRound={visibleStart} endRound={visibleEnd} {currentRound} startedAt={$measurementStore.startedAt} {sampleTimestamps} />
  <FooterBar />
</div>

<CrossLaneHover {visibleStart} {visibleEnd} />

<div
  bind:this={announcer}
  id="sonde-announcer"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
></div>

<style>
  .skip-link {
    position: absolute; top: -40px; left: 0; z-index: 9999;
    padding: 8px 16px; background: #67e8f9; color: #0c0a14;
    font-weight: 600; text-decoration: none;
    border-radius: 0 0 4px 0; transition: top 100ms ease;
  }
  .skip-link:focus { top: 0; }

  .bg {
    position: fixed; inset: 0; z-index: 0;
    background:
      radial-gradient(ellipse 80% 60% at 20% 10%, rgba(103,232,249,.07) 0%, transparent 60%),
      radial-gradient(ellipse 60% 80% at 85% 90%, rgba(249,168,212,.06) 0%, transparent 50%),
      radial-gradient(ellipse 50% 50% at 50% 50%, rgba(139,92,246,.04) 0%, transparent 60%),
      linear-gradient(160deg, #0c0a14 0%, #100e1e 40%, #0e0c18 100%);
    animation: bgShift 20s ease-in-out infinite alternate;
  }
  @keyframes bgShift {
    0%   { filter: hue-rotate(0deg) brightness(1); }
    100% { filter: hue-rotate(8deg) brightness(1.02); }
  }

  .orb {
    position: fixed; border-radius: 50%; pointer-events: none;
    z-index: 0; filter: blur(80px);
    animation: float 15s ease-in-out infinite;
  }
  .orb-1 {
    width: 400px; height: 400px; top: -80px; left: 10%;
    background: var(--orb-cyan); animation-delay: 0s;
  }
  .orb-2 {
    width: 350px; height: 350px; bottom: -60px; right: 5%;
    background: var(--orb-pink); animation-delay: -5s; animation-duration: 18s;
  }
  .orb-3 {
    width: 250px; height: 250px; top: 40%; left: 50%;
    background: var(--orb-violet); animation-delay: -10s; animation-duration: 22s;
  }
  @keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33%       { transform: translate(30px, -20px) scale(1.05); }
    66%       { transform: translate(-20px, 15px) scale(.95); }
  }

  .app {
    position: relative; z-index: 1;
    height: 100vh; display: flex; flex-direction: column;
    overflow: hidden; color: var(--t1);
  }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .bg { animation: none; }
    .orb { animation: none; }
  }
</style>
