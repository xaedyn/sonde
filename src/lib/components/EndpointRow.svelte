<!-- src/lib/components/EndpointRow.svelte -->
<!-- Single endpoint row: URL input, color dot, enable toggle, remove button,  -->
<!-- and inline latency display.                                                 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { tokens } from '$lib/tokens';
  import { latencyToColor } from '$lib/renderers/color-map';
  import type { Endpoint, SampleStatus } from '$lib/types';

  // ── Props ────────────────────────────────────────────────────────────────────
  export let endpoint: Endpoint;
  export let isRunning: boolean = false;
  export let isLast: boolean = false;
  /** Last measured latency (null if no data yet) */
  export let lastLatency: number | null = null;
  /** Last measured status */
  export let lastStatus: SampleStatus | null = null;

  // ── Events ───────────────────────────────────────────────────────────────────
  const dispatch = createEventDispatcher<{
    remove: { id: string };
    update: { id: string; patch: Partial<Omit<Endpoint, 'id'>> };
  }>();

  // ── Derived display values ────────────────────────────────────────────────────

  $: dotColor = lastLatency !== null && lastStatus === 'ok'
    ? latencyToColor(lastLatency)
    : lastStatus === 'timeout'
      ? tokens.color.status.timeout
      : lastStatus === 'error'
        ? tokens.color.status.error
        : endpoint.color;

  $: latencyText = (() => {
    if (lastStatus === null || lastLatency === null) return '';
    if (lastStatus === 'timeout') return 'timeout';
    if (lastStatus === 'error') return 'error';
    return `${Math.round(lastLatency)}ms`;
  })();

  $: latencyColor = lastStatus === 'timeout' || lastStatus === 'error'
    ? tokens.color.status.timeout
    : tokens.color.text.secondary;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleUrlChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    dispatch('update', { id: endpoint.id, patch: { url: input.value } });
  }

  function handleToggle(): void {
    dispatch('update', { id: endpoint.id, patch: { enabled: !endpoint.enabled } });
  }

  function handleRemove(): void {
    dispatch('remove', { id: endpoint.id });
  }
</script>

<div
  class="endpoint-row"
  style:--dot-color={dotColor}
  style:--border={tokens.color.chrome.border}
  style:--border-focus={tokens.color.chrome.borderFocus}
  style:--surface-raised={tokens.color.surface.raised}
  style:--text-primary={tokens.color.text.primary}
  style:--text-secondary={tokens.color.text.secondary}
  style:--text-muted={tokens.color.text.muted}
  style:--accent={tokens.color.chrome.accent}
  style:--error={tokens.color.status.error}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:opacity={endpoint.enabled ? 1 : 0.5}
>
  <!-- Color dot (pulses when running + enabled) -->
  <span
    class="dot"
    class:pulse={isRunning && endpoint.enabled}
    aria-hidden="true"
  ></span>

  <!-- URL input -->
  <input
    type="url"
    class="url-input"
    value={endpoint.url}
    readonly={isRunning}
    placeholder="https://example.com"
    aria-label="Endpoint URL"
    on:change={handleUrlChange}
  />

  <!-- Latency text -->
  {#if latencyText}
    <span
      class="latency-text"
      style:color={latencyColor}
      aria-label="Last measurement: {latencyText}"
    >
      {latencyText}
    </span>
  {/if}

  <!-- Enable/disable toggle -->
  <label class="toggle-label" aria-label="{endpoint.enabled ? 'Disable' : 'Enable'} this endpoint">
    <input
      type="checkbox"
      class="toggle-input"
      checked={endpoint.enabled}
      disabled={isRunning}
      on:change={handleToggle}
    />
    <span class="toggle-track" aria-hidden="true"></span>
  </label>

  <!-- Remove button -->
  {#if !isLast}
    <button
      type="button"
      class="remove-btn"
      aria-label="Remove endpoint {endpoint.url}"
      disabled={isRunning}
      on:click={handleRemove}
    >
      ✕
    </button>
  {/if}
</div>

<style>
  .endpoint-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--border);
    min-height: 44px; /* WCAG touch target */
  }

  /* ── Color dot ───────────────────────────────────────────────────────────── */
  .dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dot-color);
    transition: background 200ms ease;
  }

  .dot.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(1.3); }
  }

  /* ── URL input ───────────────────────────────────────────────────────────── */
  .url-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    padding: var(--spacing-xs) var(--spacing-sm);
    outline: none;
    transition: border-color 150ms ease;
  }

  .url-input:focus {
    border-color: var(--border-focus);
  }

  .url-input[readonly] {
    opacity: 0.6;
    cursor: default;
  }

  /* ── Latency text ────────────────────────────────────────────────────────── */
  .latency-text {
    flex-shrink: 0;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    min-width: 52px;
    text-align: right;
    white-space: nowrap;
  }

  /* ── Toggle ──────────────────────────────────────────────────────────────── */
  .toggle-label {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    display: block;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--border);
    transition: background 150ms ease;
    position: relative;
  }

  .toggle-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform 150ms ease, background 150ms ease;
  }

  .toggle-input:checked + .toggle-track {
    background: var(--accent);
  }

  .toggle-input:checked + .toggle-track::after {
    transform: translateX(14px);
    background: #fff;
  }

  .toggle-input:focus-visible + .toggle-track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .toggle-input:disabled + .toggle-track {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Remove button ───────────────────────────────────────────────────────── */
  .remove-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }

  .remove-btn:hover:not(:disabled) {
    background: var(--surface-raised);
    color: var(--error);
  }

  .remove-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
