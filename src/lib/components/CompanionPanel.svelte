<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { uiStore } from '$lib/stores/ui';
  import { companionStore, type CompanionStore } from '$lib/stores/companion';
  import { DEFAULT_COMPANION_BASE_URL, type CompanionProbeName } from '$lib/companion/protocol';

  interface Props {
    agentStore?: CompanionStore;
    title?: string;
    idPrefix?: string;
  }

  let {
    agentStore = companionStore,
    title = 'Local Companion',
    idPrefix = 'companion',
  }: Props = $props();

  let agentUrl = $state(DEFAULT_COMPANION_BASE_URL);
  let pairingToken = $state('');
  let probeUrl = $state('');
  let includePrivateWifi = $state(false);
  let initialized = $state(false);

  let dnsProbe = $state(true);
  let tlsProbe = $state(true);
  let routeProbe = $state(true);
  let wifiProbe = $state(true);

  const state = $derived($agentStore);
  const selectedEndpoint = $derived(
    $endpointStore.find((endpoint) => endpoint.id === $uiStore.focusedEndpointId)
      ?? $endpointStore.find((endpoint) => endpoint.enabled)
      ?? $endpointStore[0]
      ?? null,
  );
  const defaultProbeUrl = $derived(selectedEndpoint?.url ?? '');
  const urlId = $derived(`${idPrefix}-url`);
  const tokenId = $derived(`${idPrefix}-token`);
  const probeUrlId = $derived(`${idPrefix}-probe-url`);
  const titleId = $derived(`${idPrefix}-title`);
  const hasSelectedProbe = $derived(dnsProbe || tlsProbe || routeProbe || wifiProbe);
  const isBusy = $derived(state.status === 'checking' || state.status === 'probing');
  const statusLabel = $derived(({
    idle: 'Offline',
    checking: 'Checking',
    connected: 'Connected',
    probing: 'Probing',
    error: 'Attention',
  })[state.status]);

  $effect(() => {
    if (!initialized) {
      agentUrl = state.baseUrl;
      initialized = true;
    }
  });

  $effect(() => {
    if (probeUrl.trim() === '' && defaultProbeUrl) {
      probeUrl = defaultProbeUrl;
    }
  });

  function selectedProbes(): CompanionProbeName[] {
    const probes: CompanionProbeName[] = [];
    if (dnsProbe) probes.push('dns');
    if (tlsProbe) probes.push('tls');
    if (routeProbe) probes.push('route');
    if (wifiProbe) probes.push('wifi');
    return probes;
  }

  function syncConfig(): void {
    agentStore.configure({
      baseUrl: agentUrl,
      secret: pairingToken,
    });
  }

  async function handleCheck(): Promise<void> {
    syncConfig();
    await agentStore.checkHealth();
  }

  async function handleRunProbe(): Promise<void> {
    const targetUrl = probeUrl.trim();
    const probes = selectedProbes();
    if (!targetUrl || probes.length === 0) return;

    syncConfig();
    const probe = await agentStore.runProbe(targetUrl, {
      probes,
      includePrivateWifi,
    });
    if (probe) await agentStore.loadHistory();
  }

  async function handleLoadHistory(): Promise<void> {
    syncConfig();
    await agentStore.loadHistory();
  }

  function handleForgetToken(): void {
    pairingToken = '';
    agentStore.clearSecret();
  }
</script>

