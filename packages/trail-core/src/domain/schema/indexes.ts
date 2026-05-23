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
  // CrossSourceCorrelator (Step 4d) の `WHERE file_path IN (...)` 用。上の複合 idx は repo_name 先頭で
  // file_path 単独条件に効かないため、file_path 単独 idx を足して commit_files 全表スキャンを避ける。
  'CREATE INDEX IF NOT EXISTS idx_commit_files_file_path ON commit_files(file_path)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_message_uuid ON message_commits(message_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_session_costs_session ON session_costs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_daily_counts_kind_date ON daily_counts(kind, date)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_session ON message_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_commit ON message_commits(commit_hash)',
];

export const CREATE_RELEASE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_releases_released_at ON releases(released_at)',
  // Phase B-2b-iii flip: 子テーブルの FK 列は release_id へ移行。命名は新 FK 列に合わせる。
  'CREATE INDEX IF NOT EXISTS idx_release_files_release_id ON release_files(release_id)',
  'CREATE INDEX IF NOT EXISTS idx_release_coverage_release_id ON release_coverage(release_id)',
  'CREATE INDEX IF NOT EXISTS idx_release_code_graphs_release_id ON release_code_graphs(release_id)',
  'CREATE INDEX IF NOT EXISTS idx_release_code_graph_communities_release_id ON release_code_graph_communities(release_id)',
  // stable_key による「同じノード集合のコミュニティ」高速検索（mappings_json 引き継ぎ用）
  // Phase C-2 flip: current_code_graph_communities の PK が repo_id 化されたため先頭列を repo_id へ。
  "CREATE INDEX IF NOT EXISTS idx_ccgc_stable_key ON current_code_graph_communities(repo_id, stable_key) WHERE stable_key != ''",
  "CREATE INDEX IF NOT EXISTS idx_rcgc_stable_key ON release_code_graph_communities(release_id, stable_key) WHERE stable_key != ''",
];

export const CREATE_CURRENT_COVERAGE_INDEXES = [
  // Phase C-2 flip: current_coverage の PK が repo_id 化されたため repo_id を索引する。
  'CREATE INDEX IF NOT EXISTS idx_current_coverage_repo ON current_coverage(repo_id)',
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
