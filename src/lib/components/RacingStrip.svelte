<!-- src/lib/components/RacingStrip.svelte -->
<!-- Shared-latency-axis workbench — one row per endpoint plotting p50→p95     -->
<!-- band, trailing sparkline, live dot on a common x-scale. Compare endpoints  -->
<!-- directly. Click drills to Live; Shift-click drills to Diagnose.            -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { fmt, fmtParts } from '$lib/utils/format';
  import type { Endpoint, EndpointStatistics, MeasurementSample } from '$lib/types';
  import { uiStore } from '$lib/stores/ui';
  import { latencyScale } from '$lib/utils/latency-scale';

  interface Props {
    endpoints: readonly Endpoint[];
    stats: Record<string, EndpointStatistics>;
    lastLatencies: Record<string, number | null>;
    samplesByEndpoint: Record<string, readonly MeasurementSample[]>;
    threshold: number;
    focusedEndpointId: string | null;
    /** p99 across all monitored endpoints — drives adaptive y-axis ceiling. */
    p99Across: number;
  }

  let { endpoints, stats, lastLatencies, samplesByEndpoint, threshold, focusedEndpointId, p99Across }: Props = $props();

  // Adaptive axis scale — driven by cross-endpoint p99 from the parent view.
  const scale = $derived.by(() => latencyScale({ p99Across, threshold }));
  const maxSeen = $derived(scale.maxMs);
  const axisLabels = $derived(scale.ticks);

  const thresholdPct = $derived(Math.min(100, (threshold / maxSeen) * 100));

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
    // Click → Live; Shift+click → Diagnose (the per-phase waterfall view).
    uiStore.setActiveView(event.shiftKey ? 'diagnose' : 'live');
  }
</script>

<section class="racing" aria-label="Per-endpoint comparison">
  <header class="racing-header">
    <div>
      <h3 class="racing-title">Per-endpoint comparison</h3>
      <p class="racing-sub">Live latencies on shared axis</p>
    </div>
    <p class="racing-hint">Click → Live · ⇧-click → Diagnose</p>
  </header>

  <div class="racing-axis" aria-hidden="true">
    {#each axisLabels.slice(0, -1) as label (label)}
      <span class="racing-axis-label">{label}</span>
    {/each}
    <span class="racing-axis-label" data-role="axis-label-max">{maxSeen}</span>
    <span class="racing-axis-label racing-axis-threshold" style:left="{thresholdPct}%">
      {threshold} trigger
    </span>
  </div>

  <div class="racing-rows">
    {#each endpoints as ep (ep.id)}
      {@const row = rowStyle(ep.id)}
      {@const s = stats[ep.id]}
      {@const live = lastLatencies[ep.id]}
      {@const liveParts = fmtParts(live)}
      {@const focused = focusedEndpointId === ep.id}
      <button
        type="button"
        class="racing-row"
        class:over={row.over}
        class:focused
        aria-label="{ep.label}, live {live == null || !Number.isFinite(live) ? 'no data' : Math.round(live) + ' milliseconds'}, p95 {s && Number.isFinite(s.p95) ? Math.round(s.p95) + ' milliseconds' : 'no data'}, {row.over ? 'above threshold' : 'within threshold'}"
        data-endpoint-id={ep.id}
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
          <span class="racing-stats-live"><span class="racing-stats-live-num">{liveParts.num}</span>{#if liveParts.unit}<span class="racing-stats-live-unit" aria-hidden="true">{liveParts.unit}</span>{/if}</span>
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
    /* Stats column uses max-content so the inline "live · p95" pair never
       wraps and the track shrinks instead of the numbers. 78 px was
       correct for the earlier stacked layout; after flipping to a single
       row (cf. .racing-stats) we'd overflow at 120+ ms. */
    grid-template-columns: 180px minmax(0, 1fr) max-content;
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
    box-shadow: 0 0 6px var(--ep-color, currentColor);
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
    /* Isolate so the `.racing-band`'s `mix-blend-mode: screen` (below)
       blends against the track's own gradient rather than whatever sits
       behind the component in the composite layer tree. */
    isolation: isolate;
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
    /* Center 6 px band vertically regardless of track height — was hardcoded
       at top: 11px for the 28 px track, which overflowed when mobile shrank
       the track to 18 px. calc keeps the band centered at any track height. */
    top: calc(50% - 3px);
    height: 6px;
    border-radius: 3px;
    opacity: 0.35;
    /* screen blend lets the band brighten against the track's pink
       over-threshold gradient without becoming muddy. Matches v2 prototype
       .v2-racing-band. */
    mix-blend-mode: screen;
  }
  .racing-spark { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .racing-dotlive {
    position: absolute;
    top: 50%;
    width: 8px; height: 8px;
    border-radius: 50%;
    /* Dark hairline border lifts the dot off the colored track without
       relying on luminance alone. Matches v2 prototype. */
    border: 1.5px solid rgba(0, 0, 0, 0.6);
    transform: translate(-50%, -50%);
    box-shadow: 0 0 6px var(--ep-color, #fff);
    /* Longer, smoother ease so the dot settles rather than snaps. */
    transition: left 420ms cubic-bezier(.4, 0, .2, 1);
  }
  .racing-dotlive.over {
    box-shadow: 0 0 10px var(--ep-color, #fff);
    width: 10px; height: 10px;
    /* Soft pulse while over threshold — signals urgency without flashing. */
    animation: racing-dot-pulse 1.4s ease-in-out infinite;
  }
  @keyframes racing-dot-pulse {
    50% { transform: translate(-50%, -50%) scale(1.3); }
  }

  /* Stats column: live value + p95 on ONE baseline, p95 pinned right. Matches
     v2 prototype .v2-racing-stats horizontal layout. `nowrap` keeps the pair
     together even when their combined width grows past the track's
     max-content cap. */
  .racing-stats {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    justify-content: flex-end;
    gap: 6px;
    white-space: nowrap;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .racing-stats-live {
    font-size: var(--ts-md);
    color: var(--t1);
    letter-spacing: var(--tr-tight);
    line-height: 1;
  }
  .racing-stats-p95 {
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
  }

  .racing-stats-live-num {
    /* inherits font/size/color from parent .racing-stats-live */
  }
  .racing-stats-live-unit {
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
    margin-left: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .racing-row, .racing-dotlive { transition: none; }
    .racing-dotlive.over { animation: none; }
  }

  /* Mobile compaction — default 4 endpoints + a 320 px dial + verdict + subtab
     budget overflows iPhone 14 Pro's 100svh by ~60 px (1 row clipped). Tighten
     vertical rhythm to recover the budget. Default 4 endpoints now fits.
     Note: 5+ endpoints (user-added) still clips. PR #71's no-internal-scroll
     contract precludes a scroll fallback here; revisit with a discoverable
     overflow affordance if the case shows up in user testing. */
  @media (max-width: 767px) {
    .racing { padding: 6px 10px; }
    .racing-header { margin-bottom: 4px; }
    .racing-sub, .racing-hint { display: none; }
    .racing-axis { padding: 2px 0 4px; margin-bottom: 3px; }
    /* Padding 3px keeps row height at 24px (3 + 18 + 3) — meets WCAG 2.5.8 AA
       (24×24 minimum touch target). Racing rows are clickable (Shift-click →
       Diagnose), so the per-axis floor applies. Don't tighten further. */
    .racing-row { padding: 3px 6px; gap: 8px; grid-template-columns: 108px minmax(0, 1fr) max-content; }
    .racing-track { height: 18px; }
    .racing-rows { gap: 1px; }
  }
</style>
