/**
 * doc-core スキーママイグレーション（インライン定義）。
 *
 * memory-core は `.sql` ファイル＋webpack CopyPlugin だが、doc-core は DDL を TS 文字列として
 * 同梱しバンドラ非依存にする（daemon の webpack バンドルで __dirname/.sql 解決に悩まない）。
 * 将来の変更はこの配列に version を追記する。
 */

export interface DocMigration {
  readonly version: number;
  readonly sql: string;
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
CREATE VIRTUAL TABLE doc_fts USING fts5(path, title, excerpt, body, tokenize='trigram');
`;

export const MIGRATIONS: readonly DocMigration[] = [{ version: 1, sql: INITIAL }];
