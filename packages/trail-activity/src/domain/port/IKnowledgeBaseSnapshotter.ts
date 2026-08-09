// Phase 5 S3 (KB Persistence): 書込前スナップショットの提供者ポート。
// 実装は trail-db の FileKnowledgeBaseSnapshotter（FileBackupManager 流用）。

import type {
  KnowledgeBaseSnapshotEntry,
  KnowledgeBaseSnapshotResult,
  KnowledgeBaseWriteTrigger,
} from '../model/knowledgeBase';

export interface IKnowledgeBaseSnapshotter {
  /**
   * 破壊的書込の直前に呼ぶ。失敗しても throw しない（fail-open は実装側の契約。
   * グラフ系は再分析で再生成可能な導出データであり、書込停止の方が被害が大きい）。
   */
  snapshotBeforeDestructiveWrite(trigger: KnowledgeBaseWriteTrigger): KnowledgeBaseSnapshotResult;

  /** 現存スナップショットを世代番号昇順（1 = 最新）で返す。 */
  listSnapshots(): readonly KnowledgeBaseSnapshotEntry[];

  /**
   * 指定世代から復元する。現在のファイルは restore-safety copy として退避される。
   * @throws 指定世代が存在しない場合
   */
  restoreSnapshot(generation: number): { restoredFrom: string; safetyCopy: string | null };
}
