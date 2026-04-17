<!-- src/lib/components/LatencyLegend.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { latencyToColor } from '$lib/renderers/color-map';

  // Sample 6 evenly-spaced colors from the ramp for the CSS gradient
  const stops = [0, 50, 100, 200, 500, 1000, 1500].map(
    ms => latencyToColor(ms)
  );

  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
</script>

<div
  class="legend"
  role="img"
  aria-label="Latency color scale: cyan is fast, red is slow"
  style:--mono={tokens.typography.mono.fontFamily}
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
>
  <span class="label">Fast</span>
  <div class="bar" style:background={gradient}></div>
  <span class="label">Slow</span>
</div>

<style>
  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .bar {
    width: 80px;
    height: 4px;
    border-radius: 2px;
    opacity: 0.7;
  }

  .label {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 300;
    color: var(--t4);
    letter-spacing: 0.04em;
  }
</style>
