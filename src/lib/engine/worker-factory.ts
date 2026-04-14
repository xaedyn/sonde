// src/lib/engine/worker-factory.ts
// Abstracts Worker construction to enable test injection of mock workers.

// Vite's ?worker import compiles and bundles the worker at build time.
// This must live here (not in measurement-engine.ts) so that new Worker()
// and the ?worker import appear together in the same module, which is
// required for Vite's static analysis to emit a compiled worker bundle.
import MeasurementWorker from './worker.ts?worker';

export interface WorkerFactory {
  create(): Worker;
}

export const defaultWorkerFactory: WorkerFactory = {
  create(): Worker {
    return new MeasurementWorker();
  },
};
