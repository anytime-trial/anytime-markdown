-- Phase 3.1: add 'reference' to memory_spec_documents.type CHECK
-- (auto-generated index 等 type: reference の spec doc を取り込めるようにする)
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE memory_spec_documents__new (
  id            TEXT PRIMARY KEY,
  rel_path      TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL CHECK (type IN ('spec','tech','plan','manual','proposal','review','report','test','reference')),
  title         TEXT NOT NULL,
  c4_scope_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(c4_scope_json)),
  updated_at    TEXT NOT NULL CHECK (
    updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  source_hash   TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  embedding     BLOB,
  recorded_at   TEXT NOT NULL CHECK (
    recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  )
) STRICT;

INSERT INTO memory_spec_documents__new SELECT * FROM memory_spec_documents;

DROP TABLE memory_spec_documents;
ALTER TABLE memory_spec_documents__new RENAME TO memory_spec_documents;

CREATE INDEX IF NOT EXISTS idx_memory_spec_documents_type
  ON memory_spec_documents(type);
CREATE INDEX IF NOT EXISTS idx_memory_spec_documents_updated
  ON memory_spec_documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_spec_documents_source_hash
  ON memory_spec_documents(source_hash);

COMMIT;
PRAGMA foreign_keys = ON;
