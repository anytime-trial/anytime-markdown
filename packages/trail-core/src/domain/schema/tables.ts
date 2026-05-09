// domain/schema/tables.ts — SQL table/view creation statements
//
// 設計原則:
// - STRICT: 型を強制 (SQLite 3.37+)。INSERT 時に型違反でエラー
// - boolean は INTEGER + CHECK (col IN (0,1))
// - timestamp は TEXT で NULL-able。常に UTC ISO 8601 + Z (`YYYY-MM-DDTHH:mm:ss.sssZ`、24 文字)
//   を強制する。GLOB CHECK で書式違反を SQL 層で弾く。NULL / 空文字は移行期の互換性のため
//   許容しているが、新規書き込みは ISO 8601 を必須とし、欠落は NULL を推奨する
// - DEFAULT '' は意味論的に曖昧 (空文字とデータ未設定が区別不能) なため、timestamp 列では
//   廃止し NULL-able とした。テキスト列 (slug / repo_name / commit_message 等) では空文字も
//   有効値であるため DEFAULT '' を維持する
// - JSON 列は CHECK (json_valid(col)) で構造妥当性を担保
// - FK は明示し、親削除時の動作 (CASCADE / RESTRICT) を必ず指定
// - 複合 PK の参照は複合 FK を使う

// ISO 8601 UTC timestamp patterns. ms 付き (24 chars) と ms なし (20 chars) の両方を許容する。
// テスト・外部 API 経由で `2026-05-05T00:00:00Z` 形式が混入することがあるため OR で繋ぐ
const TS_GLOB_MS = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'`;
const TS_GLOB_NO_MS = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'`;
// Date-only pattern (10 chars: YYYY-MM-DD)
const DATE_GLOB = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`;

export const CREATE_SESSIONS = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  repo_name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  entrypoint TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  start_time TEXT CHECK (start_time IS NULL OR start_time = '' OR start_time GLOB ${TS_GLOB_MS} OR start_time GLOB ${TS_GLOB_NO_MS}),
  end_time TEXT CHECK (end_time IS NULL OR end_time = '' OR end_time GLOB ${TS_GLOB_MS} OR end_time GLOB ${TS_GLOB_NO_MS}),
  message_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT CHECK (imported_at IS NULL OR imported_at = '' OR imported_at GLOB ${TS_GLOB_MS} OR imported_at GLOB ${TS_GLOB_NO_MS}),
  commits_resolved_at TEXT CHECK (commits_resolved_at IS NULL OR commits_resolved_at = '' OR commits_resolved_at GLOB ${TS_GLOB_MS} OR commits_resolved_at GLOB ${TS_GLOB_NO_MS}),
  -- Pre-aggregated stats (populated in rebuildSessionStats after importAll).
  peak_context_tokens INTEGER,
  initial_context_tokens INTEGER,
  git_branch TEXT,
  interruption_reason TEXT,
  interruption_context_tokens INTEGER,
  message_commits_resolved_at TEXT CHECK (message_commits_resolved_at IS NULL OR message_commits_resolved_at = '' OR message_commits_resolved_at GLOB ${TS_GLOB_MS} OR message_commits_resolved_at GLOB ${TS_GLOB_NO_MS}),
  sub_agent_count         INTEGER NOT NULL DEFAULT 0,
  error_count             INTEGER NOT NULL DEFAULT 0,
  assistant_message_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'claude_code'
    CHECK (source IN ('claude_code', 'codex', 'gemini', 'cursor', 'other'))
) STRICT`;

export const CREATE_SESSION_COSTS = `CREATE TABLE IF NOT EXISTS session_costs (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, model)
) STRICT`;

// 統合日次集計テーブル。kind で cost_actual / cost_skill / tool / skill / error / model を識別。
// 従来の daily_costs も cost_actual / cost_skill として本テーブルに統合している。
export const CREATE_DAILY_COUNTS = `CREATE TABLE IF NOT EXISTS daily_counts (
  date TEXT NOT NULL CHECK (date GLOB ${DATE_GLOB}),
  kind TEXT NOT NULL
    CHECK (kind IN ('cost_actual', 'cost_skill', 'tool', 'skill', 'error', 'model', 'message', 'subagent_type')),
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
) STRICT`;

