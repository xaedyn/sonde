<!-- src/lib/components/CrossLaneHover.svelte -->
<script lang="ts">
  import { uiStore } from '$lib/stores/ui';
  import { measurementStore } from '$lib/stores/measurements';
  import { endpointStore } from '$lib/stores/endpoints';
  import { tokens } from '$lib/tokens';

  let { visibleStart = 1, visibleEnd = 60 }: { visibleStart?: number; visibleEnd?: number } = $props();

  let hoverX: number | null = $derived($uiStore.laneHoverX);
  let hoverY: number | null = $derived($uiStore.laneHoverY);
  let hoverRound: number | null = $derived($uiStore.laneHoverRound);
  let isActive: boolean = $derived(hoverX !== null && hoverRound !== null);

  interface EndpointHoverRow {
    id: string;
    label: string;
    color: string;
    latency: number | null;
  }

  /** Find the sample nearest to targetRound via binary search (samples are sorted by round). */
  function findNearest<T extends { round: number }>(samples: { length: number; at(i: number): T | undefined }, targetRound: number): T | null {
    if (samples.length === 0) return null;
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((samples.at(mid)?.round ?? 0) < targetRound) lo = mid + 1;
      else hi = mid;
    }
    const a = samples.at(lo);
    const b = lo > 0 ? samples.at(lo - 1) : undefined;
    if (!a) return b ?? null;
    if (!b) return a;
    return Math.abs(a.round - targetRound) <= Math.abs(b.round - targetRound) ? a : b;
  }

  const hoverRows: EndpointHoverRow[] = $derived.by(() => {
    if (hoverRound === null || hoverRound < visibleStart || hoverRound > visibleEnd) return [];
    const endpoints = $endpointStore.filter(ep => ep.enabled);
    return endpoints.map(ep => {
      const epState = $measurementStore.endpoints[ep.id];
      const sample = epState ? findNearest(epState.samples, hoverRound) : null;
      const rawLabel = ep.label || ep.url;
      // Strip protocol and www. for compact display
      const shortLabel = rawLabel.replace(/^https?:\/\/(www\.)?/, '');
      return {
        id: ep.id,
        label: shortLabel,
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
    if (fastest.latency <= 0) return '';
    const ratio = (slowest.latency / fastest.latency).toFixed(1);
    return `${fastest.label} is ${ratio}× faster`;
  });

  function fmtLatency(ms: number | null): string {
    if (ms === null) return '—';
    return `${Math.round(ms)}ms`;
  }

  const TOOLTIP_W = 200; // approximate max width including padding
  const TOOLTIP_MARGIN = 8;
  // Approximate tooltip height: header + rows + delta + padding
  const TOOLTIP_ROW_H = 22;
  const TOOLTIP_CHROME = 60; // header, delta, padding

  const tipLeft: number = $derived.by(() => {
    if (hoverX === null) return 0;
    const preferred = hoverX + 16;
    const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 1920) - TOOLTIP_W - TOOLTIP_MARGIN;
    return Math.min(preferred, maxLeft);
  });

  const tipTop: number = $derived.by(() => {
    if (hoverY === null) return 74;
    const estH = TOOLTIP_CHROME + hoverRows.length * TOOLTIP_ROW_H;
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const preferred = hoverY - estH / 2; // center on cursor
    return Math.max(TOOLTIP_MARGIN, Math.min(preferred, viewH - estH - TOOLTIP_MARGIN));
  });

  // ── Heatmap tooltip positioning ─────────────────────────────────────────
  let heatmapTipEl: HTMLDivElement | undefined = $state(undefined);

  const heatmapTipLeft: number = $derived.by(() => {
    const ht = $uiStore.heatmapTooltip;
    if (!ht) return 0;
    const tipW = heatmapTipEl?.offsetWidth ?? 200;
    const viewW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const margin = 8;
    // Try to center on cursor, clamp to viewport
    const centered = ht.x - tipW / 2;
    return Math.max(margin, Math.min(centered, viewW - tipW - margin));
  });
</script>

<div
  class="hover-line"
  class:active={isActive && !$uiStore.heatmapTooltip}
  style:left="{hoverX}px"
  style:--t3={tokens.color.text.t3}
  style:--glass-highlight={tokens.color.glass.highlight}
  aria-hidden="true"
></div>

{#if isActive && hoverRound !== null && hoverX !== null && !$uiStore.heatmapTooltip}
  <div
    class="hover-tip"
    class:active={isActive}
    style:left="{tipLeft}px"
    style:top="{tipTop}px"
    style:--tooltip-bg={tokens.color.tooltip.bg}
    style:--glass-border={tokens.color.glass.border}
    style:--glass-highlight={tokens.color.glass.highlight}
    style:--t1={tokens.color.text.t1}
    style:--t3={tokens.color.text.t3}
    style:--t4={tokens.color.text.t4}
    style:--t5={tokens.color.text.t5}
    style:--mono={tokens.typography.mono.fontFamily}
    style:--glass-shadow-strong={tokens.color.glass.shadowStrong}
    style:--glass-shadow={tokens.color.glass.shadow}
    role="tooltip"
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

{#if $uiStore.heatmapTooltip}
  <div
    class="heatmap-tip"
    bind:this={heatmapTipEl}
    style:left="{heatmapTipLeft}px"
    style:top="{$uiStore.heatmapTooltip.y}px"
    style:--tooltip-bg={tokens.color.tooltip.bg}
    style:--glass-border={tokens.color.glass.border}
    style:--mono={tokens.typography.mono.fontFamily}
    role="tooltip"
  >{$uiStore.heatmapTooltip.text}</div>
{/if}

<style>
  .hover-line {
    position: fixed; top: 0; bottom: 0;
    width: 1px; pointer-events: none; z-index: 5;
    opacity: 0; transition: opacity 0.08s;
    background: linear-gradient(180deg, transparent 10%, var(--glass-highlight) 50%, transparent 90%);
  }
  .hover-line.active { opacity: 1; }
  .hover-tip {
    position: fixed; z-index: 10;
    pointer-events: none; opacity: 0; transition: opacity 0.1s;
  }
  .hover-tip.active { opacity: 1; }
  .tip-inner {
    background: var(--tooltip-bg);
    border: 1px solid var(--glass-border);
    border-radius: 12px; padding: var(--spacing-md) var(--spacing-md);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px var(--glass-shadow-strong), 0 0 1px var(--glass-border);
    min-width: 160px;
  }
  .tip-round {
    font-family: var(--mono); font-size: 9px; font-weight: 400;
    font-variant-numeric: tabular-nums;
    color: var(--t3); text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px solid var(--t5);
  }
  .tip-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
  .tip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .tip-name { font-family: var(--mono); font-size: 9px; font-weight: 400; color: var(--t3); flex: 1; }
  .tip-val { font-family: var(--mono); font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .tip-delta {
    font-family: var(--mono); font-size: 9px; color: var(--t4);
    text-align: right; margin-top: 6px; padding-top: 5px;
    border-top: 1px solid var(--t5);
  }
  .heatmap-tip {
    position: fixed; z-index: 20; pointer-events: none;
    transform: translateY(8px);
    background: var(--tooltip-bg);
    border: 1px solid var(--glass-border);
    border-radius: 6px; padding: var(--spacing-xs) var(--spacing-sm);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    font-family: var(--mono, 'Martian Mono', monospace);
    font-size: 11px; font-weight: 400;
    color: rgba(255,255,255,.85);
    white-space: nowrap;
  }
</style>
