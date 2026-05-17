// src/lib/utils/endpoint-tone.ts
// Per-endpoint visual tone derived from real per-endpoint statistics and the
// most recent sample status. Used as the single canonical "status colour" for
// NetworkTopology nodes, Investigate endpoint cards, Overview rows, and
// EndpointDetail's hero — all four surfaces share this vocabulary so users do
// not relearn it per page.
//
// Rules run top-to-bottom; first match wins. Precedence preserves the
// behaviour of the legacy informal derivation in FigmaOverviewView.svelte:
// a recent timeout or error always trumps "not enough samples", so a
// freshly-added endpoint that immediately times out shows `bad`, not
// `collecting`.
//
// Derivation has NO dependency on the global measurementStore.lifecycle —
// an endpoint's tone reflects only its own sample history. A newly-added
// endpoint mid-run shows `collecting` while existing endpoints continue
// showing their real tones.

import type { EndpointStatistics, SampleStatus } from '../types';

export type EndpointTone = 'good' | 'watch' | 'bad' | 'collecting';

// Per the spec (Section "Vocabulary Alignment"). Surface labels for the
// status pill on Investigate / EndpointDetail / Report tables — kept here so
// every consumer maps the tone the same way.
export const ENDPOINT_TONE_PILL_LABEL: Readonly<Record<EndpointTone, string>> = {
  good: 'STABLE',
  watch: 'SPIKING',
  bad: 'FAILING',
  collecting: 'COLLECTING',
};

const LOSS_PERCENT_THRESHOLD = 1;
const STDDEV_WATCH_THRESHOLD = 25;

export interface DeriveEndpointToneInput {
  readonly stats: EndpointStatistics | null;
  readonly lastStatus: SampleStatus | null;
  readonly healthThreshold: number;
}

export function deriveEndpointTone(input: DeriveEndpointToneInput): EndpointTone {
  const { stats, lastStatus, healthThreshold } = input;

  // Rule 1: bad — most recent sample was a failure, OR ready stats show
  // significant loss. The ready guard on the loss branch matches the legacy
  // behaviour: lossPercent is only meaningful once enough samples are
  // collected for `ready` to be true.
  if (
    lastStatus === 'timeout' ||
    lastStatus === 'error' ||
    (stats?.ready === true && stats.lossPercent >= LOSS_PERCENT_THRESHOLD)
  ) {
    return 'bad';
  }

  // Rule 2: collecting — no stats yet, or not enough samples to compare.
  if (stats === null || stats.ready === false) {
    return 'collecting';
  }

  // Rule 3: watch — latency tail is over the user's health threshold, or
  // jitter is high enough that a single p95 number is misleading.
  if (stats.p95 > healthThreshold || stats.stddev >= STDDEV_WATCH_THRESHOLD) {
    return 'watch';
  }

  return 'good';
}
