import type { MetricOverlay } from '@anytime-markdown/trail-core/c4';

export type OverlayCategory =
  | 'none'
  | 'coverage'
  | 'dsm'
  | 'edit-complexity'
  | 'importance'
  | 'hotspot'
  | 'dead-code'
  | 'size';

export const OVERLAY_CATEGORY_DEFAULTS: Record<Exclude<OverlayCategory, 'none'>, MetricOverlay> = {
  coverage: 'coverage-lines',
  dsm: 'dsm-cyclic',
  'edit-complexity': 'edit-complexity-most',
  importance: 'importance',
  hotspot: 'hotspot-frequency',
  'dead-code': 'dead-code-score',
  size: 'size-loc',
};
