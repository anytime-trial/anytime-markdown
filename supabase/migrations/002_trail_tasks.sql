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
  PRIMARY KEY (task_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_trail_task_files_task ON trail_task_files(task_id);

-- C4 model elements affected per task
CREATE TABLE IF NOT EXISTS trail_task_c4_elements (
  task_id TEXT NOT NULL REFERENCES trail_tasks(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  element_type TEXT NOT NULL,
  match_type TEXT NOT NULL,
  PRIMARY KEY (task_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_trail_task_c4_task ON trail_task_c4_elements(task_id);
