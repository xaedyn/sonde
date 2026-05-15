<!-- src/lib/components/LiveView.svelte -->
<!-- Phase 3 Live view — oscilloscope surface. Header (title + Unified/Split     -->
<!-- toggle + TRIG readout), ScopeCanvas (one unified or N split), LiveFooter    -->
<!-- (per-endpoint stats chips). Solo mode when `focusedEndpointId` is set.      -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import { measurementStore } from '$lib/stores/measurements';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { monitoredEndpointsStore } from '$lib/stores/derived';
  import { fmt } from '$lib/utils/format';
  import { tokens } from '$lib/tokens';
  import ScopeCanvas from './ScopeCanvas.svelte';
  import type { MeasurementSample } from '$lib/types';

  // PATTERNS.md §3 — user-facing metric derivations iterate monitoredEndpoints.
  const monitored = $derived($monitoredEndpointsStore);
  const measurements = $derived($measurementStore);
  const stats = $derived($statisticsStore);

  // Cross-endpoint p99 — computed across ALL monitored endpoints (not just
  // visible or focused). Passed identically to every ScopeCanvas instance so
  // the unified/split/solo modes all share the same y-axis ceiling.
  // DO NOT use stats[ep.id]?.p99 per-row in split mode — that destroys the
  // cross-endpoint comparability invariant (D7).
  const p99Across = $derived(Math.max(0, ...monitored.map((ep) => stats[ep.id]?.p99 ?? 0)));
  const threshold = $derived($settingsStore.healthThreshold);
  const liveOptions = $derived($uiStore.liveOptions);
  const focusedId = $derived($uiStore.focusedEndpointId);

  // When an endpoint is focused from the rail, Live enters "solo mode" — one
  // scope showing only that endpoint. Reverts to the toggle-driven layout
  // (unified vs split) when focus clears.
  const soloEndpoint = $derived(
    focusedId === null ? null : monitored.find((ep) => ep.id === focusedId) ?? null,
  );
  const visibleEndpoints = $derived(soloEndpoint ? [soloEndpoint] : monitored);

  // Pull per-endpoint sample tails once per render. 60-round window matches
  // the scope's X axis; tail-slicing is zero-alloc on the ring buffer path.
  const samplesByEndpoint = $derived.by<Record<string, readonly MeasurementSample[]>>(() => {
    const out: Record<string, readonly MeasurementSample[]> = {};
    for (const ep of visibleEndpoints) {
      const m = measurements.endpoints[ep.id];
      if (!m) { out[ep.id] = []; continue; }
      const all = m.samples.toArray();
      out[ep.id] = all.slice(-tokens.lane.chartWindow);
    }
    return out;
  });

  const currentRound = $derived(measurements.roundCounter || tokens.lane.chartWindow);
  const mode: 'solo' | 'unified' | 'split' = $derived(
    soloEndpoint ? 'solo' : liveOptions.split ? 'split' : 'unified',
  );
  const scopeHeight = $derived(mode === 'split' ? 220 : 540);
  const modeLabel = $derived.by(() => {
    if (mode === 'solo') return 'Focused path';
    if (mode === 'split') return 'Split lanes';
    return 'Unified overlay';
  });
  const endpointCountLabel = $derived(
    soloEndpoint ? `1 of ${monitored.length} endpoints` : `${monitored.length} endpoint${monitored.length === 1 ? '' : 's'}`,
  );
  const roundLabel = $derived(`Round ${currentRound}`);
  const windowLabel = `Last ${tokens.lane.chartWindow} rounds`;

  function handleDrill(epId: string): void {
    uiStore.setFocusedEndpoint(epId);
    // Phase 3 exits with drill-to-Investigate pending (Phase 4). Stay in Live (solo)
    // after click — keeps the user on the scope they were reading.
  }

  function setSplit(split: boolean): void {
    uiStore.setLiveSplit(split);
  }

  function clearFocus(): void {
    uiStore.setFocusedEndpoint(null);
  }

  // Per-endpoint footer chips. Each shows endpoint color pip + label + live
  // latency + p95 badge. Clicking the chip focuses that endpoint (solo).
  function handleChipClick(epId: string): void {
    uiStore.setFocusedEndpoint(focusedId === epId ? null : epId);
  }

  function latencyLabel(latency: number | null): string {
    return latency === null ? 'waiting' : `${fmt(latency)} ms`;
  }

  function hasP95Value(p95: number | undefined): p95 is number {
    return typeof p95 === 'number' && Number.isFinite(p95);
  }

  function p95Label(ready: boolean | undefined, p95: number | undefined): string {
    return ready && hasP95Value(p95) ? `p95 ${fmt(p95)} ms` : 'p95 collecting';
  }

  function footerChipLabel(epId: string, epLabel: string, last: number | null, ready: boolean | undefined, p95: number | undefined): string {
    const action = focusedId === epId ? 'click to clear focus' : 'click to focus this endpoint';
    return `${epLabel}: last ${latencyLabel(last)}, ${p95Label(ready, p95)}, ${action}`;
  }
