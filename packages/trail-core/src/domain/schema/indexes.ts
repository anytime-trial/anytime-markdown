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

export const CREATE_RELEASE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_releases_released_at ON releases(released_at)',
  'CREATE INDEX IF NOT EXISTS idx_release_files_tag ON release_files(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_features_tag ON release_features(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_coverage_tag ON release_coverage(release_tag)',
];
