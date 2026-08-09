// domain/schema/indexes.ts — SQL index creation statements

export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON activity_messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON activity_messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON activity_messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_parent_uuid ON activity_messages(parent_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_messages_session_type_ts ON activity_messages(session_id, type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type_timestamp ON activity_messages(type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_session ON activity_session_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_committed_at ON activity_session_commits(committed_at)',
  // Phase D flip: activity_session_commits / activity_commit_files の PK が repo_id 化されたため、repo フィルタ系
  // インデックスの先頭列を repo_id へ移行する (repo_name 系は撤去)。命名は idx_<table>_<cols>。
  'CREATE INDEX IF NOT EXISTS idx_session_commits_repo_id_committed_at ON activity_session_commits(repo_id, committed_at)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_repo_id_hash ON activity_session_commits(repo_id, commit_hash)',
  'CREATE INDEX IF NOT EXISTS idx_commit_files_repo_id_file_path ON activity_commit_files(repo_id, file_path)',
  'CREATE INDEX IF NOT EXISTS idx_commit_files_repo_id_hash ON activity_commit_files(repo_id, commit_hash)',
  // CrossSourceCorrelator (Step 4d) の `WHERE file_path IN (...)` 用。上の複合 idx は repo_name 先頭で
  // file_path 単独条件に効かないため、file_path 単独 idx を足して activity_commit_files 全表スキャンを避ける。
  'CREATE INDEX IF NOT EXISTS idx_commit_files_file_path ON activity_commit_files(file_path)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_message_uuid ON activity_message_commits(message_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_session_costs_session ON activity_session_costs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_daily_counts_kind_date ON activity_daily_counts(kind, date)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_session ON activity_message_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_message_commits_commit ON activity_message_commits(commit_hash)',
];

export const CREATE_RELEASE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_releases_released_at ON activity_releases(released_at)',
  // Phase B-2b-iii flip: 子テーブルの FK 列は release_id へ移行。命名は新 FK 列に合わせる。
  'CREATE INDEX IF NOT EXISTS idx_release_files_release_id ON activity_release_files(release_id)',
  'CREATE INDEX IF NOT EXISTS idx_release_coverage_release_id ON activity_release_coverage(release_id)',
  'CREATE INDEX IF NOT EXISTS idx_release_code_graphs_release_id ON activity_release_code_graphs(release_id)',
  'CREATE INDEX IF NOT EXISTS idx_release_code_graph_communities_release_id ON activity_release_code_graph_communities(release_id)',
  // stable_key による「同じノード集合のコミュニティ」高速検索（mappings_json 引き継ぎ用）
  // Phase C-2 flip: activity_current_code_graph_communities の PK が repo_id 化されたため先頭列を repo_id へ。
  "CREATE INDEX IF NOT EXISTS idx_ccgc_stable_key ON activity_current_code_graph_communities(repo_id, stable_key) WHERE stable_key != ''",
  "CREATE INDEX IF NOT EXISTS idx_rcgc_stable_key ON activity_release_code_graph_communities(release_id, stable_key) WHERE stable_key != ''",
  // Snapshot per Commit の repo 単位の絞り込みで引く。保持上限超過削除の並び順は
  // `updated_at DESC, rowid DESC`（グラフ自身が名乗る generated_at は同値が並び得るため）
  // で、この索引は並び順には効かない。1 リポジトリ 30 行の上限があり走査でも足りる。
  'CREATE INDEX IF NOT EXISTS idx_commit_code_graphs_repo_id_generated_at ON activity_commit_code_graphs(repo_id, generated_at)',
];

export const CREATE_CURRENT_COVERAGE_INDEXES = [
  // Phase C-2 flip: activity_current_coverage の PK が repo_id 化されたため repo_id を索引する。
  'CREATE INDEX IF NOT EXISTS idx_current_coverage_repo ON activity_current_coverage(repo_id)',
];

// Phase E flip: c4_manual_* の PK が (repo_id, <id>) 化されたため repo_id を索引する。
// 旧 PK auto-index (repo_name, <id>) が担っていた repo フィルタを repo_id 先頭の索引へ移す。
// 命名は idx_<table>_<cols>。新規 DB / flip 済 DB の双方で IF NOT EXISTS により冪等。
export const CREATE_C4_MANUAL_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_c4_manual_elements_repo_id ON activity_c4_manual_elements(repo_id)',
  'CREATE INDEX IF NOT EXISTS idx_c4_manual_relationships_repo_id ON activity_c4_manual_relationships(repo_id)',
  'CREATE INDEX IF NOT EXISTS idx_c4_manual_groups_repo_id ON activity_c4_manual_groups(repo_id)',
];

export const CREATE_MESSAGE_TOOL_CALLS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_session_id ON activity_message_tool_calls(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_tool_name ON activity_message_tool_calls(tool_name)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_timestamp ON activity_message_tool_calls(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_skill_name ON activity_message_tool_calls(skill_name)',
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_is_error ON activity_message_tool_calls(is_error)',
  // N-gram自己結合用複合インデックス: (session_id, turn_index, call_index)
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_session_turn ON activity_message_tool_calls(session_id, turn_index, call_index)',
  // 期間集計用複合インデックス: timestamp + turn特定
  'CREATE INDEX IF NOT EXISTS idx_message_tool_calls_timestamp_turn ON activity_message_tool_calls(timestamp, session_id, turn_index)',
] as const;
