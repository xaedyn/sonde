<!-- src/lib/components/RacingStrip.svelte -->
<!-- Shared-latency-axis workbench — one row per endpoint plotting p50→p95     -->
<!-- band, trailing sparkline, live dot on a common x-scale. Compare endpoints  -->
<!-- directly. Click drills to Live; Shift-click drills to Diagnose.            -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { fmt } from '$lib/utils/format';
  import type { Endpoint, EndpointStatistics, MeasurementSample } from '$lib/types';
  import { uiStore } from '$lib/stores/ui';

  interface Props {
    endpoints: readonly Endpoint[];
    stats: Record<string, EndpointStatistics>;
    lastLatencies: Record<string, number | null>;
    samplesByEndpoint: Record<string, readonly MeasurementSample[]>;
    threshold: number;
    focusedEndpointId: string | null;
  }

  let { endpoints, stats, lastLatencies, samplesByEndpoint, threshold, focusedEndpointId }: Props = $props();

  // Dynamic axis scale, clamped to [150, 300] ms, rounded to next 30ms boundary.
  const maxSeen = $derived.by(() => {
    let maxP95 = 0;
    for (const ep of endpoints) {
      const s = stats[ep.id];
      if (s && s.p95 > maxP95) maxP95 = s.p95;
    }
    const scaled = Math.ceil((maxP95 * 1.2) / 30) * 30;
    return Math.min(300, Math.max(150, scaled));
  });

  const thresholdPct = $derived(Math.min(100, (threshold / maxSeen) * 100));

  const axisLabels = $derived([
    0,
    Math.round(maxSeen / 3),
    Math.round((2 * maxSeen) / 3),
    maxSeen,
  ]);

  function rowStyle(epId: string): { p50Pct: number; p95Pct: number; livePct: number; over: boolean } {
    const s = stats[epId];
    const last = lastLatencies[epId];
    const p50Pct = s ? Math.min(100, (s.p50 / maxSeen) * 100) : 0;
    const p95Pct = s ? Math.min(100, (s.p95 / maxSeen) * 100) : 0;
    const livePct = last == null ? 0 : Math.min(100, (last / maxSeen) * 100);
    return { p50Pct, p95Pct, livePct, over: last != null && last > threshold };
  }

  // Trailing sparkline path for an endpoint — last 40 samples, normalized to the
  // shared axis. Missing/error samples break the path (M starts a new subpath,
  // L continues the current one). An explicit `prevWasGap` flag avoids the
  // string-inspection bug where `d.endsWith(' ')` was true on every iteration
  // (every space-terminated previous emission), so every point became an M.
  function sparklinePath(epId: string): string {
    const samples = samplesByEndpoint[epId] ?? [];
    if (samples.length === 0) return '';
    const slice = samples.slice(-40);
    const n = slice.length;
    let d = '';
    let prevWasGap = true;
    for (let i = 0; i < n; i++) {
      const s = slice[i];
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      if (s.status !== 'ok' || !Number.isFinite(s.latency)) {
        prevWasGap = true;
        continue;
      }
      const y = 28 - Math.min(28, (s.latency / maxSeen) * 28);
      d += `${prevWasGap ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
      prevWasGap = false;
    }
    return d.trim();
  }

  function handleClick(event: MouseEvent, ep: Endpoint): void {
    uiStore.setFocusedEndpoint(ep.id);
    // Click → Live (Phase 3); Shift+click → Lanes for now (Atlas is Phase 4).
    // Flip the shift-branch to 'atlas' once it ships.
    uiStore.setActiveView(event.shiftKey ? 'lanes' : 'live');
  }
</script>

<section class="racing" aria-label="Per-endpoint comparison">
  <header class="racing-header">
    <div>
      <h3 class="racing-title">Per-endpoint comparison</h3>
      <p class="racing-sub">Live latencies on shared axis</p>
    </div>
    <p class="racing-hint">Click → Live · ⇧ → Lanes</p>
  </header>

  <div class="racing-axis" aria-hidden="true">
    {#each axisLabels as label (label)}
      <span class="racing-axis-label">{label}</span>
    {/each}
    <span class="racing-axis-label racing-axis-threshold" style:left="{thresholdPct}%">
      {threshold} trigger
    </span>
  </div>

  <div class="racing-rows">
    {#each endpoints as ep (ep.id)}
      {@const row = rowStyle(ep.id)}
      {@const s = stats[ep.id]}
      {@const live = lastLatencies[ep.id]}
      {@const focused = focusedEndpointId === ep.id}
      <button
        type="button"
        class="racing-row"
        class:over={row.over}
        class:focused
        aria-label="{ep.label}, live {live == null ? 'no data' : Math.round(live) + ' milliseconds'}, p95 {s ? Math.round(s.p95) + ' milliseconds' : 'no data'}, {row.over ? 'above threshold' : 'within threshold'}"
        onclick={(e) => handleClick(e, ep)}
      >
        <span class="racing-label">
          <span class="racing-dot" style:background={ep.color || tokens.color.endpoint[0]} style:--ep-color={ep.color} aria-hidden="true"></span>
          <span class="racing-name">{ep.label}</span>
        </span>

        <span class="racing-track">
          <span
            class="racing-threshtick"
            style:left="{thresholdPct}%"
            aria-hidden="true"
          ></span>
          {#if s}
            <span
              class="racing-band"
              style:left="{row.p50Pct}%"
              style:width="{Math.max(0.5, row.p95Pct - row.p50Pct)}%"
              style:background={ep.color || tokens.color.endpoint[0]}
              aria-hidden="true"
            ></span>
          {/if}
          <svg class="racing-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
            <path d={sparklinePath(ep.id)} fill="none" stroke={ep.color || tokens.color.endpoint[0]} stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.55" />
          </svg>
          {#if live != null}
            <span
              class="racing-dotlive"
              class:over={row.over}
              style:left="{row.livePct}%"
              style:background={ep.color || tokens.color.endpoint[0]}
              style:--ep-color={ep.color || tokens.color.endpoint[0]}
              aria-hidden="true"
            ></span>
          {/if}
        </span>

        <span class="racing-stats">
          <span class="racing-stats-live">{fmt(live)}</span>
          <span class="racing-stats-p95">{s ? `p95 ${fmt(s.p95)}` : '—'}</span>
        </span>
      </button>
    {/each}
  </div>
</section>

<style>
  .racing {
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 14px 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    min-width: 0;
  }

  .racing-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 8px; }
  .racing-title { margin: 0; font-size: var(--ts-lg); font-weight: 500; color: var(--t1); letter-spacing: var(--tr-tight); }
  .racing-sub { margin: 2px 0 0; font-family: var(--mono); font-size: var(--ts-xs); letter-spacing: var(--tr-kicker); color: var(--t3); text-transform: uppercase; }
  .racing-hint { margin: 0; font-family: var(--mono); font-size: var(--ts-sm); color: var(--t4); }

  .racing-axis {
    position: relative;
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
    padding: 4px 0 10px;
    border-bottom: 1px solid var(--border-mid);
    margin-bottom: 8px;
    font-variant-numeric: tabular-nums;
  }
  .racing-axis-threshold {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    color: var(--accent-pink);
    padding: 0 4px;
    background: var(--surface-topbar-bg);
  }

  .racing-rows { display: flex; flex-direction: column; gap: 4px; }
  .racing-row {
    display: grid;
    grid-template-columns: 180px 1fr 78px;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease;
  }
  .racing-row:hover { background: rgba(255,255,255,.03); border-color: var(--border-mid); }
  .racing-row.focused { background: rgba(255,255,255,.05); border-color: var(--border-bright); }
  .racing-row.over { background: rgba(249,168,212,.04); }
  .racing-row:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 2px; }

  .racing-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .racing-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }
  .racing-name {
    font-size: var(--ts-sm);
    color: var(--t1);
    font-family: var(--mono);
    letter-spacing: var(--tr-body);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .racing-track {
    position: relative;
    height: 28px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--border-mid);
    background: linear-gradient(to right,
      rgba(255,255,255,.04) 0%, rgba(255,255,255,.04) var(--thresh, 50%),
      rgba(249,168,212,.06) var(--thresh, 50%), rgba(249,168,212,.06) 100%);
  }
  .racing-threshtick {
    position: absolute; top: 0; bottom: 0;
    width: 1px;
    background: var(--accent-pink);
    box-shadow: 0 0 4px var(--accent-pink-glow);
    opacity: 0.5;
  }
  .racing-band {
    position: absolute;
    top: 11px;
    height: 6px;
    border-radius: 3px;
    opacity: 0.2;
  }
  .racing-spark { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .racing-dotlive {
    position: absolute;
    top: 50%;
    width: 8px; height: 8px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 6px var(--ep-color, #fff);
    transition: left 250ms ease-out;
  }
  .racing-dotlive.over {
    box-shadow: 0 0 10px var(--ep-color, #fff);
    width: 10px; height: 10px;
  }

  .racing-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .racing-stats-live {
    font-size: var(--ts-sm);
    color: var(--t1);
  }
  .racing-stats-p95 {
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
  }

  @media (prefers-reduced-motion: reduce) {
    .racing-row, .racing-dotlive { transition: none; }
  }
</style>
