<!-- src/lib/components/NetworkTopology.svelte -->
<!-- Per the synthesis design contract Section 2: Overview right column.       -->
<!-- Spatial visualization of what is actually being measured — browser node    -->
<!-- on the left, one endpoint node per monitored endpoint on the right,        -->
<!-- connecting path lines, animated pulse packets driven by REAL measurement   -->
<!-- round events (not setInterval(Math.random) like the v2 prototype).         -->
<script lang="ts">
  import { measurementStore } from '$lib/stores/measurements';
  import { monitoredEndpointsStore } from '$lib/stores/derived';
  import { statisticsStore } from '$lib/stores/statistics';
  import { settingsStore } from '$lib/stores/settings';
  import { uiStore } from '$lib/stores/ui';
  import { navigateTo } from '$lib/router';
  import { deriveEndpointTone, type EndpointTone } from '$lib/utils/endpoint-tone';

  // Layout grid (SVG viewBox is unitless — these are abstract design units).
  const VIEWBOX_WIDTH = 320;
  const VIEWBOX_HEIGHT = 260;
  const ORIGIN_X = 50;
  const ORIGIN_Y = VIEWBOX_HEIGHT / 2;
  const ENDPOINT_X = 250;
  const NODE_RADIUS = 14;

  const monitored = $derived($monitoredEndpointsStore);
  const stats = $derived($statisticsStore);
  const measurements = $derived($measurementStore);
  const threshold = $derived($settingsStore.healthThreshold);

  // Pulse state — keyed by endpoint id, holds a monotonic counter that
  // increments when a new successful sample arrives for that endpoint.
  // CSS animation re-runs by binding the counter to a `key` attribute on
  // the pulse element (the new key forces Svelte to recreate the node).
  let pulseKeys = $state<Record<string, number>>({});
  let lastSampleCounts: Record<string, number> = {};

  // Watch per-endpoint sample counts and emit a pulse on increment.
  // This is the "real cadence driven by measurement events" the spec
  // requires — no setInterval, no Math.random.
  $effect(() => {
    for (const ep of monitored) {
      const state = measurements.endpoints[ep.id];
      const count = state?.samples.toArray().length ?? 0;
      const prev = lastSampleCounts[ep.id] ?? 0;
      if (count > prev) {
        pulseKeys = { ...pulseKeys, [ep.id]: (pulseKeys[ep.id] ?? 0) + 1 };
      }
      lastSampleCounts[ep.id] = count;
    }
  });

  interface Node {
    readonly endpoint: { id: string; label: string };
    readonly tone: EndpointTone;
    readonly x: number;
    readonly y: number;
  }

  // Endpoint layout — simple vertical column at ENDPOINT_X, evenly spaced.
  // Works without label collision for 1-8 endpoints (the common case). For
  // >8 endpoints, a compact-grid + "+N more" treatment is deferred to a
  // follow-up; current behavior caps at 8 visible nodes.
  const MAX_VISIBLE_NODES = 8;
  const nodes: readonly Node[] = $derived.by(() => {
    const visible = monitored.slice(0, MAX_VISIBLE_NODES);
    const n = visible.length;
    if (n === 0) return [];
    const usableHeight = VIEWBOX_HEIGHT - 60;
    const step = n === 1 ? 0 : usableHeight / (n - 1);
    const topY = n === 1 ? VIEWBOX_HEIGHT / 2 : 30;
    return visible.map((ep, i) => ({
      endpoint: { id: ep.id, label: ep.label },
      tone: deriveEndpointTone({
        stats: stats[ep.id] ?? null,
        lastStatus: measurements.endpoints[ep.id]?.lastStatus ?? null,
        healthThreshold: threshold,
      }),
      x: ENDPOINT_X,
      y: topY + step * i,
    }));
  });

  const overflowCount = $derived(Math.max(0, monitored.length - MAX_VISIBLE_NODES));

  function handleEndpointClick(endpointId: string): void {
    navigateTo({ name: 'endpoint', endpointId });
  }

  function handleAddEndpoint(): void {
    uiStore.toggleEndpoints();
  }
</script>