export const CREATE_MESSAGES = `CREATE TABLE IF NOT EXISTS messages (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_uuid TEXT REFERENCES messages(uuid) ON DELETE SET NULL,
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
  timestamp TEXT CHECK (timestamp IS NULL OR timestamp = '' OR timestamp GLOB ${TS_GLOB_MS} OR timestamp GLOB ${TS_GLOB_NO_MS}),
  is_sidechain INTEGER NOT NULL DEFAULT 0 CHECK (is_sidechain IN (0, 1)),
  is_meta INTEGER NOT NULL DEFAULT 0 CHECK (is_meta IN (0, 1)),
  cwd TEXT,
  git_branch TEXT,
  permission_mode TEXT,
  skill TEXT,
  agent_id TEXT,
  source_tool_assistant_uuid TEXT REFERENCES messages(uuid) ON DELETE SET NULL,
  source_tool_use_id TEXT,
  system_command TEXT,
  duration_ms INTEGER,
  tool_result_size INTEGER,
  agent_description TEXT,
  agent_model TEXT,
  subagent_type TEXT
) STRICT`;

export const CREATE_SESSION_COMMITS = `CREATE TABLE IF NOT EXISTS session_commits (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  commit_hash TEXT NOT NULL,
  commit_message TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  committed_at TEXT CHECK (committed_at IS NULL OR committed_at = '' OR committed_at GLOB ${TS_GLOB_MS} OR committed_at GLOB ${TS_GLOB_NO_MS}),
  is_ai_assisted INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_assisted IN (0, 1)),
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  repo_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (session_id, commit_hash)
) STRICT`;

export const CREATE_COMMIT_FILES = `CREATE TABLE IF NOT EXISTS commit_files (
  commit_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  repo_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (commit_hash, file_path)
) STRICT`;

export const CREATE_SESSION_COMMIT_RESOLUTIONS = `CREATE TABLE IF NOT EXISTS session_commit_resolutions (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  repo_name TEXT NOT NULL,
  resolved_at TEXT NOT NULL CHECK (resolved_at GLOB ${TS_GLOB_MS} OR resolved_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (session_id, repo_name)
) STRICT`;

export const CREATE_MESSAGE_COMMITS = `CREATE TABLE IF NOT EXISTS message_commits (
  message_uuid TEXT NOT NULL REFERENCES messages(uuid) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  commit_hash TEXT NOT NULL,
  detected_at TEXT NOT NULL CHECK (detected_at GLOB ${TS_GLOB_MS} OR detected_at GLOB ${TS_GLOB_NO_MS}),
  match_confidence TEXT NOT NULL CHECK(match_confidence IN ('realtime', 'high', 'medium', 'low')),
  PRIMARY KEY (message_uuid, commit_hash)
) STRICT`;

export const CREATE_CURRENT_GRAPHS = `CREATE TABLE IF NOT EXISTS current_graphs (
  repo_name     TEXT PRIMARY KEY,
  commit_id     TEXT NOT NULL DEFAULT '',
  graph_json    TEXT NOT NULL CHECK (json_valid(graph_json)),
  tsconfig_path TEXT NOT NULL,
  project_root  TEXT NOT NULL,
  analyzed_at   TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS}),
  updated_at    TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;

export const CREATE_RELEASE_GRAPHS = `CREATE TABLE IF NOT EXISTS release_graphs (
  tag           TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
  graph_json    TEXT NOT NULL CHECK (json_valid(graph_json)),
  tsconfig_path TEXT NOT NULL,
  project_root  TEXT NOT NULL,
  analyzed_at   TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS}),
  updated_at    TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;

