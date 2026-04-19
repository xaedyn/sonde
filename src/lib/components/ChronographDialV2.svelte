<!-- src/lib/components/ChronographDialV2.svelte -->
<!-- Enriched Phase 2.5 dial — sibling of ChronographDial, same base geometry  -->
<!-- (rim / threshold arc / ticks / hand / orbit / pulse) plus four layers:    -->
<!--   • Baseline arc inside the tick track (where the network usually lives)  -->
<!--   • 60s quality trace inside the face                                     -->
<!--   • Within-band / above / below label below the score                    -->
<!--   • Breathing chrome — dial weights lerp between healthy and degraded     -->
<!-- Duplicates the Classic dial's scaffolding by design: per PHASE_NOTES.md   -->
<!-- Phase 2.5 policy, the two dials are sibling components gated by           -->
<!-- settings.overviewMode — not a variant branch inside one component.        -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tokens } from '$lib/tokens';
  import { VERDICT_STYLES, overviewVerdict, type OverviewVerdict } from '$lib/utils/classify';
  import { fmt } from '$lib/utils/format';
  import type { Endpoint } from '$lib/types';

  interface Baseline {
    p25: number;
    median: number;
    p75: number;
  }

  interface Props {
    score: number | null;
    liveMedian: number | null;
    threshold: number;
    endpoints: readonly Endpoint[];
    lastLatencies: Record<string, number | null>;
    /** True only after the user has explicitly stopped a previously-running test
     *  (lifecycle 'stopped' or 'completed'). 'idle' / 'starting' do not paint
     *  the PAUSED badge — there's nothing to be paused from. */
    paused: boolean;
    /** Last 60 samples of `networkQuality()`; used to draw the quality trace. */
    scoreHistory: readonly number[];
    /** Baseline latency cluster computed from ≥30 samples over last 120s;
     *  null when confidence is too low — dial hides the baseline arc. */
    baseline: Baseline | null;
  }

  let { score, liveMedian, threshold, endpoints, lastLatencies, paused, scoreHistory, baseline }: Props = $props();

  // ── Geometry constants ─────────────────────────────────────────────────────
  const SIZE = 520;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const OUTER_R = 240;
  const ORBIT_R = OUTER_R + 4;
  const BAR_INNER = ORBIT_R - 3;
  const BAR_OUTER = ORBIT_R + 3;
  const PIP_R_REST = 2.2;
  const PIP_R_OVER = 3;

  const START_ANG = -135;
  const END_ANG = 135;
  const MAX_MS = 300;

  function clamp01(t: number): number { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function latToAng(ms: number): number {
    return START_ANG + clamp01(ms / MAX_MS) * (END_ANG - START_ANG);
  }

  // SVG arc helper for the threshold zone (from threshold → MAX_MS).
  function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
    const a0 = (startDeg * Math.PI) / 180;
    const a1 = (endDeg   * Math.PI) / 180;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweep = endDeg > startDeg ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} ${sweep} ${x1} ${y1}`;
  }

  // ── Precomputed static layers ──────────────────────────────────────────────
  // Tick marks every 15ms; every 60ms is a major tick. Major/minor geometry
  // differs slightly (deeper inset + thicker stroke for major).
  interface Tick { ms: number; major: boolean; x1: number; y1: number; x2: number; y2: number; }
  const ticks: readonly Tick[] = (() => {
    const out: Tick[] = [];
    for (let ms = 0; ms <= MAX_MS; ms += 15) {
      const major = ms % 60 === 0;
      const a = (latToAng(ms) * Math.PI) / 180;
      const r1 = OUTER_R - (major ? 16 : 8);
      const r2 = OUTER_R - 2;
      out.push({
        ms,
        major,
        x1: CX + Math.cos(a) * r1, y1: CY + Math.sin(a) * r1,
        x2: CX + Math.cos(a) * r2, y2: CY + Math.sin(a) * r2,
      });
    }
    return out;
  })();

  interface Label { ms: number; x: number; y: number; }
  const NUMERIC_LABELS: readonly Label[] = [0, 60, 120, 180, 240, 300].map((ms) => {
    const a = (latToAng(ms) * Math.PI) / 180;
    const r = OUTER_R - 30;
    return { ms, x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r + 3 };
  });

  // ── Reactive derivations ───────────────────────────────────────────────────
  const threshAngDeg = $derived(latToAng(threshold));
  const threshArcD = $derived(arcPath(CX, CY, OUTER_R - 4, threshAngDeg, END_ANG));
  const verdict: OverviewVerdict = $derived(overviewVerdict(score));
  const verdictStyle = $derived(VERDICT_STYLES[verdict]);
  const overThreshold = $derived(liveMedian != null && liveMedian > threshold);
  const endpointCount = $derived(endpoints.length);
  const scoreDisplay = $derived(score == null ? '—' : String(score));

  // ── Baseline arc (Dial v2) ─────────────────────────────────────────────────
  // "Where the network usually lives." Drawn inside the tick track — its width
  // is the p25→p75 spread of the last 120s sample pool. A central tick marks
  // the median. Hidden when `baseline == null` (view gates on sample count).
  const BASELINE_R = OUTER_R - 48;
  const baselineArc = $derived.by(() => {
    if (baseline === null) return null;
    const startAng = latToAng(baseline.p25);
    const endAng = latToAng(baseline.p75);
    return {
      d: arcPath(CX, CY, BASELINE_R, startAng, endAng),
      medianAng: latToAng(baseline.median),
    };
  });
  // Small tick at the baseline's median angle, 6px long radially inward.
  const baselineMedianTick = $derived.by(() => {
    if (baselineArc === null) return null;
    const a = (baselineArc.medianAng * Math.PI) / 180;
    return {
      x1: CX + Math.cos(a) * (BASELINE_R - 3),
      y1: CY + Math.sin(a) * (BASELINE_R - 3),
      x2: CX + Math.cos(a) * (BASELINE_R + 3),
      y2: CY + Math.sin(a) * (BASELINE_R + 3),
    };
  });

  // ── 60s quality trace (Dial v2) ────────────────────────────────────────────
  // Sparkline inside the face, below the score. Score 100 at top, 0 at bottom.
  // Hidden when history is too short — calibrating label shows instead.
  const TRACE_X = CX - 70;
  const TRACE_Y = CY + 34;
  const TRACE_W = 140;
  const TRACE_H = 26;
  const TRACE_MIN_POINTS = 4;
  const qualityTraceD = $derived.by(() => {
    if (!scoreHistory || scoreHistory.length < TRACE_MIN_POINTS) return null;
    const n = scoreHistory.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = TRACE_X + (n === 1 ? TRACE_W / 2 : (i / (n - 1)) * TRACE_W);
      const s = Math.max(0, Math.min(100, scoreHistory[i]));
      const y = TRACE_Y + (TRACE_H - (s / 100) * (TRACE_H - 2) - 1);
      d += (i === 0 ? 'M ' : 'L ') + `${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d.trim();
  });
  // Dynamic trace color, synced to the current score's verdict tone.
  const traceColor = $derived.by(() => {
    if (score == null) return 'var(--t4)';
    if (score >= 70) return 'var(--accent-green)';
    if (score >= 45) return 'var(--accent-amber)';
    return 'var(--accent-pink)';
  });

  // ── Within-band label (Dial v2) ────────────────────────────────────────────
  type BandLabel = 'WITHIN BAND' | 'ABOVE BAND' | 'BELOW BAND' | null;
  const bandLabel: BandLabel = $derived.by(() => {
    if (baseline === null || liveMedian == null) return null;
    if (liveMedian >= baseline.p25 && liveMedian <= baseline.p75) return 'WITHIN BAND';
    if (liveMedian > baseline.p75) return 'ABOVE BAND';
    return 'BELOW BAND';
  });
  const bandLabelColor = $derived.by(() => {
    if (bandLabel === 'WITHIN BAND') return 'var(--accent-green)';
    if (bandLabel === 'ABOVE BAND')  return 'var(--accent-amber)';
    return 'var(--t4)';
  });

  // ── Breathing chrome (Dial v2) ─────────────────────────────────────────────
  // Weight scalar: 0 when healthy (score ≥ 70), 1 when degraded (score < 45),
  // linearly interpolated across the [45, 70] band. Drives stroke opacity,
  // tick weight, label opacity, and score weight via CSS custom properties so
  // the whole dial "breathes" on score changes without per-element animation.
  const breatheWeight = $derived.by(() => {
    if (score == null) return 0;
    const s = Math.max(45, Math.min(70, score));
    return (70 - s) / 25;
  });
  const breatheVars = $derived.by(() => {
    const w = breatheWeight;
    return {
      '--ring-opacity':   String(0.14 + w * 0.18),
      '--face-stroke':    `${1.2 + w * 1.0}px`,
      '--tick-minor-op':  String(0.55 + w * 0.23),
      '--tick-major-op':  String(0.72 + w * 0.13),
      '--label-op':       String(0.42 + w * 0.26),
      '--score-weight':   String(Math.round(500 + w * 200)),
    } as Record<string, string>;
  });

  // ── prefers-reduced-motion (live-listened) ────────────────────────────────
  // OS toggle can flip while the app is open, so a one-shot read is wrong;
  // listen and re-render. SSR-safe via the typeof window guard. Declared
  // before the rAF effect + SVG <animate> gate because both read it.
  let prefersReducedMotion = $state(false);
  $effect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = mq.matches;
    const handler = (e: MediaQueryListEvent): void => { prefersReducedMotion = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  // ── Live hand: rAF lerp toward the target angle ────────────────────────────
  const targetAng = $derived(latToAng(liveMedian ?? 0));
  let displayAng = $state(targetAng);
  let rafId: number | null = null;

  $effect(() => {
    const target = targetAng;
    const lerp = tokens.timing.handLerp;
    // Reduced-motion users get the target snap — no smooth lerp. Covers the
    // third motion surface alongside the CSS rim pulse and the SVG <animate>
    // pip ring.
    if (prefersReducedMotion) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      displayAng = target;
      return;
    }
    const stepFn = (): void => {
      const diff = target - displayAng;
      if (Math.abs(diff) < 0.1) {
        displayAng = target;
        rafId = null;
        return;
      }
      displayAng = displayAng + diff * lerp;
      rafId = requestAnimationFrame(stepFn);
    };
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(stepFn);
    return () => { if (rafId !== null) cancelAnimationFrame(rafId); rafId = null; };
  });

  // ── Threshold-cross effects (rim pulse + SR announcement) ────────────────
  // Single $effect — sibling effects on the same `wasOver` flag race in Svelte
  // 5: one writes wasOver=true before the other reads !wasOver, dropping the
  // announcement. Cleanup also moves to onDestroy so per-rerun cleanup doesn't
  // cancel the pending timer when overThreshold flips back-and-forth (which
  // would otherwise leave `pulsing` or `crossingAnnouncement` permanently set).
  let pulsing = $state(false);
  let crossingAnnouncement = $state('');
  let wasOver = false;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  let announceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const over = overThreshold;
    const median = liveMedian;
    const t = threshold;
    if (over && !wasOver) {
      // Rim pulse — window matches the CSS keyframe duration (--timing-pulse-dial-glow)
      // so the `pulsing` class drops off exactly when the animation completes.
      pulsing = true;
      if (pulseTimer !== null) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => { pulsing = false; pulseTimer = null; }, tokens.timing.pulseDialGlow);

      // SR announcement — cleared after a short dwell so it doesn't linger.
      const msg = median == null
        ? 'Median latency crossed threshold.'
        : `Median latency crossed threshold — now ${Math.round(median)}ms, threshold ${t}ms.`;
      crossingAnnouncement = msg;
      if (announceTimer !== null) clearTimeout(announceTimer);
      announceTimer = setTimeout(() => { crossingAnnouncement = ''; announceTimer = null; }, 2000);
    }
    wasOver = over;
  });

  onDestroy(() => {
    if (pulseTimer !== null) clearTimeout(pulseTimer);
    if (announceTimer !== null) clearTimeout(announceTimer);
  });

  // ── Hand geometry ──────────────────────────────────────────────────────────
  const handTip = $derived.by(() => {
    const a = (displayAng * Math.PI) / 180;
    const tipR = OUTER_R - 10;
    const tailR = 24;
    return {
      x1: CX - Math.cos(a) * tailR,
      y1: CY - Math.sin(a) * tailR,
      x2: CX + Math.cos(a) * tipR,
      y2: CY + Math.sin(a) * tipR,
    };
  });

  // ── Orbit markers ──────────────────────────────────────────────────────────
  interface OrbitMarker { id: string; color: string; x1: number; y1: number; x2: number; y2: number; pipX: number; pipY: number; over: boolean; }
  const orbitMarkers: readonly OrbitMarker[] = $derived.by(() => {
    const result: OrbitMarker[] = [];
    for (const ep of endpoints) {
      const lat = lastLatencies[ep.id];
      if (lat == null || !Number.isFinite(lat)) continue;
      const a = (latToAng(lat) * Math.PI) / 180;
      const over = lat > threshold;
      result.push({
        id: ep.id,
        color: ep.color || tokens.color.endpoint[0],
        x1: CX + Math.cos(a) * BAR_INNER,
        y1: CY + Math.sin(a) * BAR_INNER,
        x2: CX + Math.cos(a) * BAR_OUTER,
        y2: CY + Math.sin(a) * BAR_OUTER,
        pipX: CX + Math.cos(a) * (BAR_OUTER + 4),
        pipY: CY + Math.sin(a) * (BAR_OUTER + 4),
        over,
      });
    }
    return result;
  });

  // ── Accessibility label ────────────────────────────────────────────────────
  const ariaLabel = $derived.by(() => {
    const scorePart = score == null ? 'no data' : `${score} percent healthy`;
    const medianPart = liveMedian == null ? 'unknown median' : `median ${Math.round(liveMedian)} milliseconds`;
    const countPart = `${endpointCount} endpoint${endpointCount === 1 ? '' : 's'} monitored`;
    const bandPart = bandLabel === null
      ? ''
      : `, ${bandLabel === 'WITHIN BAND' ? 'within normal range' : bandLabel === 'ABOVE BAND' ? 'above normal range' : 'below normal range'}`;
    return `Network health dial — ${scorePart}, ${medianPart}${bandPart}, ${countPart}.`;
  });