<section class="companion-panel" aria-labelledby={titleId}>
  <div class="companion-head">
    <h3 id={titleId}>{title}</h3>
    <span class="status-pill" data-status={state.status}>{statusLabel}</span>
  </div>

  <p class="agent-note">
    Local-only: Chronoscope talks to 127.0.0.1. Signed probes use the token at ~/.chronoscope/agent-token.txt.
  </p>

  <div class="health-row" aria-live="polite">
    <span>Health check: {statusLabel}</span>
    {#if state.version}
      <span>Agent {state.version}</span>
    {/if}
  </div>

  <label class="field-line" for={urlId}>
    <span>Agent URL</span>
    <input
      id={urlId}
      class="field-input"
      type="url"
      autocomplete="off"
      spellcheck="false"
      bind:value={agentUrl}
    />
  </label>

  <label class="field-line" for={tokenId}>
    <span>Pairing token</span>
    <input
      id={tokenId}
      class="field-input"
      type="password"
      autocomplete="off"
      bind:value={pairingToken}
    />
  </label>

  <div class="actions">
    <button type="button" class="agent-btn primary" disabled={isBusy} onclick={handleCheck}>Check Agent</button>
    <button
      type="button"
      class="agent-btn"
      disabled={isBusy || (!state.hasSecret && pairingToken.trim() === '')}
      onclick={handleLoadHistory}
    >
      History
    </button>
    <button
      type="button"
      class="agent-btn"
      disabled={isBusy || (!state.hasSecret && pairingToken.trim() === '')}
      onclick={handleForgetToken}
    >
      Forget Token
    </button>
  </div>

  {#if state.capabilities}
    <div class="capability-row" aria-label="Local companion capabilities">
      <span class:available={state.capabilities.dns}>DNS</span>
      <span class:available={state.capabilities.tls}>TLS</span>
      <span class:available={state.capabilities.route}>Route</span>
      <span class:available={state.capabilities.wifi}>WiFi</span>
      <span class:available={state.capabilities.sqliteHistory}>SQLite</span>
    </div>
  {/if}

  <div class="probe-block">
    <label class="field-line" for={probeUrlId}>
      <span>Probe URL</span>
      <input
        id={probeUrlId}
        class="field-input"
        type="url"
        autocomplete="off"
        spellcheck="false"
        bind:value={probeUrl}
      />
    </label>

    <div class="probe-toggles" aria-label="Local probe types">
      <label class="probe-toggle">
        <input type="checkbox" bind:checked={dnsProbe} />
        <span>DNS</span>
      </label>
      <label class="probe-toggle">
        <input type="checkbox" bind:checked={tlsProbe} />
        <span>TLS</span>
      </label>
      <label class="probe-toggle">
        <input type="checkbox" bind:checked={routeProbe} />
        <span>Route/MTR</span>
      </label>
      <label class="probe-toggle">
        <input type="checkbox" bind:checked={wifiProbe} />
        <span>WiFi</span>
      </label>
      <label class="probe-toggle private-wifi" class:disabled={!wifiProbe}>
        <input type="checkbox" bind:checked={includePrivateWifi} disabled={!wifiProbe} />
        <span>Private WiFi</span>
      </label>
    </div>

    <p class="agent-note subtle">
      Private WiFi is off by default; SSID and BSSID stay redacted unless enabled for this run.
    </p>

    <button
      type="button"
      class="agent-btn primary full"
      disabled={isBusy || !probeUrl.trim() || !hasSelectedProbe}
      onclick={handleRunProbe}
    >
      Run Local Probe
    </button>
  </div>

  {#if state.error}
    <p class="agent-message error" aria-live="polite">{state.error}</p>
  {/if}

  {#if state.lastProbe}
    <div class="agent-result" aria-live="polite">
      <span class="result-host">{state.lastProbe.targetHost}</span>
      <span class="result-summary">{state.lastProbe.summary}</span>
    </div>
  {/if}

  {#if state.history.length > 0}
    <div class="history-strip" aria-label="Recent local companion probes">
      {#each state.history.slice(0, 3) as entry (entry.id)}
        <span>{entry.targetHost}</span>
      {/each}
    </div>
  {/if}
</section>

<style>
  .companion-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    min-width: 0;
  }

  .companion-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    min-width: 0;
  }

  .companion-head h3 {
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--t2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .status-pill {
    flex: 0 0 auto;
    padding: 2px 7px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    color: var(--t3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0;
  }

  .agent-note {
    margin: 0;
    color: var(--t2);
    font-family: var(--sans);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .agent-note.subtle {
    color: var(--t3);
    font-size: 11px;
  }

  .health-row {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-xs);
    min-width: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: rgba(0,0,0,.14);
    color: var(--t3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0;
  }

  .status-pill[data-status="connected"] {
    border-color: rgba(103,232,249,.28);
    color: var(--accent-cyan);
  }

  .status-pill[data-status="error"] {
    border-color: var(--pink20);
    color: var(--accent-pink);
  }

  .field-line {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    min-width: 0;
  }

  .field-line span {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .field-input {
    padding: var(--spacing-sm) var(--spacing-md);
    background: rgba(0,0,0,.2);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    color: var(--t1);
    font-family: var(--mono);
    font-size: 12px;
    width: 100%;
    min-width: 0;
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3);
    transition: border-color var(--timing-btn) ease, box-shadow var(--timing-btn) ease;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--accent-cyan);
    box-shadow: inset 0 1px 4px rgba(0,0,0,.3), 0 0 12px rgba(103,232,249,.15);
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--spacing-xs);
  }

  .agent-btn {
    min-height: 34px;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: rgba(0,0,0,.16);
    color: var(--t2);
    cursor: pointer;
    font-family: var(--sans);
    font-size: 12px;
    transition: border-color var(--timing-btn) ease, background var(--timing-btn) ease, color var(--timing-btn) ease, transform var(--timing-btn) ease;
    white-space: nowrap;
  }

  .agent-btn.primary {
    color: var(--accent-cyan);
    border-color: rgba(103,232,249,.22);
  }

  .agent-btn.full {
    width: 100%;
  }

  .agent-btn:hover:not(:disabled) {
    border-color: var(--glass-highlight);
    color: var(--t1);
    background: var(--glass-bg-strong);
    transform: translateY(-1px);
  }

  .agent-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .capability-row,
  .history-strip {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .capability-row span,
  .history-strip span {
    padding: 3px 7px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    color: var(--t3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0;
  }

  .capability-row span.available {
    color: var(--accent-cyan);
    border-color: rgba(103,232,249,.22);
  }

  .probe-block {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    min-width: 0;
  }

  .probe-toggles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-xs);
  }

  .probe-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    min-width: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--glass-border);
    border-radius: var(--btn-radius);
    background: rgba(0,0,0,.14);
    color: var(--t2);
    cursor: pointer;
  }

  .probe-toggle.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .probe-toggle input {
    flex: 0 0 auto;
    accent-color: var(--accent-cyan);
  }

  .probe-toggle span {
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--sans);
    font-size: 12px;
  }

  .private-wifi {
    grid-column: 1 / -1;
  }

  .agent-message,
  .agent-result {
    margin: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--btn-radius);
    font-family: var(--sans);
    font-size: 12px;
    line-height: 1.45;
  }

  .agent-message.error {
    color: var(--accent-pink);
    background: var(--pink06);
    border: 1px solid var(--pink12);
  }

  .agent-result {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(0,0,0,.16);
    border: 1px solid var(--glass-border);
    color: var(--t2);
    min-width: 0;
  }

  .result-host {
    color: var(--t1);
    font-family: var(--mono);
    overflow-wrap: anywhere;
  }

  .result-summary {
    color: var(--t3);
    overflow-wrap: anywhere;
  }

  @media (max-width: 420px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
