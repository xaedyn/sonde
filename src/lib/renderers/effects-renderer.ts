// src/lib/renderers/effects-renderer.ts
// NOTE: This renderer is retired from the primary view as of 2026-04-09.
// The Glass Lanes redesign uses per-lane SVG charts instead.
// This file is kept for potential future use.
//
// Sonar ping animation on the effects canvas layer.
// Four tiers with different expansion radii and durations.
// Uses 'screen' composite for additive glow; no shadowBlur at runtime.

import { tokens } from '$lib/tokens';
import type { SonarPing } from '$lib/types';

// Per-tier animation config (derived from tokens)
interface TierConfig {
  initialRadius: number;
  finalRadius: number;
  duration: number;
  strokeWidth: number;
  opacity: number;
  maxConcurrent: number;
  /** fraction of animation at which the ring starts fading */
  fadeStart: number;
}

const TIER_CONFIG: Record<SonarPing['tier'], TierConfig> = {
  fast: {
    initialRadius: tokens.canvas.sonarPing.fast.initialRadius,
    finalRadius:   tokens.canvas.sonarPing.fast.finalRadius,
    duration:      tokens.timing.sonarPingFast,
    strokeWidth: 1.5,
    opacity: 0.8,
    maxConcurrent: tokens.canvas.sonarPing.fast.maxConcurrent,
    fadeStart: 0.5,
  },
  medium: {
    initialRadius: tokens.canvas.sonarPing.medium.initialRadius,
    finalRadius:   tokens.canvas.sonarPing.medium.finalRadius,
    duration:      tokens.timing.sonarPingMedium,
    strokeWidth: 1.5,
    opacity: 0.7,
    maxConcurrent: tokens.canvas.sonarPing.medium.maxConcurrent,
    fadeStart: 0.5,
  },
  slow: {
    initialRadius: tokens.canvas.sonarPing.slow.initialRadius,
    finalRadius:   tokens.canvas.sonarPing.slow.finalRadius,
    duration:      tokens.timing.sonarPingSlow,
    strokeWidth: 2,
    opacity: 0.6,
    maxConcurrent: tokens.canvas.sonarPing.slow.maxConcurrent,
    fadeStart: 0.5,
  },
  timeout: {
    initialRadius: tokens.canvas.sonarPing.timeout.initialRadius,
    finalRadius:   tokens.canvas.sonarPing.timeout.finalRadius,
    duration:      tokens.timing.sonarPingTimeout,
    strokeWidth: 2,
    opacity: 0.5,
    maxConcurrent: tokens.canvas.sonarPing.timeout.maxConcurrent,
    /** Timeout pings fade out at 80% — they never fully complete */
    fadeStart: 0.8,
  },
};

