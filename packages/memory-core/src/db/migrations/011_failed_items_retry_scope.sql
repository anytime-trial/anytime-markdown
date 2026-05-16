-- Phase 5: add conversation_failed_items_retry pipeline scope
-- 12-step migration to extend memory_pipeline_state.scope CHECK constraint.
-- runConversationFailedItemsRetry uses this scope to track its own pipeline_state.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE memory_pipeline_state__new (
  scope              TEXT PRIMARY KEY CHECK (scope IN (
    'conversation_incremental', 'conversation_backfill',
    'conversation_failed_items_retry',
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

COMMIT;
PRAGMA foreign_keys = ON;
