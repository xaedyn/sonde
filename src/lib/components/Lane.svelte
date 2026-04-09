<!-- src/lib/components/Lane.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  let {
    endpointId,
    color,
    url,
    p50,
    p95,
    p99,
    jitter,
    lossPercent,
    ready,
    children,
  }: {
    endpointId: string;
    color: string;
    url: string;
    p50: number;
    p95: number;
    p99: number;
    jitter: number;
    lossPercent: number;
    ready: boolean;
    children?: import('svelte').Snippet;
  } = $props();

  function fmt(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  function fmtLoss(pct: number): string {
    return pct === 0 ? '0%' : `${pct.toFixed(1)}%`;
  }
</script>

<article
  id="lane-{endpointId}"
  class="lane"
  aria-label="Endpoint {url}"
  style:--ep-color={color}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--lane-bg={tokens.color.lane.bg}
  style:--lane-border={tokens.color.lane.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--radius-lg="{tokens.radius.lg}px"
  style:--timing-hover="{tokens.timing.btnHover}ms"
>
  <div class="lane-panel">
    <div class="lane-url">{url}</div>
    <div class="lane-hero" aria-label="P50 latency {fmt(p50)}">
      <span class="hero-value">{Math.round(p50)}</span>
      <span class="hero-unit">ms</span>
    </div>
    <div class="lane-label">P50 Median Latency</div>
    {#if ready}
      <div class="lane-stats" aria-label="Statistics">
        <div class="ls"><div class="ls-label">P95</div><div class="ls-val">{fmt(p95)}</div></div>
        <div class="ls"><div class="ls-label">P99</div><div class="ls-val">{fmt(p99)}</div></div>
        <div class="ls"><div class="ls-label">Jitter</div><div class="ls-val">{fmt(jitter)}</div></div>
        <div class="ls"><div class="ls-label">Loss</div><div class="ls-val">{fmtLoss(lossPercent)}</div></div>
      </div>
    {:else}
      <div class="collecting-note">Collecting data…</div>
    {/if}
  </div>
  <div class="lane-chart" aria-label="Latency chart for {url}">
    {#if children}
      {@render children()}
    {/if}
  </div>
</article>

<style>
  .lane {
    flex: 1; display: flex; min-height: 0;
    position: relative; overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--lane-bg);
    border: 1px solid var(--lane-border);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    transition: border-color var(--timing-hover) ease, box-shadow var(--timing-hover) ease;
  }
  .lane:hover {
    border-color: var(--glass-highlight);
    box-shadow: 0 4px 30px rgba(0,0,0,.15);
  }
  .lane::before {
    content: ''; position: absolute;
    top: 0; left: 10%; right: 10%; height: 1px; z-index: 2;
    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
    pointer-events: none;
  }
  .lane::after {
    content: ''; position: absolute;
    left: 0; top: 0; bottom: 0; width: 80px; z-index: 1;
    pointer-events: none;
    background: linear-gradient(90deg, color-mix(in srgb, var(--ep-color) 3%, transparent), transparent);
  }
  .lane-panel {
    width: var(--panel-width); flex-shrink: 0;
    padding: 24px 28px; display: flex; flex-direction: column;
    justify-content: center;
    border-right: 1px solid rgba(255,255,255,.05);
    position: relative; z-index: 2;
  }
  .lane-url {
    font-family: var(--mono); font-size: 11px; font-weight: 300;
    color: var(--t3); letter-spacing: 0.02em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lane-hero {
    display: flex; align-items: baseline;
    margin-top: 6px; line-height: 1; color: var(--ep-color);
  }
  .hero-value {
    font-family: var(--sans); font-size: 54px; font-weight: 200;
    letter-spacing: -0.06em;
  }
  .hero-unit {
    font-family: var(--sans); font-size: 16px; font-weight: 300;
    color: var(--t3); margin-left: 2px;
  }
  .lane-label {
    font-family: var(--mono); font-size: 9px; font-weight: 300;
    color: var(--t4); margin-top: 6px;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .lane-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 10px; margin-top: 18px; padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,.04);
  }
  .ls-label {
    font-family: var(--mono); font-size: 8px; font-weight: 400;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.07em;
  }
  .ls-val {
    font-family: var(--mono); font-size: 14px; font-weight: 300;
    color: var(--t2); margin-top: 3px;
  }
  .collecting-note {
    font-family: var(--mono); font-size: 11px; font-weight: 300;
    color: var(--t4); margin-top: 12px;
  }
  .lane-chart {
    flex: 1; position: relative; overflow: hidden; min-width: 0;
  }
  @media (max-width: 767px) {
    .lane { flex-direction: column; }
    .lane-panel {
      width: 100%; padding: 16px 20px 12px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,.05);
      flex-direction: row; align-items: center; gap: 20px;
    }
    .lane-stats { margin-top: 0; padding-top: 0; border-top: none; }
  }
</style>