</script>

<section class="live-wrap" aria-label="Live latency trace">
  <header class="live-header">
    <div class="live-title-block">
      <div class="live-kicker">Live</div>
      <h1 class="live-title">Live trace</h1>
      <div class="live-status-strip" aria-label="Live trace summary">
        <span>{modeLabel}</span>
        {#if soloEndpoint}
          <span class="live-title-solo">
            <span class="live-title-pip" style:background={soloEndpoint.color} aria-hidden="true"></span>
            {soloEndpoint.label}
          </span>
        {/if}
        <span>{endpointCountLabel}</span>
        <span>{roundLabel}</span>
        <span>{windowLabel}</span>
      </div>
    </div>

    <div class="live-controls" role="group" aria-label="Live view controls">
      {#if soloEndpoint}
        <button
          type="button" class="live-chip live-chip-back"
          onclick={clearFocus}
          aria-label="Clear focus on {soloEndpoint.label}"
        >
          ← All endpoints
        </button>
      {/if}

      <div class="live-control" role="group" aria-label="Layout mode">
        <span class="live-control-label">View</span>
        <div class="live-segment">
          <!--
            Pressed state tracks `liveOptions.split` (the user's stashed
            preference), not the current `mode`. In solo mode the trace is
            always a single full-height canvas regardless of the toggle, so
            we keep the toggle disabled + visually showing the stashed value
            so clicks are advisory — the preference will apply on unfocus.
          -->
          <button
            type="button" class="live-chip"
            class:on={!liveOptions.split}
            aria-pressed={!liveOptions.split}
            disabled={!!soloEndpoint}
            onclick={() => setSplit(false)}
          >Unified</button>
          <button
            type="button" class="live-chip"
            class:on={liveOptions.split}
            aria-pressed={liveOptions.split}
            disabled={!!soloEndpoint}
            onclick={() => setSplit(true)}
          >Split</button>
        </div>
      </div>

      <div class="live-control live-control-trig" role="group" aria-label="Slow trigger, {threshold} milliseconds">
        <span class="live-control-label">Trigger</span>
        <div class="trig-display">
          {threshold}<span>ms</span>
        </div>
      </div>
    </div>
  </header>

  {#if mode === 'split'}
    <div class="scope-stack">
      {#each visibleEndpoints as ep (ep.id)}
        <ScopeCanvas
          endpoints={[ep]}
          samplesByEndpoint={{ [ep.id]: samplesByEndpoint[ep.id] ?? [] }}
          {threshold}
          {currentRound}
          height={scopeHeight}
          focusedEndpointId={null}
          {p99Across}
          detailScale={true}
          onDrill={handleDrill}
        />
      {/each}
    </div>
  {:else}
    <ScopeCanvas
      endpoints={visibleEndpoints}
      {samplesByEndpoint}
      {threshold}
      {currentRound}
      height={scopeHeight}
      focusedEndpointId={soloEndpoint ? null : focusedId}
      {p99Across}
      detailScale={true}
      onDrill={handleDrill}
    />
  {/if}

  <footer class="live-footer" aria-label="Endpoint summary">
    <span class="live-footer-kicker">Endpoints</span>
    {#each monitored as ep (ep.id)}
      {@const m = measurements.endpoints[ep.id]}
      {@const last = m?.lastLatency ?? null}
      {@const s = stats[ep.id]}
      {@const color = ep.color || tokens.color.endpoint[0]}
      <button
        type="button" class="live-footer-chip"
        class:on={focusedId === ep.id}
        aria-pressed={focusedId === ep.id}
        data-endpoint-id={ep.id}
        aria-label={footerChipLabel(ep.id, ep.label, last, s?.ready, s?.p95)}
        onclick={() => handleChipClick(ep.id)}
      >
        <span class="live-footer-pip" style:background={color} aria-hidden="true"></span>
        <span class="live-footer-name">{ep.label}</span>
        <span class="live-footer-val">
          <span>last</span>
          {latencyLabel(last)}
        </span>
        {#if s?.ready && hasP95Value(s.p95)}
          <span class="live-footer-p95">p95 {fmt(s.p95)} ms</span>
        {/if}
      </button>
    {/each}
  </footer>
</section>

<style>
  .live-wrap {
    padding: 18px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
    flex: 1;
  }

  .live-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    flex-wrap: wrap;
  }
  .live-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--accent-cyan);
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .live-title {
    margin: 0;
    font-size: var(--ts-2xl);
    font-weight: 500;
    letter-spacing: var(--tr-tight);
    color: var(--t1);
  }
  .live-status-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 8px;
    min-width: 0;
  }
  .live-status-strip > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 3px 7px;
    border: 1px solid var(--border-mid);
    border-radius: 5px;
    background: rgba(255,255,255,.035);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .live-title-solo { display: inline-flex; align-items: center; gap: 10px; }
  .live-title-pip {
    width: 10px; height: 10px; border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
  }

  .live-controls { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  .live-control { display: flex; flex-direction: column; gap: 4px; }
  .live-control-label {
    font-family: var(--mono);
    font-size: 8.5px;
    letter-spacing: 0.2em;
    color: var(--t2);
    text-transform: uppercase;
  }
  .live-segment {
    display: inline-flex;
    padding: 2px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 7px;
    border: 1px solid var(--border-mid);
    gap: 2px;
  }
  .live-chip {
    padding: 6px 12px;
    border-radius: 5px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .live-chip:hover {
    color: var(--t1);
    border-color: var(--border-bright);
  }
  .live-chip.on {
    background: rgba(255, 255, 255, 0.08);
    color: var(--t1);
    border-color: transparent;
  }
  .live-chip:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .live-chip-back {
    padding: 6px 12px;
    border-radius: 5px;
    background: transparent;
    border: 1px solid var(--border-mid);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
    align-self: flex-end;
  }
  .live-chip-back:hover { color: var(--t1); border-color: var(--border-bright); }
  .live-chip-back:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .trig-display {
    padding: 5px 10px;
    border-radius: 6px;
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.3);
    color: var(--accent-amber);
    font-family: var(--mono);
    font-size: var(--ts-md);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .trig-display span {
    font-size: var(--ts-xs);
    color: rgba(251, 191, 36, 0.7);
    margin-left: 3px;
    letter-spacing: var(--tr-label);
  }

  .scope-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .live-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 10px 12px;
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
  }
  .live-footer-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    text-transform: uppercase;
    margin-right: 6px;
  }
  .live-footer-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-mid);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .live-footer-chip:hover {
    color: var(--t1);
    border-color: var(--border-bright);
  }
  .live-footer-chip.on {
    background: rgba(255, 255, 255, 0.06);
    color: var(--t1);
    border-color: var(--border-bright);
  }
  .live-footer-chip:focus-visible {
    outline: 2px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .live-footer-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .live-footer-name { color: inherit; }
  .live-footer-val {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-variant-numeric: tabular-nums;
    color: var(--t3);
    margin-left: 3px;
  }
  .live-footer-val span {
    color: var(--t4);
    text-transform: uppercase;
  }
  .live-footer-p95 {
    color: var(--t2);
    margin-left: 6px;
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .live-chip, .live-footer-chip { transition: none; }
  }

  @media (max-width: 767px) {
    .live-wrap { padding: 12px; gap: 10px; }
    .live-header { flex-direction: column; align-items: flex-start; gap: 10px; }
  }
</style>
