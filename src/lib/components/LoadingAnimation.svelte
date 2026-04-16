<!-- src/lib/components/LoadingAnimation.svelte -->
<script lang="ts">
  import { tokens } from '$lib/tokens';

  let {
    message = 'Configure endpoints to begin',
  }: {
    message?: string;
  } = $props();
</script>

<div
  class="loading-container"
  aria-live="polite"
  aria-label={message}
  style:--accent={tokens.color.accent.cyan}
  style:--text-muted={tokens.color.text.t3}
  style:--pulse-interval="{tokens.timing.loadingPulse}ms"
  style:--ring-duration="{tokens.timing.loadingRingDuration}ms"
>
  <div class="rings" aria-hidden="true">
    <div class="ring ring-1"></div>
    <div class="ring ring-2"></div>
    <div class="ring ring-3"></div>
  </div>
  <p class="message">{message}</p>
</div>

<style>
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg2);
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .rings {
    position: relative;
    width: 80px;
    height: 80px;
  }

  .ring {
    position: absolute;
    border-radius: 50%;
    border: 1.5px solid rgba(103, 232, 249, 0.2);
    border: 1.5px solid color-mix(in srgb, var(--accent) 20%, transparent);
    transform: scale(0);
    opacity: 0;
    animation: pulse var(--ring-duration) ease-out infinite;
  }

  .ring-1 {
    inset: 20px;
    animation-delay: 0ms;
  }

  .ring-2 {
    inset: 10px;
    animation-delay: calc(var(--pulse-interval) / 3);
  }

  .ring-3 {
    inset: 0;
    animation-delay: calc(var(--pulse-interval) * 2 / 3);
  }

  @keyframes pulse {
    0% {
      transform: scale(0.4);
      opacity: 1;
    }
    70% {
      opacity: 0.5;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ring { animation: none; opacity: 0.3; transform: scale(0.8); }
  }

  .message {
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 11px;
    margin: 0;
    text-align: center;
  }
</style>
