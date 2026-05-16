import { FileBackupManager } from '@anytime-markdown/database-core/FileBackupManager';

export interface BackupMemoryCoreDbOptions {
  /** 保持する世代数。0 以下でバックアップ無効。既定 1。 */
  readonly backupGenerations?: number;
  /**
   * バックアップ間隔（日）。0 で毎回作成、1 以上で .bak.1.gz が N 日以上
   * 古いときのみ作成。既定 1。
   */
  readonly backupIntervalDays?: number;
}

/**
 * memory-core.db を gzip 圧縮してローテーション保存する。
 *
 * trail-db の FileTrailStorage / FileBackupManager と同じ仕組みを memory-core
 * 用に薄くラップしたもの。DB ファイルが存在しない初回起動時は no-op で安全に
 * 抜ける。同じインスタンスを使い回さないので backupDone フラグは利かないが、
 * mtime ベースの interval 判定でスロットリングされるため毎回の I/O は発生
 * しない。
 *
 * @returns 実際に backup を作成した場合 true、throttled / 無効 / DB 不在で
 *          スキップした場合 false
 */
export function backupMemoryCoreDbFile(
  dbPath: string,
  opts: BackupMemoryCoreDbOptions = {},
): boolean {
  const generations = opts.backupGenerations ?? 1;
  const intervalDays = opts.backupIntervalDays ?? 1;
  const manager = new FileBackupManager(dbPath, generations, intervalDays);
  return manager.maybeRotate();
}
