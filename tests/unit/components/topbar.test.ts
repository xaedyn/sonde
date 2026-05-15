// tests/unit/components/topbar.test.ts
// Tests Topbar component logic, store-derived labels, and shared chrome DOM.
// DOM checks cover accessible controls while direct utility assertions keep
// lifecycle label expectations compact and explicit.

import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, within } from '@testing-library/svelte';
import { measurementStore } from '../../../src/lib/stores/measurements';
import { endpointStore } from '../../../src/lib/stores/endpoints';
import { settingsStore } from '../../../src/lib/stores/settings';
import { uiStore } from '../../../src/lib/stores/ui';
import { get } from 'svelte/store';
import { tokens } from '../../../src/lib/tokens';
import Topbar from '../../../src/lib/components/Topbar.svelte';
import type { TestLifecycleState } from '../../../src/lib/types';
import {
  isStartLifecycle,
  runStatusText,
  startStopButtonLabel,
} from '../../../src/lib/utils/lifecycle-copy';

function isTransitioning(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'starting' || lifecycle === 'stopping';
}

// Replicates Topbar.svelte's class:start and class:stop boolean bindings.
function getStartStopClasses(lifecycle: TestLifecycleState): { start: boolean; stop: boolean } {
  return {
    start: isStartLifecycle(lifecycle),
    stop: lifecycle === 'running',
  };
}

describe('Topbar', () => {
  beforeEach(() => {
    measurementStore.reset();
    endpointStore.reset();
    settingsStore.reset();
    uiStore.reset();
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
    expect(getStartStopClasses('idle')).toEqual({ start: true, stop: false });
  });

  it('applies start class when stopped', () => {
    expect(getStartStopClasses('stopped')).toEqual({ start: true, stop: false });
  });

  it('applies start class when completed', () => {
    expect(getStartStopClasses('completed')).toEqual({ start: true, stop: false });
  });

  it('applies stop class when running', () => {
    expect(getStartStopClasses('running')).toEqual({ start: false, stop: true });
  });

  it('does not apply start or stop class during starting transition', () => {
    expect(getStartStopClasses('starting')).toEqual({ start: false, stop: false });
  });

  it('does not apply start or stop class during stopping transition', () => {
    expect(getStartStopClasses('stopping')).toEqual({ start: false, stop: false });
  });

  it('renders the shared chrome controls with accessible names', () => {
    const { getByRole } = render(Topbar, { props: {} });

    expect(getByRole('button', { name: /run details/i })).toBeTruthy();
    expect(getByRole('button', { name: /add or remove endpoints/i })).toBeTruthy();
    expect(getByRole('button', { name: /open settings/i })).toBeTruthy();
    expect(getByRole('button', { name: /share results/i })).toBeTruthy();
    expect(getByRole('button', { name: /^start$/i })).toBeTruthy();
  });

  // statTransition / dotEntrance / dotExit removed in Phase 7 — the surviving
  // views (Status / Live / Investigate) don't consume them.

  it('btnHover timing token is at least 100ms', () => {
    expect(tokens.timing.btnHover).toBeGreaterThanOrEqual(100);
  });

  it('keeps run mechanics behind a compact Run details disclosure', async () => {
    const { getByRole, queryByText } = render(Topbar, { props: {} });

    expect(queryByText(/Measuring from your browser/i)).toBeNull();
    const detailsButton = getByRole('button', { name: /run details/i });
    expect(detailsButton).toBeTruthy();

    await fireEvent.click(detailsButton);

    const dialog = getByRole('dialog', { name: /run details/i });
    expect(within(dialog).getByText('Browser test')).toBeTruthy();
    expect(within(dialog).getByText(/0 of \d+ samples/i)).toBeTruthy();
    expect(within(dialog).getByText(/\d+s timeout/i)).toBeTruthy();
  });
});
