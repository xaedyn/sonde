<!-- src/lib/components/ScopeCanvas.svelte -->
<!-- Real-time oscilloscope renderer. SVG polylines (matches the prototype; -->
<!-- 600 points/frame at 10 × 60 comfortably 60fps). One trace per endpoint -->
<!-- on a shared 0–300ms Y axis, last 60 rounds on the X axis. Threshold    -->
<!-- line, overflow chevrons, status-break gaps, hover crosshair tooltip.   -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { fmt } from '$lib/utils/format';
  import type { Endpoint, MeasurementSample } from '$lib/types';

  interface Props {
    endpoints: readonly Endpoint[];
    samplesByEndpoint: Record<string, readonly MeasurementSample[]>;
    threshold: number;
    currentRound: number;
    /** Pixel height of the scope. 540 for unified/solo, 220 for split. */
    height: number;
    /** When set, highlight this endpoint's trace and dim the others. */
    focusedEndpointId: string | null;
    onDrill?: (endpointId: string) => void;
  }

  let { endpoints, samplesByEndpoint, threshold, currentRound, height, focusedEndpointId, onDrill }: Props = $props();

  // ── Geometry ────────────────────────────────────────────────────────────
  const VB_W = 1440;
  const VB_H = 640;
  const PAD_X = 48;
  const PAD_Y = 24;
  const MAX_MS = 300;
  const WINDOW = tokens.lane.chartWindow; // 60 rounds

  const plotX0 = PAD_X;
  const plotX1 = VB_W - PAD_X;
  const plotY0 = PAD_Y;
  const plotY1 = VB_H - PAD_Y;

  function xOf(round: number): number {
    // Right edge = currentRound; left edge = currentRound - WINDOW + 1.
    const start = Math.max(1, currentRound - WINDOW + 1);
    const span = Math.max(WINDOW - 1, 1);
    const t = (round - start) / span;
    return plotX0 + Math.max(0, Math.min(1, t)) * (plotX1 - plotX0);
  }

  function yOf(latency: number): number {
    const clamped = Math.max(0, Math.min(MAX_MS, latency));
    return plotY1 - (clamped / MAX_MS) * (plotY1 - plotY0);
  }

  // ── Precomputed grid lines ──────────────────────────────────────────────
  interface HLine { ms: number; y: number; major: boolean; }
  const hGrid: readonly HLine[] = (() => {
    const lines: HLine[] = [];
    for (let ms = 0; ms <= MAX_MS; ms += 15) {
      lines.push({ ms, y: yOf(ms), major: ms % 60 === 0 });
    }
    return lines;
  })();

  const thresholdY = $derived(yOf(threshold));

  // X axis ticks — every 10 rounds within the visible window; major every 30.
  interface XTick { round: number; x: number; major: boolean; }
  const xTicks: readonly XTick[] = $derived.by(() => {
    const start = Math.max(1, currentRound - WINDOW + 1);
    const end = Math.max(start + WINDOW - 1, currentRound);
    const out: XTick[] = [];
    const firstTick = Math.ceil(start / 10) * 10;
    for (let r = firstTick; r <= end; r += 10) {
      out.push({ round: r, x: xOf(r), major: r % 30 === 0 });
    }
    return out;
  });

  // ── Trace path per endpoint ─────────────────────────────────────────────
  interface Trace { id: string; color: string; d: string; overflow: { x: number }[]; breaks: { x: number; kind: 'timeout' | 'error' }[]; dimmed: boolean; }
  const traces: readonly Trace[] = $derived.by(() => {
    const out: Trace[] = [];
    const start = Math.max(1, currentRound - WINDOW + 1);
    for (const ep of endpoints) {
      const samples = samplesByEndpoint[ep.id] ?? [];
      const recent = samples.filter((s) => s.round >= start);
      let d = '';
      let prevWasGap = true;
      const overflow: { x: number }[] = [];
      const breaks: { x: number; kind: 'timeout' | 'error' }[] = [];
      for (const s of recent) {
        const x = xOf(s.round);
        if (s.status !== 'ok') {
          breaks.push({ x, kind: s.status === 'timeout' ? 'timeout' : 'error' });
          prevWasGap = true;
          continue;
        }
        if (!Number.isFinite(s.latency)) { prevWasGap = true; continue; }
        if (s.latency > MAX_MS) overflow.push({ x });
        const y = yOf(s.latency);
        d += `${prevWasGap ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
        prevWasGap = false;
      }
      out.push({
        id: ep.id,
        color: ep.color || tokens.color.endpoint[0],
        d: d.trim(),
        overflow,
        breaks,
        dimmed: focusedEndpointId !== null && ep.id !== focusedEndpointId,
      });
    }
    return out;
  });

  // ── Hover crosshair / tooltip ───────────────────────────────────────────
  let hoverX = $state<number | null>(null);
  let hoverRound = $state<number | null>(null);
  let tipX = $state(0);
  let tipY = $state(0);
  let svgEl: SVGSVGElement | undefined = $state();

  function handleMouseMove(event: MouseEvent): void {
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    // Convert CSS pixel → viewBox coordinate.
    const vbX = (cssX / rect.width) * VB_W;
    if (vbX < plotX0 || vbX > plotX1) {
      hoverX = null;
      hoverRound = null;
      return;
    }
    const start = Math.max(1, currentRound - WINDOW + 1);
    const span = Math.max(WINDOW - 1, 1);
    const t = (vbX - plotX0) / (plotX1 - plotX0);
    const round = Math.round(start + t * span);
    hoverX = xOf(round);
    hoverRound = round;
    tipX = cssX;
    tipY = cssY;
  }

  function handleMouseLeave(): void {
    hoverX = null;
    hoverRound = null;
  }

  interface HoverRow { id: string; color: string; label: string; latency: number | null; status: string; }
  const hoverRows: readonly HoverRow[] = $derived.by(() => {
    if (hoverRound === null) return [];
    const rows: HoverRow[] = [];
    for (const ep of endpoints) {
      const s = (samplesByEndpoint[ep.id] ?? []).find((x) => x.round === hoverRound);
      rows.push({
        id: ep.id,
        color: ep.color || tokens.color.endpoint[0],
        label: ep.label,
        latency: s && s.status === 'ok' ? s.latency : null,
        status: s?.status ?? 'no sample',
      });
    }
    return rows;
  });

  // ── A11y: polite live-region that describes the current scope state. Throttled
  // to once per 2s so the reader doesn't narrate every tick.
  let liveRegionText = $state('');
  let liveThrottleTs = 0;
  $effect(() => {
    // Re-run whenever samples change; read but throttle output.
    void samplesByEndpoint;
    const now = Date.now();
    if (now - liveThrottleTs < 2000) return;
    liveThrottleTs = now;
    const parts: string[] = [];
    for (const ep of endpoints) {
      const samples = samplesByEndpoint[ep.id] ?? [];
      const last = samples[samples.length - 1];
      if (!last) continue;
      if (last.status === 'ok') {
        parts.push(`${ep.label} ${Math.round(last.latency)} ms${last.latency > threshold ? ', over threshold' : ''}`);
      } else {
        parts.push(`${ep.label} ${last.status}`);
      }
    }
    liveRegionText = parts.length === 0 ? 'Awaiting samples.' : parts.join('. ');
  });

  const ariaLabel = $derived(
    `Live latency scope — ${endpoints.length} endpoint${endpoints.length === 1 ? '' : 's'}, last ${WINDOW} rounds, threshold ${threshold} ms.`
  );

  function handleClickTrace(epId: string): void {
    onDrill?.(epId);
  }

  const hasAnySample = $derived(traces.some((t) => t.d.length > 0));
</script>

<div class="scope-wrap" style:height="{height}px">
  <svg
    bind:this={svgEl}
    class="scope-svg"
    viewBox="0 0 {VB_W} {VB_H}"
    preserveAspectRatio="none"
    role="img"
    aria-label={ariaLabel}
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
  >
    <!-- Horizontal grid (latency buckets) -->
    <g aria-hidden="true">
      {#each hGrid as line (line.ms)}
        <line
          x1={plotX0} y1={line.y} x2={plotX1} y2={line.y}
          stroke={line.major ? 'var(--svg-grid-major)' : 'var(--svg-grid-line)'}
          stroke-width={line.major ? 0.5 : 0.3}
        />
      {/each}
      {#each [0, 60, 120, 180, 240, 300] as ms (ms)}
        <text
          x={plotX0 - 8} y={yOf(ms) + 3}
          text-anchor="end" font-size="9" font-family={tokens.typography.mono.fontFamily}
          fill="var(--t4)" letter-spacing="0.1em"
        >{ms}</text>
      {/each}
    </g>

    <!-- Vertical grid (round ticks) -->
    <g aria-hidden="true">
      {#each xTicks as tick (tick.round)}
        <line
          x1={tick.x} y1={plotY0} x2={tick.x} y2={plotY1}
          stroke="var(--svg-grid-line)" stroke-width={tick.major ? 0.4 : 0.2}
        />
        {#if tick.major}
          <text
            x={tick.x} y={plotY1 + 14}
            text-anchor="middle" font-size="9" font-family={tokens.typography.mono.fontFamily}
            fill="var(--t4)" letter-spacing="0.1em"
          >R{tick.round}</text>
        {/if}
      {/each}
    </g>

    <!-- Threshold line -->
    <line
      x1={plotX0} y1={thresholdY} x2={plotX1} y2={thresholdY}
      stroke="var(--svg-threshold)" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"
      aria-hidden="true"
    />
    <text
      x={plotX1 - 4} y={thresholdY - 4}
      text-anchor="end" font-size="9" font-family={tokens.typography.mono.fontFamily}
      fill="var(--svg-threshold)" letter-spacing="0.1em"
      aria-hidden="true"
    >TRIG {threshold}</text>

    <!-- Traces -->
    {#each traces as trace (trace.id)}
      {#if trace.d.length > 0}
        <path
          d={trace.d}
          fill="none"
          stroke={trace.color}
          stroke-width={trace.dimmed ? 1 : 1.5}
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity={trace.dimmed ? 0.35 : 1}
          style:cursor="pointer"
          onclick={() => handleClickTrace(trace.id)}
        />
      {/if}
      {#each trace.overflow as o, i (i)}
        <path
          d="M {o.x - 4} {plotY0 + 6} L {o.x} {plotY0} L {o.x + 4} {plotY0 + 6}"
          fill="none" stroke={trace.color} stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
          opacity={trace.dimmed ? 0.35 : 0.9}
          aria-hidden="true"
        />
      {/each}
      {#each trace.breaks as b, i (i)}
        <path
          d="M {b.x - 4} {plotY0 + 6} L {b.x} {plotY0} L {b.x + 4} {plotY0 + 6}"
          fill="none"
          stroke={b.kind === 'timeout' ? 'var(--accent-pink)' : 'var(--status-timeout)'}
          stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
          opacity={trace.dimmed ? 0.35 : 0.85}
          aria-hidden="true"
        />
      {/each}
    {/each}

    <!-- Hover crosshair -->
    {#if hoverX !== null}
      <line
        x1={hoverX} y1={plotY0} x2={hoverX} y2={plotY1}
        stroke="var(--t3)" stroke-width="0.5" opacity="0.6"
        aria-hidden="true"
      />
    {/if}

    <!-- Idle state -->
    {#if !hasAnySample}
      <text
        x={VB_W / 2} y={VB_H / 2}
        text-anchor="middle" font-size="12" font-family={tokens.typography.mono.fontFamily}
        fill="var(--t4)" letter-spacing="0.25em"
        aria-hidden="true"
      >AWAITING SAMPLES</text>
    {/if}
  </svg>

  {#if hoverRound !== null}
    <div
      class="scope-tooltip"
      style:left="{tipX + 12}px"
      style:top="{tipY + 12}px"
      role="presentation"
    >
      <div class="scope-tooltip-time">Round {hoverRound}</div>
      <ul class="scope-tooltip-list">
        {#each hoverRows as row (row.id)}
          <li class="scope-tooltip-row" class:dim={row.latency === null}>
            <span class="scope-tooltip-pip" style:background={row.color} aria-hidden="true"></span>
            <span class="scope-tooltip-name">{row.label}</span>
            <span class="scope-tooltip-val">
              {row.latency === null ? row.status : `${fmt(row.latency)} ms`}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="scope-sr-live" role="status" aria-live="polite" aria-atomic="true">{liveRegionText}</div>
</div>

<style>
  .scope-wrap {
    position: relative;
    background: #030509;
    border: 1px solid rgba(103, 232, 249, 0.18);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: inset 0 0 60px rgba(103, 232, 249, 0.04);
  }
  .scope-svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
  }

  .scope-tooltip {
    position: absolute;
    background: var(--tooltip-bg-deep);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--tooltip-border);
    border-radius: var(--radius-sm, 8px);
    padding: 10px 12px;
    min-width: 180px;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    z-index: 40;
  }
  .scope-tooltip-time {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--accent-cyan);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .scope-tooltip-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .scope-tooltip-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: var(--ts-sm);
    font-variant-numeric: tabular-nums;
  }
  .scope-tooltip-row.dim { color: var(--t4); }
  .scope-tooltip-pip { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .scope-tooltip-name { color: var(--t2); flex: 1; }
  .scope-tooltip-val { color: var(--tooltip-text); }
  .scope-tooltip-row.dim .scope-tooltip-val { color: var(--t4); }

  .scope-sr-live {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap; border: 0;
  }
</style>
