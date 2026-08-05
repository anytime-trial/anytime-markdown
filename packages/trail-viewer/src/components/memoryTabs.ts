import type { TrailI18n } from '../i18n/types';

/**
 * Memory のサブタブ。
 *
 * `bug`（バグ修正履歴）と `review`（レビュー指摘）は 2026-08-05 に Flight Record の
 * Bug Fixed / Review サブタブへ移設した。どちらも「どの指示が何を潰したか」の運航記録で、
 * 指示単位の画面が正しい置き場になる。`chat` はトップレベルタブへ昇格済み。
 */
export type MemoryTabValue = 'drift' | 'runs';

export interface MemoryTabDef {
  readonly value: MemoryTabValue;
  readonly id: string;
  readonly panelId: string;
  readonly i18nKey: keyof TrailI18n;
}

export const MEMORY_TAB_DEFS: ReadonlyArray<MemoryTabDef> = [
  { value: 'drift', id: 'memory-tab-drift', panelId: 'memory-panel-drift', i18nKey: 'memory.drift.tab' },
  { value: 'runs',  id: 'memory-tab-runs',  panelId: 'memory-panel-runs',  i18nKey: 'memory.runs.tab' },
];
