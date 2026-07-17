// Phase 5 S3 (KB Persistence): グラフ系テーブルの破壊的書込直前に trail.db を
// whole-file で世代退避する Pre-write Snapshot の実体。
// 起動時バックアップ（.bak.N.gz・FileTrailStorage）とは独立した世代系列（.kb.N.gz）を持つ。

import { FileBackupManager } from '@anytime-markdown/database-core/FileBackupManager';
import type {
  IKnowledgeBaseSnapshotter,
  KnowledgeBaseSnapshotEntry,
  KnowledgeBaseSnapshotResult,
  KnowledgeBaseWriteTrigger,
} from '@anytime-markdown/trail-core';

import type { DbLogger } from './DbLogger';
import { assertNotProductionWriteDuringTests } from './TrailDatabase.guard';

/** 保持する KB スナップショット世代数 */
export const KB_SNAPSHOT_GENERATIONS = 3;
/** 同一系列への連続スナップショットを抑止するデバウンス（分）。分析 1 回は複数経路を連続で呼ぶため先頭 1 回だけ取る。 */
export const KB_SNAPSHOT_DEBOUNCE_MINUTES = 10;

export class FileKnowledgeBaseSnapshotter implements IKnowledgeBaseSnapshotter {
  private readonly manager: FileBackupManager;

  constructor(
    dbPath: string,
    private readonly logger: DbLogger,
  ) {
    this.manager = new FileBackupManager(
      dbPath,
      KB_SNAPSHOT_GENERATIONS,
      KB_SNAPSHOT_DEBOUNCE_MINUTES / (24 * 60), // 最新世代の mtime 間隔判定によるデバウンス
      assertNotProductionWriteDuringTests,
      { suffix: '.kb', latchPerInstance: false },
    );
  }

  snapshotBeforeDestructiveWrite(trigger: KnowledgeBaseWriteTrigger): KnowledgeBaseSnapshotResult {
    try {
      const created = this.manager.maybeRotate();
      if (created) {
        this.logger.info(`[kb-snapshot] created before ${trigger} write`);
      }
      return { created };
    } catch (err) {
      // fail-open: グラフ系は再分析で再生成可能な導出データであり、書込停止（分析パイプライン
      // 全停止）の方が被害が大きい。ただし silent にせず必ず警告を残す。
      this.logger.warn(
        `[kb-snapshot] failed (fail-open, trigger=${trigger}): ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      return { created: false };
    }
  }

  listSnapshots(): readonly KnowledgeBaseSnapshotEntry[] {
    return this.manager.listBackups();
  }

  restoreSnapshot(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    // 復元失敗は throw（呼び出し側がエラーメッセージを表示する）
    return this.manager.restoreFromBackup(generation);
  }
}
