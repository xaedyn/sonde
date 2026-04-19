<!-- src/lib/components/EventFeed.svelte -->
<!-- Newest-loud activity log. 5 rows max. Each row fades by rank; newest row   -->
<!-- plays a feedArrive flash when it arrives. Pure render — event derivation  -->
<!-- lives in the parent (OverviewView event ring buffer).                     -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tokens } from '$lib/tokens';
  import { fmt } from '$lib/utils/format';
  import type { Endpoint } from '$lib/types';

  export type FeedEventKind = 'cross-up' | 'cross-down' | 'shift';

  export interface FeedEvent {
    t: number;         // ms timestamp
    epId: string;
    kind: FeedEventKind;
    value?: number;
    from?: number;
    to?: number;
    threshold?: number;
  }

  interface Props {
    events: readonly FeedEvent[];         // most-recent-first; max 5 rendered
    endpoints: readonly Endpoint[];
    now: number;
    onDrill: (epId: string) => void;
  }

  let { events, endpoints, now, onDrill }: Props = $props();

  const MAX_ROWS = 5;
  const rows = $derived(events.slice(0, MAX_ROWS));

  // Detect when the top event key changes and flash the arrival. Previous-key
  // state is kept untracked — if it were $state read inside the $effect, the
  // effect would self-invalidate as soon as we wrote the new key, cancelling
  // arriveTimer before it fired. Timer cleanup lives in onDestroy so a fresh
  // arrival during an already-pending flash doesn't cancel the flash mid-way.
  let prevKey: string | null = null;
  let arrivedKey = $state<string | null>(null);
  let arriveTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const top = rows[0];
    const nextKey = top ? `${top.t}-${top.epId}-${top.kind}` : null;
    if (nextKey !== null && nextKey !== prevKey) {
      prevKey = nextKey;
      arrivedKey = nextKey;
      if (arriveTimer !== null) clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => { arrivedKey = null; arriveTimer = null; }, 1200);
    }
  });

  onDestroy(() => {
    if (arriveTimer !== null) clearTimeout(arriveTimer);
  });

  function relTime(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return `${h}h ago`;
  }

  function endpointFor(epId: string): Endpoint | undefined {
    return endpoints.find((ep) => ep.id === epId);
  }

  function actionPhrase(ev: FeedEvent): { phrase: string; value: string } {
    switch (ev.kind) {
      case 'cross-up':   return { phrase: 'crossed up',   value: ev.value != null ? `${fmt(ev.value)}ms` : '' };
      case 'cross-down': return { phrase: 'recovered',    value: ev.value != null ? `${fmt(ev.value)}ms` : '' };
      case 'shift':      return {
        phrase: 'p95 shift',
        value: ev.from != null && ev.to != null ? `${fmt(ev.from)}→${fmt(ev.to)}ms` : '',
      };
    }
  }
</script>

<section class="feed" aria-label="Recent events">
  <header class="feed-header">
    <h3 class="feed-title">Recent events</h3>
    <p class="feed-sub">Threshold activity</p>
  </header>

  {#if rows.length === 0}
    <p class="feed-empty">No crossings in window. Network steady.</p>
  {:else}
    <ol class="feed-rows" aria-live="polite">
      {#each rows as ev, rank (`${ev.t}-${ev.epId}-${ev.kind}`)}
        {@const ep = endpointFor(ev.epId)}
        {@const color = ep?.color || tokens.color.endpoint[0]}
        {@const name = ep?.label || ev.epId}
        {@const { phrase, value } = actionPhrase(ev)}
        {@const key = `${ev.t}-${ev.epId}-${ev.kind}`}
        <li class="feed-row" class:latest={rank === 0} class:arrived={arrivedKey === key} class:k-up={ev.kind === 'cross-up'} class:k-down={ev.kind === 'cross-down'} class:k-shift={ev.kind === 'shift'} style="--rank: {rank};">
          <button
            type="button"
            class="feed-btn"
            onclick={() => onDrill(ev.epId)}
            aria-label="{relTime(now - ev.t)} {name} {phrase} {value}"
          >
            <span class="feed-time">{relTime(now - ev.t)}</span>
            <span class="feed-dot" style:background={color} aria-hidden="true"></span>
            <span class="feed-name">{name}</span>
            <span class="feed-action">{phrase} · <em class="feed-value">{value}</em></span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .feed {
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 14px 16px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .feed-header { display: flex; flex-direction: column; gap: 2px; }
  .feed-title { margin: 0; font-size: var(--ts-lg); font-weight: 500; color: var(--t1); letter-spacing: var(--tr-tight); }
  .feed-sub { margin: 0; font-family: var(--mono); font-size: var(--ts-xs); letter-spacing: var(--tr-kicker); color: var(--t3); text-transform: uppercase; }

  .feed-empty { margin: 0; padding: 8px 0; font-family: var(--mono); font-size: var(--ts-sm); color: var(--t4); }

  .feed-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .feed-row {
    opacity: calc(1 - var(--rank, 0) * 0.14);
    transition: background 140ms ease, opacity 400ms ease;
    border-radius: 6px;
  }
  .feed-row:hover { opacity: 1; background: rgba(255,255,255,.04); }
  .feed-row.latest { font-size: var(--ts-base); }
  .feed-row.latest .feed-name { color: var(--t1); font-weight: 500; }
  .feed-row.latest .feed-dot  { width: 8px; height: 8px; box-shadow: 0 0 6px currentColor; }

  .feed-btn {
    width: 100%;
    display: grid;
    grid-template-columns: 60px 10px 120px 1fr;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .feed-btn:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 2px; border-radius: 6px; }

  .feed-time {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t4);
    font-variant-numeric: tabular-nums;
  }
  .feed-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
  }
  .feed-name {
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .feed-action {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t3);
    letter-spacing: var(--tr-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feed-row.k-up    .feed-value { color: var(--accent-pink); }
  .feed-row.k-down  .feed-value { color: var(--accent-green); }
  .feed-row.k-shift .feed-value { color: var(--accent-amber); }

  .feed-row.arrived { animation: feedArrive 1.2s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  @keyframes feedArrive {
    0%   { background: rgba(255,255,255,.1);  transform: translateX(-4px); }
    30%  { background: rgba(255,255,255,.06); transform: none; }
    100% { background: transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    .feed-row, .feed-row.arrived { transition: none; animation: none; }
  }
</style>
