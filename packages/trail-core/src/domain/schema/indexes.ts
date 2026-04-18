// domain/schema/indexes.ts — SQL index creation statements

export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_parent_uuid ON messages(parent_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_messages_session_type_ts ON messages(session_id, type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_session ON session_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_session_costs_session ON session_costs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_daily_counts_kind_date ON daily_counts(kind, date)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_session ON message_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_commit ON message_commits(commit_hash)',
];

export const CREATE_RELEASE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_releases_released_at ON releases(released_at)',
  'CREATE INDEX IF NOT EXISTS idx_release_files_tag ON release_files(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_features_tag ON release_features(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_coverage_tag ON release_coverage(release_tag)',
];

export const CREATE_MESSAGE_TOOL_CALLS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_mtc_session   ON message_tool_calls(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_mtc_tool_name ON message_tool_calls(tool_name)',
  'CREATE INDEX IF NOT EXISTS idx_mtc_timestamp ON message_tool_calls(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_mtc_skill     ON message_tool_calls(skill_name)',
  'CREATE INDEX IF NOT EXISTS idx_mtc_is_error  ON message_tool_calls(is_error)',
  // N-gram自己結合用複合インデックス: (session_id, turn_index, call_index)
  'CREATE INDEX IF NOT EXISTS idx_mtc_turn ON message_tool_calls(session_id, turn_index, call_index)',
  // 期間集計用複合インデックス: timestamp + turn特定
  'CREATE INDEX IF NOT EXISTS idx_mtc_ts_turn ON message_tool_calls(timestamp, session_id, turn_index)',
] as const;
