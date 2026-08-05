import type { TrailI18n } from '../i18n/types';

/** Drift は 2026-08-05 に Flight Record のサブタブへ移設した（ここには戻さない）。 */
export type MemoryTabValue = 'bug' | 'review' | 'runs';

export interface MemoryTabDef {
  readonly value: MemoryTabValue;
  readonly id: string;
  readonly panelId: string;
  readonly i18nKey: keyof TrailI18n;
}

export const MEMORY_TAB_DEFS: ReadonlyArray<MemoryTabDef> = [
  { value: 'bug',    id: 'memory-tab-bug',    panelId: 'memory-panel-bug',    i18nKey: 'memory.bug.tab' },
  { value: 'review', id: 'memory-tab-review', panelId: 'memory-panel-review', i18nKey: 'memory.review.tab' },
  { value: 'runs',   id: 'memory-tab-runs',   panelId: 'memory-panel-runs',   i18nKey: 'memory.runs.tab' },
];
