// src/lib/layout.ts
// Pure layout derivation — no Svelte dependency, easily testable.
import { tokens } from '$lib/tokens';

export type LayoutMode = 'full' | 'compact' | 'compact-2col';

const COMPACT_THRESHOLD = tokens.lane.compactThreshold;        // 4
const MOBILE_COMPACT_THRESHOLD = 3;
const MIN_LANE_HEIGHT = tokens.lane.minHeight;                 // 120px

export function deriveLayoutMode(
  endpointCount: number,
  containerHeight: number,
  isMobile: boolean,
): LayoutMode {
  if (endpointCount <= 0) return 'full';

  const threshold = isMobile ? MOBILE_COMPACT_THRESHOLD : COMPACT_THRESHOLD;
  if (endpointCount < threshold) return 'full';

  // Mobile: never 2-col (too narrow)
  if (isMobile) return 'compact';

  // Single-column lane height check
  const totalGap = (endpointCount - 1) * tokens.lane.gapPx;
  const availableHeight = containerHeight - totalGap;
  const laneHeight = availableHeight / endpointCount;

  if (laneHeight >= MIN_LANE_HEIGHT) return 'compact';

  // 2-col: each column holds ceil(count/2) lanes
  const colCount = Math.ceil(endpointCount / 2);
  const colGap = (colCount - 1) * tokens.lane.gapPx;
  const colAvailable = containerHeight - colGap;
  const colLaneHeight = colAvailable / colCount;

  if (colLaneHeight >= MIN_LANE_HEIGHT) return 'compact-2col';

  // Fallback: 2-col is still the best layout at 10 endpoints
  return 'compact-2col';
}
