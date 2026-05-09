-- Phase 2.7: add review pipeline scopes + source_hash to memory_reviews + Review/ReviewFinding entity types
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Step 1: Add source_hash column to memory_reviews (for incremental skip logic)
ALTER TABLE memory_reviews ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';

-- Step 2: 12-step migration to extend memory_pipeline_state scope CHECK
CREATE TABLE memory_pipeline_state__new (
  scope              TEXT PRIMARY KEY CHECK (scope IN (
    'conversation_incremental', 'conversation_backfill',
    'spec_incremental', 'code_incremental', 'drift',
    'bug_history_incremental',
    'review_incremental', 'review_session_incremental'
  )),
  last_processed_at  TEXT NOT NULL DEFAULT '',
  last_cursor        TEXT,
  status             TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'quarantine', 'error')),
  error_detail       TEXT NOT NULL DEFAULT ''
) STRICT;

INSERT INTO memory_pipeline_state__new SELECT * FROM memory_pipeline_state;

DROP TABLE memory_pipeline_state;
ALTER TABLE memory_pipeline_state__new RENAME TO memory_pipeline_state;

-- Step 3: 12-step migration to extend memory_entities type CHECK to include Review and ReviewFinding
CREATE TABLE memory_entities__new (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN (
    'Person','Project','Package','File','Library','Tool','Concept','Decision',
    'Bug','Task','Skill','Rule','Commit','Question',
    'Review','ReviewFinding'
  )),
  canonical_name   TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  aliases_json     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases_json)),
  tags_json        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  attributes_json  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
  summary          TEXT NOT NULL DEFAULT '',
  embedding        BLOB,
  first_seen_at    TEXT NOT NULL CHECK (first_seen_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR first_seen_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  last_updated_at  TEXT NOT NULL CHECK (last_updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR last_updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at      TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  UNIQUE (type, canonical_name)
) STRICT;

INSERT INTO memory_entities__new SELECT * FROM memory_entities;

DROP TABLE memory_entities;
ALTER TABLE memory_entities__new RENAME TO memory_entities;

-- Recreate indexes on memory_entities
CREATE INDEX IF NOT EXISTS idx_memory_entities_type ON memory_entities(type);
CREATE INDEX IF NOT EXISTS idx_memory_entities_last_updated ON memory_entities(last_updated_at);

COMMIT;
PRAGMA foreign_keys = ON;
