import type { TestLifecycleState } from '../types';

const RUN_STATUS_TEXT: Record<TestLifecycleState, string> = {
  idle: 'Ready',
  starting: 'Starting...',
  running: 'Measuring',
  stopping: 'Stopping...',
  stopped: 'Stopped',
  completed: 'Complete',
};

const START_STOP_BUTTON_LABEL: Record<TestLifecycleState, string> = {
  idle: 'Start',
  starting: 'Starting...',
  running: 'Stop',
  stopping: 'Stopping...',
  stopped: 'Start',
  completed: 'Start',
};

const IS_START_LIFECYCLE: Record<TestLifecycleState, boolean> = {
  idle: true,
  starting: false,
  running: false,
  stopping: false,
  stopped: true,
  completed: true,
};

export function runStatusText(lifecycle: TestLifecycleState): string {
  return RUN_STATUS_TEXT[lifecycle];
}

export function startStopButtonLabel(lifecycle: TestLifecycleState): string {
  return START_STOP_BUTTON_LABEL[lifecycle];
}

export function isStartLifecycle(lifecycle: TestLifecycleState): boolean {
  return IS_START_LIFECYCLE[lifecycle];
}
