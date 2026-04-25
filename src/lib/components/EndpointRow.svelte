<!-- src/lib/components/EndpointRow.svelte -->
<!-- Single endpoint row: URL input, color dot, enable toggle, remove button,  -->
<!-- and inline latency display.                                                 -->
<script lang="ts">
  import { tick } from 'svelte';
  import { tokens } from '$lib/tokens';
  import { latencyToColor } from '$lib/renderers/color-map';
  import { isValidNickname } from '$lib/endpoint/displayLabel';
  import type { Endpoint, SampleStatus } from '$lib/types';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    endpoint,
    isRunning = false,
    isLast = false,
    isLastEnabled = false,
    lastLatency = null,
    lastStatus = null,
    lastErrorMessage = null,
    onRemove,
    onUpdate,
  }: {
    endpoint: Endpoint;
    isRunning?: boolean;
    isLast?: boolean;
    isLastEnabled?: boolean;
    lastLatency?: number | null;
    lastStatus?: SampleStatus | null;
    lastErrorMessage?: string | null;
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
    if (lastStatus === 'error') return lastErrorMessage ?? 'error';
    return `${Math.round(lastLatency)}ms`;
  });

  let latencyColor = $derived(
    lastStatus === 'timeout' || lastStatus === 'error'
      ? tokens.color.status.timeout
      : tokens.color.text.secondary
  );

  // ── Edit mode state ───────────────────────────────────────────────────────────

  let isEditing = $state(false);
  let editUrl = $state('');
  let editNickname = $state('');
  let nicknameInvalid = $state(false);

  // Element refs for focus management. Without these, activating the pencil
  // unmounts .edit-btn in the same tick as .url-input mounts, leaving keyboard
  // and screen-reader users on <body> (WCAG 2.4.3 violation).
  let urlInputEl: HTMLInputElement | null = $state(null);
  let editBtnEl: HTMLButtonElement | null = $state(null);

  async function handleEditStart(): Promise<void> {
    editUrl = endpoint.url;
    editNickname = endpoint.nickname ?? '';
    nicknameInvalid = false;
    isEditing = true;
    // Wait for the form to mount, then focus the URL input.
    await tick();
    urlInputEl?.focus();
  }

  async function handleEditSave(): Promise<void> {
    const trimmedNick = editNickname.trim();
    if (trimmedNick !== '' && !isValidNickname(trimmedNick)) {
      nicknameInvalid = true;
      return;
    }
    nicknameInvalid = false;
    const nickToSave: string | undefined = trimmedNick === '' ? undefined : trimmedNick;
    onUpdate?.(endpoint.id, { url: editUrl, nickname: nickToSave });
    isEditing = false;
    // Wait for read-mode to remount, then return focus to the pencil.
    await tick();
    editBtnEl?.focus();
  }

  async function handleEditCancel(): Promise<void> {
    nicknameInvalid = false;
    isEditing = false;
    await tick();
    editBtnEl?.focus();
  }

  function handleNicknameKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); handleEditSave(); }
    if (e.key === 'Escape') { e.preventDefault(); handleEditCancel(); }
  }

  function handleUrlKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); handleEditSave(); }
    if (e.key === 'Escape') { e.preventDefault(); handleEditCancel(); }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

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
  style:--btn-radius="{tokens.radius.btn}px"
  style:--radius-sm="{tokens.radius.sm}px"
  style:--spacing-xs="{tokens.spacing.xs}px"
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--mono={tokens.typography.mono.fontFamily}
  style:--sans={tokens.typography.sans.fontFamily}
  style:--timing-btn="{tokens.timing.btnHover}ms"
  style:opacity={endpoint.enabled ? 1 : 0.5}