export const CREATE_SKILL_MODELS = `CREATE TABLE IF NOT EXISTS skill_models (
  skill TEXT PRIMARY KEY,
  canonical_skill TEXT,
  recommended_model TEXT NOT NULL DEFAULT 'sonnet'
) STRICT`;

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
  released_at TEXT CHECK (released_at IS NULL OR released_at = '' OR released_at GLOB ${TS_GLOB_MS} OR released_at GLOB ${TS_GLOB_NO_MS}),
  prev_tag TEXT REFERENCES releases(tag) ON DELETE SET NULL,
  repo_name TEXT NOT NULL DEFAULT '',
  package_tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(package_tags)),
  commit_count INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  total_lines INTEGER NOT NULL DEFAULT 0,
  feat_count INTEGER NOT NULL DEFAULT 0,
  fix_count INTEGER NOT NULL DEFAULT 0,
  refactor_count INTEGER NOT NULL DEFAULT 0,
  test_count INTEGER NOT NULL DEFAULT 0,
  other_count INTEGER NOT NULL DEFAULT 0,
  affected_packages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(affected_packages)),
  duration_days REAL NOT NULL DEFAULT 0,
  resolved_at TEXT CHECK (resolved_at IS NULL OR resolved_at = '' OR resolved_at GLOB ${TS_GLOB_MS} OR resolved_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;

export const CREATE_RELEASE_FILES = `CREATE TABLE IF NOT EXISTS release_files (
  release_tag TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL DEFAULT 'modified'
    CHECK (change_type IN ('added', 'modified', 'deleted', 'renamed', 'copied')),
  PRIMARY KEY (release_tag, file_path)
) STRICT`;

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
) STRICT`;

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
  updated_at         TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, package, file_path)
) STRICT`;

// AUTOINCREMENT は撤去。INTEGER PRIMARY KEY は ROWID と同義で再利用される可能性があるが、
// 別カラムで一意性が保たれているため実害はなく、書き込み性能が改善する。
export const CREATE_MESSAGE_TOOL_CALLS = `CREATE TABLE IF NOT EXISTS message_tool_calls (
  id           INTEGER PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_uuid TEXT NOT NULL REFERENCES messages(uuid) ON DELETE CASCADE,
  turn_index   INTEGER NOT NULL,
  call_index   INTEGER NOT NULL,
  tool_name    TEXT NOT NULL,
  file_path    TEXT,
  command      TEXT,
  skill_name   TEXT,
  model        TEXT,
  is_sidechain INTEGER NOT NULL DEFAULT 0 CHECK (is_sidechain IN (0, 1)),
  turn_exec_ms INTEGER,
  has_thinking INTEGER NOT NULL DEFAULT 0 CHECK (has_thinking IN (0, 1)),
  is_error     INTEGER NOT NULL DEFAULT 0 CHECK (is_error IN (0, 1)),
  error_type   TEXT,
  timestamp    TEXT NOT NULL CHECK (timestamp GLOB ${TS_GLOB_MS} OR timestamp GLOB ${TS_GLOB_NO_MS}),
  UNIQUE (message_uuid, call_index)
) STRICT`;

export const CREATE_C4_MANUAL_ELEMENTS = `CREATE TABLE IF NOT EXISTS c4_manual_elements (
  repo_name    TEXT NOT NULL,
  element_id   TEXT NOT NULL,
  type         TEXT NOT NULL
    CHECK (type IN ('person', 'system', 'container', 'component', 'code', 'enterprise')),
  name         TEXT NOT NULL,
  description  TEXT,
  external     INTEGER NOT NULL DEFAULT 0 CHECK (external IN (0, 1)),
  parent_id    TEXT,
  service_type TEXT,
  updated_at   TEXT NOT NULL CHECK (updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, element_id),
  FOREIGN KEY (repo_name, parent_id) REFERENCES c4_manual_elements(repo_name, element_id)
) STRICT`;

export const CREATE_C4_MANUAL_RELATIONSHIPS = `CREATE TABLE IF NOT EXISTS c4_manual_relationships (
  repo_name   TEXT NOT NULL,
  rel_id      TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  label       TEXT,
  technology  TEXT,
  updated_at  TEXT NOT NULL CHECK (updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, rel_id),
  FOREIGN KEY (repo_name, from_id) REFERENCES c4_manual_elements(repo_name, element_id),
  FOREIGN KEY (repo_name, to_id)   REFERENCES c4_manual_elements(repo_name, element_id)
) STRICT`;

export const CREATE_C4_MANUAL_GROUPS = `CREATE TABLE IF NOT EXISTS c4_manual_groups (
  repo_name  TEXT NOT NULL,
  group_id   TEXT NOT NULL,
  member_ids TEXT NOT NULL CHECK (json_valid(member_ids)),
  label      TEXT,
  updated_at TEXT NOT NULL CHECK (updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, group_id)
) STRICT`;

