<!-- src/lib/components/FooterBar.svelte -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { settingsStore } from '$lib/stores/settings';
  import { tokens } from '$lib/tokens';

  let lifecycle = $derived($measurementStore.lifecycle);
  let roundCounter = $derived($measurementStore.roundCounter);
  let cap = $derived($settingsStore.cap);
  let delay = $derived($settingsStore.delay);
  let timeout = $derived($settingsStore.timeout);

  let errorCount = $derived.by(() => {
    let errors = 0;
    let timeouts = 0;
    for (const ep of Object.values($measurementStore.endpoints)) {
      for (const s of ep.samples) {
        if (s.status === 'error') errors++;
        if (s.status === 'timeout') timeouts++;
      }
    }
    return { errors, timeouts };
  });

  let progressLabel = $derived.by(() => {
    const total = cap > 0 ? cap : '∞';
    const { errors, timeouts } = errorCount;
    const parts: string[] = [`${roundCounter} of ${total} complete`];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (timeouts > 0) parts.push(`${timeouts} timeout${timeouts === 1 ? '' : 's'}`);
    return parts.join(' · ');
  });

  let configLabel = $derived(`${delay / 1000}s interval · ${timeout / 1000}s timeout`);
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
  <div class="spacer"></div>
  <span class="progress">{progressLabel}</span>
</footer>

<style>
  .foot {
    height: var(--footer-height); display: flex; align-items: center;
    padding: 0 20px; flex-shrink: 0;
    background: var(--footer-bg);
    border-top: 1px solid var(--footer-border);
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    font-family: var(--mono); font-size: 10px; font-weight: 300;
    color: var(--t3); gap: 16px;
  }
  .highlight { color: var(--t1); font-weight: 400; }
  .spacer { flex: 1; }
  .config, .progress { color: var(--t3); }
  @media (max-width: 767px) {
    .foot { padding: 0 12px; gap: 8px; }
    .config { display: none; }
  }
</style>
