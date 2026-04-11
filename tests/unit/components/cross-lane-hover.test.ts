import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import CrossLaneHover from '../../../src/lib/components/CrossLaneHover.svelte';
import { uiStore } from '../../../src/lib/stores/ui';
import { tick } from 'svelte';

describe('CrossLaneHover', () => {
  beforeEach(() => {
    uiStore.clearLaneHover();
  });

  it('renders hover line element', () => {
    const { container } = render(CrossLaneHover, { props: { visibleStart: 1, visibleEnd: 30 } });
    expect(container.querySelector('.hover-line')).not.toBeNull();
  });

  it('hover line is inactive by default', () => {
    const { container } = render(CrossLaneHover, { props: { visibleStart: 1, visibleEnd: 30 } });
    const line = container.querySelector('.hover-line');
    expect(line?.classList.contains('active')).toBe(false);
  });
});

describe('CrossLaneHover (AC5)', () => {
  beforeEach(() => {
    uiStore.clearLaneHover();
  });

  it('hover line activates when uiStore has a hover round (AC5)', async () => {
    const { container } = render(CrossLaneHover, { props: { visibleStart: 1, visibleEnd: 30 } });
    uiStore.setLaneHover(5, 400, 300);
    await tick();
    const line = container.querySelector('.hover-line');
    expect(line?.classList.contains('active')).toBe(true);
  });

  it('hover line is inactive when no hover round set', () => {
    const { container } = render(CrossLaneHover, { props: { visibleStart: 1, visibleEnd: 30 } });
    const line = container.querySelector('.hover-line');
    expect(line?.classList.contains('active')).toBe(false);
  });
});
