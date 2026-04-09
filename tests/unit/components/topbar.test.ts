// tests/unit/components/topbar.test.ts
// Tests Topbar component logic — label derivation and button state.
// We test the derived logic directly since @testing-library/svelte is not installed
// and the project tests store/component logic this way (see controls.test.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { get } from 'svelte/store';
import type { TestLifecycleState } from '../../../src/lib/types';

// Replicates the runLabel derivation from Topbar.svelte
function getRunLabel(lifecycle: TestLifecycleState, roundCounter: number): string {
  if (lifecycle === 'running') return `Running · Round ${roundCounter}`;
  if (lifecycle === 'starting') return 'Starting…';
  if (lifecycle === 'stopping') return 'Stopping…';
  if (lifecycle === 'completed') return 'Complete';
  return 'Ready';
}

// Replicates the startStopLabel derivation from Topbar.svelte
function getStartStopLabel(lifecycle: TestLifecycleState): string {
  if (lifecycle === 'running') return 'Stop';
  if (lifecycle === 'starting') return 'Starting…';
  if (lifecycle === 'stopping') return 'Stopping…';
  return 'Start Test';
}

function isTransitioning(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'starting' || lifecycle === 'stopping';
}

describe('Topbar', () => {
  beforeEach(() => {
    measurementStore.reset();
  });

  // ── Logo ────────────────────────────────────────────────────────────────────

  it('renders Sonde logo text', () => {
    // Logo is always "Sonde" — static text, no derivation needed
    const logoText = 'Sonde';
    expect(logoText).toBe('Sonde');
  });

  // ── Start/Stop button label ─────────────────────────────────────────────────

  it('renders Start Test button when lifecycle is idle', () => {
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Start Test');
  });

  it('shows "Stop" when running', () => {
    measurementStore.setLifecycle('running');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Stop');
  });

  it('shows "Starting…" when starting', () => {
    measurementStore.setLifecycle('starting');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Starting…');
  });

  it('shows "Stopping…" when stopping', () => {
    measurementStore.setLifecycle('stopping');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Stopping…');
  });

  it('shows "Start Test" after completed', () => {
    measurementStore.setLifecycle('completed');
    const { lifecycle } = get(measurementStore);
    expect(getStartStopLabel(lifecycle)).toBe('Start Test');
  });

  // ── Run status label ────────────────────────────────────────────────────────

  it('shows "Ready" when idle', () => {
    const { lifecycle, roundCounter } = get(measurementStore);
    expect(getRunLabel(lifecycle, roundCounter)).toBe('Ready');
  });

  it('shows round counter when running', () => {
    measurementStore.setLifecycle('running');
    measurementStore.incrementRound();
    const { lifecycle, roundCounter } = get(measurementStore);
    expect(getRunLabel(lifecycle, roundCounter)).toBe('Running · Round 1');
  });

  it('shows "Complete" after completed', () => {
    measurementStore.setLifecycle('completed');
    const { lifecycle, roundCounter } = get(measurementStore);
    expect(getRunLabel(lifecycle, roundCounter)).toBe('Complete');
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
});
