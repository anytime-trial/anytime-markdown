// domain/schema/tables.ts — SQL table/view creation statements

export const CREATE_SESSIONS = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  repo_name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  entrypoint TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT '',
  commits_resolved_at TEXT,
  -- Pre-aggregated stats (populated in rebuildSessionStats after importAll).
  peak_context_tokens INTEGER,
  initial_context_tokens INTEGER,
  git_branch TEXT,
  interruption_reason TEXT,
  interruption_context_tokens INTEGER,
  message_commits_resolved_at TEXT,
  source TEXT NOT NULL DEFAULT 'claude_code'
)`;

export const CREATE_SESSION_COSTS = `CREATE TABLE IF NOT EXISTS session_costs (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, model)
)`;

// 統合日次集計テーブル。kind で cost_actual / cost_skill / tool / skill / error / model を識別。
// 従来の daily_costs も cost_actual / cost_skill として本テーブルに統合している。
export const CREATE_DAILY_COUNTS = `CREATE TABLE IF NOT EXISTS daily_counts (
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, kind, key)
)`;

export const CREATE_MESSAGES = `CREATE TABLE IF NOT EXISTS messages (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  parent_uuid TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  text_content TEXT,
  user_content TEXT,
  tool_calls TEXT,
  tool_use_result TEXT,
  model TEXT,
  request_id TEXT,
  stop_reason TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  service_tier TEXT,
  speed TEXT,
  timestamp TEXT NOT NULL DEFAULT '',
  is_sidechain INTEGER NOT NULL DEFAULT 0,
  is_meta INTEGER NOT NULL DEFAULT 0,
  cwd TEXT,
  git_branch TEXT,
  permission_mode TEXT,
  skill TEXT,
  agent_id TEXT,
  source_tool_assistant_uuid TEXT,
  source_tool_use_id TEXT,
  system_command TEXT,
  duration_ms INTEGER,
  tool_result_size INTEGER,
  agent_description TEXT,
  agent_model TEXT,
  subagent_type TEXT
)`;

export const CREATE_SESSION_COMMITS = `CREATE TABLE IF NOT EXISTS session_commits (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  commit_hash TEXT NOT NULL,
  commit_message TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  committed_at TEXT NOT NULL DEFAULT '',
  is_ai_assisted INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  repo_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (session_id, commit_hash)
)`;

export const CREATE_COMMIT_FILES = `CREATE TABLE IF NOT EXISTS commit_files (
  commit_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  repo_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (commit_hash, file_path)
)`;

export const CREATE_SESSION_COMMIT_RESOLUTIONS = `CREATE TABLE IF NOT EXISTS session_commit_resolutions (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  repo_name TEXT NOT NULL,
  resolved_at TEXT NOT NULL,
  PRIMARY KEY (session_id, repo_name)
)`;

export const CREATE_MESSAGE_COMMITS = `CREATE TABLE IF NOT EXISTS message_commits (
  message_uuid TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  commit_hash TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  match_confidence TEXT NOT NULL CHECK(match_confidence IN ('realtime', 'high', 'medium', 'low')),
  PRIMARY KEY (message_uuid, commit_hash)
)`;

export const CREATE_CURRENT_GRAPHS = `CREATE TABLE IF NOT EXISTS current_graphs (
  repo_name     TEXT PRIMARY KEY,
  commit_id     TEXT NOT NULL DEFAULT '',
  graph_json    TEXT NOT NULL,
  tsconfig_path TEXT NOT NULL,
  project_root  TEXT NOT NULL,
  analyzed_at   TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT ''
)`;

export const CREATE_RELEASE_GRAPHS = `CREATE TABLE IF NOT EXISTS release_graphs (
  tag           TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
  graph_json    TEXT NOT NULL,
  tsconfig_path TEXT NOT NULL,
  project_root  TEXT NOT NULL,
  analyzed_at   TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT ''
)`;

export const CREATE_SKILL_MODELS = `CREATE TABLE IF NOT EXISTS skill_models (
  skill TEXT PRIMARY KEY,
  canonical_skill TEXT,
  recommended_model TEXT NOT NULL DEFAULT 'sonnet'
)`;

export const CREATE_SKILL_MODELS_RESOLVED_VIEW = `CREATE VIEW IF NOT EXISTS skill_models_resolved AS
SELECT
  s.skill,
  COALESCE(
    (SELECT c.recommended_model FROM skill_models c WHERE c.skill = s.canonical_skill),
    s.recommended_model
  ) AS recommended_model
