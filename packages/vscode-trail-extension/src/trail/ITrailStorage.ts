import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { assertNotProductionWriteDuringTests } from './TrailDatabase.guard';

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

  /** sql.js の export() 結果を永続化する。 */
  save(bytes: Uint8Array): void;

  /** デバッグ・ログ用の識別子（本番はパス、テストは 'in-memory' 等）。 */
  readonly identifier: string;
}

/**
 * 世代管理バックアップの 1 エントリ。UI に表示する際の情報源。
 */
export interface BackupEntry {
  /** 世代番号（1 が最新、3 が最古） */
  readonly generation: number;
  /** バックアップファイルの絶対パス（.bak.N.gz） */
  readonly path: string;
  /** バックアップ作成日時 */
  readonly mtime: Date;
  /** gzip 圧縮後のバイト数 */
  readonly compressedSize: number;
}

/**
 * ファイルシステム上の SQLite DB に読み書きする本番用ストレージ。
 *
 * 破壊的副作用（writeFileSync）を持つ。コンストラクタは絶対パスを要求し、
 * `~/.claude` や `~/.vscode-server` 配下への書き込みはテスト環境で例外を投げる。
 *
 * セッション（このインスタンスの生存期間）内で最初の save() 呼び出し時に
 * 既存 DB を 3 世代まで gzip 圧縮してローテーションバックアップする
 * （.bak.1.gz → .bak.2.gz → .bak.3.gz）。SQLite ファイルは冗長性が高く、
 * level 1 でも 30〜50% 程度まで縮むためディスク使用量を大幅に抑えられる。
 */
export class FileTrailStorage implements ITrailStorage {
  /** デフォルトのバックアップ世代数。VS Code 設定で上書き可能。 */
  static readonly DEFAULT_BACKUP_GENERATIONS = 1;
  /** @deprecated Use DEFAULT_BACKUP_GENERATIONS */
  static readonly BACKUP_GENERATIONS = FileTrailStorage.DEFAULT_BACKUP_GENERATIONS;
  /** gzip 圧縮レベル。起動時のブロッキング時間を短縮するため level 1 を採用。 */
  private static readonly GZIP_LEVEL = 1;
  private backupDone = false;

  constructor(
    private readonly dbPath: string,
    private readonly backupGenerations: number = FileTrailStorage.DEFAULT_BACKUP_GENERATIONS,
  ) {}

  get identifier(): string {
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
    if (!this.backupDone) {
      this.rotateBackups();
      this.backupDone = true;
    }
    fs.writeFileSync(this.dbPath, Buffer.from(bytes));
  }

  /**
   * 既存 DB ファイルを .bak.1.gz へ、.bak.1.gz → .bak.2.gz → .bak.3.gz と
   * シフトする。.bak.3.gz は上書きで破棄される。DB ファイルが存在しない
   * ケース（新規）は通常動作として無視する。
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
    const gz = zlib.gzipSync(dbBuffer, { level: FileTrailStorage.GZIP_LEVEL });
    fs.writeFileSync(this.backupPath(1), gz);
  }

  /** 世代番号からバックアップファイルの絶対パスを導出。 */
  private backupPath(generation: number): string {
    return `${this.dbPath}.bak.${generation}.gz`;
  }

  /**
   * 現存する世代バックアップを新しい順で返す。UI 表示向け。
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
   * 復元前に現在の DB をタイムスタンプ付きの安全コピー（.restore-safety-<epoch>）
   * として退避する。VS Code はメモリ内の DB を保持しているため、
   * 呼び出し後に拡張機能を再起動（ウィンドウリロード）する必要がある。
   *
   * @throws 指定世代のバックアップが存在しない場合 Error を投げる
   */
  restoreFromBackup(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    assertNotProductionWriteDuringTests(this.dbPath);
    const bakPath = this.backupPath(generation);
    if (!fs.existsSync(bakPath)) {
      throw new Error(`Backup not found: ${bakPath}`);
    }
    let safetyCopy: string | null = null;
    if (fs.existsSync(this.dbPath)) {
      safetyCopy = `${this.dbPath}.restore-safety-${Date.now()}`;
      fs.copyFileSync(this.dbPath, safetyCopy);
    }
    const compressed = fs.readFileSync(bakPath);
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(this.dbPath, decompressed);
    return { restoredFrom: bakPath, safetyCopy };
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
  save(_bytes: Uint8Array): void {
    /* no-op */
  }
}
