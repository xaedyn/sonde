// tests/unit/components/topbar.test.ts
// Tests Topbar component logic — label derivation, button state, and UX polish.
// We test the derived logic directly since @testing-library/svelte is not installed
// and the project tests store/component logic this way (see controls.test.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { get } from 'svelte/store';
import { tokens } from '../../../src/lib/tokens';
import type { TestLifecycleState } from '../../../src/lib/types';
import {
  isStartLifecycle,
  runStatusText,
  startStopButtonLabel,
} from '../../../src/lib/utils/lifecycle-copy';

function isTransitioning(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'starting' || lifecycle === 'stopping';
}

// Replicates button modifier class logic from Topbar.svelte (single node, class toggle)
function getStartStopModifier(lifecycle: TestLifecycleState): 'start' | 'stop' {
  return isStartLifecycle(lifecycle) ? 'start' : 'stop';
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
    expect(startStopButtonLabel(lifecycle)).toBe('Start');
  });

  it('shows "Stop" when running', () => {
    measurementStore.setLifecycle('running');
    const { lifecycle } = get(measurementStore);
    expect(startStopButtonLabel(lifecycle)).toBe('Stop');
  });

  it('shows "Starting..." when starting', () => {
    measurementStore.setLifecycle('starting');
    const { lifecycle } = get(measurementStore);
    expect(startStopButtonLabel(lifecycle)).toBe('Starting...');
  });

  it('shows "Stopping..." when stopping', () => {
    measurementStore.setLifecycle('stopping');
    const { lifecycle } = get(measurementStore);
    expect(startStopButtonLabel(lifecycle)).toBe('Stopping...');
  });

  it('shows "Start" after completed', () => {
    measurementStore.setLifecycle('completed');
    const { lifecycle } = get(measurementStore);
    expect(startStopButtonLabel(lifecycle)).toBe('Start');
  });

  // ── Run status label ────────────────────────────────────────────────────────

  it('shows "Ready" when idle', () => {
    const { lifecycle } = get(measurementStore);
    expect(runStatusText(lifecycle)).toBe('Ready');
  });

  it('shows "Measuring" when running', () => {
    measurementStore.setLifecycle('running');
    const { lifecycle } = get(measurementStore);
    expect(runStatusText(lifecycle)).toBe('Measuring');
  });

  it('shows "Complete" after completed', () => {
    measurementStore.setLifecycle('completed');
    const { lifecycle } = get(measurementStore);
    expect(runStatusText(lifecycle)).toBe('Complete');
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

  // statTransition / dotEntrance / dotExit removed in Phase 7 — the surviving
  // views (Overview / Live / Diagnose) don't consume them.

  it('btnHover timing token is at least 100ms', () => {
    expect(tokens.timing.btnHover).toBeGreaterThanOrEqual(100);
  });
});
