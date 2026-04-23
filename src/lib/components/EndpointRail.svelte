<!-- src/lib/components/EndpointRail.svelte -->
<!-- Persistent left rail. Drives global endpoint focus across all v2 views.   -->
<!-- 264px fixed width; full viewport height inside the shell-body row.        -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { uiStore } from '$lib/stores/ui';
  import { endpointStore } from '$lib/stores/endpoints';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { classify, HEALTH_STYLES, type HealthBucket } from '$lib/utils/classify';
  import { fmtParts } from '$lib/utils/format';

  const endpoints = $derived($endpointStore);
  const stats = $derived($statisticsStore);
  const focusedId = $derived($uiStore.focusedEndpointId);
  const threshold = $derived($settingsStore.healthThreshold);

  function handleClick(id: string): void {
    uiStore.toggleFocusedEndpoint(id);
  }

  function handleDoubleClick(id: string): void {
    uiStore.setFocusedEndpoint(id);
    uiStore.setActiveView('live');
  }

  // Keyboard parity for drill: Enter falls through to native button click
  // (toggle), Space drills to the detail view per the rail spec.
  function handleKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      handleDoubleClick(id);
    }
  }

  function handleManageEndpoints(): void {
    uiStore.toggleEndpoints();
  }

  function bucketFor(id: string): HealthBucket {
    return classify(stats[id] ?? null, threshold);
  }
</script>

<nav
  class="rail"
  aria-label="Endpoints"
  style:--rail-bg="rgba(10,9,18,.5)"
>
  <div class="rail-header">
    <span class="rail-title">Endpoints</span>
    <span class="rail-count" aria-label="{endpoints.length} {endpoints.length === 1 ? 'endpoint' : 'endpoints'} listed">{endpoints.length}</span>
  </div>

  <div class="rail-list">
    {#each endpoints as ep (ep.id)}
      {@const bucket = bucketFor(ep.id)}
      {@const style = HEALTH_STYLES[bucket]}
      {@const epStats = stats[ep.id]}
      {@const parts = epStats?.ready ? fmtParts(epStats.p50) : { num: '—', unit: '' }}
      {@const focused = focusedId === ep.id}
      {@const epColor = ep.color || tokens.color.endpoint[0]}
      <button
        type="button"
        class="rail-row"
        class:focused
        class:disabled={!ep.enabled}
        disabled={!ep.enabled}
        aria-pressed={focused}
        aria-label="{ep.label === ep.url || ep.label.trim() === '' ? ep.url : `${ep.label}, ${ep.url}`}, status: {style.label}"
        onclick={() => handleClick(ep.id)}
        ondblclick={() => handleDoubleClick(ep.id)}
        onkeydown={(e) => handleKeydown(e, ep.id)}
      >
        <span
          class="rail-pip"
          style:background={style.color}
          style:box-shadow="0 0 8px {style.glow}"
          aria-hidden="true"
        ></span>
        <span class="rail-row-body" class:single-line={ep.label.trim() === '' || ep.label === ep.url}>
          <!-- Whitespace-only or blank labels render the URL in the label slot
               so the visible top line is never empty. The URL subtitle is then
               hidden (no duplicate). Keeps the one-line/two-line logic symmetric
               with the aria-label dedup on line 70. -->
          <span class="rail-row-label">{ep.label.trim() === '' ? ep.url : ep.label}</span>
          {#if ep.label.trim() !== '' && ep.label !== ep.url}
            <span class="rail-row-url">{ep.url}</span>
          {/if}
        </span>
        <span class="rail-row-metric">
          <span class="rail-row-p50" style:color={epColor}>{parts.num}</span>
          <span class="rail-row-unit">{parts.unit}</span>
        </span>
      </button>
    {/each}
  </div>

  <div class="rail-footer">
    <button type="button" class="rail-add" onclick={handleManageEndpoints}>
      Manage endpoints
    </button>
  </div>
</nav>

<style>
  .rail {
    width: var(--rail-width);
    flex-shrink: 0;
    background: var(--rail-bg);
    border-right: 1px solid var(--border-mid);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* Mobile: the endpoint drawer (Topbar endpoint-count button) is the
     affordance; the fixed-width rail would eat 264 px of a 360 px viewport. */
  @media (max-width: 767px) {
    .rail { display: none; }
  }

  .rail-header {
    padding: 14px 16px 10px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .rail-title {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    text-transform: uppercase;
  }
  .rail-count {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    border: 1px solid var(--border-mid);
    padding: 1px 6px;
    border-radius: 3px;
  }

  .rail-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
  }

  .rail-row {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 10px;
    margin-bottom: 3px;
    border-radius: 7px;
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: background 140ms ease, border-color 140ms ease;
    /* Enforce equal row height regardless of one-line vs two-line body content.
       Grid rows auto-size to the tallest cell; without min-height a single-line
       row collapses. Computed from two-line layout: 10px top padding +
       2 × ~20px line-height + 1px gap + 10px bottom padding ≈ 61px.
       At 375px the 44px tap-target floor is already exceeded by this value. */
    min-height: 60px;
  }
  .rail-row:hover:not(:disabled) { background: var(--glass-bg-rail-hover); border-color: var(--border-mid); }
  .rail-row.focused {
    background: var(--glass-bg-rail-selected);
    border-color: var(--border-bright);
  }
  .rail-row.disabled, .rail-row:disabled { opacity: 0.5; cursor: not-allowed; }
  .rail-row:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .rail-pip {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .rail-row-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .rail-row-body.single-line {
    justify-content: center;
  }
  .rail-row-label {
    font-size: var(--ts-md);
    color: var(--t1);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rail-row-url {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rail-row-metric {
    display: flex;
    align-items: baseline;
    gap: 2px;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }
  .rail-row-p50 {
    font-size: var(--ts-lg);
    font-weight: 500;
  }
  .rail-row-unit {
    font-size: var(--ts-xs);
    color: var(--t4);
    letter-spacing: var(--tr-label);
  }

  .rail-footer {
    padding: 10px 12px;
    border-top: 1px solid var(--border-mid);
  }
  .rail-add {
    width: 100%;
    padding: 7px;
    border-radius: 6px;
    background: transparent;
    border: 1px dashed var(--border-bright);
    color: var(--t3);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-label);
    cursor: pointer;
    transition: color 160ms ease, border-color 160ms ease;
  }
  .rail-add:hover {
    color: var(--t1);
    border-color: var(--accent-cyan);
  }
  .rail-add:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-row, .rail-add { transition: none; }
  }
</style>
