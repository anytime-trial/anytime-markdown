import fs from 'node:fs';
import path from 'node:path';
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
 * ファイルシステム上の SQLite DB に読み書きする本番用ストレージ。
 *
 * 破壊的副作用（writeFileSync）を持つ。コンストラクタは絶対パスを要求し、
 * `~/.claude` や `~/.vscode-server` 配下への書き込みはテスト環境で例外を投げる。
 */
export class FileTrailStorage implements ITrailStorage {
  constructor(private readonly dbPath: string) {}

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
    fs.writeFileSync(this.dbPath, Buffer.from(bytes));
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
