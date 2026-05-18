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

  // Cross-endpoint axis-target percentile — uses p95 (not p99) on
  // /live so a single >120 ms spike doesn't drag the y-axis ceiling up
  // for the whole window, leaving 80 % of the chart empty above the
  // typical data range. p99 outliers still render correctly via
  // ScopeCanvas's overflow markers. Computed across ALL monitored
  // endpoints (not just visible/focused) so unified/split/solo modes
  // all share the same y-axis ceiling — required for the cross-
  // endpoint comparability invariant (D7). The prop is named
  // p99Across on ScopeCanvas for historical reasons; what it means in
  // practice is "the latency target the chart should fit".
  const p99Across = $derived(Math.max(
    0,
    ...monitored.map((ep) => stats[ep.id]?.p95 ?? stats[ep.id]?.p99 ?? 0),
  ));
  const threshold = $derived($settingsStore.healthThreshold);
  const liveOptions = $derived($uiStore.liveOptions);
  const focusedId = $derived($uiStore.focusedEndpointId);
  // v2 polish: paused-state overlay needs to know whether a live test is
  // actively producing samples. 'starting' counts as running so the
  // overlay flickers off the moment the user clicks Start.
  const isRunning = $derived(
    measurements.lifecycle === 'running' || measurements.lifecycle === 'starting',
  );

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

  // v2-polish-round-2: subtitle replaces the prior status-strip chips
  // (UNIFIED OVERLAY / 4 ENDPOINTS / LAST 60 ROUNDS). The subtitle keeps
  // the at-a-glance context (mode + endpoint count) but as a single
  // human-readable sentence under the title, not three competing pills.
  const liveSubtitle = $derived.by(() => {
    if (soloEndpoint) {
      return `Focused on ${soloEndpoint.label} — last ${tokens.lane.chartWindow} rounds, live from your browser.`;
    }
    const count = monitored.length;
    const noun = count === 1 ? 'endpoint' : 'endpoints';
    return `Live latency across ${count} monitored ${noun} — last ${tokens.lane.chartWindow} rounds.`;
  });

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

