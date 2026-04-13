<!-- src/lib/components/Header.svelte -->
<!-- Minimal branding header: title + subtitle.                                  -->
<script lang="ts">
  import { tokens } from '$lib/tokens';
</script>

<header
  class="app-header"
  style:--text-primary={tokens.color.text.primary}
  style:--text-muted={tokens.color.text.muted}
  style:--border={tokens.color.chrome.border}
  style:--surface-raised={tokens.color.surface.raised}
  style:--spacing-sm="{tokens.spacing.sm}px"
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
>
  <div class="branding">
    <h1 class="title">Chronoscope</h1>
    <span class="subtitle" aria-label="HTTP Latency Diagnostic">HTTP Latency Diagnostic</span>
  </div>
</header>

<style>
  .app-header {
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    background: var(--surface-raised);
    flex-shrink: 0;
  }

  .branding {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-sm);
  }

  .title {
    font-family: 'Inter', sans-serif;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-primary);
  }

  .subtitle {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--text-muted);
    letter-spacing: 0.03em;
  }
</style>
