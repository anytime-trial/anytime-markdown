-- Memory Core Phase 1 Initial Schema
-- TS_GLOB_MS  = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

-- 1. _migrations table
CREATE TABLE IF NOT EXISTS _migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

-- 2. memory_relation_types
CREATE TABLE IF NOT EXISTS memory_relation_types (
  predicate       TEXT PRIMARY KEY,
  cardinality     TEXT NOT NULL CHECK (cardinality IN ('single_active','multiple_active')),
  directionality  TEXT NOT NULL CHECK (directionality IN ('subject_to_object','symmetric')),
  description     TEXT NOT NULL DEFAULT ''
) STRICT;

-- 3. memory_entities
CREATE TABLE IF NOT EXISTS memory_entities (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('Person','Project','Package','File','Library','Tool','Concept','Decision','Bug','Task','Skill','Rule','Commit','Question')),
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

-- 4. memory_episodes (no FK on session_id — cross-DB FK not supported in SQLite)
CREATE TABLE IF NOT EXISTS memory_episodes (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL,
  message_uuid_start   TEXT NOT NULL,
  message_uuid_end     TEXT NOT NULL,
  agent_runtime        TEXT NOT NULL CHECK (agent_runtime IN ('claude_code','codex','gemini','cursor','other')),
  model                TEXT NOT NULL,
  agent_model          TEXT,
  subagent_type        TEXT,
  valid_from           TEXT NOT NULL CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at          TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  raw_excerpt          TEXT NOT NULL,
  summary              TEXT NOT NULL DEFAULT '',
  embedding            BLOB
) STRICT;

-- 5. memory_edges
CREATE TABLE IF NOT EXISTS memory_edges (
  id                TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  predicate         TEXT NOT NULL REFERENCES memory_relation_types(predicate) ON DELETE RESTRICT,
  object_entity_id  TEXT REFERENCES memory_entities(id) ON DELETE SET NULL,
  object_literal    TEXT,
  valid_from        TEXT NOT NULL CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  valid_to          TEXT CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  recorded_at       TEXT NOT NULL CHECK (recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  source_type       TEXT NOT NULL CHECK (source_type IN ('conversation','spec','code','bug_history','review')),
  source_ref        TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 1.0,
  confidence_label  TEXT NOT NULL DEFAULT 'EXTRACTED' CHECK (confidence_label IN ('EXTRACTED','INFERRED','AMBIGUOUS')),
  modality          TEXT NOT NULL DEFAULT 'asserted' CHECK (modality IN ('asserted','mandatory','recommended','forbidden')),
  attributes_json   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
  CHECK (object_entity_id IS NOT NULL OR object_literal IS NOT NULL)
) STRICT;

-- 6. memory_edge_invalidations
CREATE TABLE IF NOT EXISTS memory_edge_invalidations (
  id                  TEXT PRIMARY KEY,
  edge_id             TEXT NOT NULL REFERENCES memory_edges(id) ON DELETE CASCADE,
  invalidated_at      TEXT NOT NULL CHECK (invalidated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR invalidated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  reason              TEXT NOT NULL CHECK (reason IN ('rule_exclusive','llm_contradiction','spec_updated','code_changed','manual')),
  superseding_edge_id TEXT REFERENCES memory_edges(id) ON DELETE SET NULL,
  detail              TEXT NOT NULL DEFAULT ''
) STRICT;

-- 7. memory_episode_entities
CREATE TABLE IF NOT EXISTS memory_episode_entities (
  episode_id   TEXT NOT NULL REFERENCES memory_episodes(id) ON DELETE CASCADE,
  entity_id    TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (episode_id, entity_id)
) STRICT;

-- 8. memory_pipeline_state
CREATE TABLE IF NOT EXISTS memory_pipeline_state (
  scope              TEXT PRIMARY KEY CHECK (scope IN ('conversation_incremental','conversation_backfill','spec_incremental','code_incremental','drift')),
  last_processed_at  TEXT NOT NULL DEFAULT '',
  last_cursor        TEXT,
  status             TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','quarantine','error')),
  error_detail       TEXT NOT NULL DEFAULT ''
) STRICT;

-- 9. memory_pipeline_runs
CREATE TABLE IF NOT EXISTS memory_pipeline_runs (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL,
  started_at          TEXT NOT NULL CHECK (started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  finished_at         TEXT CHECK (finished_at IS NULL OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  status              TEXT NOT NULL CHECK (status IN ('running','success','partial','error')),
  items_processed     INTEGER NOT NULL DEFAULT 0,
  entities_inserted   INTEGER NOT NULL DEFAULT 0,
  entities_updated    INTEGER NOT NULL DEFAULT 0,
  edges_inserted      INTEGER NOT NULL DEFAULT 0,
  edges_invalidated   INTEGER NOT NULL DEFAULT 0,
  drifts_detected     INTEGER NOT NULL DEFAULT 0,
  items_failed        INTEGER NOT NULL DEFAULT 0,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  error_detail        TEXT NOT NULL DEFAULT ''
) STRICT;

-- 10. memory_failed_items
CREATE TABLE IF NOT EXISTS memory_failed_items (
  scope         TEXT NOT NULL,
  item_key      TEXT NOT NULL,
  failed_at     TEXT NOT NULL CHECK (failed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR failed_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  reason        TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  attempt_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, item_key)
) STRICT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_entities_type ON memory_entities(type);
CREATE INDEX IF NOT EXISTS idx_memory_entities_last_updated ON memory_entities(last_updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_episodes_session ON memory_episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_episodes_valid_from ON memory_episodes(valid_from);
CREATE INDEX IF NOT EXISTS idx_memory_edges_subject ON memory_edges(subject_entity_id, predicate);
CREATE INDEX IF NOT EXISTS idx_memory_edges_object ON memory_edges(object_entity_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_active ON memory_edges(valid_to) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges(source_type);
CREATE INDEX IF NOT EXISTS idx_memory_invalidations_edge ON memory_edge_invalidations(edge_id);
CREATE INDEX IF NOT EXISTS idx_memory_runs_started ON memory_pipeline_runs(started_at);

-- Seed: 11 Phase 1 relation type predicates
INSERT OR IGNORE INTO memory_relation_types(predicate, cardinality, directionality, description) VALUES
  ('prefers',      'multiple_active', 'subject_to_object', '主体が対象を好む'),
  ('dislikes',     'multiple_active', 'subject_to_object', '主体が対象を嫌う'),
  ('depends_on',   'multiple_active', 'subject_to_object', 'パッケージ依存・必要条件'),
  ('replaces',     'single_active',   'subject_to_object', '新が旧を置き換え'),
  ('relates_to',   'multiple_active', 'symmetric',         '汎用関連'),
  ('mentioned_in', 'multiple_active', 'subject_to_object', 'エンティティ→出典逆引き'),
  ('authored_by',  'single_active',   'subject_to_object', 'コミット→人物'),
  ('works_on',     'multiple_active', 'subject_to_object', '人物→プロジェクト/タスク'),
  ('uses',         'multiple_active', 'subject_to_object', 'プロジェクト→ライブラリ/ツール'),
  ('asked_by',     'single_active',   'subject_to_object', 'Question→Person（F22）'),
  ('answered_in',  'multiple_active', 'subject_to_object', 'Question→Episode（F22）');
