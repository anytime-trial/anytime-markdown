-- doc-core 初期スキーマ。
-- frontmatter 由来のドキュメントメタ＋型付き関係＋embedding＋全文検索を保持する。
-- 関係(doc_relation)は note-graph と同じく未解決 to_path（プレースホルダ）も許容するため FK を張らない。

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

-- 型付き関係（frontmatter related を正規化）。1 ペアに複数 type を許容（PK 複合）。
CREATE TABLE doc_relation (
  from_path TEXT NOT NULL,
  to_path   TEXT NOT NULL,
  type      TEXT NOT NULL,
  PRIMARY KEY (from_path, to_path, type)
) STRICT;

CREATE INDEX idx_doc_relation_to   ON doc_relation (to_path, type);   -- バックリンク
CREATE INDEX idx_doc_relation_from ON doc_relation (from_path, type); -- 前方トラバーサル

-- 意味検索用 embedding（Float32 を BLOB 保存）。doc 削除で連動破棄。
CREATE TABLE doc_embedding (
  path         TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  dim          INTEGER NOT NULL,
  vec          BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  FOREIGN KEY (path) REFERENCES doc (path) ON DELETE CASCADE
) STRICT;

-- キーワード全文検索（FTS5）。path で doc と突き合わせる。
CREATE VIRTUAL TABLE doc_fts USING fts5(path, title, excerpt, body);
