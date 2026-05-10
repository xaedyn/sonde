import type { TestLifecycleState } from '../types';

export function runStatusText(lifecycle: TestLifecycleState): string {
  if (lifecycle === 'running') return 'Measuring';
  if (lifecycle === 'starting') return 'Starting...';
  if (lifecycle === 'stopping') return 'Stopping...';
  if (lifecycle === 'stopped') return 'Stopped';
  if (lifecycle === 'completed') return 'Complete';
  return 'Ready';
}

export function startStopButtonLabel(lifecycle: TestLifecycleState): string {
  if (lifecycle === 'running') return 'Stop';
  if (lifecycle === 'starting') return 'Starting...';
  if (lifecycle === 'stopping') return 'Stopping...';
  return 'Start';
}

export function isStartLifecycle(lifecycle: TestLifecycleState): boolean {
  return lifecycle === 'idle' || lifecycle === 'stopped' || lifecycle === 'completed';
}
