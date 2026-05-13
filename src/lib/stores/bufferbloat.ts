import { writable } from 'svelte/store';
import {
  gradeBufferbloat,
  median,
  type BufferbloatGradeResult,
} from '../bufferbloat/bufferbloat-test';
import type { Endpoint, MeasurementSample, Settings } from '../types';

export type BufferbloatStatus = 'idle' | 'running' | 'complete' | 'stopped' | 'error';

export interface BufferbloatState {
  readonly status: BufferbloatStatus;
  readonly idleMedianMs: number | null;
  readonly loadedMedianMs: number | null;
  readonly grade: BufferbloatGradeResult;
  readonly error: string | null;
}

export interface BufferbloatRunRequest {
  readonly endpoint: Endpoint;
  readonly idleSamples: readonly MeasurementSample[];
  readonly settings: Pick<Settings, 'corsMode' | 'timeout'>;
}

export interface MeasureLatencyOptions {
  readonly corsMode: Settings['corsMode'];
  readonly timeout: number;
  readonly signal: AbortSignal;
  readonly fetcher: typeof fetch;
}

type MeasureLatency = (url: string, options: MeasureLatencyOptions) => Promise<number | null>;

export interface BufferbloatStoreOptions {
  readonly fetcher?: typeof fetch;
  readonly measureLatency?: MeasureLatency;
  readonly saturationBytes?: number;
  readonly loadedSampleTarget?: number;
  readonly sampleDelayMs?: number;
  readonly now?: () => number;
}

export interface BufferbloatStore {
  subscribe: ReturnType<typeof writable<BufferbloatState>>['subscribe'];
  run(request: BufferbloatRunRequest): Promise<BufferbloatGradeResult | null>;
  stop(): void;
  reset(): void;
}

const DEFAULT_SATURATION_BYTES = 26_214_400;
const DEFAULT_LOADED_SAMPLE_TARGET = 6;
const DEFAULT_SAMPLE_DELAY_MS = 120;

const initialGrade = gradeBufferbloat({ idleMedianMs: null, loadedMedianMs: null });

const initialState: BufferbloatState = {
  status: 'idle',
  idleMedianMs: null,
  loadedMedianMs: null,
  grade: initialGrade,
  error: null,
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function idleMedian(samples: readonly MeasurementSample[]): number | null {
  return median(
    samples
      .filter((sample) => sample.status === 'ok' && Number.isFinite(sample.latency))
      .map((sample) => sample.latency),
  );
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function consumeResponse(response: Response): Promise<void> {
  if (!response.body) {
    await response.arrayBuffer();
    return;
  }

  const reader = response.body.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function measureBrowserLatency(
  url: string,
  options: MeasureLatencyOptions,
): Promise<number | null> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeout);
  const start = performance.now();

  try {
    await options.fetcher(url, {
      method: 'GET',
      mode: options.corsMode,
      cache: 'no-store',
      signal: controller.signal,
    });
    return performance.now() - start;
  } catch (error) {
    if (isAbortError(error)) return null;
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    options.signal.removeEventListener('abort', abort);
  }
}

export function createBufferbloatStore(options: BufferbloatStoreOptions = {}): BufferbloatStore {
  const { subscribe, set, update } = writable<BufferbloatState>(initialState);
  const fetcher = options.fetcher ?? fetch;
  const measureLatency = options.measureLatency ?? measureBrowserLatency;
  const saturationBytes = options.saturationBytes ?? DEFAULT_SATURATION_BYTES;
  const loadedSampleTarget = options.loadedSampleTarget ?? DEFAULT_LOADED_SAMPLE_TARGET;
  const sampleDelayMs = options.sampleDelayMs ?? DEFAULT_SAMPLE_DELAY_MS;

  let activeAbortController: AbortController | null = null;
  let runSerial = 0;

  async function run(request: BufferbloatRunRequest): Promise<BufferbloatGradeResult | null> {
    activeAbortController?.abort();
    const controller = new AbortController();
    activeAbortController = controller;
    const serial = runSerial + 1;
    runSerial = serial;

    const idleMedianMs = idleMedian(request.idleSamples);
    const startingGrade = gradeBufferbloat({ idleMedianMs, loadedMedianMs: null });
    update((state) => ({
      ...state,
      status: 'running',
      idleMedianMs,
      loadedMedianMs: null,
      grade: startingGrade,
      error: null,
    }));

    if (idleMedianMs === null) {
      update((state) => ({
        ...state,
        status: 'error',
        error: 'Run the browser test long enough to collect idle latency samples first.',
      }));
      activeAbortController = null;
      return null;
    }

    const saturation = fetcher(`/api/vantage/saturation?bytes=${saturationBytes}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(consumeResponse)
      .then(() => null, (error: unknown) => error);

    try {
      const loadedLatencies: number[] = [];
      for (let index = 0; index < loadedSampleTarget; index++) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const latency = await measureLatency(request.endpoint.url, {
          corsMode: request.settings.corsMode,
          timeout: request.settings.timeout,
          signal: controller.signal,
          fetcher,
        });
        if (latency !== null && Number.isFinite(latency)) {
          loadedLatencies.push(latency);
        }
        if (index < loadedSampleTarget - 1) {
          await wait(sampleDelayMs, controller.signal);
        }
      }

      const saturationError = await saturation;
      if (saturationError !== null) throw saturationError;

      if (serial !== runSerial) return null;
      const loadedMedianMs = median(loadedLatencies);
      const grade = gradeBufferbloat({ idleMedianMs, loadedMedianMs });
      update((state) => ({
        ...state,
        status: 'complete',
        loadedMedianMs,
        grade,
        error: null,
      }));
      return grade;
    } catch (error) {
      if (serial !== runSerial) return null;
      const wasAborted = isAbortError(error) || controller.signal.aborted;
      controller.abort();
      await saturation;
      if (wasAborted) {
        update((state) => ({ ...state, status: 'stopped', error: null }));
        return null;
      }
      update((state) => ({ ...state, status: 'error', error: messageFrom(error) }));
      return null;
    } finally {
      if (activeAbortController === controller) activeAbortController = null;
    }
  }

  function stop(): void {
    activeAbortController?.abort();
  }

  function reset(): void {
    activeAbortController?.abort();
    activeAbortController = null;
    runSerial += 1;
    set(initialState);
  }

  return {
    subscribe,
    run,
    stop,
    reset,
  };
}

export const bufferbloatStore = createBufferbloatStore();
