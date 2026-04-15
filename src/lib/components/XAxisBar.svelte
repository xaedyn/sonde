<!-- src/lib/components/XAxisBar.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { formatElapsed } from '$lib/renderers/timeline-data-pipeline';

  let {
    startRound,
    endRound,
    currentRound,
    startedAt,
    sampleTimestamps,
  }: {
    startRound: number;
    endRound: number;
    currentRound: number;
    startedAt: number | null;
    sampleTimestamps: readonly number[];
  } = $props();

  const ticks: Array<{ label: string; isFuture: boolean }> = $derived.by(() => {
    const span = endRound - startRound;
    if (span <= 0) return [];
    const step = Math.max(1, Math.ceil(span / 6));
    const result: Array<{ label: string; isFuture: boolean }> = [];

    function elapsedLabel(round: number): string {
      if (startedAt === null) return '0:00';
      const ts = sampleTimestamps[round - 1];
      if (ts === undefined) return '0:00';
      return formatElapsed(ts - startedAt);
    }

    for (let r = startRound + step; r <= endRound; r += step) {
      result.push({ label: elapsedLabel(r), isFuture: r > currentRound });
    }
    if (result.length === 0 || result[result.length - 1]?.label !== elapsedLabel(endRound)) {
      result.push({ label: elapsedLabel(endRound), isFuture: endRound > currentRound });
    }
    return result;
  });
</script>

<div
  class="x-bar"
  aria-label="Elapsed time axis"
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--x-height="{tokens.lane.xAxisHeight}px"
  style:--lanes-padding-x="{tokens.lane.paddingX}px"
>
  <div class="x-spacer" aria-hidden="true">
    <span class="x-spacer-label">Elapsed</span>
  </div>
  <div class="x-labels" role="list" aria-label="Elapsed time markers">
    {#each ticks as tick, i (i)}
      <span class="x-tick" class:future={tick.isFuture} role="listitem" aria-label="{tick.label}{tick.isFuture ? ' (future)' : ''}">{tick.label}</span>
    {/each}
  </div>
</div>

<style>
  .x-bar {
    height: var(--x-height); display: flex; align-items: center;
    padding: 0 var(--lanes-padding-x); flex-shrink: 0;
  }
  .x-spacer { width: var(--panel-width); padding: 0 var(--spacing-xxl); flex-shrink: 0; }
  .x-spacer-label {
    font-family: var(--mono); font-size: 9px; font-weight: 400;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.04em;
  }
  .x-labels { flex: 1; display: flex; justify-content: space-between; padding: 0 18px; }
  .x-tick { font-family: var(--mono); font-size: 9px; font-weight: 400; font-variant-numeric: tabular-nums; color: var(--t3); }
  .x-tick.future { color: var(--t4); opacity: 0.5; }
</style>
