-- Phase 2.7: review ingestion tables
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

CREATE TABLE IF NOT EXISTS memory_reviews (
  id                TEXT PRIMARY KEY,
  source_kind       TEXT NOT NULL CHECK (source_kind IN ('review_doc', 'session', 'pr_comment')),
  source_ref        TEXT NOT NULL,
  review_entity_id  TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('spec', 'code', 'package', 'release', 'mixed')),
  target_refs_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(target_refs_json)),
  title             TEXT NOT NULL,
  reviewer          TEXT NOT NULL DEFAULT '',
  severity_overall  TEXT NOT NULL DEFAULT 'info' CHECK (severity_overall IN ('info', 'warn', 'error')),
  summary           TEXT NOT NULL DEFAULT '',
  body_excerpt      TEXT NOT NULL DEFAULT '',
  reviewed_at       TEXT NOT NULL CHECK (reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at       TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  UNIQUE (source_kind, source_ref)
) STRICT;

CREATE TABLE IF NOT EXISTS memory_review_findings (
  id                   TEXT PRIMARY KEY,
  review_id            TEXT NOT NULL REFERENCES memory_reviews(id) ON DELETE CASCADE,
  finding_entity_id    TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  finding_index        INTEGER NOT NULL,
  target_file_path     TEXT,
  target_symbol        TEXT,
  target_line_start    INTEGER,
  target_line_end      INTEGER,
  category             TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('design', 'a11y', 'security', 'perf', 'naming', 'spec', 'logic', 'other')),
  severity             TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),
  finding_text         TEXT NOT NULL,
  suggestion_text      TEXT NOT NULL DEFAULT '',
  addressed_commit_sha TEXT,
  addressed_at         TEXT CHECK (addressed_at IS NULL OR addressed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR addressed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at          TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  UNIQUE (review_id, finding_index)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_memory_reviews_target_kind ON memory_reviews(target_kind);
CREATE INDEX IF NOT EXISTS idx_memory_reviews_reviewed_at ON memory_reviews(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_memory_reviews_severity ON memory_reviews(severity_overall);
CREATE INDEX IF NOT EXISTS idx_memory_review_findings_review ON memory_review_findings(review_id);
CREATE INDEX IF NOT EXISTS idx_memory_review_findings_file ON memory_review_findings(target_file_path);
CREATE INDEX IF NOT EXISTS idx_memory_review_findings_category ON memory_review_findings(category);
CREATE INDEX IF NOT EXISTS idx_memory_review_findings_addressed ON memory_review_findings(addressed_commit_sha);
CREATE INDEX IF NOT EXISTS idx_memory_review_findings_unaddressed ON memory_review_findings(addressed_at) WHERE addressed_at IS NULL;

INSERT OR IGNORE INTO memory_relation_types (predicate, cardinality, directionality, description) VALUES
  ('reviewed_by', 'multiple_active', 'subject_to_object', '対象 → Review entity'),
  ('flagged',     'multiple_active', 'subject_to_object', 'Review → ReviewFinding'),
  ('addresses',   'multiple_active', 'subject_to_object', 'Commit → ReviewFinding'),
  ('precedes',    'multiple_active', 'subject_to_object', 'ReviewFinding → 後続 Bug');
