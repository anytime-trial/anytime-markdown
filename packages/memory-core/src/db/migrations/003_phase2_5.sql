-- Memory Core Phase 2.5 Schema Extension
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

-- 1. memory_bug_fixes
CREATE TABLE IF NOT EXISTS memory_bug_fixes (
  id                       TEXT PRIMARY KEY,
  commit_sha               TEXT NOT NULL UNIQUE,
  bug_entity_id            TEXT NOT NULL REFERENCES memory_entities(id),
  package                  TEXT NOT NULL,
  category                 TEXT NOT NULL CHECK (category IN
    ('spec', 'logic', 'regression', 'typo', 'deps', 'unknown')),
  subject_summary          TEXT NOT NULL,
  body_excerpt             TEXT NOT NULL DEFAULT '',
  affected_file_paths_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(affected_file_paths_json)),
  related_session_id       TEXT,
  root_cause_episode_id    TEXT REFERENCES memory_episodes(id),
  introduced_commit_sha    TEXT,
  committed_at             TEXT NOT NULL CHECK (
    committed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR committed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  recorded_at              TEXT NOT NULL CHECK (
    recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  )
) STRICT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_bug_fixes_package      ON memory_bug_fixes(package);
CREATE INDEX IF NOT EXISTS idx_memory_bug_fixes_category     ON memory_bug_fixes(category);
CREATE INDEX IF NOT EXISTS idx_memory_bug_fixes_committed_at ON memory_bug_fixes(committed_at);
CREATE INDEX IF NOT EXISTS idx_memory_bug_fixes_bug_entity   ON memory_bug_fixes(bug_entity_id);
CREATE INDEX IF NOT EXISTS idx_memory_bug_fixes_session      ON memory_bug_fixes(related_session_id)
  WHERE related_session_id IS NOT NULL;

-- 2. Seed: Phase 2.5 relation type predicates
INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description) VALUES
  ('fixes',         'single_active',   'subject_to_object', 'コミット→バグ'),
  ('affects',       'multiple_active', 'subject_to_object', 'バグ → 影響を受けたファイル/シンボル'),
  ('caused_by',     'multiple_active', 'subject_to_object', 'バグ → 根本原因'),
  ('introduced_by', 'single_active',   'subject_to_object', 'バグ → バグを混入させたコミット');
