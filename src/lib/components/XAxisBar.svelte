<!-- src/lib/components/XAxisBar.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  let {
    totalRounds,
    currentRound,
  }: {
    totalRounds: number;
    currentRound: number;
  } = $props();

  const ticks: Array<{ label: string; isFuture: boolean }> = $derived.by(() => {
    if (totalRounds <= 0) return [];
    const step = Math.max(1, Math.ceil(totalRounds / 6));
    const result: Array<{ label: string; isFuture: boolean }> = [];
    for (let r = step; r <= totalRounds; r += step) {
      result.push({ label: String(r), isFuture: r > currentRound });
    }
    if (result.length === 0 || result[result.length - 1]?.label !== String(totalRounds)) {
      result.push({ label: String(totalRounds), isFuture: totalRounds > currentRound });
    }
    return result;
  });
</script>

<div
  class="x-bar"
  aria-label="Round axis"
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--x-height="{tokens.lane.xAxisHeight}px"
  style:--lanes-padding-x="{tokens.lane.paddingX}px"
>
  <div class="x-spacer" aria-hidden="true">
    <span class="x-spacer-label">Round</span>
  </div>
  <div class="x-labels" role="list" aria-label="Round markers">
    {#each ticks as tick}
      <span class="x-tick" class:future={tick.isFuture} role="listitem" aria-label="Round {tick.label}{tick.isFuture ? ' (future)' : ''}">{tick.label}</span>
    {/each}
  </div>
</div>

<style>
  .x-bar {
    height: var(--x-height); display: flex; align-items: center;
    padding: 0 var(--lanes-padding-x); flex-shrink: 0;
  }
  .x-spacer { width: var(--panel-width); padding: 0 28px; flex-shrink: 0; }
  .x-spacer-label {
    font-family: var(--mono); font-size: 9px; font-weight: 300;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.08em;
  }
  .x-labels { flex: 1; display: flex; justify-content: space-between; padding: 0 18px; }
  .x-tick { font-family: var(--mono); font-size: 10px; font-weight: 300; color: var(--t3); }
  .x-tick.future { color: var(--t4); opacity: 0.5; }
</style>