export const CREATE_CURRENT_CODE_GRAPHS = `CREATE TABLE IF NOT EXISTS current_code_graphs (
  repo_name    TEXT PRIMARY KEY,
  graph_json   TEXT NOT NULL CHECK (json_valid(graph_json)),
  generated_at TEXT CHECK (generated_at IS NULL OR generated_at = '' OR generated_at GLOB ${TS_GLOB_MS} OR generated_at GLOB ${TS_GLOB_NO_MS}),
  updated_at   TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;

export const CREATE_RELEASE_CODE_GRAPHS = `CREATE TABLE IF NOT EXISTS release_code_graphs (
  release_tag  TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
  graph_json   TEXT NOT NULL CHECK (json_valid(graph_json)),
  generated_at TEXT CHECK (generated_at IS NULL OR generated_at = '' OR generated_at GLOB ${TS_GLOB_MS} OR generated_at GLOB ${TS_GLOB_NO_MS}),
  updated_at   TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS})
) STRICT`;

export const CREATE_CURRENT_CODE_GRAPH_COMMUNITIES = `CREATE TABLE IF NOT EXISTS current_code_graph_communities (
  repo_name    TEXT    NOT NULL,
  community_id INTEGER NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  name         TEXT    NOT NULL DEFAULT '',
  summary      TEXT    NOT NULL DEFAULT '',
  generated_at TEXT CHECK (generated_at IS NULL OR generated_at = '' OR generated_at GLOB ${TS_GLOB_MS} OR generated_at GLOB ${TS_GLOB_NO_MS}),
  updated_at   TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, community_id)
) STRICT`;

export const CREATE_RELEASE_CODE_GRAPH_COMMUNITIES = `CREATE TABLE IF NOT EXISTS release_code_graph_communities (
  release_tag  TEXT    NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
  community_id INTEGER NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  name         TEXT    NOT NULL DEFAULT '',
  summary      TEXT    NOT NULL DEFAULT '',
  generated_at TEXT CHECK (generated_at IS NULL OR generated_at = '' OR generated_at GLOB ${TS_GLOB_MS} OR generated_at GLOB ${TS_GLOB_NO_MS}),
  updated_at   TEXT CHECK (updated_at IS NULL OR updated_at = '' OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (release_tag, community_id)
) STRICT`;

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
  signal_orphan              INTEGER NOT NULL DEFAULT 0 CHECK (signal_orphan IN (0, 1)),
  signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0, 1)),
  signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0 CHECK (signal_no_recent_churn IN (0, 1)),
  signal_zero_coverage       INTEGER NOT NULL DEFAULT 0 CHECK (signal_zero_coverage IN (0, 1)),
  signal_isolated_community  INTEGER NOT NULL DEFAULT 0 CHECK (signal_isolated_community IN (0, 1)),
  is_ignored                 INTEGER NOT NULL DEFAULT 0 CHECK (is_ignored IN (0, 1)),
  ignore_reason              TEXT NOT NULL DEFAULT '',
  analyzed_at                TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, file_path)
) STRICT`;

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
  signal_orphan              INTEGER NOT NULL DEFAULT 0 CHECK (signal_orphan IN (0, 1)),
  signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0, 1)),
  signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0 CHECK (signal_no_recent_churn IN (0, 1)),
  signal_zero_coverage       INTEGER NOT NULL DEFAULT 0 CHECK (signal_zero_coverage IN (0, 1)),
  signal_isolated_community  INTEGER NOT NULL DEFAULT 0 CHECK (signal_isolated_community IN (0, 1)),
  is_ignored                 INTEGER NOT NULL DEFAULT 0 CHECK (is_ignored IN (0, 1)),
  ignore_reason              TEXT NOT NULL DEFAULT '',
  analyzed_at                TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (release_tag, repo_name, file_path)
) STRICT`;

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
  signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0, 1)),
  analyzed_at            TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (repo_name, file_path, function_name, start_line)
) STRICT`;

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
  signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0, 1)),
  analyzed_at            TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS}),
  PRIMARY KEY (release_tag, repo_name, file_path, function_name, start_line)
) STRICT`;

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
