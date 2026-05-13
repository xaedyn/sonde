# Run Storyline Design

## Purpose

Chronoscope should make the recent run history immediately understandable without copying the visual language of `s80`. The new surface should answer: what changed, when did it change, which endpoints were involved, and what evidence supports that reading.

The feature replaces the main Status view's `Recent events` card with a compact `What happened` card. It keeps the current Chronoscope layout, dial, comparison card, typography, density, and restrained technical aesthetic.

## Product Goal

The Status view should give a first-time user a fast, trustworthy read of the run:

- Whether the connection currently looks clean, degraded, or poor.
- Whether the recent issue was isolated to one endpoint or shared across paths.
- When a slowdown, failure, or recovery happened.
- What evidence Chronoscope has, without guessing root cause.

The experience should feel like Chronoscope becoming clearer, not like a redesigned product.

## Non-Goals

- Do not add a new top-level History view in this phase.
- Do not redesign the Status layout.
- Do not claim ISP, WiFi, DNS, or server root cause from browser-only evidence.
- Do not include private local companion history in shared/public output.
- Do not make the page taller or reintroduce Status scrolling.

## User Experience

The lower-right Status card changes from `Recent events` to `What happened`.

The card contains:

1. A compact story rail across the top.
   - The rail shows the recent run as phases over time.
   - Example phases: `steady`, `AWS slow`, `failures`, `recovered`, `collecting`.
   - Phase labels should be short and placed directly on or near the rail.

2. Endpoint micro-trace rows.
   - One row per monitored endpoint.
   - Rows share the same time axis as the story rail.
   - Each row renders a tiny waveform/sparkline, not blocky status pips.
   - Normal latency stays visually flat.
   - Spikes rise visibly.
   - Failed samples create a small failure marker.
   - Missing or unknown samples create a muted break, not a scary state.

3. Event alignment markers.
   - Important moments are marked with tiny vertical ticks that line up across the story rail and endpoint traces.
   - Markers represent observable events: slowdown, failure, recovery, broad correlation, or not-enough-data transition.

4. A plain-language summary line.
   - The sentence should describe the observed pattern.
   - Examples:
     - `AWS slowed briefly; the other paths stayed clean.`
     - `Multiple paths slowed together, then recovered.`
     - `Fastly had failed requests; the other paths stayed reachable.`
     - `Still collecting enough samples to show a reliable timeline.`

5. A compact drill affordance.
   - Example: `Click a moment -> Diagnose`.
   - Clicking a row or marker focuses the endpoint and routes to Diagnose or Live with existing store/navigation behavior.

## Visual Direction

The card must match the current Chronoscope aesthetic:

- Same glass-card treatment, border, radius, spacing, and restrained color use as `RacingStrip` and `EventFeed`.
- Mono labels and tabular numbers where useful.
- Existing endpoint colors should carry identity.
- Status colors must be limited and evidence-based:
  - Clean/normal: muted green or endpoint color at low intensity.
  - Slow/degraded: amber or pink depending on existing severity conventions.
  - Failed: small red/pink marker, not a full-row alarm unless repeated.
  - Unknown/collecting: muted gray.
- The card should fit in the same approximate footprint as the current event feed.
- No new decorative background treatment.
- No large explanatory text block.

## Data Model

The implementation should derive the card from existing browser samples:

- `samplesByEndpoint`
- endpoint metadata
- threshold
- current diagnostic narrative where appropriate
- current run timing

Introduce a pure utility that converts endpoint samples into a compact timeline model.

Suggested model:

```ts
interface RunStoryline {
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly phases: readonly StoryPhase[];
  readonly rows: readonly EndpointTimelineRow[];
  readonly markers: readonly StoryMarker[];
  readonly summary: string;
  readonly confidence: 'collecting' | 'low' | 'medium' | 'high';
}

interface StoryPhase {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly kind: 'collecting' | 'steady' | 'isolated-slow' | 'shared-slow' | 'failure' | 'recovered';
}

interface EndpointTimelineRow {
  readonly endpointId: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly TimelinePoint[];
}

interface TimelinePoint {
  readonly t: number;
  readonly normalizedLatency: number | null;
  readonly status: 'ok' | 'slow' | 'failed' | 'unknown';
}

interface StoryMarker {
  readonly t: number;
  readonly endpointId?: string;
  readonly kind: 'slowdown' | 'failure' | 'recovery' | 'shared-change';
  readonly label: string;
}
```

