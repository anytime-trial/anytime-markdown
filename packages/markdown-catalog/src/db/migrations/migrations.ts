/**
 * markdown-catalog スキーママイグレーション（インライン定義）。
 *
 * trail-caravan-book は `.sql` ファイル＋webpack CopyPlugin だが、markdown-catalog は DDL を TS 文字列として
 * 同梱しバンドラ非依存にする（daemon の webpack バンドルで __dirname/.sql 解決に悩まない）。
 * 将来の変更はこの配列に version を追記する。
 */

import type { DatabaseSync } from 'node:sqlite';

export interface DocMigration {
  readonly version: number;
  /** SQL 一括実行の migration。apply とどちらか一方を必ず持つ。 */
  readonly sql?: string;
  /** code migration（存在ガード等、SQL だけで書けない冪等化が要る場合）。 */
  readonly apply?: (db: DatabaseSync) => void;
}

const INITIAL = `
-- frontmatter 由来のメタ＋型付き関係＋embedding＋全文検索。
-- doc_relation は note-graph と同じく未解決 to_path（プレースホルダ）も許容するため FK を張らない。
CREATE TABLE doc (
  path         TEXT PRIMARY KEY,
  title        TEXT,
  category     TEXT,
  type         TEXT,
  lang         TEXT,
  excerpt      TEXT,
  content_hash TEXT NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;
CREATE INDEX idx_doc_category ON doc (category);

CREATE TABLE doc_relation (
  from_path TEXT NOT NULL,
  to_path   TEXT NOT NULL,
  type      TEXT NOT NULL,
  PRIMARY KEY (from_path, to_path, type)
) STRICT;
CREATE INDEX idx_doc_relation_to   ON doc_relation (to_path, type);
CREATE INDEX idx_doc_relation_from ON doc_relation (from_path, type);

CREATE TABLE doc_embedding (
  path         TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  dim          INTEGER NOT NULL,
  vec          BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  FOREIGN KEY (path) REFERENCES doc (path) ON DELETE CASCADE
) STRICT;

-- tokenize='trigram': 既定 unicode61 は CJK を語分割せず日本語コーパスでキーワード検索が
-- 機能しないため、3 文字以上の substring 一致を行う trigram を使う（日英両対応）。
-- 注意: トークナイザは v1 を直接変更している。markdown-catalog は未デプロイ（0.1.0/private）で既存 DB が
-- 無い前提のため許容。万一トークナイザ変更前の catalog.db が手元にある場合は migration が
-- 適用済 v1 をスキップし旧 doc_fts が残るため、その DB ファイルを削除して再生成（再 ingest）すること。
CREATE VIRTUAL TABLE doc_fts USING fts5(path, title, excerpt, body, tokenize='trigram');
`;

// frontmatter ファセット検索（type / lang での絞り込み）用の索引。category は v1 で索引済み。
const FACET_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_doc_type ON doc (type);
CREATE INDEX IF NOT EXISTS idx_doc_lang ON doc (lang);
`;

// search_sections（節粒度 FTS）。doc_fts と同じく trigram で日英両対応。
// level は検索対象外（UNINDEXED）。snippet は body 列（index 3）から取得する。
// 注意（移行の罠）: incremental ingest は content_hash 不変の doc をスキップするため、
// v3 追加後も既存 doc は doc_section_fts が空のまま。catalog.db を再構築（DB 削除→
// 拡張「Rebuild Doc Search Index」）して全 doc を再 ingest する必要がある。
const SECTION_FTS = `
CREATE VIRTUAL TABLE doc_section_fts USING fts5(
  path, heading, level UNINDEXED, body, tokenize='trigram'
);
`;

// 節単位埋め込み（葉節＋リード節のみ。spec/00.requirements/doc-section-embedding-requirements.ja.md）。
// content_hash は doc の hash（差分判定は doc 単位・節の安定 ID は持たない）。
// backfill は ingest と独立に doc と本テーブルの差分から pending を導出するため、
// v3 の「既存 doc が空のまま」問題（再構築必須）は発生しない。
// path の削除連鎖は FK CASCADE、doc 更新時の洗い替えは embedSections が DELETE→再生成する。
const SECTION_EMBEDDING = `
CREATE TABLE doc_section_embedding (
  path         TEXT NOT NULL REFERENCES doc (path) ON DELETE CASCADE,
  section_idx  INTEGER NOT NULL CHECK (section_idx >= 0),
  heading      TEXT NOT NULL DEFAULT '',
  level        INTEGER NOT NULL CHECK (level BETWEEN 0 AND 6),
  model        TEXT NOT NULL,
  dim          INTEGER NOT NULL CHECK (dim > 0),
  vec          BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (path, section_idx)
) STRICT;
`;

/**
 * v5: テーブル名接頭辞移行（catalog.db → catalog_ 前置・2026-08-08）。
 *
 * code migration にするのは、ALTER TABLE に IF EXISTS が無く「migration 実行後・記帳前」の
 * クラッシュ窓で再実行されたとき SQL 直書きだと no such table で起動不能になるため
 * （trail-caravan-book の 023 と同方針。存在ガードで冪等化する）。
 * FTS5（doc_fts / doc_section_fts）は contentful のため rename で中身ごと移る。
 * v1〜v4 の歴史 SQL は旧名のまま凍結し、新規 DB は v1→…→v5 で同じ最終状態に収束する。
 */
const V5_TABLE_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['doc', 'catalog_doc'],
  ['doc_relation', 'catalog_doc_relation'],
  ['doc_embedding', 'catalog_doc_embedding'],
  ['doc_fts', 'catalog_doc_fts'],
  ['doc_section_fts', 'catalog_doc_section_fts'],
  ['doc_section_embedding', 'catalog_doc_section_embedding'],
];

function applyTablePrefix(db: DatabaseSync): void {
  const existing = new Set(
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((r) => (r as { name: string }).name),
  );
  const statements = V5_TABLE_RENAMES.filter(
    ([from, to]) => existing.has(from) && !existing.has(to),
  ).map(([from, to]) => `ALTER TABLE ${from} RENAME TO ${to}`);
  if (statements.length === 0) return;
  // REFERENCES 句（doc_embedding / doc_section_embedding → doc）の書き換えは
  // foreign_keys=ON のときだけ行われる。open 経路は ON だが、接続状態へ暗黙依存しない
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(['BEGIN', ...statements, 'COMMIT'].join(';\n'));
}

export const MIGRATIONS: readonly DocMigration[] = [
  { version: 1, sql: INITIAL },
  { version: 2, sql: FACET_INDEXES },
  { version: 3, sql: SECTION_FTS },
  { version: 4, sql: SECTION_EMBEDDING },
  { version: 5, apply: applyTablePrefix },
];
