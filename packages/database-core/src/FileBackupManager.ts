import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * 世代管理バックアップの 1 エントリ。UI に表示する際の情報源。
 */
export interface BackupEntry {
  /** 世代番号（1 が最新、N が最古） */
  readonly generation: number;
  /** バックアップファイルの絶対パス（.bak.N.gz） */
  readonly path: string;
  /** バックアップ作成日時 */
  readonly mtime: Date;
  /** gzip 圧縮後のバイト数 */
  readonly compressedSize: number;
}

/**
 * SQLite DB ファイルの世代管理バックアップ。
 *
 * 任意の DB ファイルに対して `.bak.1.gz` → `.bak.N.gz` の gzip 圧縮ローテーション
 * を行う。SQLite ファイルは冗長性が高く、gzip level 1 でも 30〜50% 程度まで
 * 縮むためディスク使用量を大幅に抑えられる。
 *
 * このインスタンスの生存期間内で最初の `maybeRotate()` 呼び出し時にだけ
 * 既存 DB を圧縮ローテーションし、それ以降は no-op。複数回 maybeRotate を
 * 呼んでも 1 セッションで 1 回までしか作成しない設計。
 */
export class FileBackupManager {
  /** デフォルトのバックアップ世代数。利用側で上書き可能。 */
  static readonly DEFAULT_BACKUP_GENERATIONS = 1;
  /** gzip 圧縮レベル。起動時のブロッキング時間を短縮するため level 1 を採用。 */
  private static readonly GZIP_LEVEL = 1;
  private backupDone = false;

  /**
   * @param dbPath              対象 DB ファイルの絶対パス
   * @param backupGenerations   保持する世代数（0 以下はバックアップ無効）
   * @param backupIntervalDays  バックアップ間隔（日）。0 = セッション毎、1 以上 = `.bak.1.gz` が N 日以上古い場合のみ作成
   * @param preWriteGuard       書き込み直前に呼ばれる任意のガード。テスト環境で保護領域への書き込みを止める用途。throw すれば操作は中断される。
   */
  constructor(
    private readonly dbPath: string,
    private readonly backupGenerations: number = FileBackupManager.DEFAULT_BACKUP_GENERATIONS,
    private readonly backupIntervalDays: number = 1,
    private readonly preWriteGuard?: (targetPath: string) => void,
  ) {}

  /**
   * 必要であればバックアップをローテートする。
   *
   * - 既に同一インスタンスで実行済み (`backupDone=true`) なら no-op
   * - `shouldBackup()` が false なら no-op
   * - それ以外は `rotateBackups()` を実行
   *
   * @returns 実際にバックアップを作成した場合 true
   */
  maybeRotate(): boolean {
    if (this.backupDone) return false;
    if (!this.shouldBackup()) {
      this.backupDone = true;
      return false;
    }
    this.preWriteGuard?.(this.dbPath);
    this.rotateBackups();
    this.backupDone = true;
    return true;
  }

  /**
   * バックアップを作成すべきか判定する。
   * - `backupGenerations <= 0`: 常に false
   * - `backupIntervalDays === 0`: 常に true
   * - `backupIntervalDays >= 1`: `.bak.1.gz` が存在しない、または mtime が N 日以上前の場合のみ true
   */
  private shouldBackup(): boolean {
    if (this.backupGenerations <= 0) return false;
    if (this.backupIntervalDays === 0) return true;
    const bak1 = this.backupPath(1);
    if (!fs.existsSync(bak1)) return true;
    const { mtime } = fs.statSync(bak1);
    const daysSince = (Date.now() - mtime.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= this.backupIntervalDays;
  }

  /**
   * 既存 DB ファイルを `.bak.1.gz` へ、`.bak.1.gz` → `.bak.2.gz` → … と
   * シフトする。最古世代は上書きで破棄される。DB ファイルが存在しないケース
   * （新規作成中）は通常動作として無視する。
   */
  private rotateBackups(): void {
    if (!fs.existsSync(this.dbPath)) return;
    const oldest = this.backupPath(this.backupGenerations);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }
    for (let gen = this.backupGenerations - 1; gen >= 1; gen -= 1) {
      const src = this.backupPath(gen);
      const dst = this.backupPath(gen + 1);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }
    const dbBuffer = fs.readFileSync(this.dbPath);
    const gz = zlib.gzipSync(dbBuffer, { level: FileBackupManager.GZIP_LEVEL });
    fs.writeFileSync(this.backupPath(1), gz);
  }

  /** 世代番号からバックアップファイルの絶対パスを導出。 */
  private backupPath(generation: number): string {
    return `${this.dbPath}.bak.${generation}.gz`;
  }

  /**
   * 現存する世代バックアップを世代番号昇順（1=最新）で返す。UI 表示向け。
   */
  listBackups(): readonly BackupEntry[] {
    const entries: BackupEntry[] = [];
    for (let gen = 1; gen <= this.backupGenerations; gen += 1) {
      const bakPath = this.backupPath(gen);
      if (!fs.existsSync(bakPath)) continue;
      const stat = fs.statSync(bakPath);
      entries.push({
        generation: gen,
        path: bakPath,
        mtime: stat.mtime,
        compressedSize: stat.size,
      });
    }
    return entries;
  }

  /**
   * 指定世代のバックアップを展開して DB ファイルへ復元する。
   * 復元前に現在の DB をタイムスタンプ付き安全コピー
   * (`.restore-safety-<epoch>`) として退避する。
   *
   * @throws 指定世代のバックアップが存在しない場合 Error を投げる
   */
  restoreFromBackup(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    const bakPath = this.backupPath(generation);
    // TOCTOU 競合を避けるため existsSync を使わず、直接 read を試みて ENOENT で判定。
    let compressed: Buffer;
    try {
      compressed = fs.readFileSync(bakPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Backup not found: ${bakPath}`);
      }
      throw err;
    }
    this.preWriteGuard?.(this.dbPath);
    let safetyCopy: string | null = null;
    const safetyPath = `${this.dbPath}.restore-safety-${Date.now()}`;
    try {
      fs.copyFileSync(this.dbPath, safetyPath, fs.constants.COPYFILE_EXCL);
      safetyCopy = safetyPath;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // ENOENT: 既存 DB なしのため safetyCopy は作らない
      // EEXIST: 同時呼び出しで衝突、こちらの copy は諦める
      if (code !== 'ENOENT' && code !== 'EEXIST') throw err;
    }
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(this.dbPath, decompressed);
    return { restoredFrom: bakPath, safetyCopy };
  }
}
