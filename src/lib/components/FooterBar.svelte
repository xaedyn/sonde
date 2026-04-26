<!-- src/lib/components/FooterBar.svelte -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';
  import { formatElapsed } from '$lib/utils/format';
  import LatencyLegend from './LatencyLegend.svelte';

  let lifecycle = $derived($measurementStore.lifecycle);
  let roundCounter = $derived($measurementStore.roundCounter);
  let cap = $derived($settingsStore.cap);
  let burstRounds = $derived($settingsStore.burstRounds);
  let monitorDelay = $derived($settingsStore.monitorDelay);
  let timeout = $derived($settingsStore.timeout);

  let errorCount = $derived({ errors: $measurementStore.errorCount, timeouts: $measurementStore.timeoutCount });

  let progressLabel = $derived.by(() => {
    const { errors, timeouts } = errorCount;
    const parts: string[] = [`${roundCounter} of ${cap} complete`];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (timeouts > 0) parts.push(`${timeouts} timeout${timeouts === 1 ? '' : 's'}`);
    if (startedAt !== null) parts.push(`${formatElapsed(elapsed)} elapsed`);
    return parts.join(' · ');
  });

  let now = $state(Date.now());

  $effect(() => {
    if (lifecycle !== 'running') return;
    const id = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(id);
  });

  let startedAt = $derived($measurementStore.startedAt);
  let elapsed = $derived(startedAt !== null ? Math.max(0, now - startedAt) : 0);

  let isBurst = $derived(roundCounter < burstRounds);
  let configLabel = $derived(
    isBurst
      ? `Burst · ${roundCounter}/${burstRounds} · ${timeout / 1000}s timeout`
      : `${monitorDelay / 1000}s interval · ${timeout / 1000}s timeout`
  );

  let progressVisible = $state(true);
  let prevLifecycleForFade = $state($measurementStore.lifecycle);

  $effect(() => {
    const current = $measurementStore.lifecycle;
    if (current !== prevLifecycleForFade) {
      progressVisible = false;
      const id = setTimeout(() => { progressVisible = true; }, 80);
      prevLifecycleForFade = current;
      return () => clearTimeout(id);
    }
  });
</script>

<footer
  class="foot"
  style:--footer-bg={tokens.color.footer.bg}
  style:--footer-border={tokens.color.glass.border}
  style:--t1={tokens.color.text.t1}
  style:--t3={tokens.color.text.t3}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--footer-height="{tokens.lane.footerHeight}px"
>
  <span class="highlight">Measuring from your browser</span>
  <span class="config">{configLabel}</span>
  <LatencyLegend />
  <div class="spacer"></div>
  <span class="progress" class:fade-out={!progressVisible}>{progressLabel}</span>
</footer>

<style>
  .foot {
    height: var(--footer-height); display: flex; align-items: center;
    padding: 0 20px; flex-shrink: 0;
    background: var(--footer-bg);
    border-top: 1px solid var(--footer-border);
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    font-family: var(--mono); font-size: 9px; font-weight: 400;
    font-variant-numeric: tabular-nums;
    color: var(--t3); gap: var(--spacing-lg);
  }
  .highlight { color: var(--t1); font-weight: 400; }
  .spacer { flex: 1; }
  .config, .progress { color: var(--t3); }
  .progress {
    transition: opacity 200ms ease;
  }
  .progress.fade-out {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress { transition: none; }
  }

  @media (max-width: 767px) {
    .foot { padding: 0 12px; gap: 8px; }
    .config { display: none; }
  }
  /* At the mobile floor the 38 px footer is the difference between fitting
     and not — progress is already surfaced on the dial and topbar. */
  @media (max-width: 479px) {
    .foot { display: none; }
  }
</style>
