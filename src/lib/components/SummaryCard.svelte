<!-- src/lib/components/SummaryCard.svelte -->
<!-- Per-endpoint statistics card with progressive disclosure and tier 2 waterfall. -->
<script lang="ts">
  import { statisticsStore } from '$lib/stores/statistics';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { tokens } from '$lib/tokens';

  export let endpointId: string;

  $: endpoint = $endpointStore.find(ep => ep.id === endpointId);
  $: stats = $statisticsStore[endpointId];
  $: epState = $measurementStore.endpoints[endpointId];
  $: isExpanded = $uiStore.expandedCards.has(endpointId);

  $: ready = stats?.ready ?? false;
  $: sampleCount = stats?.sampleCount ?? epState?.samples.length ?? 0;
  $: tierLevel = epState?.tierLevel ?? 1;
  $: color = endpoint?.color ?? tokens.color.endpoint[0] ?? '#4a90d9';

  // Connection reuse delta threshold
  const REUSE_DELTA_THRESHOLD = 0.2;
  $: showReuseDelta =
    ready &&
    stats?.connectionReuseDelta !== null &&
    stats?.connectionReuseDelta !== undefined &&
    Math.abs(stats.connectionReuseDelta) > REUSE_DELTA_THRESHOLD * (stats?.p50 ?? 1);

  // Tier 2 waterfall: compute percentages from tier2Averages
  $: tier2 = stats?.tier2Averages;
  $: tier2Total = tier2
    ? tier2.dnsLookup + tier2.tcpConnect + tier2.tlsHandshake + tier2.ttfb + tier2.contentTransfer
    : 0;

  function pct(val: number): string {
    if (tier2Total <= 0) return '0%';
    return `${((val / tier2Total) * 100).toFixed(1)}%`;
  }

  function fmt(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  function toggleExpand(): void {
    uiStore.toggleCard(endpointId);
  }

  // Estimate first vs subsequent latency from connection reuse delta
  $: firstLatency = showReuseDelta && stats ? stats.p50 + (stats.connectionReuseDelta ?? 0) : null;
  $: subsequentLatency = showReuseDelta && stats ? stats.p50 : null;
</script>

<article
  class="summary-card"
  style:--card-color={color}
  style:--surface-raised={tokens.color.surface.raised}
  style:--surface-elevated={tokens.color.surface.elevated}
  style:--border={tokens.color.chrome.border}
  style:--accent={tokens.color.chrome.accent}
  style:--text-primary={tokens.color.text.primary}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-muted={tokens.color.text.muted}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--radius-md="{tokens.radius.md}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  style:--spacing-xl="{tokens.spacing.xl}px"
  style:--timing={tokens.timing.progressiveDisclosure}ms
  style:--easing={tokens.easing.standard}
  style:--tier2-dns={tokens.color.tier2.dns}
  style:--tier2-tcp={tokens.color.tier2.tcp}
  style:--tier2-tls={tokens.color.tier2.tls}
  style:--tier2-ttfb={tokens.color.tier2.ttfb}
  style:--tier2-transfer={tokens.color.tier2.transfer}
  aria-label="{endpoint?.label ?? endpointId} statistics"
>
  <!-- Colored left border accent -->
  <div class="card-accent" aria-hidden="true"></div>

  <div class="card-body">
    <!-- Header row: label + chevron toggle -->
    <div class="card-header">
      <div class="endpoint-label">
        <span class="color-dot" aria-hidden="true"></span>
        <span class="label-text">{endpoint?.label ?? endpointId}</span>
        {#if ready}
          <span class="tier-badge" aria-label="Tier {tierLevel}">Tier {tierLevel}</span>
        {/if}
      </div>
      <button
        type="button"
        class="chevron-btn"
        class:expanded={isExpanded}
        aria-expanded={isExpanded}
        aria-controls="card-detail-{endpointId}"
        aria-label="{isExpanded ? 'Collapse' : 'Expand'} details for {endpoint?.label ?? endpointId}"
        on:click={toggleExpand}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    {#if !ready}
      <!-- ── Collecting state ──────────────────────────────────────────────── -->
      <div class="collecting-state">
        <div class="collecting-progress" aria-label="Collecting data: {sampleCount} of 30 samples">
          <span class="collecting-text">Collecting data…</span>
          <span class="collecting-count">{sampleCount}/30</span>
        </div>
        <div class="progress-bar" role="progressbar" aria-valuenow={sampleCount} aria-valuemin={0} aria-valuemax={30}>
          <div class="progress-fill" style:width="{(sampleCount / 30) * 100}%"></div>
        </div>
        {#if epState?.lastLatency !== null && epState?.lastLatency !== undefined}
          <div class="last-latency" aria-label="Last latency: {fmt(epState.lastLatency)}">
            <span class="stat-value">{fmt(epState.lastLatency)}</span>
            <span class="stat-label">last</span>
          </div>
        {/if}
      </div>

    {:else if stats}
      <!-- ── Ready state ───────────────────────────────────────────────────── -->
      <div class="stats-ready">
        <!-- Hero: p50 + CI -->
        <div class="hero-row">
          <div class="hero-stat">
            <span class="stat-value hero-value" aria-label="Median latency: {fmt(stats.p50)}">{fmt(stats.p50)}</span>
            <span class="stat-label">p50</span>
          </div>
          <div class="hero-meta">
            <span class="ci-badge" aria-label="95% confidence interval: ±{fmt(stats.ci95.margin)}">±{fmt(stats.ci95.margin)}</span>
            <span class="sample-count" aria-label="{stats.sampleCount} rounds">{stats.sampleCount} rounds</span>
          </div>
        </div>

        <!-- Secondary stats row -->
        <div class="secondary-row" aria-label="Percentiles and jitter">
          <div class="stat-item">
            <span class="stat-value">{fmt(stats.p95)}</span>
            <span class="stat-label">p95</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{fmt(stats.p99)}</span>
            <span class="stat-label">p99</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{fmt(stats.stddev)}</span>
            <span class="stat-label">jitter</span>
          </div>
        </div>

        <!-- Connection reuse delta -->
        {#if showReuseDelta && firstLatency !== null && subsequentLatency !== null}
          <div class="reuse-delta" aria-label="Connection reuse: first {fmt(firstLatency)}, subsequent average {fmt(subsequentLatency)}">
            <span class="reuse-label">First:</span>
            <span class="reuse-value">{fmt(firstLatency)}</span>
            <span class="reuse-label">subsequent avg:</span>
            <span class="reuse-value">{fmt(subsequentLatency)}</span>
          </div>
        {/if}

        <!-- Tier 2 waterfall or Tier 1 fallback -->
        {#if tierLevel === 2 && tier2 && tier2Total > 0}
          <div class="waterfall" aria-label="Timing breakdown">
            <div class="waterfall-bar" role="img" aria-label="DNS {fmt(tier2.dnsLookup)}, TCP {fmt(tier2.tcpConnect)}, TLS {fmt(tier2.tlsHandshake)}, TTFB {fmt(tier2.ttfb)}, Transfer {fmt(tier2.contentTransfer)}">
              <div class="wf-segment wf-dns" style:width={pct(tier2.dnsLookup)} title="DNS: {fmt(tier2.dnsLookup)}"></div>
              <div class="wf-segment wf-tcp" style:width={pct(tier2.tcpConnect)} title="TCP: {fmt(tier2.tcpConnect)}"></div>
              <div class="wf-segment wf-tls" style:width={pct(tier2.tlsHandshake)} title="TLS: {fmt(tier2.tlsHandshake)}"></div>
              <div class="wf-segment wf-ttfb" style:width={pct(tier2.ttfb)} title="TTFB: {fmt(tier2.ttfb)}"></div>
              <div class="wf-segment wf-transfer" style:width={pct(tier2.contentTransfer)} title="Transfer: {fmt(tier2.contentTransfer)}"></div>
            </div>
            <div class="waterfall-legend" aria-hidden="true">
              <span class="legend-item"><span class="legend-dot legend-dns"></span>DNS {fmt(tier2.dnsLookup)}</span>
              <span class="legend-item"><span class="legend-dot legend-tcp"></span>TCP {fmt(tier2.tcpConnect)}</span>
              <span class="legend-item"><span class="legend-dot legend-tls"></span>TLS {fmt(tier2.tlsHandshake)}</span>
              <span class="legend-item"><span class="legend-dot legend-ttfb"></span>TTFB {fmt(tier2.ttfb)}</span>
              <span class="legend-item"><span class="legend-dot legend-transfer"></span>Transfer {fmt(tier2.contentTransfer)}</span>
            </div>
          </div>
        {:else if tierLevel === 1}
          <p class="tier1-note">This server does not expose timing details. Total latency and connection patterns are tracked.</p>
        {/if}
      </div>
    {/if}

    <!-- ── Expandable detail panel ─────────────────────────────────────────── -->
    <div
      id="card-detail-{endpointId}"
      class="detail-panel"
      class:detail-visible={isExpanded}
      aria-hidden={!isExpanded}
    >
      {#if ready && stats}
        <div class="detail-content">
          <h3 class="detail-heading">Full percentiles</h3>
          <div class="percentile-grid">
            <div class="pct-item">
              <span class="pct-label">min</span>
              <span class="pct-value">{fmt(stats.min)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">p25</span>
              <span class="pct-value">{fmt(stats.p25)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">p50</span>
              <span class="pct-value">{fmt(stats.p50)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">p75</span>
              <span class="pct-value">{fmt(stats.p75)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">p90</span>
              <span class="pct-value">{fmt(stats.p90)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">p95</span>
              <span class="pct-value">{fmt(stats.p95)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">p99</span>
              <span class="pct-value">{fmt(stats.p99)}</span>
            </div>
            <div class="pct-item">
              <span class="pct-label">max</span>
              <span class="pct-value">{fmt(stats.max)}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</article>

<style>
  /* ── Card shell ──────────────────────────────────────────────────────────── */
  .summary-card {
    position: relative;
    display: flex;
    flex-direction: row;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .card-accent {
    width: 4px;
    flex-shrink: 0;
    background: var(--card-color);
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  .card-body {
    flex: 1;
    min-width: 0;
    padding: var(--spacing-md) var(--spacing-md) var(--spacing-md) var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .endpoint-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    min-width: 0;
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--card-color);
    flex-shrink: 0;
  }

  .label-text {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tier-badge {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: var(--text-muted);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1px 6px;
    flex-shrink: 0;
  }

  .chevron-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 150ms ease, background 150ms ease;
    flex-shrink: 0;
  }

  .chevron-btn:hover {
    color: var(--text-primary);
    background: var(--surface-elevated);
  }

  .chevron-btn svg {
    transition: transform var(--timing) var(--easing);
  }

  .chevron-btn.expanded svg {
    transform: rotate(180deg);
  }

  /* ── Collecting state ────────────────────────────────────────────────────── */
  .collecting-state {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .collecting-progress {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .collecting-text {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .collecting-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
  }

  .progress-bar {
    height: 3px;
    background: var(--surface-elevated);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--card-color);
    border-radius: 2px;
    transition: width 300ms ease;
  }

  .last-latency {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
  }

  /* ── Stats ready ─────────────────────────────────────────────────────────── */
  .stats-ready {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .hero-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .hero-stat {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs);
  }

  .hero-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 28px;
    font-weight: 600;
    line-height: 1.1;
    color: var(--text-primary);
  }

  .hero-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .ci-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1px 6px;
  }

  .sample-count {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    color: var(--text-muted);
  }

  .secondary-row {
    display: flex;
    gap: var(--spacing-lg);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stat-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .stat-label {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ── Connection reuse delta ──────────────────────────────────────────────── */
  .reuse-delta {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
    font-size: 11px;
  }

  .reuse-label {
    font-family: 'Inter', sans-serif;
    color: var(--text-muted);
  }

  .reuse-value {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-secondary);
  }

  /* ── Tier 1 note ─────────────────────────────────────────────────────────── */
  .tier1-note {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.5;
    border-left: 2px solid var(--border);
    padding-left: var(--spacing-sm);
  }

  /* ── Waterfall ───────────────────────────────────────────────────────────── */
  .waterfall {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .waterfall-bar {
    display: flex;
    height: 10px;
    border-radius: 4px;
    overflow: hidden;
    gap: 1px;
  }

  .wf-segment {
    min-width: 2px;
    transition: width 400ms ease;
  }

  .wf-dns      { background: var(--tier2-dns); }
  .wf-tcp      { background: var(--tier2-tcp); }
  .wf-tls      { background: var(--tier2-tls); }
  .wf-ttfb     { background: var(--tier2-ttfb); }
  .wf-transfer { background: var(--tier2-transfer); }

  .waterfall-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs) var(--spacing-sm);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 3px;
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    color: var(--text-muted);
  }

  .legend-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-dns      { background: var(--tier2-dns); }
  .legend-tcp      { background: var(--tier2-tcp); }
  .legend-tls      { background: var(--tier2-tls); }
  .legend-ttfb     { background: var(--tier2-ttfb); }
  .legend-transfer { background: var(--tier2-transfer); }

  /* ── Expandable detail ───────────────────────────────────────────────────── */
  .detail-panel {
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition:
      max-height var(--timing) var(--easing),
      opacity var(--timing) var(--easing);
  }

  .detail-panel.detail-visible {
    max-height: 400px;
    opacity: 1;
  }

  .detail-content {
    border-top: 1px solid var(--border);
    padding-top: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }

  .detail-heading {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: var(--spacing-sm);
  }

  .percentile-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-xs) var(--spacing-sm);
  }

  .pct-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .pct-label {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pct-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
  }
</style>
