<!-- src/lib/components/SummaryCards.svelte -->
<!-- Responsive grid of SummaryCard components — one per endpoint.              -->
<script lang="ts">
  import { endpointStore } from '$lib/stores/endpoints';
  import { tokens } from '$lib/tokens';
  import SummaryCard from './SummaryCard.svelte';
</script>

<section
  class="summary-cards"
  style:--border={tokens.color.chrome.border}
  style:--spacing-md="{tokens.spacing.md}px"
  style:--spacing-lg="{tokens.spacing.lg}px"
  aria-label="Endpoint statistics"
>
  {#if $endpointStore.length === 0}
    <p class="empty-state">Add an endpoint to see statistics.</p>
  {:else}
    <div class="cards-grid">
      {#each $endpointStore as endpoint (endpoint.id)}
        <SummaryCard endpointId={endpoint.id} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .summary-cards {
    width: 100%;
    padding: var(--spacing-md);
  }

  .cards-grid {
    display: grid;
    gap: var(--spacing-md);
    /* Mobile: 1 column */
    grid-template-columns: 1fr;
  }

  /* Tablet: 2 columns */
  @media (min-width: 768px) {
    .cards-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Desktop: 3 columns */
  @media (min-width: 1024px) {
    .cards-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .empty-state {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
    padding: var(--spacing-lg);
  }
</style>
