-- Phase 3: memory_spec_documents + memory_spec_doc_entities
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

CREATE TABLE IF NOT EXISTS memory_spec_documents (
  id            TEXT PRIMARY KEY,
  rel_path      TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL CHECK (type IN ('spec','tech','plan','manual','proposal','review','report','test')),
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

CREATE TABLE IF NOT EXISTS memory_spec_doc_entities (
  spec_doc_id TEXT NOT NULL REFERENCES memory_spec_documents(id) ON DELETE CASCADE,
  entity_id   TEXT NOT NULL REFERENCES memory_entities(id),
  line_hint   INTEGER,
  PRIMARY KEY (spec_doc_id, entity_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_memory_spec_documents_type
  ON memory_spec_documents(type);

CREATE INDEX IF NOT EXISTS idx_memory_spec_documents_updated
  ON memory_spec_documents(updated_at);

CREATE INDEX IF NOT EXISTS idx_memory_spec_documents_source_hash
  ON memory_spec_documents(source_hash);

CREATE INDEX IF NOT EXISTS idx_memory_spec_doc_entities_entity
  ON memory_spec_doc_entities(entity_id);
