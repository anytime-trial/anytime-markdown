import fs from 'node:fs';
import path from 'node:path';
import { FileBackupManager, type BackupEntry } from '@anytime-markdown/database-core/FileBackupManager';
import { assertNotProductionWriteDuringTests } from './TrailDatabase.guard';

export type { BackupEntry };

/**
 * TrailDatabase の永続化層を抽象化するストレージ戦略。
 *
 * 本番では FileTrailStorage（ファイル I/O）、
 * テストでは InMemoryTrailStorage（no-op）を注入することで、
 * 単一のテストミスが保護領域のファイルを破壊する事故を防ぐ。
 */
export interface ITrailStorage {
  /** 初期化時に既存 DB バイト列を返す。新規作成の場合は null。 */
  readInitialBytes(): Uint8Array | null;

  /**
   * DB の現在状態を永続化する。better-sqlite3 を file-backed で使う場合は
   * すでにメイン DB ファイルが書き込み済みなので、本メソッドはバックアップ
   * ローテーション目的のみで使われる。in-memory ストレージでは no-op。
   *
   * **注意**: 本メソッドはバックアップトリガを発火しない。バックアップは
   * {@link maybeRotateBackup} を明示的に呼んだ時のみ作成される。
   */
  save(bytes: Uint8Array): void;

  /**
   * バックアップトリガ。既存 DB ファイルを世代退避する判定 + 実行。
   * 同一インスタンス内では 2 回目以降 no-op (per-instance backupDone フラグ)。
   * 実装を持たないストレージ (in-memory) では undefined。
   *
   * TrailDatabase.init() から 1 回だけ呼ばれ、createTables() の書き込み前に
   * 既存 DB の状態を `.bak.1.gz` に圧縮退避する。
   */
  maybeRotateBackup?(): void;

  /**
   * better-sqlite3 にそのまま渡すファイルパスを返す。
   * - FileTrailStorage: 絶対パス
   * - InMemoryTrailStorage: null (呼び出し側は `:memory:` で開く)
   */
  getFilePath(): string | null;

  /** デバッグ・ログ用の識別子（本番はパス、テストは 'in-memory' 等）。 */
  readonly identifier: string;
}

/**
 * ファイルシステム上の SQLite DB に読み書きする本番用ストレージ。
 *
 * 破壊的副作用（writeFileSync）を持つ。コンストラクタは絶対パスを要求し、
 * `~/.claude` や `~/.vscode-server` 配下への書き込みはテスト環境で例外を投げる。
 *
 * 世代管理バックアップは `@anytime-markdown/database-core` の
 * {@link FileBackupManager} に委譲する。Trail 固有の保護領域ガード
 * ({@link assertNotProductionWriteDuringTests}) は preWriteGuard として注入し、
 * バックアップ / 復元の write 直前にも作用させる。
 */
export class FileTrailStorage implements ITrailStorage {
  /** @deprecated FileBackupManager.DEFAULT_BACKUP_GENERATIONS を使う */
  static readonly DEFAULT_BACKUP_GENERATIONS = FileBackupManager.DEFAULT_BACKUP_GENERATIONS;
  /** @deprecated Use DEFAULT_BACKUP_GENERATIONS */
  static readonly BACKUP_GENERATIONS = FileBackupManager.DEFAULT_BACKUP_GENERATIONS;

  private readonly backupManager: FileBackupManager;

  /**
   * @param dbPath             DB ファイルの絶対パス
   * @param backupGenerations  保持する世代数（0 以下はバックアップ無効）
   * @param backupIntervalDays バックアップ間隔（日）。0 = セッション毎、1 以上 = 最新バックアップが N 日以上古い場合のみ作成
   */
  constructor(
    private readonly dbPath: string,
    backupGenerations: number = FileBackupManager.DEFAULT_BACKUP_GENERATIONS,
    backupIntervalDays: number = 1,
  ) {
    this.backupManager = new FileBackupManager(
      dbPath,
      backupGenerations,
      backupIntervalDays,
      assertNotProductionWriteDuringTests,
    );
  }

  get identifier(): string {
    return this.dbPath;
  }

  getFilePath(): string {
    return this.dbPath;
  }

  readInitialBytes(): Uint8Array | null {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) return null;
    return fs.readFileSync(this.dbPath);
  }

  save(bytes: Uint8Array): void {
    assertNotProductionWriteDuringTests(this.dbPath);
    fs.writeFileSync(this.dbPath, Buffer.from(bytes));
  }

  /**
   * バックアップ世代ローテーションを実行するか判定する。
   * 同一インスタンス内で 1 回だけ作動し、以降は no-op。
   *
   * TrailDatabase.init() の冒頭 (createTables の書き込み前) から呼ばれる
   * ことを想定しており、save() の経路では発火しない。これにより
   * 「セッション起動時 1 回」というタイミングが明示的になる。
   */
  maybeRotateBackup(): void {
    this.backupManager.maybeRotate();
  }

  /**
   * 現存する世代バックアップを新しい順で返す。UI 表示向け。
   */
  listBackups(): readonly BackupEntry[] {
    return this.backupManager.listBackups();
  }

  /**
   * 指定世代のバックアップを展開して DB ファイルへ復元する。
   * 復元前に現在の DB をタイムスタンプ付きの安全コピー（.restore-safety-<epoch>）
   * として退避する。VS Code はメモリ内の DB を保持しているため、
   * 呼び出し後に拡張機能を再起動（ウィンドウリロード）する必要がある。
   *
   * @throws 指定世代のバックアップが存在しない場合 Error を投げる
   */
  restoreFromBackup(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    return this.backupManager.restoreFromBackup(generation);
  }
}

/**
 * 一切ディスクに触れないテスト用ストレージ。save() は no-op。
 * テストファクトリ（createTestTrailDatabase）が標準で使用する。
 */
export class InMemoryTrailStorage implements ITrailStorage {
  readonly identifier = 'in-memory';
  readInitialBytes(): Uint8Array | null {
    return null;
  }
  getFilePath(): null {
    return null;
  }
  save(_bytes: Uint8Array): void {
    /* no-op */
  }
}
