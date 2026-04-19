<!-- src/lib/components/ChronographDial.svelte -->
<!-- v2 Overview hero. Minimal 520×520 analog dial — fixed geometry, live hand -->
<!-- with rAF lerp interpolation, endpoint orbit ring outside the scale, and a -->
<!-- rim pulse when the aggregate median crosses the health threshold.         -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tokens } from '$lib/tokens';
  import { VERDICT_STYLES, overviewVerdict, type OverviewVerdict } from '$lib/utils/classify';
  import { fmt } from '$lib/utils/format';
  import type { Endpoint } from '$lib/types';

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
  }

  let { score, liveMedian, threshold, endpoints, lastLatencies, paused }: Props = $props();

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
      // Rim pulse — give the CSS animation a buffer beyond the rim swap window.
      pulsing = true;
      if (pulseTimer !== null) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => { pulsing = false; pulseTimer = null; }, tokens.timing.pulseRim + 500);

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

  // ── prefers-reduced-motion (live-listened) ────────────────────────────────
  // OS toggle can flip while the app is open, so a one-shot read is wrong;
  // listen and re-render. SSR-safe via the typeof window guard.
  let prefersReducedMotion = $state(false);
  $effect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = mq.matches;
    const handler = (e: MediaQueryListEvent): void => { prefersReducedMotion = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
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
    return `Network health dial — ${scorePart}, ${medianPart}, ${countPart}.`;
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
                <animate attributeName="r" values="{PIP_R_REST};4;{PIP_R_REST}" dur="1.4s" repeatCount="indefinite" />
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

  .dial {
    width: 100%;
    max-width: min(520px, 80vw);
    height: auto;
    display: block;
  }

  /* The svg-level pulsing class runs a one-shot drop-shadow pulse whenever the
     aggregate median crosses the health threshold. Driven by the component's
     `pulsing` signal, reset after `timing.pulseRim` ms. */
  .dial.pulsing {
    animation: dialPulse var(--timing-pulse-rim, 400ms) ease-out;
    animation-duration: 900ms; /* full pulse window exceeds the rim swap */
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