{#if monitored.length === 0}
  <div class="network-topology network-topology-empty" aria-label="Network topology — no endpoints">
    <p class="empty-headline">No endpoints to map yet</p>
    <p class="empty-detail">Add an endpoint to see your network map.</p>
    <button type="button" class="empty-cta" onclick={handleAddEndpoint}>
      Add endpoint
    </button>
  </div>
{:else}
  <div class="network-topology" aria-label="Network topology — browser to {monitored.length} endpoints">
    <svg
      class="topology-svg"
      viewBox="0 0 {VIEWBOX_WIDTH} {VIEWBOX_HEIGHT}"
      role="img"
      aria-hidden="true"
    >
      <!-- Connecting path lines (origin → each endpoint) -->
      {#each nodes as node (node.endpoint.id)}
        <line
          class="topology-path"
          x1={ORIGIN_X}
          y1={ORIGIN_Y}
          x2={node.x}
          y2={node.y}
          stroke-width="1"
        />
      {/each}

      <!-- Pulse packets — re-rendered when pulseKeys[ep.id] increments.
           cx/cy are set to the ORIGIN position; the animation translates the
           element via CSS transform (which IS reliably animatable on SVG,
           unlike CSS animation of SVG `cx`/`cy` attributes which silently
           strands the element). The translate distance is the delta from
           origin to endpoint, passed via --pulse-dx/--pulse-dy. -->
      {#each nodes as node (node.endpoint.id)}
        {#if pulseKeys[node.endpoint.id]}
          {#key pulseKeys[node.endpoint.id]}
            <circle
              class="topology-pulse"
              data-tone={node.tone}
              cx={ORIGIN_X}
              cy={ORIGIN_Y}
              r="3.5"
              style:--pulse-dx="{node.x - ORIGIN_X}px"
              style:--pulse-dy="{node.y - ORIGIN_Y}px"
            />
          {/key}
        {/if}
      {/each}

      <!-- Origin (browser) node -->
      <g class="topology-node-group" data-role="origin">
        <circle class="topology-node" cx={ORIGIN_X} cy={ORIGIN_Y} r={NODE_RADIUS} />
        <text class="topology-label" x={ORIGIN_X} y={ORIGIN_Y + NODE_RADIUS + 16} text-anchor="middle">
          BROWSER
        </text>
      </g>

      <!-- Endpoint nodes -->
      {#each nodes as node (node.endpoint.id)}
        <g
          class="topology-node-group topology-node-clickable"
          data-tone={node.tone}
          data-endpoint-id={node.endpoint.id}
          role="button"
          tabindex="0"
          aria-label="View {node.endpoint.label} details"
          onclick={() => handleEndpointClick(node.endpoint.id)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleEndpointClick(node.endpoint.id);
            }
          }}
        >
          <circle
            class="topology-node"
            cx={node.x}
            cy={node.y}
            r={NODE_RADIUS}
          />
          <text
            class="topology-label"
            x={node.x}
            y={node.y + NODE_RADIUS + 16}
            text-anchor="middle"
          >
            {node.endpoint.label.slice(0, 16)}
          </text>
        </g>
      {/each}
    </svg>

    {#if overflowCount > 0}
      <p class="topology-overflow" role="note">
        +{overflowCount} more endpoint{overflowCount === 1 ? '' : 's'} not shown
      </p>
    {/if}
  </div>
{/if}

<style>
  .network-topology {
    width: 100%;
    height: 100%;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    padding: 16px;
    border: 1px solid var(--shell-border);
    border-radius: 18px;
    background: var(--shell-panel);
  }

  .topology-svg {
    width: 100%;
    height: 100%;
    max-height: 280px;
    overflow: visible;
  }

  /* Path lines — brighter than the prior shell-divider tone so the
     spatial structure reads at a glance against the dark panel. */
  .topology-path {
    stroke: var(--shell-border-strong);
    fill: none;
    stroke-width: 1.2;
  }

  /* Nodes — filled (slightly darker than the panel background so the
     coloured stroke pops), thicker stroke, and a tone-coloured drop
     shadow / glow halo so each endpoint has presence rather than reading
     as a wireframe placeholder. */
  .topology-node {
    fill: var(--shell-base);
    stroke-width: 2.5;
    transition: stroke 200ms ease, fill 200ms ease;
  }
  [data-role='origin'] .topology-node {
    stroke: var(--t2);
  }
  [data-tone='good'] .topology-node {
    stroke: var(--accent-green);
    filter: drop-shadow(0 0 6px var(--accent-green));
  }
  [data-tone='watch'] .topology-node {
    stroke: var(--accent-amber);
    filter: drop-shadow(0 0 6px var(--accent-amber));
  }
  [data-tone='bad'] .topology-node {
    stroke: var(--accent-pink);
    filter: drop-shadow(0 0 8px var(--accent-pink));
  }
  [data-tone='collecting'] .topology-node {
    stroke: var(--accent-cyan);
    filter: drop-shadow(0 0 6px var(--accent-cyan));
  }

  .topology-node-clickable {
    cursor: pointer;
  }
  .topology-node-clickable:hover .topology-node,
  .topology-node-clickable:focus-visible .topology-node {
    fill: var(--shell-panel-hover);
  }
  .topology-node-clickable:focus-visible {
    outline: none;
  }
  .topology-node-clickable:focus-visible .topology-node {
    stroke-width: 3.5;
  }

  /* Labels — bumped contrast (was --t3 = .5 alpha, barely readable;
     --t2 = .58 still calm but legible). */
  .topology-label {
    fill: var(--t2);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
    pointer-events: none;
  }
  [data-tone='good'] .topology-label,
  [data-tone='watch'] .topology-label,
  [data-tone='bad'] .topology-label,
  [data-tone='collecting'] .topology-label {
    fill: var(--t1);
  }

  /* Pulse packets — animate via CSS transform: translate (which IS
     reliably animatable on SVG elements). The earlier implementation used
     CSS keyframes on the SVG `cx`/`cy` attributes, which Chrome accepts
     syntactically but renders inconsistently and frequently strands the
     element mid-path. The new approach: render the circle at the origin
     coordinates (cx=ORIGIN_X, cy=ORIGIN_Y) and animate transform: translate
     by --pulse-dx / --pulse-dy (the delta to the endpoint). */
  .topology-pulse {
    animation: pulse-travel 1.2s ease-out forwards;
    pointer-events: none;
    transform-box: fill-box;
  }
  [data-tone='good'].topology-pulse { fill: var(--accent-green); }
  [data-tone='watch'].topology-pulse { fill: var(--accent-amber); }
  [data-tone='bad'].topology-pulse { fill: var(--accent-pink); }
  [data-tone='collecting'].topology-pulse { fill: var(--accent-cyan); }

  @keyframes pulse-travel {
    0%   { transform: translate(0, 0);                            opacity: 0; }
    20%  { transform: translate(calc(var(--pulse-dx) * 0.2), calc(var(--pulse-dy) * 0.2)); opacity: 1; }
    80%  { transform: translate(calc(var(--pulse-dx) * 0.8), calc(var(--pulse-dy) * 0.8)); opacity: 1; }
    100% { transform: translate(var(--pulse-dx), var(--pulse-dy));  opacity: 0; }
  }

  .network-topology-empty {
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
  }
  .empty-headline {
    margin: 0;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--ts-base);
    font-weight: 700;
  }
  .empty-detail {
    margin: 0;
    color: var(--t3);
    font-family: var(--sans);
    font-size: var(--ts-sm);
  }
  .empty-cta {
    margin-top: 8px;
    min-height: 36px;
    padding: 0 16px;
    border: 1px solid var(--shell-border-strong);
    background: var(--shell-bg-cyan);
    color: var(--accent-cyan);
    font-family: var(--sans);
    font-size: var(--ts-sm);
    font-weight: 700;
    cursor: pointer;
    border-radius: 8px;
  }
  .empty-cta:hover { background: var(--shell-panel-hover); }

  .topology-overflow {
    margin: 8px 0 0;
    color: var(--t4);
    font-family: var(--mono);
    font-size: 10px;
    text-align: center;
    letter-spacing: var(--tr-label);
    text-transform: uppercase;
  }

  @media (prefers-reduced-motion: reduce) {
    .topology-pulse { animation: none; opacity: 0; }
    .topology-node { transition: none; }
  }
</style>
