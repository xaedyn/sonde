<!-- src/lib/components/OverviewView.svelte -->
<!-- Phase 1 stub. Phase 2 replaces the inner block with the chronograph dial.  -->
<section class="overview" aria-label="Overview">
  <div class="overview-stub">
    <div class="overview-stub-kicker">Overview</div>
    <h1 class="overview-stub-title">Coming soon</h1>
    <p class="overview-stub-desc">
      The chronograph dial lands in Phase&nbsp;2. Pick the
      <strong>Lanes</strong> tab to use the existing visualization
      while the v2 surfaces are built out.
    </p>
  </div>
</section>

<style>
  .overview {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 32px;
    min-height: 0;
  }
  .overview-stub {
    max-width: 480px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .overview-stub-kicker {
    font-family: var(--mono);
    font-size: var(--ts-xs);
    letter-spacing: var(--tr-kicker);
    color: var(--accent-cyan);
    text-transform: uppercase;
  }
  .overview-stub-title {
    font-family: var(--sans);
    font-size: var(--ts-3xl);
    font-weight: 300;
    letter-spacing: var(--tr-display);
    color: var(--t1);
    margin: 0;
  }
  .overview-stub-desc {
    font-family: var(--sans);
    font-size: var(--ts-base);
    color: var(--t3);
    line-height: 1.55;
  }
  .overview-stub-desc strong {
    color: var(--t1);
    font-weight: 500;
  }
</style>
