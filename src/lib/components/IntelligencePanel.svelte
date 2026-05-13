<script lang="ts">
  type IntelligenceConsent = 'anonymous-aggregate' | 'named-public-endpoint';

  interface IntelligenceSummaryBucket {
    readonly bucket: string;
    readonly consent: IntelligenceConsent;
    readonly originHost: string | null;
    readonly count: number;
    readonly sampleCount: number;
    readonly p50Avg: number;
    readonly p95Avg: number;
    readonly lossPercentAvg: number;
    readonly updatedAt: number;
  }

  interface IntelligenceSummaryResponse {
    readonly ok: true;
    readonly buckets: readonly IntelligenceSummaryBucket[];
  }

  type LoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

  let status = $state<LoadStatus>('idle');
  let buckets = $state<readonly IntelligenceSummaryBucket[]>([]);
  let errorMessage = $state('');

  const isBusy = $derived(status === 'loading');
  const topBuckets = $derived(buckets.slice(0, 3));

  function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function isSafeHost(value: unknown): value is string {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= 253
      && !/[/:?#]/.test(value);
  }

  function isBucket(value: unknown): value is IntelligenceSummaryBucket {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (record.consent !== 'anonymous-aggregate' && record.consent !== 'named-public-endpoint') return false;
    if (typeof record.bucket !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.bucket)) return false;
    if (record.consent === 'named-public-endpoint' && !isSafeHost(record.originHost)) return false;
    if (record.consent === 'anonymous-aggregate' && record.originHost !== null) return false;
    return isFiniteNumber(record.count)
      && isFiniteNumber(record.sampleCount)
      && isFiniteNumber(record.p50Avg)
      && isFiniteNumber(record.p95Avg)
      && isFiniteNumber(record.lossPercentAvg)
      && isFiniteNumber(record.updatedAt);
  }

  function isSummaryResponse(value: unknown): value is IntelligenceSummaryResponse {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return record.ok === true
      && Array.isArray(record.buckets)
      && record.buckets.every(isBucket);
  }

  function endpointLabel(bucket: IntelligenceSummaryBucket): string {
    return bucket.originHost ?? 'Anonymous endpoint group';
  }

  function reportLabel(count: number): string {
    return `${count} ${count === 1 ? 'report' : 'reports'}`;
  }

  function formatLoss(value: number): string {
    return value === 0 ? '0%' : `${value.toFixed(value < 1 ? 2 : 1)}%`;
  }

  async function handleLoad(): Promise<void> {
    status = 'loading';
    errorMessage = '';

    try {
      const response = await fetch('/api/intelligence/summary', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.status === 503) {
        buckets = [];
        status = 'unavailable';
        return;
      }
      if (!response.ok || !isSummaryResponse(payload)) {
        throw new Error('Invalid aggregate context response.');
      }

      buckets = payload.buckets;
      status = 'ready';
    } catch {
      buckets = [];
      errorMessage = 'Could not load aggregate context.';
      status = 'error';
    }
  }
</script>

<section class="intelligence-panel" aria-label="Aggregate context">
  <div class="intelligence-head">
    <div>
      <div class="intelligence-kicker">Aggregate context</div>
      <p class="intelligence-headline">Opted-in reports from other runs</p>
    </div>
    <button
      type="button"
      class="intelligence-button"
      disabled={isBusy}
      aria-disabled={isBusy}
      onclick={handleLoad}
    >
      {isBusy ? 'Checking...' : 'Check context'}
    </button>
  </div>

  <p class="intelligence-detail">
    Population-level context from consented reports. It shows recent aggregate buckets only; it does not prove what is happening on your path.
  </p>

  <div class="intelligence-body" aria-live="polite">
    {#if status === 'idle'}
      <p class="intelligence-action">No aggregate context loaded for this investigation yet.</p>
    {:else if status === 'loading'}
      <p class="intelligence-action">Checking privacy-safe aggregate buckets...</p>
    {:else if status === 'unavailable'}
      <p class="intelligence-action">Aggregate context is not available yet.</p>
    {:else if status === 'error'}
      <p class="intelligence-error">{errorMessage}</p>
    {:else if topBuckets.length === 0}
      <p class="intelligence-action">No opted-in aggregate reports are available yet.</p>
    {:else}
      <dl class="intelligence-buckets">
        {#each topBuckets as bucket (`${bucket.bucket}:${bucket.consent}:${bucket.originHost ?? 'anonymous'}`)}
          <div>
            <dt>{endpointLabel(bucket)}</dt>
            <dd>{reportLabel(bucket.count)} / {bucket.sampleCount} samples</dd>
            <p>avg P50 {Math.round(bucket.p50Avg)} ms / avg P95 {Math.round(bucket.p95Avg)} ms / avg loss {formatLoss(bucket.lossPercentAvg)}</p>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
</section>

<style>
  .intelligence-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
  }

  .intelligence-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .intelligence-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--t3);
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .intelligence-headline,
  .intelligence-detail,
  .intelligence-action,
  .intelligence-error,
  .intelligence-buckets p {
    margin: 0;
  }

  .intelligence-headline {
    color: var(--t1);
    font-size: var(--ts-md);
    line-height: 1.4;
  }

  .intelligence-detail,
  .intelligence-action,
  .intelligence-error,
  .intelligence-buckets p {
    color: var(--t3);
    font-size: var(--ts-sm);
    line-height: 1.45;
  }

  .intelligence-action {
    color: var(--accent-cyan);
  }

  .intelligence-error {
    color: var(--accent-amber);
  }

  .intelligence-button {
    padding: 6px 12px;
    border-radius: 5px;
    background: transparent;
    border: 1px solid var(--border-mid);
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease, opacity 160ms ease;
  }

  .intelligence-button:hover:not(:disabled) {
    color: var(--t1);
    border-color: var(--border-bright);
  }

  .intelligence-button:disabled {
    cursor: default;
    opacity: 0.62;
  }

  .intelligence-button:focus-visible {
    outline: 1.5px solid var(--accent-cyan);
    outline-offset: 2px;
  }

  .intelligence-buckets {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .intelligence-buckets div {
    min-width: 0;
    padding-top: 8px;
    border-top: 1px solid var(--border-mid);
  }

  .intelligence-buckets dt {
    margin: 0 0 3px;
    color: var(--t2);
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .intelligence-buckets dd {
    margin: 0 0 4px;
    color: var(--t1);
    font-family: var(--mono);
    font-size: var(--ts-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    .intelligence-buckets {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .intelligence-button {
      transition: none;
    }
  }
</style>
