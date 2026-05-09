-- Phase 2.7: add memory_review_runs + extend memory_reviews.source_kind CHECK to include 'agent'
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- ── Step 1: Create memory_review_runs ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_review_runs (
  id                TEXT PRIMARY KEY,
  trigger_kind      TEXT NOT NULL CHECK (trigger_kind IN ('cron', 'hook', 'manual', 'mcp')),
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('spec', 'code', 'package', 'mixed')),
  target_refs_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(target_refs_json)),
  model             TEXT NOT NULL,
  prompt_kind       TEXT NOT NULL CHECK (prompt_kind IN
    ('a11y', 'security', 'perf', 'spec_drift', 'naming', 'logic', 'multi')),
  prompt_hash       TEXT NOT NULL,
  started_at        TEXT NOT NULL CHECK (
    started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  finished_at       TEXT CHECK (
    finished_at IS NULL
    OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL CHECK (status IN
    ('running', 'success', 'partial', 'error', 'rejected_external_endpoint')),
  findings_count    INTEGER NOT NULL DEFAULT 0,
  findings_inserted INTEGER NOT NULL DEFAULT 0,
  findings_merged   INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  gpu_used          TEXT NOT NULL DEFAULT '',
  review_id         TEXT REFERENCES memory_reviews(id),
  error_detail      TEXT NOT NULL DEFAULT '',
  recorded_at       TEXT NOT NULL CHECK (
    recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z')
) STRICT;

CREATE INDEX IF NOT EXISTS idx_memory_review_runs_started     ON memory_review_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_memory_review_runs_status      ON memory_review_runs(status);
CREATE INDEX IF NOT EXISTS idx_memory_review_runs_target_kind ON memory_review_runs(target_kind);
CREATE INDEX IF NOT EXISTS idx_memory_review_runs_trigger     ON memory_review_runs(trigger_kind);
CREATE INDEX IF NOT EXISTS idx_memory_review_runs_model       ON memory_review_runs(model);
CREATE INDEX IF NOT EXISTS idx_memory_review_runs_running     ON memory_review_runs(started_at)
  WHERE status = 'running';

-- ── Step 2: Extend memory_reviews.source_kind CHECK to include 'agent' ────────
-- 12-step table recreation (SQLite cannot ALTER CHECK constraints)
-- Column order must match existing memory_reviews (after migration 006 ALTER TABLE ADD COLUMN source_hash)

CREATE TABLE memory_reviews__new (
  id                TEXT PRIMARY KEY,
  source_kind       TEXT NOT NULL CHECK (source_kind IN
    ('review_doc', 'session', 'agent', 'pr_comment')),
  source_ref        TEXT NOT NULL,
  review_entity_id  TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  target_kind       TEXT NOT NULL CHECK (target_kind IN
    ('spec', 'code', 'package', 'release', 'mixed')),
  target_refs_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(target_refs_json)),
  title             TEXT NOT NULL,
  reviewer          TEXT NOT NULL DEFAULT '',
  severity_overall  TEXT NOT NULL DEFAULT 'info' CHECK (severity_overall IN ('info', 'warn', 'error')),
  summary           TEXT NOT NULL DEFAULT '',
  body_excerpt      TEXT NOT NULL DEFAULT '',
  reviewed_at       TEXT NOT NULL CHECK (
    reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at       TEXT NOT NULL CHECK (
    recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  source_hash       TEXT NOT NULL DEFAULT '',
  UNIQUE (source_kind, source_ref)
) STRICT;

INSERT INTO memory_reviews__new SELECT * FROM memory_reviews;

DROP TABLE memory_reviews;

ALTER TABLE memory_reviews__new RENAME TO memory_reviews;

-- Recreate indexes on memory_reviews
CREATE INDEX IF NOT EXISTS idx_memory_reviews_target_kind ON memory_reviews(target_kind);
CREATE INDEX IF NOT EXISTS idx_memory_reviews_reviewed_at ON memory_reviews(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_memory_reviews_severity    ON memory_reviews(severity_overall);

COMMIT;
PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
