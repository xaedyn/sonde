<!-- src/lib/components/EndpointRow.svelte -->
<!-- Single endpoint row: URL input, color dot, enable toggle, remove button,  -->
<!-- and inline latency display.                                                 -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
  import { latencyToColor } from '$lib/renderers/color-map';
  import type { Endpoint, SampleStatus } from '$lib/types';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    endpoint,
    isRunning = false,
    isLast = false,
    lastLatency = null,
    lastStatus = null,
    onRemove,
    onUpdate,
  }: {
    endpoint: Endpoint;
    isRunning?: boolean;
    isLast?: boolean;
    lastLatency?: number | null;
    lastStatus?: SampleStatus | null;
    onRemove?: (id: string) => void;
    onUpdate?: (id: string, patch: Partial<Omit<Endpoint, 'id'>>) => void;
  } = $props();

  // ── Derived display values ────────────────────────────────────────────────────

  let dotColor = $derived(
    lastLatency !== null && lastStatus === 'ok'
      ? latencyToColor(lastLatency)
      : lastStatus === 'timeout'
        ? tokens.color.status.timeout
        : lastStatus === 'error'
          ? tokens.color.status.error
          : endpoint.color
  );

  let latencyText = $derived.by(() => {
    if (lastStatus === null || lastLatency === null) return '';
    if (lastStatus === 'timeout') return 'timeout';
    if (lastStatus === 'error') return 'error';
    return `${Math.round(lastLatency)}ms`;
  });

  let latencyColor = $derived(
    lastStatus === 'timeout' || lastStatus === 'error'
      ? tokens.color.status.timeout
      : tokens.color.text.secondary
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleUrlChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    onUpdate?.(endpoint.id, { url: input.value });
  }

  function handleToggle(): void {
    onUpdate?.(endpoint.id, { enabled: !endpoint.enabled });
  }

  function handleRemove(): void {
    onRemove?.(endpoint.id);
  }
</script>

<div
  class="endpoint-row"
  style:--dot-color={dotColor}
  style:--glass-border={tokens.color.glass.border}
  style:--glass-highlight={tokens.color.glass.highlight}
  style:--glass-bg={tokens.color.glass.bg}
  style:--t1={tokens.color.text.t1}
  style:--t2={tokens.color.text.t2}
  style:--t3={tokens.color.text.t3}
  style:--accent-cyan={tokens.color.accent.cyan}
  style:--accent-pink={tokens.color.accent.pink}
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--mono={tokens.typography.mono.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
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
    onchange={handleUrlChange}
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
      onchange={handleToggle}
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
      onclick={handleRemove}
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
    border-bottom: 1px solid var(--glass-border);
    min-height: 44px; /* WCAG touch target */
  }

  /* ── Color dot ───────────────────────────────────────────────────────────── */
  .dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dot-color);
    transition: background var(--timing-btn) ease;
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
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    color: var(--t1);
    font-size: 13px;
    font-family: var(--mono);
    padding: var(--spacing-xs) var(--spacing-sm);
    outline: none;
    transition: border-color var(--timing-btn) ease;
  }

  .url-input:focus {
    border-color: var(--accent-cyan);
  }

  .url-input[readonly] {
    opacity: 0.6;
    cursor: default;
  }

  /* ── Latency text ────────────────────────────────────────────────────────── */
  .latency-text {
    flex-shrink: 0;
    font-size: 11px;
    font-family: var(--mono);
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
    background: var(--glass-border);
    transition: background var(--timing-btn) ease;
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
    background: var(--t3);
    transition: transform var(--timing-btn) ease, background var(--timing-btn) ease;
  }

  .toggle-input:checked + .toggle-track {
    background: var(--accent-cyan);
  }

  .toggle-input:checked + .toggle-track::after {
    transform: translateX(14px);
    background: rgba(12,10,20,.92);
  }

  .toggle-input:focus-visible + .toggle-track {
    outline: 2px solid var(--accent-cyan);
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
    color: var(--t3);
    font-size: 12px;
    cursor: pointer;
    transition: background var(--timing-btn) ease, color var(--timing-btn) ease;
  }

  .remove-btn:hover:not(:disabled) {
    background: var(--glass-bg);
    color: var(--accent-pink);
  }

  .remove-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
