import { describe, expect, it } from 'vitest';
import {
  runStatusText,
  startStopButtonLabel,
  isStartLifecycle,
} from '../../../src/lib/utils/lifecycle-copy';

describe('lifecycle-copy', () => {
  it('uses Ready before the first run instead of Halted', () => {
    expect(runStatusText('idle')).toBe('Ready');
  });

  it('uses Measuring while running', () => {
    expect(runStatusText('running')).toBe('Measuring');
  });

  it('uses Stopped after an explicit stop', () => {
    expect(runStatusText('stopped')).toBe('Stopped');
  });

  it('uses Complete after capped completion', () => {
    expect(runStatusText('completed')).toBe('Complete');
  });

  it('keeps transition copy explicit', () => {
    expect(runStatusText('starting')).toBe('Starting...');
    expect(runStatusText('stopping')).toBe('Stopping...');
  });

  it('keeps the button action short and predictable', () => {
    expect(startStopButtonLabel('idle')).toBe('Start');
    expect(startStopButtonLabel('running')).toBe('Stop');
    expect(startStopButtonLabel('stopped')).toBe('Start');
    expect(startStopButtonLabel('completed')).toBe('Start');
  });

  it('treats idle, stopped, and completed as start-capable states', () => {
    expect(isStartLifecycle('idle')).toBe(true);
    expect(isStartLifecycle('stopped')).toBe(true);
    expect(isStartLifecycle('completed')).toBe(true);
    expect(isStartLifecycle('running')).toBe(false);
  });
});