export class EffectsRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  // Active pings grouped by tier for O(1) maxConcurrent enforcement
  private readonly activePings: Map<string, SonarPing> = new Map();
  private sweepStartTime: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a new ping. Respects maxConcurrent per tier — oldest excess ping is
   * evicted when the limit is already reached.
   */
  addPing(ping: SonarPing): void {
    const config = TIER_CONFIG[ping.tier];

    // Count how many active pings share this tier
    const tierPings = [...this.activePings.values()].filter(
      (p) => p.tier === ping.tier,
    );

    if (tierPings.length >= config.maxConcurrent) {
      // Evict the oldest ping of this tier (smallest startTime)
      const oldest = tierPings.reduce((a, b) =>
        a.startTime <= b.startTime ? a : b,
      );
      this.activePings.delete(oldest.id);
    }

    this.activePings.set(ping.id, ping);
  }

  /**
   * Draw all active pings and expire completed ones.
   * @param _pings — reserved for future external ping injection; not used
   * @param now    — current timestamp in ms (e.g. performance.now())
   */
  draw(_pings: SonarPing[], now: number): void {
    const { ctx, canvas } = this;

    // Expiry runs regardless of ctx availability so counts stay accurate
    const toExpire: string[] = [];
    for (const [id, ping] of this.activePings) {
      const config = TIER_CONFIG[ping.tier];
      const progress = (now - ping.startTime) / config.duration;
      if (progress >= 1.0) {
        toExpire.push(id);
      }
    }
    for (const id of toExpire) {
      this.activePings.delete(id);
    }

    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const [, ping] of this.activePings) {
      const config = TIER_CONFIG[ping.tier];
      const progress = (now - ping.startTime) / config.duration;

      if (ping.tier === 'timeout') {
        this.drawRing(ctx, ping, config, Math.min(progress, config.fadeStart));
      } else {
        this.drawRing(ctx, ping, config, progress);
      }
    }

    ctx.restore();
  }

  /** Returns the number of currently tracked (not-yet-expired) pings. */
  getActivePingCount(): number {
    return this.activePings.size;
  }

  /** Draw radar sweep animation when no data is present (empty state). */
  drawEmptyState(now: number): void {
    const { ctx, canvas } = this;
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    // Initialize sweep start time on first call
    if (this.sweepStartTime === null) {
      this.sweepStartTime = now;
    }

    ctx.clearRect(0, 0, width, height);

    const elapsed = now - this.sweepStartTime;
    const angle = (elapsed / tokens.canvas.emptyState.sweepPeriod) * 2 * Math.PI;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) * 0.6;
    const trailAngle = (tokens.canvas.emptyState.trailAngleDeg * Math.PI) / 180;

    // Sweep trail (fading arc via conic gradient)
    try {
      const gradient = ctx.createConicGradient(angle - trailAngle, centerX, centerY);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.8, tokens.color.chrome.accent + '15');
      gradient.addColorStop(1, tokens.color.chrome.accent + '40');

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle - trailAngle, angle);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } catch {
      // createConicGradient not supported in jsdom — skip gradient, still draw line
    }

    // Sweep line
    const endX = centerX + Math.cos(angle) * radius;
    const endY = centerY + Math.sin(angle) * radius;
    ctx.save();
    ctx.strokeStyle = tokens.color.chrome.accent;
    ctx.globalAlpha = tokens.canvas.emptyState.sweepLineOpacity;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();

    // Concentric rings (subtle)
    ctx.save();
    ctx.globalAlpha = tokens.canvas.emptyState.ringOpacity;
    ctx.strokeStyle = tokens.color.chrome.border;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    for (let i = 1; i <= 3; i++) {
      const r = radius * (i / 3);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    // Instructional text
    ctx.save();
    ctx.globalAlpha = tokens.canvas.emptyState.textOpacity;
    ctx.fillStyle = tokens.color.text.secondary;
    ctx.font = `${tokens.typography.bodySize}px ${tokens.typography.sans.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add endpoints and start a test', centerX, centerY + radius * 0.15);

    ctx.font = `${tokens.typography.labelSize}px ${tokens.typography.mono.fontFamily}`;
    ctx.fillStyle = tokens.color.text.muted;
    ctx.fillText('Latency data will appear here', centerX, centerY + radius * 0.15 + 24);
    ctx.restore();
  }

  // ── Internal rendering ─────────────────────────────────────────────────────

  private drawRing(
    ctx: CanvasRenderingContext2D,
    ping: SonarPing,
    config: TierConfig,
    progress: number,
  ): void {
    // Apply easing (decelerate: ease-out cubic)
    const easedProgress = tokens.easingFn.decelerate(progress);

    const radius =
      config.initialRadius +
      easedProgress * (config.finalRadius - config.initialRadius);

    // Fade out as ring expands (from fadeStart to 1.0)
    const fadeProgress = progress >= config.fadeStart
      ? (progress - config.fadeStart) / (1 - config.fadeStart)
      : 0;
    const alpha = config.opacity * (1 - fadeProgress);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = ping.color;
    ctx.lineWidth = config.strokeWidth;
    ctx.beginPath();
    ctx.arc(ping.x, ping.y, Math.max(0, radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
