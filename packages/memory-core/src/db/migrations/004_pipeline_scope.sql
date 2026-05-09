-- Phase 2.5: add 'bug_history_incremental' to memory_pipeline_state scope CHECK
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE memory_pipeline_state__new (
  scope              TEXT PRIMARY KEY CHECK (scope IN (
    'conversation_incremental', 'conversation_backfill',
    'spec_incremental', 'code_incremental', 'drift',
    'bug_history_incremental'
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
