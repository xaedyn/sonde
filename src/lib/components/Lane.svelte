<!-- src/lib/components/Lane.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import LaneHeaderWaterfall from './LaneHeaderWaterfall.svelte';

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
    lastLatency = null,
    compact = false,
    showGrip = true,
    dragging = false,
    settling = false,
    noTransition = false,
    translateY = 0,
    laneIndex = 0,
    showEntrance = false,
    onGripPointerDown = undefined,
    tier2Averages = undefined,
    onGripKeyDown = undefined,
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
    lastLatency?: number | null;
    compact?: boolean;
    showGrip?: boolean;
    dragging?: boolean;
    settling?: boolean;
    noTransition?: boolean;
    translateY?: number;
    tier2Averages?: {
      dnsLookup: number;
      tcpConnect: number;
      tlsHandshake: number;
      ttfb: number;
      contentTransfer: number;
    };
    laneIndex?: number;
    showEntrance?: boolean;
    onGripPointerDown?: (e: PointerEvent) => void;
    onGripKeyDown?: (e: KeyboardEvent) => void;
    children?: import('svelte').Snippet;
  } = $props();

  const GRIP_DOTS = [
    [2, 2], [8, 2],
    [2, 7], [8, 7],
    [2, 12], [8, 12],
  ] as const;

  function fmt(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  function fmtLoss(pct: number): string {
    return pct === 0 ? '0%' : `${pct.toFixed(1)}%`;
  }
</script>

<article
  id="lane-{endpointId}"
  data-endpoint-id={endpointId}
  class="lane"
  class:compact={compact}
  class:entrance={showEntrance}
  class:is-dragging={dragging}
  class:is-settling={settling}
  class:no-transition={noTransition}
  aria-label="Endpoint {url}"
  data-dragging={dragging ? 'true' : undefined}
  style:--drag-translate="{translateY}px"
  style:--lane-index={laneIndex}
  style:--ep-color={color}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--t4={tokens.color.text.t4}
  style:--t5={tokens.color.text.t5}
  style:--stats-border={tokens.color.glass.statsBorder}
  style:--lane-bg={tokens.color.lane.bg}
  style:--border-mid={tokens.color.surface.border.mid}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--panel-width="{tokens.lane.panelWidth}px"
  style:--compact-header-height="{tokens.lane.compactHeaderHeight}px"
  style:--radius-lg="{tokens.radius.lg}px"
  style:--timing-hover="{tokens.timing.btnHover}ms"
>
  <div class="lane-panel" class:sr-only={compact}>
    {#if showGrip && !compact}
      <button
        class="lane-grip"
        aria-label="Reorder lane"
        data-endpoint-id={endpointId}
        type="button"
        onpointerdown={onGripPointerDown}
        onkeydown={onGripKeyDown}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {#each GRIP_DOTS as [cx, cy], i (i)}
            <circle {cx} {cy} r="1.5" fill="currentColor" />
          {/each}
        </svg>
      </button>
    {/if}
    <div class="lane-url">{url}</div>
    <div class="lane-body">
      <div class="lane-hero" aria-label="Median latency {fmt(p50)}">
        <span class="hero-value">{Math.round(p50)}</span>
        <span class="hero-unit">ms</span>
      </div>
      <div class="lane-label">Median</div>
      {#if ready}
        <div class="lane-stats-container">
        <div class="lane-stats" aria-label="Statistics">
          <div class="ls"><div class="ls-label">P95</div><div class="ls-val">{fmt(p95)}</div></div>
          <div class="ls"><div class="ls-label">P99</div><div class="ls-val">{fmt(p99)}</div></div>
          <div class="ls"><div class="ls-label">Jitter</div><div class="ls-val">{fmt(jitter)}</div></div>
          <div class="ls"><div class="ls-label">Loss</div><div class="ls-val">{fmtLoss(lossPercent)}</div></div>
        </div>
        </div>
        {#if !compact && tier2Averages !== undefined}
          <LaneHeaderWaterfall {tier2Averages} />
        {/if}
      {:else}
        <div class="collecting-note">Collecting data…</div>
      {/if}
    </div>
  </div>
  {#if compact}
    <div class="lane-compact-header">
      {#if showGrip}
        <button
          class="lane-grip lane-grip--compact"
          aria-label="Reorder lane"
          data-endpoint-id={endpointId}
          type="button"
          onpointerdown={onGripPointerDown}
          onkeydown={onGripKeyDown}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
            {#each GRIP_DOTS as [cx, cy], i (i)}
              <circle {cx} {cy} r="1.5" fill="currentColor" />
            {/each}
          </svg>
        </button>
      {/if}
      <span class="ch-dot" style:background={color}></span>
      <span class="ch-url">{url}</span>
      <span class="ch-hero" style:color={color}>{Math.round(p50)}<span class="ch-hero-unit">ms</span></span>
      {#if ready}
        <span class="ch-stat"><span class="ch-stat-label">P95</span> <span class="ch-stat-val">{fmt(p95)}</span></span>
        <span class="ch-stat"><span class="ch-stat-label">P99</span> <span class="ch-stat-val">{fmt(p99)}</span></span>
        <span class="ch-stat"><span class="ch-stat-label">J</span> <span class="ch-stat-val">{fmt(jitter)}</span></span>
        <span class="ch-stat"><span class="ch-stat-label">L</span> <span class="ch-stat-val">{fmtLoss(lossPercent)}</span></span>
      {/if}
    </div>
  {/if}
  <div class="lane-chart" aria-label="Latency chart for {url}">
    {#if children}
      {@render children()}
    {/if}
    {#if lastLatency !== null}
      <span class="now-label" aria-hidden="true">
        {Math.round(lastLatency)}ms
      </span>
    {/if}
  </div>
</article>

<style>
  .lane {
    flex: 1; display: flex; min-height: 0;
    position: relative; overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--lane-bg);
    border: 1px solid var(--border-mid);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    transform: translateY(var(--drag-translate, 0px));
    transition: border-color var(--timing-hover) ease, box-shadow var(--timing-hover) ease;
  }
  /* Neighbors shift with spring easing */
  .lane:not(.is-dragging):not(.is-settling) {
    transition:
      transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
      border-color var(--timing-hover) ease,
      box-shadow var(--timing-hover) ease;
  }

  /* Pickup: pop-lift keyframe — overshoot scale then settle */
  @keyframes drag-lift {
    0%   { transform: translateY(var(--drag-translate, 0px)) scale(1); opacity: 1; }
    40%  { transform: translateY(var(--drag-translate, 0px)) scale(1.03); opacity: 0.92; }
    100% { transform: translateY(var(--drag-translate, 0px)) scale(1.01); opacity: 0.92; }
  }
  .lane.is-dragging {
    opacity: 0.92;
    transform: translateY(var(--drag-translate, 0px)) scale(1.01);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    z-index: 10;
    animation: drag-lift 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  /* Suppress transitions during DOM reorder to prevent neighbor twitch */
  .lane.no-transition {
    transition: none !important;
  }

  /* Drop settle: spring back to resting state */
  .lane.is-settling {
    z-index: 10;
    transition:
      transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 280ms ease-out,
      box-shadow 280ms ease-out;
  }
  .lane:hover {
    border-color: rgba(255,255,255,.09);
    box-shadow: 0 6px 32px rgba(0,0,0,.25);
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
    background: linear-gradient(90deg, rgba(255,255,255,0.015), transparent); /* fallback for browsers without color-mix() */
    background: linear-gradient(90deg, color-mix(in srgb, var(--ep-color) 3%, transparent), transparent);
  }
  .lane-panel {
    width: var(--panel-width); flex-shrink: 0;
    padding: 24px 28px; display: flex; flex-direction: column;
    border-right: 1px solid rgba(255,255,255,.05);
    position: relative; z-index: 2;
  }
  .lane-body {
    flex: 1; display: flex; flex-direction: column;
    min-height: 0; overflow: hidden;
    container-type: size;
    container-name: lane-body;
  }

  .lane-url {
    font-family: var(--sans); font-size: 12px; font-weight: 500;
    color: var(--t2); letter-spacing: 0.02em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lane-hero {
    display: flex; align-items: baseline;
    margin-top: 6px; line-height: 1; color: var(--ep-color);
  }
  .hero-value {
    font-family: var(--sans); font-size: 54px; font-weight: 200;
    letter-spacing: -0.06em; font-variant-numeric: tabular-nums;
  }
  .hero-unit {
    font-family: var(--sans); font-size: 16px; font-weight: 300;
    color: var(--t3); margin-left: 2px;
  }
  .lane-label {
    font-family: var(--mono); font-size: 9px; font-weight: 300;
    color: var(--t4); margin-top: 4px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .lane-stats-container {
    container-type: inline-size;
    margin-top: 18px; padding-top: 16px;
    border-top: 1px solid var(--stats-border);
  }
  .lane-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @container (max-width: 199px) {
    .lane-stats { grid-template-columns: 1fr 1fr; }
  }
  .ls-label {
    font-family: var(--mono); font-size: 8px; font-weight: 400;
    color: var(--t5); text-transform: uppercase; letter-spacing: 0.07em;
  }
  .ls-val {
    font-family: var(--mono); font-size: 12px; font-weight: 300;
    color: var(--t2); margin-top: 3px; font-variant-numeric: tabular-nums;
  }
  .collecting-note {
    font-family: var(--mono); font-size: 11px; font-weight: 300;
    color: var(--t4); margin-top: 12px;
  }
  .lane-chart {
    flex: 1; position: relative; overflow: hidden; min-width: 0;
  }
  .now-label {
    position: absolute; top: 8px; right: 12px;
    font-family: var(--mono); font-size: 12px; font-weight: 400;
    color: var(--ep-color);
    text-shadow: 0 0 8px var(--ep-color), 0 0 16px var(--ep-color); /* fallback for browsers without color-mix() */
    text-shadow: 0 0 8px var(--ep-color), 0 0 16px color-mix(in srgb, var(--ep-color) 50%, transparent);
    pointer-events: none; z-index: 10;
    line-height: 1;
  }
  /* Suppress left-edge glow in compact mode */
  .lane.compact::after { display: none; }

  /* sr-only: visually hidden but accessible to screen readers */
  .lane-panel.sr-only {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }

  /* Compact overlay header */
  .lane-compact-header {
    position: absolute; top: 0; left: 0; right: 0; z-index: 3;
    height: var(--compact-header-height);
    display: flex; align-items: center; gap: 10px; padding: 0 10px;
    background: rgba(12, 10, 20, 0.7);
    backdrop-filter: blur(12px) saturate(1.2);
    -webkit-backdrop-filter: blur(12px) saturate(1.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }
  .ch-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .ch-url {
    font-family: var(--mono); font-size: 10px; font-weight: 300; color: var(--t3);
    max-width: 160px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
  }
  .ch-hero {
    font-family: var(--sans); font-size: 18px; font-weight: 200;
    line-height: 1; margin-left: 2px; flex-shrink: 0;
  }
  .ch-hero-unit {
    font-family: var(--sans); font-size: 10px; font-weight: 300;
    color: var(--t3); margin-left: 1px;
  }
  .ch-stat {
    display: inline-flex; align-items: baseline; gap: 3px; flex-shrink: 0;
  }
  .ch-stat-label {
    font-family: var(--mono); font-size: 8px; font-weight: 400;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.05em;
  }
  .ch-stat-val {
    font-family: var(--mono); font-size: 10px; font-weight: 300;
    color: var(--t2);
  }

  /* Grip handle — hidden until lane hover, Apple-style progressive disclosure */
  .lane-grip {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 32px; flex-shrink: 0;
    background: none; border: none; padding: 0;
    color: var(--t4);
    cursor: grab;
    touch-action: none;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 200ms ease, color 200ms ease, background 200ms ease;
  }
  .lane:hover .lane-grip,
  .lane-grip:focus-visible {
    opacity: 1;
  }
  .lane-grip:hover {
    color: var(--t2);
    background: rgba(255, 255, 255, 0.05);
  }
  .lane-grip:active { cursor: grabbing; }
  .lane-panel .lane-grip {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
  }
  .lane-compact-header .lane-grip {
    pointer-events: auto;
    flex-shrink: 0;
  }
  .lane-grip--compact { height: 22px; }

  /* Shift now-label below compact header */
  .lane.compact .now-label { top: 34px; }

  @keyframes laneEntrance {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .lane.entrance {
    animation: laneEntrance 200ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
    animation-delay: min(calc(var(--lane-index, 0) * 50ms), 540ms);
  }

  .lane.is-dragging.entrance,
  .lane.is-settling.entrance {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .lane.entrance {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 767px) {
    .lane:not(.compact) { flex-direction: column; }
    .lane:not(.compact) .lane-panel {
      width: 100%; padding: 16px 20px 12px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,.05);
      flex-direction: row; align-items: center; gap: 20px;
    }
    .lane-panel { padding: 16px 20px; }
    .lane:not(.compact) .lane-stats { margin-top: 0; padding-top: 0; border-top: none; }
    .hero-value { font-size: clamp(32px, 10vw, 54px); }
    .ch-url { max-width: 120px; }
  }

  /* ── Condensed body: when lane-body is short, adapt content to fit ── */
  @container lane-body (max-height: 160px) {
    .lane-hero { margin-top: 2px; }
    .hero-value { font-size: 36px; }
    .hero-unit { font-size: 14px; }
    .lane-label { margin-top: 2px; }
    .lane-stats-container { margin-top: 6px; padding-top: 6px; }
    .lane-stats { grid-template-columns: repeat(4, auto); gap: 4px 12px; }
    .ls-label { display: none; }
    .ls-val { margin-top: 0; }
    .ls-val::before { font-size: 7px; color: var(--t5); text-transform: uppercase; letter-spacing: 0.05em; margin-right: 3px; }
    .collecting-note { display: none; }
  }

  /* Inline stat labels via ::before pseudo-elements in condensed mode */
  @container lane-body (max-height: 160px) {
    .ls:nth-child(1) .ls-val::before { content: 'P95 '; }
    .ls:nth-child(2) .ls-val::before { content: 'P99 '; }
    .ls:nth-child(3) .ls-val::before { content: 'J '; }
    .ls:nth-child(4) .ls-val::before { content: 'L '; }
  }

</style>
