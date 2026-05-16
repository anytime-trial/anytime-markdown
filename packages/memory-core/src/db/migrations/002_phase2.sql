-- Memory Core Phase 2 Schema Extension
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

-- 1. memory_code_facts
CREATE TABLE IF NOT EXISTS memory_code_facts (
  id          TEXT PRIMARY KEY,
  repo_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  symbol_path TEXT,
  fact_type   TEXT NOT NULL CHECK (fact_type IN ('imports','calls','extends','exports','signature')),
  fact_value  TEXT NOT NULL,
  line_start  INTEGER,
  line_end    INTEGER,
  commit_sha  TEXT,
  recorded_at TEXT NOT NULL CHECK (
    recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  )
) STRICT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_code_facts_file        ON memory_code_facts(file_path);
CREATE INDEX IF NOT EXISTS idx_memory_code_facts_type        ON memory_code_facts(fact_type);
CREATE INDEX IF NOT EXISTS idx_memory_code_facts_value       ON memory_code_facts(fact_value);
CREATE INDEX IF NOT EXISTS idx_memory_code_facts_commit      ON memory_code_facts(commit_sha);
CREATE INDEX IF NOT EXISTS idx_memory_code_facts_repo_file   ON memory_code_facts(repo_name, file_path);

-- 2. Seed: Phase 2 relation type predicates
INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description) VALUES
  ('rationale_for',  'multiple_active', 'subject_to_object', '決定根拠 → 対象シンボル/コミット/spec');

INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description) VALUES
  ('imports_module', 'multiple_active', 'subject_to_object', 'File → 外部モジュール');
