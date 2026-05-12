-- 013_rag_fts.sql
-- RAG 用 FTS5 (BM25) インデックスと memory_pipeline_state.scope 拡張
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- 1. FTS5 contentless ミラー (3 テーブル)
CREATE VIRTUAL TABLE IF NOT EXISTS memory_entities_fts USING fts5(
  display_name,
  summary,
  aliases_text,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_episodes_fts USING fts5(
  raw_excerpt,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_drift_events_fts USING fts5(
  predicate,
  conversation_value,
  spec_value,
  code_value,
  resolution_note,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);

-- 2. memory_pipeline_state.scope CHECK 拡張 (12-step テーブル再作成)
CREATE TABLE memory_pipeline_state__new (
  scope              TEXT PRIMARY KEY CHECK (scope IN (
    'conversation_incremental', 'conversation_backfill',
    'conversation_failed_items_retry',
    'spec_incremental', 'code_incremental', 'drift',
    'bug_history_incremental',
    'review_incremental', 'review_session_incremental',
    'rag_fts_rebuild'
  )),
  last_processed_at  TEXT NOT NULL DEFAULT '',
  last_cursor        TEXT,
  status             TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'quarantine', 'error')),
  error_detail       TEXT NOT NULL DEFAULT ''
) STRICT;

INSERT INTO memory_pipeline_state__new SELECT * FROM memory_pipeline_state;

DROP TABLE memory_pipeline_state;
ALTER TABLE memory_pipeline_state__new RENAME TO memory_pipeline_state;

COMMIT;
PRAGMA foreign_keys = ON;
