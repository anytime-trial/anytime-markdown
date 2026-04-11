-- Tasks (PRs) resolved from merge commits
CREATE TABLE IF NOT EXISTS trail_tasks (
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
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merge_commit_hash)
);

CREATE INDEX IF NOT EXISTS idx_trail_tasks_merged_at ON trail_tasks(merged_at);
CREATE INDEX IF NOT EXISTS idx_trail_tasks_branch ON trail_tasks(branch_name);

-- Files changed per task
CREATE TABLE IF NOT EXISTS trail_task_files (
  task_id TEXT NOT NULL REFERENCES trail_tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL DEFAULT 'modified',
  PRIMARY KEY (task_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_trail_task_files_task ON trail_task_files(task_id);

-- C4 model elements affected per task
CREATE TABLE IF NOT EXISTS trail_task_c4_elements (
  task_id TEXT NOT NULL REFERENCES trail_tasks(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  element_type TEXT NOT NULL,
  element_name TEXT NOT NULL DEFAULT '',
  match_type TEXT NOT NULL,
  PRIMARY KEY (task_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_trail_task_c4_task ON trail_task_c4_elements(task_id);

-- Features affected per task (derived from C4 elements + featureMatrix)
CREATE TABLE IF NOT EXISTS trail_task_features (
  task_id TEXT NOT NULL REFERENCES trail_tasks(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  feature_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_trail_task_features_task ON trail_task_features(task_id);
