import type { TrailI18n } from '../i18n/types';

export type MemoryTabValue = 'drift' | 'bug' | 'review' | 'runs' | 'chat';

export interface MemoryTabDef {
  readonly value: MemoryTabValue;
  readonly id: string;
  readonly panelId: string;
  readonly i18nKey: keyof TrailI18n;
}

export const MEMORY_TAB_DEFS: ReadonlyArray<MemoryTabDef> = [
  { value: 'drift',  id: 'memory-tab-drift',  panelId: 'memory-panel-drift',  i18nKey: 'memory.drift.tab' },
  { value: 'bug',    id: 'memory-tab-bug',    panelId: 'memory-panel-bug',    i18nKey: 'memory.bug.tab' },
  { value: 'review', id: 'memory-tab-review', panelId: 'memory-panel-review', i18nKey: 'memory.review.tab' },
  { value: 'runs',   id: 'memory-tab-runs',   panelId: 'memory-panel-runs',   i18nKey: 'memory.runs.tab' },
  { value: 'chat',   id: 'memory-tab-chat',   panelId: 'memory-panel-chat',   i18nKey: 'memory.chat.tab' },
];
