<!-- src/lib/components/CrossLaneHover.svelte -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { tokens } from '$lib/tokens';

  let { totalRounds }: { totalRounds: number } = $props();

  let hoverX: number | null = $derived($uiStore.laneHoverX);
  let hoverRound: number | null = $derived($uiStore.laneHoverRound);
  let isActive: boolean = $derived(hoverX !== null && hoverRound !== null);

  interface EndpointHoverRow {
    id: string;
    label: string;
    color: string;
    latency: number | null;
  }

  const hoverRows: EndpointHoverRow[] = $derived.by(() => {
    if (hoverRound === null || hoverRound < 1 || hoverRound > totalRounds) return [];
    const endpoints = $endpointStore.filter(ep => ep.enabled);
    return endpoints.map(ep => {
      const epState = $measurementStore.endpoints[ep.id];
      const sample = epState?.samples[hoverRound - 1] ?? null;
      return {
        id: ep.id,
        label: ep.label || ep.url,
        color: ep.color,
        latency: sample?.status === 'ok' ? sample.latency : null,
      };
    });
  });

  const deltaLabel: string = $derived.by(() => {
    const valid = hoverRows.filter(r => r.latency !== null);
    if (valid.length < 2) return '';
    const sorted = [...valid].sort((a, b) => (a.latency ?? 0) - (b.latency ?? 0));
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    if (!fastest || !slowest || fastest.latency === null || slowest.latency === null) return '';
    const ratio = (slowest.latency / fastest.latency).toFixed(1);
    return `${fastest.label} is ${ratio}× faster`;
  });

  function fmtLatency(ms: number | null): string {
    if (ms === null) return '—';
    return `${Math.round(ms)}ms`;
  }
</script>

<div
  class="hover-line"
  class:active={isActive}
  style:left="{hoverX}px"
  style:--t3={tokens.color.text.t3}
  aria-hidden="true"
></div>

{#if isActive && hoverRound !== null && hoverX !== null}
  <div
    class="hover-tip"
    class:active={isActive}
    style:left="{hoverX + 16}px"
    style:top="74px"
    style:--tooltip-bg={tokens.color.tooltip.bg}
    style:--glass-border={tokens.color.glass.border}
    style:--glass-highlight={tokens.color.glass.highlight}
    style:--t1={tokens.color.text.t1}
    style:--t3={tokens.color.text.t3}
    style:--t4={tokens.color.text.t4}
    style:--mono={tokens.typography.mono.fontFamily}
    role="tooltip"
    aria-live="polite"
  >
    <div class="tip-inner">
      <div class="tip-round">Round {hoverRound}</div>
      {#each hoverRows as row (row.id)}
        <div class="tip-row">
          <div class="tip-dot" style:background={row.color} style:box-shadow="0 0 4px {row.color}"></div>
          <div class="tip-name">{row.label}</div>
          <div class="tip-val" style:color={row.color}>{fmtLatency(row.latency)}</div>
        </div>
      {/each}
      {#if deltaLabel}
        <div class="tip-delta">{deltaLabel}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hover-line {
    position: fixed; top: 0; bottom: 0;
    width: 1px; pointer-events: none; z-index: 5;
    opacity: 0; transition: opacity 0.08s;
    background: linear-gradient(180deg, transparent 10%, rgba(255,255,255,.12) 50%, transparent 90%);
  }
  .hover-line.active { opacity: 1; }
  .hover-tip {
    position: fixed; z-index: 10;
    pointer-events: none; opacity: 0; transition: opacity 0.1s;
  }
  .hover-tip.active { opacity: 1; }
  .tip-inner {
    background: var(--tooltip-bg);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px; padding: 10px 14px;
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 1px rgba(255,255,255,.1);
    min-width: 160px;
  }
  .tip-round {
    font-family: var(--mono); font-size: 9px; font-weight: 400;
    color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .tip-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
  .tip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .tip-name { font-family: var(--mono); font-size: 10px; font-weight: 300; color: var(--t3); flex: 1; }
  .tip-val { font-family: var(--mono); font-size: 13px; font-weight: 500; }
  .tip-delta {
    font-family: var(--mono); font-size: 9px; color: var(--t4);
    text-align: right; margin-top: 6px; padding-top: 5px;
    border-top: 1px solid rgba(255,255,255,.04);
  }
</style>
