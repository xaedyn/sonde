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
      connectionReused: undefined,
      protocol: (entry as PerformanceResourceTiming).nextHopProtocol || undefined,
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
    // connectStart === connectEnd means a reused connection (no TCP setup time).
    // However both are 0 when TAO is absent, so only report reuse when TAO data is valid.
    connectionReused: hasTao ? connectStart === connectEnd : undefined,
    protocol: (entry as PerformanceResourceTiming).nextHopProtocol || undefined,
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

// ── Probe URL resolution ──────────────────────────────────────────────────

/**
 * Resolve the actual probe URL from the user-configured endpoint URL.
 * - Bare origins (no path or just "/") → append /favicon.ico for stable,
 *   CDN-edge-cached measurement with minimal server processing.
 * - URLs with an explicit path → respect the user's intent, fetch as-is.
 */
export function resolveProbeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/favicon.ico';
      return parsed.href;
    }
    return url;
  } catch {
    return url;
  }
}

// ── Resource Timing extraction helpers ─────────────────────────────────────

const hasPerformanceObserver = typeof PerformanceObserver !== 'undefined';

/**
 * Wait for a Resource Timing entry matching `url` using PerformanceObserver.
 * Races against the AbortController signal — if aborted, returns null.
 */
function waitForResourceEntry(
  url: string,
  signal: AbortSignal,
): Promise<PerformanceResourceTiming | null> {
  if (!hasPerformanceObserver) {
    // Fallback: poll once after a microtask yield
    return new Promise(resolve => {
      setTimeout(() => {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const filtered = entries.filter(e => e.name === url);
        const entry = filtered.length > 0 ? (filtered[filtered.length - 1] ?? null) : null;
        performance.clearResourceTimings();
        resolve(entry);
      }, 0);
    });
  }

  return new Promise(resolve => {
    if (signal.aborted) {
      resolve(null);
      return;
    }

    let settled = false;
    // eslint-disable-next-line prefer-const -- forward-referenced in cleanup before assignment
    let observer: PerformanceObserver;
    // eslint-disable-next-line prefer-const -- forward-referenced in cleanup before assignment
    let abortHandler: () => void;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      signal.removeEventListener('abort', abortHandler);
      performance.clearResourceTimings();
    };

    observer = new PerformanceObserver((list) => {
      const match = list.getEntries().find(e => e.name === url) as PerformanceResourceTiming | undefined;
      if (match && !settled) {
        cleanup();
        resolve(match);
      }
    });

    abortHandler = () => {
      cleanup();
      resolve(null);
    };

    signal.addEventListener('abort', abortHandler, { once: true });
    observer.observe({ type: 'resource', buffered: true });

    // Safety timeout: if observer never fires (e.g. no-cors opaque response
    // that doesn't create a Resource Timing entry), resolve after 100ms
    setTimeout(() => {
      if (settled) return;
      // Check entries one last time before giving up
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const fallback = entries.filter(e => e.name === url);
      cleanup();
      resolve(fallback.length > 0 ? (fallback[fallback.length - 1] ?? null) : null);
    }, 100);
  });
}

// ── Worker event loop ───────────────────────────────────────────────────────
// Guard: only execute inside a real Worker (not in jsdom / main thread).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).WorkerGlobalScope !== 'undefined' && self instanceof (globalThis as any).WorkerGlobalScope) {
  let abortController: AbortController | null = null;
  let measuring = false;
  let stopRequested = false;

  self.addEventListener('message', async (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;

    if (msg.type === 'stop') {
      stopRequested = true;
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
      stopRequested = false;
      abortController = new AbortController();
      const signal = abortController.signal;

      const timeoutId = setTimeout(() => abortController?.abort(), timeout);

      const probeUrl = resolveProbeUrl(url);
      const startMark = performance.now();

      try {
        await fetch(probeUrl, {
          method: 'GET',
          mode: corsMode,
          cache: 'no-store',
          credentials: 'omit',
          signal,
        });

        // Capture duration immediately — before the PerformanceObserver wait.
        // If the observer times out (e.g. redirect changes the entry URL),
        // using performance.now() here would inflate by ~100ms.
        const fetchDuration = performance.now() - startMark;

        clearTimeout(timeoutId);

        // Use PerformanceObserver to get the Resource Timing entry (push-based).
        const entry = await waitForResourceEntry(probeUrl, signal);

        const timing: TimingPayload = entry
          ? extractTimingPayload(entry)
          : {
              total: fetchDuration,
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
        performance.clearResourceTimings();

        if (stopRequested) {
          // Intentional stop — don't record a false timeout.
          return;
        } else if (signal.aborted) {
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
