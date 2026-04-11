// domain/schema/tables.ts — SQL table/view creation statements

export const CREATE_SESSIONS = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  entrypoint TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT '',
  commits_resolved_at TEXT
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

export const CREATE_DAILY_COSTS = `CREATE TABLE IF NOT EXISTS daily_costs (
  date TEXT NOT NULL,
  model TEXT NOT NULL,
  cost_type TEXT NOT NULL DEFAULT 'actual',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model, cost_type)
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
  system_command TEXT,
  duration_ms INTEGER,
  tool_result_size INTEGER,
  agent_description TEXT,
  agent_model TEXT
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
  PRIMARY KEY (session_id, commit_hash)
)`;

export const CREATE_IMPORTED_FILES = `CREATE TABLE IF NOT EXISTS imported_files (
  file_path TEXT PRIMARY KEY,
  file_size INTEGER NOT NULL DEFAULT 0,
  session_id TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT ''
)`;

export const CREATE_C4_MODELS = `CREATE TABLE IF NOT EXISTS c4_models (
  id TEXT PRIMARY KEY DEFAULT 'current',
  model_json TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
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

export const CREATE_TASKS = `CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  merge_commit_hash TEXT NOT NULL,
  branch_name TEXT,
  pr_number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  merged_at TEXT NOT NULL DEFAULT '',
  base_branch TEXT NOT NULL DEFAULT '',
  commit_count INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  UNIQUE(merge_commit_hash)
)`;

export const CREATE_TASK_FILES = `CREATE TABLE IF NOT EXISTS task_files (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL DEFAULT 'modified',
  PRIMARY KEY (task_id, file_path)
)`;

export const CREATE_TASK_C4_ELEMENTS = `CREATE TABLE IF NOT EXISTS task_c4_elements (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  element_type TEXT NOT NULL,
  element_name TEXT NOT NULL DEFAULT '',
  match_type TEXT NOT NULL,
  PRIMARY KEY (task_id, element_id)
)`;

export const CREATE_TASK_FEATURES = `CREATE TABLE IF NOT EXISTS task_features (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  feature_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, feature_id)
)`;
