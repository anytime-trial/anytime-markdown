// domain/schema/indexes.ts — SQL index creation statements

export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_parent_uuid ON messages(parent_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_session ON session_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_session_costs_session ON session_costs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_daily_costs_date ON daily_costs(date)',
  'CREATE INDEX IF NOT EXISTS idx_daily_costs_type ON daily_costs(cost_type)',
];

export const CREATE_TASK_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_merged_at ON tasks(merged_at)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_branch ON tasks(branch_name)',
  'CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_task_c4_task ON task_c4_elements(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_task_features_task ON task_features(task_id)',
];
