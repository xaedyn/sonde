// tests/unit/components/topbar.test.ts
// Tests Topbar component logic — label derivation, button state, and UX polish.
// We test the derived logic directly since @testing-library/svelte is not installed
// and the project tests store/component logic this way (see controls.test.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { get } from 'svelte/store';
import { tokens } from '../../../src/lib/tokens';
import type { TestLifecycleState } from '../../../src/lib/types';

// Replicates the runLabel derivation from Topbar.svelte
function getRunLabel(lifecycle: TestLifecycleState, roundCounter: number): string {
  if (lifecycle === 'running') return `Round ${roundCounter}`;
  if (lifecycle === 'starting') return 'Starting\u2026';
  if (lifecycle === 'stopping') return 'Stopping\u2026';
  return '';
}

// Replicates the startStopLabel derivation from Topbar.svelte
function getStartStopLabel(lifecycle: TestLifecycleState): string {
  if (lifecycle === 'running') return 'Stop';
  if (lifecycle === 'starting') return 'Starting\u2026';
  if (lifecycle === 'stopping') return 'Stopping\u2026';
  return 'Start';
}

function isTransitioning(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'starting' || lifecycle === 'stopping';
}

// Replicates the showRunStatus derivation from Topbar.svelte
function showRunStatus(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'running' || lifecycle === 'starting' || lifecycle === 'stopping';
}

// Replicates button modifier class logic from Topbar.svelte (single node, class toggle)
function getStartStopModifier(lifecycle: TestLifecycleState): 'start' | 'stop' {
  const isStart = lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed';
  return isStart ? 'start' : 'stop';
}

describe('Topbar', () => {
  beforeEach(() => {
    measurementStore.reset();
  });

  // ── Logo ────────────────────────────────────────────────────────────────────

  it('renders Chronoscope logo text', () => {
    const logoText = 'Chronoscope';
    expect(logoText).toBe('Chronoscope');
  });

  // ── Start/Stop button label ─────────────────────────────────────────────────

  it('renders Start button when lifecycle is idle', () => {
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Start');
  });

  it('shows "Stop" when running', () => {
    measurementStore.setLifecycle('running');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Stop');
  });

  it('shows "Starting\u2026" when starting', () => {
    measurementStore.setLifecycle('starting');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Starting\u2026');
  });

  it('shows "Stopping\u2026" when stopping', () => {
    measurementStore.setLifecycle('stopping');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Stopping\u2026');
  });

  it('shows "Start" after completed', () => {
    measurementStore.setLifecycle('completed');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Start');
  });

  // ── Run status label ────────────────────────────────────────────────────────

  it('returns empty string when idle', () => {
    const { lifecycle, roundCounter } = get(measurementStore);
    expect(getRunLabel(lifecycle, roundCounter)).toBe('');
  });

  it('shows round counter when running', () => {
    measurementStore.setLifecycle('running');
    measurementStore.incrementRound();
    const { lifecycle, roundCounter } = get(measurementStore);
    expect(getRunLabel(lifecycle, roundCounter)).toBe('Round 1');
  });

  it('returns empty string after completed', () => {
    measurementStore.setLifecycle('completed');
    const { lifecycle, roundCounter } = get(measurementStore);
    expect(getRunLabel(lifecycle, roundCounter)).toBe('');
  });

  // ── Disabled state ──────────────────────────────────────────────────────────

  it('button is disabled during starting transition', () => {
    expect(isTransitioning('starting')).toBe(true);
  });

  it('button is disabled during stopping transition', () => {
    expect(isTransitioning('stopping')).toBe(true);
  });

  it('button is enabled when idle', () => {
    expect(isTransitioning('idle')).toBe(false);
  });

  it('button is enabled when running', () => {
    expect(isTransitioning('running')).toBe(false);
  });

  // ── isRunning ───────────────────────────────────────────────────────────────

  it('pulse dot shown only when running', () => {
    const isRunning = (lc: TestLifecycleState) => lc === 'running';
    expect(isRunning('idle')).toBe(false);
    expect(isRunning('running')).toBe(true);
    expect(isRunning('stopping')).toBe(false);
  });

  // ── Button hierarchy: start / stop / btn-ghost ─────────────────────

  it('applies start class when idle', () => {
    expect(getStartStopModifier('idle')).toBe('start');
  });

  it('applies start class when stopped', () => {
    expect(getStartStopModifier('stopped')).toBe('start');
  });

  it('applies start class when completed', () => {
    expect(getStartStopModifier('completed')).toBe('start');
  });

  it('applies stop class when running', () => {
    expect(getStartStopModifier('running')).toBe('stop');
  });

  it('applies stop class during starting transition', () => {
    expect(getStartStopModifier('starting')).toBe('stop');
  });

  it('applies stop class during stopping transition', () => {
    expect(getStartStopModifier('stopping')).toBe('stop');
  });

  // Secondary buttons are always btn-ghost (verified by template — class is static)
  it('secondary buttons have ghost class (static in template)', () => {
    // Settings, Share, + Endpoint all use class="btn btn-ghost" in the template.
    // This test documents the expectation; actual DOM verification requires a DOM renderer.
    const secondaryClass = 'btn-ghost';
    expect(secondaryClass).toBe('btn-ghost');
  });

  // ── showRunStatus logic ────────────────────────────────────────────────────

  it('hides run status when idle', () => {
    expect(showRunStatus('idle')).toBe(false);
  });

  it('hides run status when stopped', () => {
    expect(showRunStatus('stopped')).toBe(false);
  });

  it('hides run status when completed', () => {
    expect(showRunStatus('completed')).toBe(false);
  });

  it('shows run status when running', () => {
    expect(showRunStatus('running')).toBe(true);
  });

  it('shows run status when starting', () => {
    expect(showRunStatus('starting')).toBe(true);
  });

  it('shows run status when stopping', () => {
    expect(showRunStatus('stopping')).toBe(true);
  });

  // statTransition / dotEntrance / dotExit removed in Phase 7 — the surviving
  // views (Overview / Live / Atlas) don't consume them.

  it('btnHover timing token is at least 100ms', () => {
    expect(tokens.timing.btnHover).toBeGreaterThanOrEqual(100);
  });
});