</script>

<div class="dial-wrap" class:paused>
  <svg
    class="dial"
    class:pulsing
    viewBox="0 0 {SIZE} {SIZE}"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label={ariaLabel}
    style={Object.entries(breatheVars).map(([k, v]) => `${k}:${v}`).join(';')}
  >
      <defs>
        <radialGradient id="dial-face-bg" cx="50%" cy="40%">
          <stop offset="0%"   stop-color="var(--surface-raised)" />
          <stop offset="60%"  stop-color="var(--bg-base)" />
          <stop offset="100%" stop-color="#030207" />
        </radialGradient>
        <filter id="dial-hand-glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <!-- 1. Outer structural hairline. -->
      <circle cx={CX} cy={CY} r={OUTER_R + 8} fill="none" stroke="var(--border-mid)" stroke-width="1" />

      <!-- 2. Dial face with a radial fill for depth. -->
      <circle cx={CX} cy={CY} r={OUTER_R} fill="url(#dial-face-bg)"
              stroke="var(--svg-dial-rim)" stroke-width="1" />

      <!-- 3. Inner rim — stroke swaps to verdict color while pulsing. -->
      <circle cx={CX} cy={CY} r={OUTER_R - 4} fill="none"
              stroke={pulsing ? verdictStyle.color : 'var(--svg-grid-major)'}
              stroke-width={pulsing ? 2 : 1}
              style:transition="stroke var(--timing-pulse-rim, 400ms) ease" />

      <!-- 4. Decorative concentric guides. -->
      <circle cx={CX} cy={CY} r={OUTER_R - 36} fill="none" stroke="var(--svg-grid-cyan)" stroke-width="0.5" />
      <circle cx={CX} cy={CY} r={60}           fill="none" stroke="var(--svg-grid-cyan)" stroke-width="0.5" />

      <!-- 4a (v2). Baseline arc — "where the network usually lives". Hidden
           when baseline is null (sample count < 30). Decorative, no role. -->
      {#if baselineArc !== null}
        <g aria-hidden="true">
          <path
            d={baselineArc.d}
            fill="none"
            stroke="rgba(255,255,255,.07)"
            stroke-width="14"
            stroke-linecap="round"
          />
          {#if baselineMedianTick !== null}
            <line
              x1={baselineMedianTick.x1} y1={baselineMedianTick.y1}
              x2={baselineMedianTick.x2} y2={baselineMedianTick.y2}
              stroke="rgba(255,255,255,.14)" stroke-width="1.5" stroke-linecap="round"
            />
          {/if}
        </g>
      {/if}

      <!-- 5. Threshold arc (over-threshold zone). -->
      <path d={threshArcD} fill="none" stroke="var(--svg-threshold)" stroke-width="2" stroke-linecap="round" />

      <!-- 6. Tick marks. -->
      {#each ticks as t (t.ms)}
        <line
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={t.major ? 'var(--svg-tick-major)' : 'var(--svg-tick-minor)'}
          stroke-width={t.major ? 1.3 : 0.8}
        />
      {/each}

      <!-- 7. Numeric labels. -->
      {#each NUMERIC_LABELS as l (l.ms)}
        <text
          x={l.x} y={l.y}
          text-anchor="middle"
          font-size="10"
          font-family={tokens.typography.mono.fontFamily}
          fill="var(--t3)"
          letter-spacing="0.1em"
        >{l.ms}</text>
      {/each}

      <!-- 8. Center readouts. Kicker / score / verdict / live-median. -->
      <text x={CX} y={CY - 94} text-anchor="middle" font-size="10"
            font-family={tokens.typography.mono.fontFamily} fill="var(--t3)" letter-spacing="0.3em">QUALITY</text>
      <text x={CX} y={CY - 8} text-anchor="middle" font-size="120" font-weight="200"
            fill="var(--t1)" font-family={tokens.typography.sans.fontFamily}
            style="letter-spacing: -0.05em; font-variant-numeric: tabular-nums;">{scoreDisplay}</text>
      <text x={CX} y={CY + 38} text-anchor="middle" font-size="11"
            font-family={tokens.typography.mono.fontFamily} fill={verdictStyle.color} letter-spacing="0.28em">
        {verdictStyle.kicker}
      </text>
      <text x={CX} y={CY + 64} text-anchor="middle" font-size="10"
            font-family={tokens.typography.mono.fontFamily} fill="var(--t4)" letter-spacing="0.18em">
        LIVE {fmt(liveMedian).toUpperCase()} · {endpointCount} {endpointCount === 1 ? 'LINK' : 'LINKS'}
      </text>

      <!-- 8a (v2). 60s quality trace inside the face. Decorative — the numeric
           score + verdict kicker carry the primary meaning for SR users. -->
      {#if qualityTraceD !== null}
        <g aria-hidden="true">
          <path
            d={qualityTraceD}
            fill="none"
            stroke={traceColor}
            stroke-width="1.4"
            stroke-linejoin="round"
            stroke-linecap="round"
            opacity="0.9"
          />
        </g>
      {:else if scoreHistory && scoreHistory.length > 0}
        <text
          x={CX} y={TRACE_Y + TRACE_H / 2 + 4}
          text-anchor="middle" font-size="9"
          font-family={tokens.typography.mono.fontFamily}
          fill="var(--t4)" letter-spacing="0.18em"
          aria-hidden="true"
        >CALIBRATING</text>
      {/if}

      <!-- 8b (v2). Within-band / above / below label. Informative — included
           in the dial's aria-label via `bandLabel`. -->
      {#if bandLabel !== null}
        <text
          x={CX} y={CY + 86}
          text-anchor="middle" font-size="10"
          font-family={tokens.typography.mono.fontFamily}
          fill={bandLabelColor} letter-spacing="0.14em"
        >{bandLabel}</text>
      {/if}

      <!-- 9. Endpoint orbit ring. -->
      <g aria-hidden="true">
        <circle cx={CX} cy={CY} r={ORBIT_R} fill="none" stroke="var(--svg-orbit-track)" stroke-width="6" />
        <circle cx={CX} cy={CY} r={ORBIT_R} fill="none" stroke="var(--svg-orbit-edge)"  stroke-width="0.8" />
        {#each orbitMarkers as m (m.id)}
          <g>
            <line
              x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2}
              stroke={m.color} stroke-width="2.5" stroke-linecap="round"
              opacity={m.over ? 1 : 0.9}
            />
            <circle
              cx={m.pipX} cy={m.pipY}
              r={m.over ? PIP_R_OVER : PIP_R_REST}
              fill={m.color}
              stroke={m.over ? 'var(--accent-pink-glow)' : 'var(--bg-base)'}
              stroke-width={m.over ? 2 : 0.5}
            >
              {#if m.over && !prefersReducedMotion}
                <animate attributeName="r" values="{PIP_R_OVER};{PIP_R_OVER + 1.5};{PIP_R_OVER}" dur="1.4s" repeatCount="indefinite" />
              {/if}
            </circle>
          </g>
        {/each}
      </g>

      <!-- 10. Hand — white stroke with a glow filter, interpolated via rAF lerp. -->
      <g>
        <line x1={handTip.x1} y1={handTip.y1} x2={handTip.x2} y2={handTip.y2}
              stroke="var(--svg-hand-stroke)" stroke-width="2.2" stroke-linecap="round"
              filter="url(#dial-hand-glow)" />
      </g>

      <!-- 11. Central hub. -->
      <circle cx={CX} cy={CY} r="8" fill="var(--bg-base)" stroke="var(--border-bright)" stroke-width="1" />
      <circle cx={CX} cy={CY} r="2.5" fill="var(--t1)" />
    </svg>

  <div class="dial-announcer" role="status" aria-live="polite" aria-atomic="true">
    {crossingAnnouncement}
  </div>

  {#if paused}
    <span class="paused-badge" aria-hidden="true">PAUSED</span>
  {/if}
</div>

<style>
  .dial-wrap {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px 0;
  }

  /* Register the breathing-chrome custom properties so transitions can animate
     them. Without @property the browser treats custom props as untyped strings
     and snaps between values. Falls back to unanimated snaps on older browsers. */
  @property --ring-opacity {
    syntax: '<number>';
    initial-value: 0.14;
    inherits: true;
  }
  @property --face-stroke {
    syntax: '<length>';
    initial-value: 1.2px;
    inherits: true;
  }
  @property --tick-minor-op {
    syntax: '<number>';
    initial-value: 0.55;
    inherits: true;
  }
  @property --tick-major-op {
    syntax: '<number>';
    initial-value: 0.72;
    inherits: true;
  }
  @property --label-op {
    syntax: '<number>';
    initial-value: 0.42;
    inherits: true;
  }
  @property --score-weight {
    syntax: '<number>';
    initial-value: 500;
    inherits: true;
  }

  .dial {
    width: 100%;
    max-width: min(520px, 80vw);
    height: auto;
    display: block;
    /* Breathing chrome — all five transitions run in parallel. Subtle by
       design; if visibly "pulsing", amplitude is wrong, not timing. */
    transition:
      --ring-opacity 900ms ease,
      --face-stroke  900ms ease,
      --tick-minor-op 900ms ease,
      --tick-major-op 900ms ease,
      --label-op     900ms ease,
      --score-weight 900ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .dial { transition: none; }
  }

  /* One-shot drop-shadow flash when the aggregate median crosses the health
     threshold. Driven by the component's `pulsing` signal, cleared after
     --timing-pulse-dial-glow ms — same token as the JS setTimeout so the
     class and the keyframe can't drift apart. */
  .dial.pulsing {
    animation: dialPulse var(--timing-pulse-dial-glow, 900ms) ease-out;
  }
  @keyframes dialPulse {
    0%   { filter: drop-shadow(0 0 0    var(--accent-pink-glow)); }
    30%  { filter: drop-shadow(0 0 24px var(--accent-pink-glow)); }
    100% { filter: drop-shadow(0 0 0    var(--accent-pink-glow)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .dial.pulsing { animation: none; }
  }

  .paused-badge {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    padding: 3px 10px;
    border: 1px solid var(--border-mid);
    border-radius: 3px;
    text-transform: uppercase;
  }

  .dial-announcer {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap; border: 0;
  }
</style>
