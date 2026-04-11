// src/lib/engine/worker.ts
// Web Worker for fetch + Resource Timing measurements.
//
// Pure helper functions (extractTimingPayload, classifyLatencyTier) are
// exported so unit tests can import them directly without instantiating a Worker.
// The event loop at the bottom is guarded by WorkerGlobalScope so it only runs
// inside an actual Worker context.

import type { TimingPayload, MainToWorkerMessage, WorkerToMainMessage } from '../types';

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Extract a TimingPayload from a PerformanceResourceTiming entry.
 * When the Timing-Allow-Origin header is absent (TAO blocked), sub-fields are
 * all zero — we still return the total duration.
 */
export function extractTimingPayload(entry: PerformanceResourceTiming): TimingPayload {
  const {
    duration,
    domainLookupStart,
    domainLookupEnd,
    connectStart,
    connectEnd,
    secureConnectionStart,
    requestStart,
    responseStart,
    responseEnd,
  } = entry;

  const hasTao =
    domainLookupStart !== 0 ||
    domainLookupEnd !== 0 ||
    connectStart !== 0 ||
    connectEnd !== 0 ||
    requestStart !== 0 ||
    responseStart !== 0;

  if (!hasTao) {
    return {
      total: duration,
      dnsLookup: 0,
      tcpConnect: 0,
      tlsHandshake: 0,
      ttfb: 0,
      contentTransfer: 0,
    };
  }

  const dnsLookup = domainLookupEnd - domainLookupStart;
  const tcpConnect = connectEnd - connectStart;
  const tlsHandshake =
    secureConnectionStart > 0 ? connectEnd - secureConnectionStart : 0;
  const ttfb = responseStart - requestStart;
  const contentTransfer = responseEnd - responseStart;

  return {
    total: duration,
    dnsLookup,
    tcpConnect,
    tlsHandshake,
    ttfb,
    contentTransfer,
  };
}

/** Classify a latency value (ms) into a display tier. */
export function classifyLatencyTier(
  latency: number | null
): 'fast' | 'medium' | 'slow' | 'timeout' {
  if (latency === null) return 'timeout';
  if (latency < 50) return 'fast';
  if (latency < 200) return 'medium';
  return 'slow';
}

// ── Worker event loop ───────────────────────────────────────────────────────
// Guard: only execute inside a real Worker (not in jsdom / main thread).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).WorkerGlobalScope !== 'undefined' && self instanceof (globalThis as any).WorkerGlobalScope) {
  let abortController: AbortController | null = null;
  let measuring = false;

  self.addEventListener('message', async (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;

    if (msg.type === 'stop') {
      abortController?.abort();
      abortController = null;
      measuring = false;
      return;
    }

    if (msg.type === 'measure') {
      const { url, timeout, corsMode, epoch, roundId } = msg;

      // If already measuring, reply busy — don't abort the in-flight request.
      if (measuring) {
        const busyReply: WorkerToMainMessage = {
          type: 'busy',
          endpointId: url,
          epoch,
          roundId,
        };
        (self as unknown as Worker).postMessage(busyReply);
        return;
      }

      measuring = true;
      abortController = new AbortController();
      const signal = abortController.signal;

      const timeoutId = setTimeout(() => abortController?.abort(), timeout);

      const startMark = performance.now();

      try {
        await fetch(url, {
          method: 'HEAD',
          mode: corsMode,
          cache: 'no-store',
          signal,
        });

        clearTimeout(timeoutId);

        // Wait a tick for the Resource Timing entry to be committed.
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        // A stop or new measure may have aborted us during the yield.
        if (signal.aborted) {
          measuring = false;
          return;
        }

        const entries = performance.getEntriesByType(
          'resource'
        ) as PerformanceResourceTiming[];

        // Find the most recent entry for this URL.
        const filtered = entries.filter(e => e.name === url);
        const entry = filtered[filtered.length - 1];

        const timing: TimingPayload = entry
          ? extractTimingPayload(entry)
          : {
              total: performance.now() - startMark,
              dnsLookup: 0,
              tcpConnect: 0,
              tlsHandshake: 0,
              ttfb: 0,
              contentTransfer: 0,
            };

        const reply: WorkerToMainMessage = {
          type: 'result',
          endpointId: url,
          epoch,
          roundId,
          timing,
        };

        measuring = false;
        (self as unknown as Worker).postMessage(reply);
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        measuring = false;

        if (signal.aborted) {
          const timeoutReply: WorkerToMainMessage = {
            type: 'timeout',
            endpointId: url,
            epoch,
            roundId,
            timeoutValue: timeout,
          };
          (self as unknown as Worker).postMessage(timeoutReply);
        } else {
          const errorReply: WorkerToMainMessage = {
            type: 'error',
            endpointId: url,
            epoch,
            roundId,
            errorType: err instanceof Error ? err.constructor.name : 'UnknownError',
            message: err instanceof Error ? err.message : String(err),
          };
          (self as unknown as Worker).postMessage(errorReply);
        }
      }
    }
  });
}