>
  {#snippet toggleAndRemove()}
    <label
      class="toggle-label"
      aria-label="{endpoint.enabled ? 'Disable' : 'Enable'} this endpoint"
      title={isLastEnabled ? 'At least one endpoint must be enabled' : ''}
    >
      <input
        type="checkbox"
        class="toggle-input"
        checked={endpoint.enabled}
        disabled={isRunning || isLastEnabled}
        onchange={handleToggle}
      />
      <span class="toggle-track" aria-hidden="true"></span>
    </label>
    {#if !isLast}
      <button
        type="button"
        class="remove-btn"
        aria-label="Remove endpoint {endpoint.label}"
        disabled={isRunning}
        onclick={handleRemove}
      >
        ✕
      </button>
    {/if}
  {/snippet}

  {#if isEditing}
    <!-- Edit mode: row expands vertically into a stacked form. -->
    <!-- The cramped "two inputs in a flex row" pattern doesn't fit narrow viewports;
         stacking gives each input full width regardless of viewport size. -->
    <div class="edit-form">
      <div class="edit-form-line">
        <span class="dot" aria-hidden="true"></span>
        <input
          type="url"
          class="url-input"
          bind:this={urlInputEl}
          bind:value={editUrl}
          placeholder="https://example.com"
          aria-label="Endpoint URL"
          onkeydown={handleUrlKeydown}
        />
      </div>
      <div class="edit-form-line">
        <input
          type="text"
          class="nickname-input"
          bind:value={editNickname}
          placeholder="Optional nickname"
          aria-label="Endpoint nickname"
          aria-invalid={nicknameInvalid ? 'true' : 'false'}
          onkeydown={handleNicknameKeydown}
          oninput={() => { if (nicknameInvalid) nicknameInvalid = false; }}
        />
      </div>
      {#if nicknameInvalid}
        <span class="nickname-error" role="alert">Invalid nickname (max 80 chars, no control/zero-width/bidi)</span>
      {/if}
      <div class="edit-actions">
        <button type="button" class="btn-secondary" onclick={handleEditCancel}>Cancel</button>
        <button type="button" class="btn-primary" onclick={handleEditSave}>Save</button>
        <span class="actions-spacer"></span>
        {@render toggleAndRemove()}
      </div>
    </div>
  {:else}
    <!-- Read mode: single horizontal line (dot · label · pencil · toggle · remove). -->
    <span
      class="dot"
      class:pulse={isRunning && endpoint.enabled}
      aria-hidden="true"
    ></span>

    <span class="row-label" title={endpoint.url}>{endpoint.label}</span>

    {#if latencyText}
      <span
        class="latency-text"
        style:color={latencyColor}
        aria-label="Last measurement: {latencyText}"
      >
        {latencyText}
      </span>
    {/if}

    {#if !isRunning}
      <button
        type="button"
        class="edit-btn"
        bind:this={editBtnEl}
        aria-label="Edit {endpoint.label}"
        onclick={handleEditStart}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linejoin="round"
            fill="none"
          />
          <path
            d="M7.5 3.5L10.5 6.5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
          />
        </svg>
      </button>
    {/if}

    {@render toggleAndRemove()}
  {/if}
</div>

<style>
  .endpoint-row {
    /* Single source for the color-dot diameter — used by .dot and by
       .edit-actions's left padding so the action bar stays aligned with the
       input column without drift if the dot ever resizes. */
    --dot-size: 10px;

    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    min-height: 44px; /* WCAG touch target */
    position: relative;
  }

  /* Edit mode: container becomes a vertical stack so .edit-form's columns
     can flow naturally. The two-input flex-row layout was unusable at narrow
     viewports — even Google's URL would collapse to one character. */
  .endpoint-row:has(.edit-form) {
    align-items: stretch;
    flex-direction: column;
  }

  /* Gradient separator between rows */
  .endpoint-row + :global(.endpoint-row),
  :global(li + li) .endpoint-row {
    /* handled by li separator below */
  }

  :global(.endpoint-list > li + li) {
    position: relative;
  }

  :global(.endpoint-list > li + li)::before {
    content: '';
    display: block;
    height: 1px;
    margin: 0 12%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.07), transparent);
  }

  /* ── Color dot ───────────────────────────────────────────────────────────── */
  .dot {
    flex-shrink: 0;
    width: var(--dot-size);
    height: var(--dot-size);
    border-radius: 50%;
    background: var(--dot-color);
    box-shadow: 0 0 8px var(--dot-color); /* fallback for browsers without color-mix() */
    box-shadow: 0 0 8px color-mix(in srgb, var(--dot-color) 40%, transparent);
    transition: background var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
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
    background: rgba(0,0,0,.2);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    color: var(--t1);
    font-size: 13px;
    font-family: var(--mono);
    padding: var(--spacing-xs) var(--spacing-sm);
    outline: none;
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3);
    transition: border-color var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  .url-input:focus {
    border-color: var(--accent-cyan);
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3), 0 0 12px rgba(103,232,249,.15);
  }

  /* ── Identity label (read mode) ──────────────────────────────────────────── */
  /* Replaces the read-only URL input. Showing the derived label as primary
     identity (and the full URL via title attr for hover-disclosure) is what
     fixes the truncated-URL readability bug on the mobile drawer. */
  .row-label {
    flex: 1;
    min-width: 0;
    color: var(--t1);
    font-size: 13px;
    font-family: var(--sans);
    font-weight: 500;
    padding: var(--spacing-xs) var(--spacing-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Edit form (vertical stack inside .endpoint-row when isEditing) ──────── */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    width: 100%;
  }

  .edit-form-line {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  /* Within the form, URL input and nickname input both expand full-width.
     Override the read-mode .url-input flex:1 inheritance; the form-line is
     already a flex container. */
  .edit-form .url-input,
  .edit-form .nickname-input {
    flex: 1;
    width: 100%;
  }

  /* Action bar — Cancel/Save on the left, toggle/remove on the right. */
  .edit-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    /* Sit just inside the dot's column so the action bar visually nests under
       the input column rather than the dot. */
    padding-left: calc(var(--dot-size) + var(--spacing-sm));
  }

  .actions-spacer { flex: 1; }

  .btn-primary,
  .btn-secondary {
    min-height: 32px;
    padding: 0 var(--spacing-md);
    border-radius: var(--btn-radius);
    border: 1px solid transparent;
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--timing-btn) ease, border-color var(--timing-btn) ease;
  }
  .btn-primary {
    background: color-mix(in srgb, var(--accent-cyan) 18%, transparent);
    color: var(--accent-cyan);
    border-color: color-mix(in srgb, var(--accent-cyan) 35%, transparent);
  }
  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent-cyan) 28%, transparent);
  }
  .btn-secondary {
    background: transparent;
    color: var(--t2);
    border-color: var(--glass-border);
  }
  .btn-secondary:hover {
    color: var(--t1);
    border-color: var(--glass-highlight);
  }

  /* ── Nickname input ──────────────────────────────────────────────────────── */
  .nickname-input {
    min-width: 0;
    background: rgba(0,0,0,.2);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    color: var(--t1);
    font-size: 13px;
    font-family: var(--sans);
    padding: var(--spacing-xs) var(--spacing-sm);
    outline: none;
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3);
    transition: border-color var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  .nickname-input:focus {
    border-color: var(--accent-cyan);
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3), 0 0 12px rgba(103,232,249,.15);
  }

  .nickname-input[aria-invalid='true'] {
    border-color: var(--accent-pink);
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3), 0 0 8px rgba(249,168,212,.2);
  }

  /* ── Nickname error ──────────────────────────────────────────────────────── */
  .nickname-error {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--accent-pink);
    white-space: nowrap;
    line-height: 1.2;
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

  /* ── Edit button ─────────────────────────────────────────────────────────── */
  .edit-btn {
    flex-shrink: 0;
    width: 44px;  /* WCAG 2.5.5 minimum touch target */
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--btn-radius);
    background: transparent;
    color: var(--t3);
    cursor: pointer;
    transition: opacity var(--timing-btn) ease, color var(--timing-btn) ease,
      background var(--timing-btn) ease, border-color var(--timing-btn) ease;
    /* Hidden by default; revealed on row hover or focus */
    opacity: 0;
    visibility: hidden;
  }

  .endpoint-row:hover .edit-btn,
  .edit-btn:focus-visible {
    opacity: 1;
    visibility: visible;
  }

  .edit-btn:hover:not(:disabled) {
    background: var(--glass-bg);
    border-color: rgba(103,232,249,.15);
    color: var(--accent-cyan);
  }

  /* Touch devices: always show edit button */
  @media (hover: none) {
    .edit-btn {
      opacity: 1;
      visibility: visible;
    }
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
    transition: background var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
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
    box-shadow: 0 0 10px rgba(103,232,249,.25);
  }

  .toggle-input:checked + .toggle-track::after {
    transform: translateX(14px);
    background: rgba(12,10,20,.7);
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
    border: 1px solid transparent;
    border-radius: 50%;
    background: transparent;
    color: var(--t3);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--timing-btn) ease;
  }

  .remove-btn:hover:not(:disabled) {
    background: var(--glass-bg);
    border-color: rgba(249,168,212,.15);
    color: var(--accent-pink);
    box-shadow: 0 0 8px rgba(249,168,212,.1);
  }

  .remove-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
