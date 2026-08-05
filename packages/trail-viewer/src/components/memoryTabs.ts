import type { TrailI18n } from '../i18n/types';

/**
 * Memory（表示名 Trail Pipeline）のサブタブ。
 *
 * `bug`（バグ修正履歴）と `review`（レビュー指摘）は 2026-08-05 に Flight Record の
 * Bug Fixed / Review サブタブへ、同日 `drift` も Flight Record の Drift サブタブへ移設した。
 * いずれも「どの指示が何を潰したか / 何がずれたか」の運航記録で、指示単位の画面が正しい
 * 置き場になる。`chat` はトップレベルタブへ昇格済み。残るのは pipeline runs のみ。
 */
export type MemoryTabValue = 'runs';

export interface MemoryTabDef {
  readonly value: MemoryTabValue;
  readonly id: string;
  readonly panelId: string;
  readonly i18nKey: keyof TrailI18n;
}

export const MEMORY_TAB_DEFS: ReadonlyArray<MemoryTabDef> = [
  { value: 'runs', id: 'memory-tab-runs', panelId: 'memory-panel-runs', i18nKey: 'memory.runs.tab' },
];