FROM skill_models s`;

export const CREATE_RELEASES = `CREATE TABLE IF NOT EXISTS releases (
  tag TEXT PRIMARY KEY,
  released_at TEXT NOT NULL DEFAULT '',
  prev_tag TEXT,
  repo_name TEXT NOT NULL DEFAULT '',
  package_tags TEXT NOT NULL DEFAULT '[]',
  commit_count INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  feat_count INTEGER NOT NULL DEFAULT 0,
  fix_count INTEGER NOT NULL DEFAULT 0,
  refactor_count INTEGER NOT NULL DEFAULT 0,
  test_count INTEGER NOT NULL DEFAULT 0,
  other_count INTEGER NOT NULL DEFAULT 0,
  affected_packages TEXT NOT NULL DEFAULT '[]',
  duration_days REAL NOT NULL DEFAULT 0,
  resolved_at TEXT
)`;

export const CREATE_RELEASE_FILES = `CREATE TABLE IF NOT EXISTS release_files (
  release_tag TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL DEFAULT 'modified',
  PRIMARY KEY (release_tag, file_path)
)`;

export const CREATE_RELEASE_COVERAGE = `CREATE TABLE IF NOT EXISTS release_coverage (
  release_tag        TEXT    NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  package            TEXT    NOT NULL,
  file_path          TEXT    NOT NULL,
  lines_total        INTEGER NOT NULL DEFAULT 0,
  lines_covered      INTEGER NOT NULL DEFAULT 0,
  lines_pct          REAL    NOT NULL DEFAULT 0,
  statements_total   INTEGER NOT NULL DEFAULT 0,
  statements_covered INTEGER NOT NULL DEFAULT 0,
  statements_pct     REAL    NOT NULL DEFAULT 0,
  functions_total    INTEGER NOT NULL DEFAULT 0,
  functions_covered  INTEGER NOT NULL DEFAULT 0,
  functions_pct      REAL    NOT NULL DEFAULT 0,
  branches_total     INTEGER NOT NULL DEFAULT 0,
  branches_covered   INTEGER NOT NULL DEFAULT 0,
  branches_pct       REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (release_tag, package, file_path)
)`;

export const CREATE_CURRENT_COVERAGE = `CREATE TABLE IF NOT EXISTS current_coverage (
  repo_name          TEXT    NOT NULL,
  package            TEXT    NOT NULL,
  file_path          TEXT    NOT NULL,
  lines_total        INTEGER NOT NULL DEFAULT 0,
  lines_covered      INTEGER NOT NULL DEFAULT 0,
  lines_pct          REAL    NOT NULL DEFAULT 0,
  statements_total   INTEGER NOT NULL DEFAULT 0,
  statements_covered INTEGER NOT NULL DEFAULT 0,
  statements_pct     REAL    NOT NULL DEFAULT 0,
  functions_total    INTEGER NOT NULL DEFAULT 0,
  functions_covered  INTEGER NOT NULL DEFAULT 0,
  functions_pct      REAL    NOT NULL DEFAULT 0,
  branches_total     INTEGER NOT NULL DEFAULT 0,
  branches_covered   INTEGER NOT NULL DEFAULT 0,
  branches_pct       REAL    NOT NULL DEFAULT 0,
  updated_at         TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (repo_name, package, file_path)
)`;

export const CREATE_MESSAGE_TOOL_CALLS = `CREATE TABLE IF NOT EXISTS message_tool_calls (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  message_uuid TEXT NOT NULL REFERENCES messages(uuid),
  turn_index   INTEGER NOT NULL,
  call_index   INTEGER NOT NULL,
  tool_name    TEXT NOT NULL,
  file_path    TEXT,
  command      TEXT,
  skill_name   TEXT,
  model        TEXT,
  is_sidechain INTEGER NOT NULL DEFAULT 0,
  turn_exec_ms INTEGER,
  has_thinking INTEGER NOT NULL DEFAULT 0,
  is_error     INTEGER NOT NULL DEFAULT 0,
  error_type   TEXT,
  timestamp    TEXT NOT NULL,
  UNIQUE (message_uuid, call_index)
)`;

export const CREATE_C4_MANUAL_ELEMENTS = `CREATE TABLE IF NOT EXISTS c4_manual_elements (
  repo_name    TEXT NOT NULL,
  element_id   TEXT NOT NULL,
  type         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  external     INTEGER NOT NULL DEFAULT 0,
  parent_id    TEXT,
  service_type TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (repo_name, element_id),
  FOREIGN KEY (repo_name, parent_id) REFERENCES c4_manual_elements(repo_name, element_id)
)`;

export const CREATE_C4_MANUAL_RELATIONSHIPS = `CREATE TABLE IF NOT EXISTS c4_manual_relationships (
  repo_name   TEXT NOT NULL,
  rel_id      TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  label       TEXT,
  technology  TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (repo_name, rel_id),
  FOREIGN KEY (repo_name, from_id) REFERENCES c4_manual_elements(repo_name, element_id),
  FOREIGN KEY (repo_name, to_id)   REFERENCES c4_manual_elements(repo_name, element_id)
)`;

export const CREATE_C4_MANUAL_GROUPS = `CREATE TABLE IF NOT EXISTS c4_manual_groups (
  repo_name  TEXT NOT NULL,
  group_id   TEXT NOT NULL,
  member_ids TEXT NOT NULL,
  label      TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo_name, group_id)
)`;

export const CREATE_CURRENT_CODE_GRAPHS = `CREATE TABLE IF NOT EXISTS current_code_graphs (
  repo_name    TEXT PRIMARY KEY,
  graph_json   TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT ''
)`;

export const CREATE_RELEASE_CODE_GRAPHS = `CREATE TABLE IF NOT EXISTS release_code_graphs (
  release_tag  TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
  graph_json   TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT ''
)`;

export const CREATE_CURRENT_CODE_GRAPH_COMMUNITIES = `CREATE TABLE IF NOT EXISTS current_code_graph_communities (
  repo_name    TEXT    NOT NULL,
  community_id INTEGER NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  name         TEXT    NOT NULL DEFAULT '',
  summary      TEXT    NOT NULL DEFAULT '',
  generated_at TEXT    NOT NULL DEFAULT '',
  updated_at   TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (repo_name, community_id)
)`;

export const CREATE_RELEASE_CODE_GRAPH_COMMUNITIES = `CREATE TABLE IF NOT EXISTS release_code_graph_communities (
  release_tag  TEXT    NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  community_id INTEGER NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  name         TEXT    NOT NULL DEFAULT '',
  summary      TEXT    NOT NULL DEFAULT '',
  generated_at TEXT    NOT NULL DEFAULT '',
  updated_at   TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (release_tag, community_id)
)`;

// ---------------------------------------------------------------------------
//  File / Function Analysis (Dead Code Detection)
// ---------------------------------------------------------------------------

export const CREATE_CURRENT_FILE_ANALYSIS = `CREATE TABLE IF NOT EXISTS current_file_analysis (
  repo_name                  TEXT NOT NULL,
  file_path                  TEXT NOT NULL,
  importance_score           REAL    NOT NULL DEFAULT 0,
  fan_in_total               INTEGER NOT NULL DEFAULT 0,
  cognitive_complexity_max   INTEGER NOT NULL DEFAULT 0,
  line_count                 INTEGER NOT NULL DEFAULT 0,
  cyclomatic_complexity_max  INTEGER NOT NULL DEFAULT 0,
  function_count             INTEGER NOT NULL DEFAULT 0,
  dead_code_score            INTEGER NOT NULL DEFAULT 0,
  signal_orphan              INTEGER NOT NULL DEFAULT 0,
  signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0,
  signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0,
  signal_zero_coverage       INTEGER NOT NULL DEFAULT 0,
  signal_isolated_community  INTEGER NOT NULL DEFAULT 0,
  is_ignored                 INTEGER NOT NULL DEFAULT 0,
  ignore_reason              TEXT NOT NULL DEFAULT '',
  analyzed_at                TEXT NOT NULL,
  PRIMARY KEY (repo_name, file_path)
)`;

export const CREATE_RELEASE_FILE_ANALYSIS = `CREATE TABLE IF NOT EXISTS release_file_analysis (
  release_tag                TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  repo_name                  TEXT NOT NULL,
  file_path                  TEXT NOT NULL,
  importance_score           REAL    NOT NULL DEFAULT 0,
  fan_in_total               INTEGER NOT NULL DEFAULT 0,
  cognitive_complexity_max   INTEGER NOT NULL DEFAULT 0,
  line_count                 INTEGER NOT NULL DEFAULT 0,
  cyclomatic_complexity_max  INTEGER NOT NULL DEFAULT 0,
  function_count             INTEGER NOT NULL DEFAULT 0,
  dead_code_score            INTEGER NOT NULL DEFAULT 0,
  signal_orphan              INTEGER NOT NULL DEFAULT 0,
  signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0,
  signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0,
  signal_zero_coverage       INTEGER NOT NULL DEFAULT 0,
  signal_isolated_community  INTEGER NOT NULL DEFAULT 0,
  is_ignored                 INTEGER NOT NULL DEFAULT 0,
  ignore_reason              TEXT NOT NULL DEFAULT '',
  analyzed_at                TEXT NOT NULL,
  PRIMARY KEY (release_tag, repo_name, file_path)
)`;

export const CREATE_CURRENT_FUNCTION_ANALYSIS = `CREATE TABLE IF NOT EXISTS current_function_analysis (
  repo_name              TEXT NOT NULL,
  file_path              TEXT NOT NULL,
  function_name          TEXT NOT NULL,
  start_line             INTEGER NOT NULL,
  end_line               INTEGER NOT NULL DEFAULT 0,
  language               TEXT NOT NULL DEFAULT '',
  fan_in                 INTEGER NOT NULL DEFAULT 0,
  cognitive_complexity   INTEGER NOT NULL DEFAULT 0,
  cyclomatic_complexity  INTEGER NOT NULL DEFAULT 0,
  data_mutation_score    INTEGER NOT NULL DEFAULT 0,
  side_effect_score      INTEGER NOT NULL DEFAULT 0,
  line_count             INTEGER NOT NULL DEFAULT 0,
  importance_score       REAL    NOT NULL DEFAULT 0,
  signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0,
  analyzed_at            TEXT NOT NULL,
  PRIMARY KEY (repo_name, file_path, function_name, start_line)
)`;

export const CREATE_RELEASE_FUNCTION_ANALYSIS = `CREATE TABLE IF NOT EXISTS release_function_analysis (
  release_tag            TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  repo_name              TEXT NOT NULL,
  file_path              TEXT NOT NULL,
  function_name          TEXT NOT NULL,
  start_line             INTEGER NOT NULL,
  end_line               INTEGER NOT NULL DEFAULT 0,
  language               TEXT NOT NULL DEFAULT '',
  fan_in                 INTEGER NOT NULL DEFAULT 0,
  cognitive_complexity   INTEGER NOT NULL DEFAULT 0,
  cyclomatic_complexity  INTEGER NOT NULL DEFAULT 0,
  data_mutation_score    INTEGER NOT NULL DEFAULT 0,
  side_effect_score      INTEGER NOT NULL DEFAULT 0,
  line_count             INTEGER NOT NULL DEFAULT 0,
  importance_score       REAL    NOT NULL DEFAULT 0,
  signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0,
  analyzed_at            TEXT NOT NULL,
  PRIMARY KEY (release_tag, repo_name, file_path, function_name, start_line)
)`;

export const CREATE_FILE_ANALYSIS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_current_file_analysis_dead_code
    ON current_file_analysis (repo_name, dead_code_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_current_file_analysis_importance
    ON current_file_analysis (repo_name, importance_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_current_function_analysis_fan_in
    ON current_function_analysis (repo_name, fan_in)`,
  `CREATE INDEX IF NOT EXISTS idx_current_function_analysis_importance
    ON current_function_analysis (repo_name, importance_score DESC)`,
];
