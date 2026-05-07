// domain/schema/indexes.ts — SQL index creation statements

export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_parent_uuid ON messages(parent_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_messages_session_type_ts ON messages(session_id, type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type_timestamp ON messages(type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_session ON session_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_committed_at ON session_commits(committed_at)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_repo ON session_commits(repo_name, committed_at)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_repo_hash ON session_commits(repo_name, commit_hash)',
  'CREATE INDEX IF NOT EXISTS idx_commit_files_repo ON commit_files(repo_name, file_path)',
  'CREATE INDEX IF NOT EXISTS idx_commit_files_repo_hash ON commit_files(repo_name, commit_hash)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_message_uuid ON message_commits(message_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_session_costs_session ON session_costs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_daily_counts_kind_date ON daily_counts(kind, date)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_session ON message_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_commit ON message_commits(commit_hash)',
];

export const CREATE_RELEASE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_releases_released_at ON releases(released_at)',
  'CREATE INDEX IF NOT EXISTS idx_release_files_tag ON release_files(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_coverage_tag ON release_coverage(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_code_graphs_tag ON release_code_graphs(release_tag)',
  'CREATE INDEX IF NOT EXISTS idx_release_code_graph_communities_tag ON release_code_graph_communities(release_tag)',
];

export const CREATE_CURRENT_COVERAGE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_current_coverage_repo ON current_coverage(repo_name)',
];

export const CREATE_MESSAGE_TOOL_CALLS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_session_id ON message_tool_calls(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_tool_name ON message_tool_calls(tool_name)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_timestamp ON message_tool_calls(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_skill_name ON message_tool_calls(skill_name)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_is_error ON message_tool_calls(is_error)',
  // N-gram自己結合用複合インデックス: (session_id, turn_index, call_index)
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_session_turn ON message_tool_calls(session_id, turn_index, call_index)',
  // 期間集計用複合インデックス: timestamp + turn特定
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_timestamp_turn ON message_tool_calls(timestamp, session_id, turn_index)',
] as const;
