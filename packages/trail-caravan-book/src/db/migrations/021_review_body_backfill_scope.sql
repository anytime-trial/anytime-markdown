-- memory_pipeline_state.scope へ 'review_body_backfill' を追加する。
--
-- runReviewBackfill は「カーソルより古い session review 行の是正」を担う 1 回限りの
-- 処理で、完了印が無いと review_incremental のたびに全期間のメッセージ再走査
-- （実測 500 ブロック・約 0.6 秒〜数十秒）を繰り返す。印の置き場が要る。
--
-- 完了は他スコープと同じく last_processed_at が非空であることで表す。status には
-- 専用の値を足さない（CHECK は 'idle' / 'running' / 'quarantine' / 'error' のまま）。
--
-- 12-step 再作成が要るのは scope の CHECK 制約を広げるため（STRICT テーブルの
-- CHECK は ALTER で変更できない）。011 / 006 と同じ手順。
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE memory_pipeline_state__new (
  scope              TEXT PRIMARY KEY CHECK (scope IN (
    'conversation_incremental', 'conversation_backfill',
    'conversation_failed_items_retry',
    'spec_incremental', 'code_incremental', 'drift',
    'bug_history_incremental',
    'review_incremental', 'review_session_incremental',
    'review_body_backfill',
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