<section class="live-wrap live-surface" aria-label="Live latency trace">
  <header class="live-header live-hero">
    <div class="live-title-block">
      <h1 class="live-title">
        <span class="live-title-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="1.6" fill="currentColor"/>
            <path d="M5.2 5.2c-1.55 1.55-1.55 4.05 0 5.6M10.8 5.2c1.55 1.55 1.55 4.05 0 5.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <path d="M2.8 2.8c-2.9 2.9-2.9 7.5 0 10.4M13.2 2.8c2.9 2.9 2.9 7.5 0 10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/>
          </svg>
        </span>
        Live latency trace
      </h1>
      <p class="live-subtitle">{liveSubtitle}</p>
    </div>

    <!-- v2 polish round 2: bigger glance chips, fewer rows of chrome.
         Status-strip pills (UNIFIED OVERLAY / 4 ENDPOINTS / LAST 60 ROUNDS)
         dropped — redundant with the controls and footer. View/Trigger
         controls moved into the chart panel toolbar below. -->
    <div class="live-glance" aria-label="Current latency per endpoint">
      {#each monitored as ep (ep.id)}
        {@const m = measurements.endpoints[ep.id]}
        {@const last = m?.lastLatency ?? null}
        {@const color = ep.color || tokens.color.endpoint[0]}
        <span class="live-glance-chip" data-endpoint-id={ep.id}>
          <span class="live-glance-pip" style:background={color} aria-hidden="true"></span>
          <span class="live-glance-name">{ep.label}</span>
          <span class="live-glance-val">{latencyLabel(last)}</span>
        </span>
      {/each}
    </div>
  </header>

  <div class="live-scope-panel" data-mode={mode}>
    <!-- v2 polish round 2: chart toolbar lives inside the panel, top
         right. View / Trigger controls (and the back-to-all-endpoints
         button in solo mode) belong with the chart they control. -->
    <div class="live-scope-toolbar" role="group" aria-label="Live view controls">
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

    {#if !isRunning}
      <!-- v2 polish: paused-state overlay so a stopped chart reads as
           "paused" rather than "broken". Centred card explaining how to
           resume; matches v2's "Measurement Paused" pattern. -->
      <div class="live-paused-overlay" role="status" aria-live="polite">
        <div class="live-paused-card">
          <span class="live-paused-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <rect x="4.5" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor"/>
              <rect x="9" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor"/>
            </svg>
          </span>
          <p class="live-paused-headline">Measurement paused</p>
          <p class="live-paused-detail">Click <strong>Start</strong> in the top bar to resume live diagnostics.</p>
        </div>
      </div>
    {/if}
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
  </div>

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
    width: min(100%, 1320px);
    margin: 0 auto;
    padding: clamp(24px, 4vw, 48px) clamp(16px, 4vw, 48px) 40px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-height: 0;
    overflow-y: auto;
    flex: 1;
    color: var(--t1);
  }

  /* v2 polish: the header is no longer a wrapping panel. Title block +
     glance chips + controls sit directly on the page bg (matches v2's
     Live page composition where only the chart card carries a panel
     surface). Drops the prior border + bg + shadow that made every
     surface a stacked card. */
  .live-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    padding: 4px 4px 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  /* v2 polish: smaller title (was up to 46 px), font-weight 600 to match
     the verdict-card h1 from the v2 arc. The Radio icon sits inline. */
  .live-title {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: clamp(22px, 2.4vw, 28px);
    line-height: 1.1;
    font-weight: 600;
    letter-spacing: var(--tr-tight);
    color: var(--t1);
  }
  .live-title-icon {
    width: 22px;
    height: 22px;
    color: var(--accent-cyan);
    display: inline-grid;
    place-items: center;
  }
  .live-title-icon svg {
    width: 100%;
    height: 100%;
  }

  /* v2 polish: top-right glance summary chips — one per endpoint with
     current latency value. Reads like the APP / API chips in v2. The
     richer footer below still carries the p95 + click-to-focus
     affordance, but the glance row gives the at-a-glance read. */
  /* v2 polish round 2: subtitle replaces the chip stack. Sans 14 px /
     500 weight / zinc-400 — matches v2's "Synchronized latency testing
     from your browser" line under its Live title. */
  .live-subtitle {
    margin: 6px 0 0;
    color: var(--t3);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
  }

  /* v2 polish round 2: glance chips upsized. Was 12 px mono with 7 px
     pip — read as crowded chrome. Now 16 px mono value with 10 px pip
     and a smaller stacked label, matching v2's APP / API metric chip
     anatomy. */
  .live-glance {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-left: auto;
    align-items: stretch;
  }
  .live-glance-chip {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--t1) 6%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, black 40%, transparent);
    min-width: 96px;
  }
  .live-glance-pip {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
    flex-shrink: 0;
  }
  .live-glance-name {
    color: var(--t3);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tr-label);
    line-height: 1.1;
  }
  .live-glance-val {
    color: var(--t1);
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.1;
    margin-left: 2px;
  }
  /* .live-title-solo / .live-title-pip selectors removed — they were
     used by the dropped status-strip's solo indicator. Solo-mode focus
     is now reflected in the subtitle copy ("Focused on …") instead of
     an inline pip next to the title. */

  /* v2 polish round 2: chart toolbar lives inside the chart panel, top
     right. Replaces the standalone live-controls block that floated above
     the chart. Absolute positioning so it overlays the top edge of the
     panel without consuming the chart's vertical space. */
  .live-scope-toolbar {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--t1) 6%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, black 65%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
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
    border: 1px solid var(--shell-border);
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
    border-color: var(--shell-border-strong);
  }
  .live-chip.on {
    background: var(--shell-panel-active);
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
    border: 1px solid var(--shell-border);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
    align-self: flex-end;
  }
  .live-chip-back:hover { color: var(--t1); border-color: var(--shell-border-strong); }
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

  .live-scope-panel {
    min-width: 0;
    position: relative;
    padding: clamp(12px, 2vw, 18px);
    border: 1px solid var(--shell-border);
    border-radius: 24px;
    background: var(--shell-panel);
    box-shadow: 0 25px 50px -12px color-mix(in srgb, black 35%, transparent);
    overflow: hidden;
  }

  /* v2 polish: paused-state overlay layered over the scope panel. When
     the test isn't running the chart by itself reads as "broken" — this
     card tells the user it's just paused and how to resume. Backdrop
     blur keeps the recent trace visible behind the card so the user
     can still see what was last measured. */
  .live-paused-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, black 50%, transparent);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }
  .live-paused-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 32px;
    border: 1px solid color-mix(in srgb, var(--t1) 8%, transparent);
    border-radius: 16px;
    background: var(--shell-panel-raised);
    text-align: center;
    max-width: 320px;
  }
  .live-paused-icon {
    width: 28px;
    height: 28px;
    color: var(--t3);
    display: inline-grid;
    place-items: center;
    margin-bottom: 4px;
  }
  .live-paused-icon svg { width: 100%; height: 100%; }
  .live-paused-headline {
    margin: 0;
    color: var(--t1);
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 600;
  }
  .live-paused-detail {
    margin: 0;
    color: var(--t3);
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.5;
  }
  .live-paused-detail strong {
    color: var(--t1);
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--t1) 8%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .live-paused-overlay { backdrop-filter: none; -webkit-backdrop-filter: none; }
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
    background: color-mix(in srgb, black 40%, transparent);
    border: 1px solid var(--shell-border);
    border-radius: 14px;
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
    border: 1px solid var(--shell-border);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .live-footer-chip:hover {
    color: var(--t1);
    border-color: var(--shell-border-strong);
  }
  .live-footer-chip.on {
    background: rgba(255, 255, 255, 0.06);
    color: var(--t1);
    border-color: var(--shell-border-strong);
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
    .live-wrap { width: 100%; padding: 16px; gap: 14px; }
    .live-header { flex-direction: column; align-items: flex-start; gap: 14px; }
    .live-glance { margin-left: 0; gap: 8px; }
    .live-glance-chip { padding: 8px 12px; min-width: 88px; }
    .live-glance-val { font-size: 15px; }
    /* Mobile: toolbar moves below the chart so it doesn't crowd the
       small viewport. Static position, full width, single-row scroll. */
    .live-scope-panel { padding: 10px 10px 12px; border-radius: 14px; }
    .live-scope-toolbar {
      position: static;
      margin-top: 10px;
      width: 100%;
      justify-content: flex-start;
      background: color-mix(in srgb, black 40%, transparent);
    }
    .live-control { flex: 1 1 120px; min-width: 0; }
  }
</style>