The exact type names can change during implementation, but the boundary should stay pure and testable.

## Derivation Rules

The first version should stay conservative.

- Use the current run window only.
- Use the most recent bounded sample window, matching the product's existing short-run behavior.
- Mark a sample as slow only when it crosses the configured threshold or a clearly established run-relative spike rule.
- Treat failed/error/timeout samples separately from slow samples.
- Identify isolated slowdown when one endpoint worsens while most ready endpoints remain normal.
- Identify shared slowdown only when multiple ready endpoints worsen in the same time region.
- Use `collecting` until there are enough samples to avoid over-reading noise.
- Prefer saying `slowed`, `failed`, `recovered`, or `stayed clean` over diagnosis language such as `ISP`, `WiFi`, `DNS`, or `server issue`.

## Interaction

Clicking an endpoint row should focus that endpoint and route to Live or Diagnose using the existing interaction pattern.

Clicking a marker should:

- Focus the related endpoint when there is one.
- Route to Diagnose when deeper evidence is useful.
- Preserve current keyboard accessibility expectations.

Hover or focus may show a compact tooltip:

`3:42 PM · AWS slow · 4 samples · others normal`

The tooltip must be optional enhancement. The broad story should be understandable without hover.

## Empty And Edge States

- No samples: `Start test to build the run timeline.`
- Too few samples: `Collecting enough samples to show what changed.`
- No events: show flat traces and summary `No meaningful changes in the current window.`
- All endpoints disabled or unready: use existing endpoint readiness language where possible.
- Paused run: keep the last timeline visible and indicate that it is paused only if the surrounding UI does not already make that clear.

## Accessibility

- The card needs an accessible label such as `Recent run timeline`.
- Rows should expose endpoint name and short status summary.
- Markers should be keyboard-focusable only if they perform an action.
- SVG traces should be `aria-hidden` when equivalent text is provided.
- Color cannot be the only signal: marker shape, row labels, and summary text must carry meaning.

## Testing

Unit tests should cover the pure derivation utility:

- Flat clean run creates a steady phase and clean summary.
- One endpoint spike creates isolated slowdown language.
- Multiple endpoint spikes in the same window create shared slowdown language.
- Failed samples create failure markers without being treated as latency spikes.
- Recovery is detected after a slowdown returns to normal.
- Too few samples creates collecting state.
- Unknown/missing samples create muted gaps.

Component tests should cover:

- The card renders endpoint rows and story rail.
- Empty and collecting states are readable.
- Clicking a row calls the drill handler with the correct endpoint.
- The component fits the existing Status right-column footprint.

Visual tests should cover:

- Desktop Status view remains above the fold.
- Small desktop height does not push the dial off-screen.
- Mobile layout remains scroll-safe and does not hide timeline content behind fixed controls.

## Implementation Notes

Likely files:

- `src/lib/utils/run-storyline.ts`
- `src/lib/components/RunStorylineCard.svelte`
- `src/lib/components/OverviewView.svelte`
- `tests/unit/run-storyline.test.ts`
- Status visual tests in `tests/visual/`

The new card can initially replace `EventFeed` in `OverviewView`. Existing event derivation may be reused or folded into the new pure utility if doing so reduces duplication.

## Success Criteria

- A first-time user can glance at Status and understand what happened over the last few minutes.
- The feature is visibly Chronoscope-native and does not feel like a new design system.
- The feature explains correlation better than `s80` without copying its visual form.
- All claims are evidence-bound and avoid unsupported root-cause diagnosis.
- The main page remains stable, compact, and non-scrolling on target desktop layouts.
