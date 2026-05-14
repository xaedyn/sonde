<!-- src/lib/components/RunStorylineCard.svelte -->
<!-- Recent-run storyline. Pure render: evidence derivation lives in -->
<!-- utils/run-storyline so this component cannot invent unsupported claims. -->
<script lang="ts">
  import type {
    EndpointTimelineRow,
    RunStoryline,
    StoryPhase,
    TimelinePoint,
    StoryMarker,
    StoryMarkerKind,
  } from '$lib/utils/run-storyline';

  interface Props {
    storyline: RunStoryline;
    onDrill: (endpointId: string) => void;
  }

  const SPARK_VIEWBOX_HEIGHT = 40;
  const SPARK_BASELINE_Y = 34;
  const SPARK_RANGE_Y = 28;
  const LEGEND_ITEMS: readonly { readonly kind: TimelinePoint['status']; readonly label: string }[] = [
    { kind: 'ok', label: 'steady' },
    { kind: 'elevated', label: 'elevated' },
    { kind: 'slow', label: 'slow' },
    { kind: 'failed', label: 'failed' },
  ];

  let { storyline, onDrill }: Props = $props();

  let windowLabel = $derived(`Last ${durationLabel(windowSpan())} · newest on right`);
  let axisTicks = $derived(buildAxisTicks(storyline.windowStart, storyline.windowEnd));

  function windowSpan(): number {
    return Math.max(1, storyline.windowEnd - storyline.windowStart);
  }

  function durationLabel(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 90) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }

  function buildAxisTicks(start: number, end: number): readonly { readonly pct: number; readonly label: string }[] {
    const span = Math.max(1, end - start);
    const seconds = span / 1000;
    let positions: readonly number[];
    if (seconds < 3) {
      positions = [0, 1];
    } else if (seconds < 20) {
      positions = [0, 0.5, 1];
    } else if (seconds < 45) {
      positions = [0, 1 / 3, 2 / 3, 1];
    } else {
      positions = [0, 0.25, 0.5, 0.75, 1];
    }
    return positions.map((position) => {
      const age = span * (1 - position);
      const label = position === 1 ? 'now' : position === 0 ? `${durationLabel(age)} ago` : durationLabel(age);
      return { pct: position * 100, label };
    });
  }

  function pct(t: number): number {
    const span = windowSpan();
    return Math.max(0, Math.min(100, ((t - storyline.windowStart) / span) * 100));
  }

  function phaseBasis(phase: StoryPhase): number {
    const span = windowSpan();
    return Math.max(4, ((phase.end - phase.start) / span) * 100);
  }

  function sparkY(point: Pick<TimelinePoint, 'normalizedLatency'>): number {
    return SPARK_BASELINE_Y - Math.min(SPARK_RANGE_Y, (point.normalizedLatency ?? 0) * SPARK_RANGE_Y);
  }

  function pathFor(row: EndpointTimelineRow): string {
    if (row.points.length === 0) return '';
    let d = '';
    let prevWasGap = true;
    for (const point of row.points) {
      if (point.status === 'failed' || point.normalizedLatency == null) {
        prevWasGap = true;
        continue;
      }
      const x = pct(point.t);
      const y = sparkY(point);
      d += `${prevWasGap ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
      prevWasGap = false;
    }
    return d.trim();
  }

  function failurePoints(row: EndpointTimelineRow): readonly TimelinePoint[] {
    return row.points.filter((point) => point.status === 'failed');
  }

  function elevatedPoints(row: EndpointTimelineRow): readonly TimelinePoint[] {
    return row.points.filter((point) => point.status === 'elevated');
  }

  function markerTimeLabel(marker: StoryMarker): string {
    const age = storyline.windowEnd - marker.t;
    return age <= 999 ? 'now' : `${durationLabel(age)} ago`;
  }

  function markerKindLabel(kind: StoryMarkerKind): string {
    switch (kind) {
      case 'elevation':
        return 'Elevated';
      case 'slowdown':
        return 'Slow';
      case 'failure':
        return 'Failed';
      case 'recovery':
        return 'Recovered';
      case 'shared-change':
        return 'Shared change';
    }
  }

  function latestMarkerFor(row: EndpointTimelineRow): StoryMarker | undefined {
    return storyline.markers
      .filter((marker) => marker.endpointId === row.endpointId)
      .sort((a, b) => b.t - a.t)[0];
  }

  function rowTimeSummary(row: EndpointTimelineRow): string {
    const marker = latestMarkerFor(row);
    if (marker) return `${markerKindLabel(marker.kind)} ${markerTimeLabel(marker)}`;
    if (storyline.confidence === 'collecting') return 'Collecting samples';
    if (row.points.length === 0) return 'No recent samples';
    return `Steady for ${durationLabel(windowSpan())}`;
  }

  function markerLabel(marker: StoryMarker): string {
    return `${marker.label}, ${markerTimeLabel(marker)}, ${marker.evidence}`;
  }

  function drillMarker(marker: StoryMarker): void {
    if (marker.endpointId) onDrill(marker.endpointId);
  }
</script>

<section class="storyline" aria-label="Recent run timeline. {windowLabel}" data-confidence={storyline.confidence}>
  <header class="storyline-header">
    <div>
      <h3 class="storyline-title">What happened</h3>
      <p class="storyline-sub">{windowLabel}</p>
    </div>
    <p class="storyline-hint">Click a marker -&gt; Diagnose</p>
  </header>

  <ul class="story-legend" aria-label="Timeline status legend">
    {#each LEGEND_ITEMS as item (item.kind)}
      <li data-kind={item.kind}>
        <span aria-hidden="true"></span>
        {item.label}
      </li>
    {/each}
  </ul>

  <div class="story-axis" aria-hidden="true">
    <span class="story-axis-title">time</span>
    <div class="story-axis-track">
      {#each axisTicks as tick (tick.pct)}
        <span class="story-axis-tick" style:left="{tick.pct}%">{tick.label}</span>
      {/each}
    </div>
  </div>

  <div class="story-rail">
    <span class="story-rail-label">events</span>
    <div class="story-rail-track">
      <div class="story-phases" aria-hidden="true">
        {#each storyline.phases as phase (`${phase.kind}-${phase.start}-${phase.end}`)}
          <span
            class="story-phase"
            data-kind={phase.kind}
            style:flex-basis="{phaseBasis(phase)}%"
          >
            <span>{phase.label}</span>
          </span>
        {/each}
      </div>
      {#each storyline.markers as marker (`${marker.kind}-${marker.endpointId ?? 'all'}-${marker.t}`)}
        {#if marker.endpointId}
          <button
            type="button"
            class="story-marker"
            data-kind={marker.kind}
            style:left="{pct(marker.t)}%"
            title="{markerTimeLabel(marker)} - {marker.evidence}"
            aria-label={markerLabel(marker)}
            onclick={() => drillMarker(marker)}
          ></button>
        {:else}
          <span
            class="story-marker"
            data-kind={marker.kind}
            style:left="{pct(marker.t)}%"
            title="{markerTimeLabel(marker)} - {marker.evidence}"
          ></span>
        {/if}
      {/each}
    </div>
  </div>

  <div class="story-rows">
    {#each storyline.rows as row (row.endpointId)}
      {@const timeSummary = rowTimeSummary(row)}
      <button
        type="button"
        class="story-row"
        style:--ep-color={row.color}
        data-endpoint-id={row.endpointId}
        aria-label="{row.label}, {timeSummary}, {row.summary}"
        onclick={() => onDrill(row.endpointId)}
      >
        <span class="story-label">
          <span class="story-dot" aria-hidden="true"></span>
          <span class="story-label-copy">
            <span class="story-name">{row.label}</span>
            <span class="story-row-time">{timeSummary}</span>
          </span>
        </span>
        <span class="story-track">
          <svg
            class="story-spark"
            viewBox="0 0 100 {SPARK_VIEWBOX_HEIGHT}"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={pathFor(row)}
              fill="none"
              stroke="var(--ep-color)"
              stroke-width="2.35"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          {#each failurePoints(row) as point (`${row.endpointId}-${point.round}-${point.t}`)}
            <span class="story-failure" style:left="{pct(point.t)}%" style:top="{sparkY(point)}px" aria-hidden="true">!</span>
          {/each}
          {#each elevatedPoints(row) as point (`${row.endpointId}-elevated-${point.round}-${point.t}`)}
            <span
              class="story-elevated"
              style:left="{pct(point.t)}%"
              style:top="{sparkY(point)}px"
              title="Elevated: higher than recent median but below the slow trigger"
              aria-hidden="true"
            ></span>
          {/each}
        </span>
      </button>
    {/each}
  </div>

  <footer class="story-footer">
    <p class="story-summary">{storyline.summary}</p>
    {#if storyline.overflow}
      <p class="story-overflow">{storyline.overflow.summary}</p>
    {/if}
  </footer>
</section>

<style>
  .storyline {
    --story-label-w: 156px;
    background: var(--glass-bg-rail-hover);
    border: 1px solid var(--border-mid);
    border-radius: 14px;
    padding: 14px 16px 13px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .storyline-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
  }
  .storyline-title {
    margin: 0;
    font-size: var(--ts-lg);
    font-weight: 500;
    color: var(--t1);
    letter-spacing: var(--tr-tight);
  }
  .storyline-sub {
    margin: 2px 0 0;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t2);
    text-transform: uppercase;
  }
  .storyline-hint {
    margin: 0;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t2);
    white-space: nowrap;
  }

  .story-legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    min-width: 0;
  }
  .story-legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    text-transform: uppercase;
  }
  .story-legend span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--t3);
    box-shadow: 0 0 8px rgba(255,255,255,.12);
  }
  .story-legend li[data-kind="ok"] span { background: var(--accent-green); }
  .story-legend li[data-kind="elevated"] span { background: var(--accent-amber); }
  .story-legend li[data-kind="slow"] span { background: var(--accent-pink); }
  .story-legend li[data-kind="failed"] span { background: var(--accent-pink); }

  .story-axis,
  .story-rail {
    display: grid;
    grid-template-columns: var(--story-label-w) minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
  }
  .story-axis {
    height: 14px;
  }
  .story-axis-title,
  .story-rail-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: var(--tr-kicker);
    color: var(--t4);
    text-transform: uppercase;
  }
  .story-axis-track {
    position: relative;
    height: 14px;
    min-width: 0;
  }
  .story-axis-track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 6px;
    height: 1px;
    background: rgba(255,255,255,.08);
  }
  .story-axis-tick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: 10px;
    color: var(--t3);
    white-space: nowrap;
  }
  .story-axis-tick:first-child { transform: translateX(0); }
  .story-axis-tick:last-child { transform: translateX(-100%); color: var(--t1); }

  .story-rail-track {
    position: relative;
    min-width: 0;
  }
  .story-phases {
    display: flex;
    height: 30px;
    overflow: hidden;
    border-radius: 6px;
    background: rgba(255,255,255,.035);
    border: 1px solid var(--border-mid);
  }
  .story-phase {
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-family: var(--mono);
    font-size: var(--ts-xs);
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-right: 1px solid rgba(255,255,255,.07);
  }
  .story-phase:last-child { border-right: none; }
  .story-phase[data-kind="steady"],
  .story-phase[data-kind="recovered"] {
    background: rgba(74, 222, 128, .1);
    color: var(--t2);
  }
  .story-phase[data-kind="isolated-slow"] {
    background: rgba(251, 191, 36, .16);
    color: var(--accent-amber);
  }
  .story-phase[data-kind="shared-slow"],
  .story-phase[data-kind="failure"] {
    background: rgba(249, 168, 212, .16);
    color: var(--accent-pink);
  }
  .story-phase[data-kind="collecting"] {
    background: rgba(148, 163, 184, .1);
    color: var(--t3);
  }
  .story-marker {
    position: absolute;
    top: -2px;
    bottom: -4px;
    width: 18px;
    padding: 0;
    border: none;
    background: transparent;
    transform: translateX(-50%);
    cursor: pointer;
  }
  .story-marker::before {
    content: '';
    position: absolute;
    top: 1px;
    bottom: 1px;
    left: 50%;
    width: 2px;
    transform: translateX(-1px);
    background: rgba(255,255,255,.6);
  }
  .story-marker::after {
    content: '';
    position: absolute;
    top: 10px;
    left: 50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255,255,255,.8);
    box-shadow: 0 0 12px rgba(255,255,255,.28);
  }
  .story-marker:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
    border-radius: 5px;
  }
  .story-marker[data-kind="failure"]::before,
  .story-marker[data-kind="failure"]::after { background: var(--accent-pink); }
  .story-marker[data-kind="slowdown"]::before,
  .story-marker[data-kind="slowdown"]::after,
  .story-marker[data-kind="shared-change"]::before,
  .story-marker[data-kind="shared-change"]::after { background: var(--accent-amber); }
  .story-marker[data-kind="recovery"]::before,
  .story-marker[data-kind="recovery"]::after { background: var(--accent-green); }
  .story-marker[data-kind="elevation"]::before,
  .story-marker[data-kind="elevation"]::after { background: var(--accent-amber); }

  .story-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .story-row {
    display: grid;
    grid-template-columns: var(--story-label-w) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    height: 42px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .story-row:hover {
    background: rgba(255,255,255,.035);
    border-color: var(--border-mid);
  }
  .story-row:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }
  .story-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding-left: 6px;
  }
  .story-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--ep-color);
    box-shadow: 0 0 8px var(--ep-color);
    flex: 0 0 auto;
  }
  .story-label-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .story-name,
  .story-row-time {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--mono);
  }
  .story-name {
    font-size: var(--ts-sm);
    color: var(--t1);
    letter-spacing: var(--tr-body);
  }
  .story-row-time {
    font-size: 10px;
    color: var(--t3);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
  }
  .story-track {
    position: relative;
    height: 38px;
    min-width: 0;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,.06);
    background:
      linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px) 0 0 / 25% 100%,
      linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.06));
    overflow: hidden;
  }
  .story-track::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 7px;
    height: 1px;
    background: rgba(255,255,255,.1);
  }
  .story-spark {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 1;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--ep-color), transparent 55%));
  }
  .story-failure {
    position: absolute;
    width: 16px;
    height: 18px;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: rgba(248, 113, 113, .18);
    color: var(--accent-pink);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 0 10px rgba(248, 113, 113, .26);
  }
  .story-elevated {
    position: absolute;
    width: 10px;
    height: 10px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1.5px solid var(--accent-amber);
    background: rgba(251, 191, 36, .16);
    box-shadow: 0 0 9px rgba(251, 191, 36, .34);
  }

  .story-footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
    min-width: 0;
  }
  .story-summary,
  .story-overflow {
    margin: 0;
    min-width: 0;
    font-family: var(--mono);
    font-size: var(--ts-sm);
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .story-summary { color: var(--t1); }
  .story-overflow {
    flex: 0 0 auto;
    color: var(--t3);
  }

  @media (max-width: 1023px) {
    .storyline {
      --story-label-w: 108px;
      gap: 6px;
      padding: 10px 12px;
    }
    .storyline-hint { display: none; }
    .story-legend { gap: 4px 8px; }
    .story-axis { height: 12px; }
    .story-axis-title,
    .story-rail-label { display: none; }
    .story-axis,
    .story-rail,
    .story-row {
      grid-template-columns: var(--story-label-w) minmax(0, 1fr);
      gap: 8px;
    }
    .story-phases { height: 22px; }
    .story-row { height: 30px; }
    .story-track { height: 28px; }
    .story-footer { display: block; }
    .story-overflow { margin-top: 2px; }
  }

  @media (max-width: 767px) {
    .storyline {
      --story-label-w: 88px;
      height: 100%;
      padding: 5px 8px;
      gap: 3px;
      border-radius: 10px;
    }

    .storyline-header {
      align-items: baseline;
      min-height: 0;
    }

    .storyline-header > div {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 7px;
    }

    .storyline-title {
      flex: 0 0 auto;
      font-size: var(--ts-sm);
      white-space: nowrap;
    }

    .storyline-sub {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 8px;
      letter-spacing: .12em;
    }

    .storyline-hint,
    .story-legend,
    .story-rail,
    .story-footer {
      display: none;
    }

    .story-axis {
      display: block;
      height: 10px;
    }

    .story-axis-title {
      display: none;
    }

    .story-axis-track {
      height: 10px;
    }

    .story-axis-track::before {
      top: 5px;
    }

    .story-axis-tick {
      font-size: 8px;
    }

    .story-rows {
      gap: 1px;
      min-height: 0;
    }

    .story-row {
      --row-h: 20px;
      height: var(--row-h);
      grid-template-columns: var(--story-label-w) minmax(0, 1fr);
      gap: 6px;
      border-radius: 5px;
    }

    .story-label {
      gap: 5px;
      padding-left: 0;
    }

    .story-dot {
      width: 7px;
      height: 7px;
    }

    .story-name {
      font-size: 10px;
    }

    .story-row-time {
      display: none;
    }

    .story-track {
      height: 18px;
      border-radius: 5px;
    }

    .story-track::after {
      bottom: 4px;
    }

    .story-failure {
      width: 13px;
      height: 14px;
      border-radius: 4px;
      font-size: 9px;
    }

    .story-elevated {
      width: 8px;
      height: 8px;
    }
  }

  @media (max-width: 767px) and (max-height: 760px) {
    .storyline {
      --story-label-w: 82px;
      padding: 4px 7px;
      gap: 2px;
    }

    .storyline-title {
      font-size: 11px;
    }

    .storyline-sub,
    .story-axis-tick {
      font-size: 7px;
    }

    .story-axis,
    .story-axis-track {
      height: 9px;
    }

    .story-axis-track::before {
      top: 4px;
    }

    .story-row {
      --row-h: 17px;
      gap: 5px;
    }

    .story-track {
      height: 15px;
    }
  }
</style>
