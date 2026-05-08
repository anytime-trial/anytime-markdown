-- supabase/migrations/001_schema.sql
-- Trail viewer tables (consolidated schema)
--
-- 本プロジェクトでは Supabase のテーブルを毎回すべて削除してから再作成する運用のため、
-- 先頭で全テーブルを DROP し、その後に CREATE TABLE を実行する。
-- FK 依存順序に注意し、子テーブル → 親テーブルの順で DROP する。

DROP TABLE IF EXISTS trail_release_code_graph_communities CASCADE;
DROP TABLE IF EXISTS trail_release_code_graphs CASCADE;
DROP TABLE IF EXISTS trail_current_code_graph_communities CASCADE;
DROP TABLE IF EXISTS trail_current_code_graphs CASCADE;
DROP TABLE IF EXISTS trail_current_file_analysis CASCADE;
DROP TABLE IF EXISTS trail_release_file_analysis CASCADE;
DROP TABLE IF EXISTS trail_current_function_analysis CASCADE;
DROP TABLE IF EXISTS trail_release_function_analysis CASCADE;
DROP TABLE IF EXISTS trail_current_coverage CASCADE;
DROP TABLE IF EXISTS trail_release_coverage CASCADE;
DROP TABLE IF EXISTS trail_c4_manual_groups CASCADE;
DROP TABLE IF EXISTS trail_c4_manual_relationships CASCADE;
DROP TABLE IF EXISTS trail_c4_manual_elements CASCADE;
DROP TABLE IF EXISTS trail_message_tool_calls CASCADE;
DROP TABLE IF EXISTS trail_release_features CASCADE;
DROP TABLE IF EXISTS trail_release_files CASCADE;
DROP TABLE IF EXISTS trail_releases CASCADE;
DROP TABLE IF EXISTS trail_current_graphs CASCADE;
DROP TABLE IF EXISTS trail_release_graphs CASCADE;
-- Legacy tables (to be removed after migration)
DROP TABLE IF EXISTS trail_current_c4_models CASCADE;
DROP TABLE IF EXISTS trail_c4_models CASCADE;
DROP TABLE IF EXISTS trail_daily_counts CASCADE;
DROP TABLE IF EXISTS trail_session_costs CASCADE;
DROP TABLE IF EXISTS trail_commit_files CASCADE;
DROP TABLE IF EXISTS trail_session_commits CASCADE;
DROP TABLE IF EXISTS trail_messages CASCADE;
DROP TABLE IF EXISTS trail_sessions CASCADE;

CREATE TABLE IF NOT EXISTS trail_sessions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT '',
    repo_name TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    entrypoint TEXT NOT NULL DEFAULT '',
    start_time TEXT,
    end_time TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT,
    commits_resolved_at TEXT,
    -- Pre-aggregated stats (mirrored from local SQLite at sync time)
    peak_context_tokens INTEGER,
    initial_context_tokens INTEGER,
    interruption_reason TEXT,
    interruption_context_tokens INTEGER,
    compact_count INTEGER,
    source TEXT NOT NULL DEFAULT 'claude_code',
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trail_messages (
    uuid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES trail_sessions(id) ON DELETE CASCADE,
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
    timestamp TEXT,
    is_sidechain INTEGER NOT NULL DEFAULT 0,
    is_meta INTEGER NOT NULL DEFAULT 0,
    cwd TEXT,
    git_branch TEXT,
    -- Subagent / 委任関連: ローカル DB と整合
    permission_mode TEXT,
    skill TEXT,
    agent_id TEXT,
    agent_description TEXT,
    agent_model TEXT,
    subagent_type TEXT,
    source_tool_assistant_uuid TEXT,
    source_tool_use_id TEXT,
    system_command TEXT,
    duration_ms INTEGER,
    tool_result_size INTEGER
);

CREATE TABLE IF NOT EXISTS trail_session_commits (
    session_id TEXT NOT NULL REFERENCES trail_sessions(id) ON DELETE CASCADE,
    repo_name TEXT NOT NULL DEFAULT '',
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    committed_at TEXT,
    is_ai_assisted INTEGER NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0,
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, repo_name, commit_hash)
);

-- コミットごとの変更ファイル一覧。コミットは複数セッションに現れるためセッション非依存。
CREATE TABLE IF NOT EXISTS trail_commit_files (
    repo_name TEXT NOT NULL DEFAULT '',
    commit_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    PRIMARY KEY (repo_name, commit_hash, file_path)
);

CREATE TABLE IF NOT EXISTS trail_session_costs (
    session_id TEXT NOT NULL REFERENCES trail_sessions(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, model)
);

CREATE TABLE IF NOT EXISTS trail_daily_counts (
    date                TEXT NOT NULL,
    kind                TEXT NOT NULL,
    key                 TEXT NOT NULL,
    count               INTEGER NOT NULL DEFAULT 0,
    tokens              INTEGER NOT NULL DEFAULT 0,
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms         INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd  REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (date, kind, key)
);

-- リリース版 TrailGraph（id=release tag）。
-- 取得時に trailToC4() で C4Model へ、buildSourceMatrix() で DSM へ変換する。
CREATE TABLE IF NOT EXISTS trail_release_graphs (
    tag        TEXT PRIMARY KEY,
    graph_json TEXT NOT NULL,
    updated_at TEXT,
    synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- リポジトリ別 current TrailGraph（拡張機能の current_graphs と対応）
CREATE TABLE IF NOT EXISTS trail_current_graphs (
    repo_name  TEXT PRIMARY KEY,
    commit_id  TEXT NOT NULL DEFAULT '',
    graph_json TEXT NOT NULL,
    updated_at TEXT,
    synced_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trail_releases (
    tag TEXT PRIMARY KEY,
    released_at TEXT,
    prev_tag TEXT,
    repo_name TEXT NOT NULL DEFAULT '',
    package_tags TEXT NOT NULL DEFAULT '[]',
    commit_count INTEGER NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0,
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,
    feat_count INTEGER NOT NULL DEFAULT 0,
    fix_count INTEGER NOT NULL DEFAULT 0,
    refactor_count INTEGER NOT NULL DEFAULT 0,
    test_count INTEGER NOT NULL DEFAULT 0,
    other_count INTEGER NOT NULL DEFAULT 0,
    affected_packages TEXT NOT NULL DEFAULT '[]',
    duration_days REAL NOT NULL DEFAULT 0,
    resolved_at TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trail_release_files (
    release_tag TEXT NOT NULL REFERENCES trail_releases(tag) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,
    change_type TEXT NOT NULL DEFAULT 'modified',
    PRIMARY KEY (release_tag, file_path)
);

CREATE TABLE IF NOT EXISTS trail_release_features (
    release_tag TEXT NOT NULL REFERENCES trail_releases(tag) ON DELETE CASCADE,
    feature_id TEXT NOT NULL,
    feature_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (release_tag, feature_id)
);

CREATE TABLE IF NOT EXISTS trail_message_tool_calls (
    id           BIGSERIAL PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES trail_sessions(id) ON DELETE CASCADE,
    message_uuid TEXT NOT NULL REFERENCES trail_messages(uuid) ON DELETE CASCADE,
    turn_index   INTEGER NOT NULL,
    call_index   INTEGER NOT NULL,
    tool_name    TEXT NOT NULL,
    file_path    TEXT,
    command      TEXT,
    skill_name   TEXT,
    model        TEXT,
    is_sidechain INTEGER NOT NULL DEFAULT 0,
    turn_exec_ms INTEGER,
    has_thinking INTEGER NOT NULL DEFAULT 0,
    is_error     INTEGER NOT NULL DEFAULT 0,
    error_type   TEXT,
    timestamp    TEXT NOT NULL,
    UNIQUE (session_id, message_uuid, call_index)
);

-- C4 手動追加要素（拡張 SQLite の c4_manual_elements と対応）
CREATE TABLE IF NOT EXISTS trail_c4_manual_elements (
    repo_name   TEXT NOT NULL,
    element_id  TEXT NOT NULL,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    external    BOOLEAN NOT NULL DEFAULT FALSE,
    parent_id   TEXT,
    updated_at  TEXT NOT NULL,
    synced_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (repo_name, element_id)
);

-- C4 手動追加関係（拡張 SQLite の c4_manual_relationships と対応）
CREATE TABLE IF NOT EXISTS trail_c4_manual_relationships (
    repo_name   TEXT NOT NULL,
    rel_id      TEXT NOT NULL,
    from_id     TEXT NOT NULL,
    to_id       TEXT NOT NULL,
    label       TEXT,
    technology  TEXT,
    updated_at  TEXT NOT NULL,
    synced_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (repo_name, rel_id)
);

-- C4 手動グループ（拡張 SQLite の c4_manual_groups と対応）
CREATE TABLE IF NOT EXISTS trail_c4_manual_groups (
    repo_name  TEXT NOT NULL,
    group_id   TEXT NOT NULL,
    member_ids TEXT NOT NULL,
    label      TEXT,
    updated_at TEXT NOT NULL,
    synced_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (repo_name, group_id)
);

-- カバレッジ最新スナップショット（ローカル current_coverage と対応）
CREATE TABLE IF NOT EXISTS trail_current_coverage (
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
  updated_at         TEXT,
  PRIMARY KEY (repo_name, package, file_path)
);

-- カバレッジ リリーススナップショット（ローカル release_coverage と対応）
CREATE TABLE IF NOT EXISTS trail_release_coverage (
  release_tag        TEXT    NOT NULL REFERENCES trail_releases(tag) ON DELETE CASCADE,
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
);

-- 未使用コード検出 ファイル単位スコア（ローカル current_file_analysis と対応）
CREATE TABLE IF NOT EXISTS trail_current_file_analysis (
  repo_name                  TEXT             NOT NULL,
  file_path                  TEXT             NOT NULL,
  importance_score           DOUBLE PRECISION NOT NULL DEFAULT 0,
  fan_in_total               INTEGER          NOT NULL DEFAULT 0,
  cognitive_complexity_max   INTEGER          NOT NULL DEFAULT 0,
  line_count                 INTEGER          NOT NULL DEFAULT 0,
  cyclomatic_complexity_max  INTEGER          NOT NULL DEFAULT 0,
  function_count             INTEGER          NOT NULL DEFAULT 0,
  dead_code_score            INTEGER          NOT NULL DEFAULT 0,
  signal_orphan              INTEGER          NOT NULL DEFAULT 0,
  signal_fan_in_zero         INTEGER          NOT NULL DEFAULT 0,
  signal_no_recent_churn     INTEGER          NOT NULL DEFAULT 0,
  signal_zero_coverage       INTEGER          NOT NULL DEFAULT 0,
  signal_isolated_community  INTEGER          NOT NULL DEFAULT 0,
  is_ignored                 INTEGER          NOT NULL DEFAULT 0,
  ignore_reason              TEXT             NOT NULL DEFAULT '',
  analyzed_at                TEXT             NOT NULL,
  PRIMARY KEY (repo_name, file_path)
);
CREATE INDEX IF NOT EXISTS idx_trail_current_file_analysis_dead_code
  ON trail_current_file_analysis (repo_name, dead_code_score DESC);
CREATE INDEX IF NOT EXISTS idx_trail_current_file_analysis_importance
  ON trail_current_file_analysis (repo_name, importance_score DESC);

-- 未使用コード検出 ファイル単位スコア リリース版（ローカル release_file_analysis と対応）
CREATE TABLE IF NOT EXISTS trail_release_file_analysis (
  release_tag                TEXT             NOT NULL REFERENCES trail_releases(tag) ON DELETE CASCADE,
  repo_name                  TEXT             NOT NULL,
  file_path                  TEXT             NOT NULL,
  importance_score           DOUBLE PRECISION NOT NULL DEFAULT 0,
  fan_in_total               INTEGER          NOT NULL DEFAULT 0,
  cognitive_complexity_max   INTEGER          NOT NULL DEFAULT 0,
  line_count                 INTEGER          NOT NULL DEFAULT 0,
  cyclomatic_complexity_max  INTEGER          NOT NULL DEFAULT 0,
  function_count             INTEGER          NOT NULL DEFAULT 0,
  dead_code_score            INTEGER          NOT NULL DEFAULT 0,
  signal_orphan              INTEGER          NOT NULL DEFAULT 0,
  signal_fan_in_zero         INTEGER          NOT NULL DEFAULT 0,
  signal_no_recent_churn     INTEGER          NOT NULL DEFAULT 0,
  signal_zero_coverage       INTEGER          NOT NULL DEFAULT 0,
  signal_isolated_community  INTEGER          NOT NULL DEFAULT 0,
  is_ignored                 INTEGER          NOT NULL DEFAULT 0,
  ignore_reason              TEXT             NOT NULL DEFAULT '',
  analyzed_at                TEXT             NOT NULL,
  PRIMARY KEY (release_tag, repo_name, file_path)
);

-- 未使用コード検出 関数単位スコア（ローカル current_function_analysis と対応）
CREATE TABLE IF NOT EXISTS trail_current_function_analysis (
  repo_name              TEXT             NOT NULL,
  file_path              TEXT             NOT NULL,
  function_name          TEXT             NOT NULL,
  start_line             INTEGER          NOT NULL,
  end_line               INTEGER          NOT NULL DEFAULT 0,
  language               TEXT             NOT NULL DEFAULT '',
  fan_in                 INTEGER          NOT NULL DEFAULT 0,
  cognitive_complexity   INTEGER          NOT NULL DEFAULT 0,
  cyclomatic_complexity  INTEGER          NOT NULL DEFAULT 0,
  data_mutation_score    INTEGER          NOT NULL DEFAULT 0,
  side_effect_score      INTEGER          NOT NULL DEFAULT 0,
  line_count             INTEGER          NOT NULL DEFAULT 0,
  importance_score       DOUBLE PRECISION NOT NULL DEFAULT 0,
  signal_fan_in_zero     INTEGER          NOT NULL DEFAULT 0,
  analyzed_at            TEXT             NOT NULL,
  PRIMARY KEY (repo_name, file_path, function_name, start_line)
);

-- 未使用コード検出 関数単位スコア リリース版（ローカル release_function_analysis と対応）
CREATE TABLE IF NOT EXISTS trail_release_function_analysis (
  release_tag            TEXT             NOT NULL REFERENCES trail_releases(tag) ON DELETE CASCADE,
  repo_name              TEXT             NOT NULL,
  file_path              TEXT             NOT NULL,
  function_name          TEXT             NOT NULL,
  start_line             INTEGER          NOT NULL,
  end_line               INTEGER          NOT NULL DEFAULT 0,
  language               TEXT             NOT NULL DEFAULT '',
  fan_in                 INTEGER          NOT NULL DEFAULT 0,
  cognitive_complexity   INTEGER          NOT NULL DEFAULT 0,
  cyclomatic_complexity  INTEGER          NOT NULL DEFAULT 0,
  data_mutation_score    INTEGER          NOT NULL DEFAULT 0,
  side_effect_score      INTEGER          NOT NULL DEFAULT 0,
  line_count             INTEGER          NOT NULL DEFAULT 0,
  importance_score       DOUBLE PRECISION NOT NULL DEFAULT 0,
  signal_fan_in_zero     INTEGER          NOT NULL DEFAULT 0,
  analyzed_at            TEXT             NOT NULL,
  PRIMARY KEY (release_tag, repo_name, file_path, function_name, start_line)
);

-- コードグラフ最新スナップショット（ローカル current_code_graphs と対応）
CREATE TABLE IF NOT EXISTS trail_current_code_graphs (
  repo_name    TEXT PRIMARY KEY,
  graph_json   TEXT NOT NULL,
  generated_at TEXT,
  updated_at   TEXT
);

-- コードグラフコミュニティ（ローカル current_code_graph_communities と対応）
CREATE TABLE IF NOT EXISTS trail_current_code_graph_communities (
  repo_name    TEXT    NOT NULL,
  community_id INTEGER NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  name         TEXT    NOT NULL DEFAULT '',
  summary      TEXT    NOT NULL DEFAULT '',
  mappings_json TEXT NULL,
  generated_at TEXT,
  updated_at   TEXT,
  PRIMARY KEY (repo_name, community_id)
);

-- コードグラフ リリーススナップショット（ローカル release_code_graphs と対応）
CREATE TABLE IF NOT EXISTS trail_release_code_graphs (
  release_tag  TEXT PRIMARY KEY REFERENCES trail_releases(tag) ON DELETE CASCADE,
  graph_json   TEXT NOT NULL,
  generated_at TEXT,
  updated_at   TEXT
);

-- コードグラフ リリースコミュニティ（ローカル release_code_graph_communities と対応）
CREATE TABLE IF NOT EXISTS trail_release_code_graph_communities (
  release_tag  TEXT    NOT NULL REFERENCES trail_releases(tag) ON DELETE CASCADE,
  community_id INTEGER NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  name         TEXT    NOT NULL DEFAULT '',
  summary      TEXT    NOT NULL DEFAULT '',
  generated_at TEXT,
  updated_at   TEXT,
  PRIMARY KEY (release_tag, community_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_trail_messages_session ON trail_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_messages_type ON trail_messages(type);
CREATE INDEX IF NOT EXISTS idx_trail_messages_timestamp ON trail_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_trail_messages_agent_id ON trail_messages(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trail_messages_subagent_type ON trail_messages(subagent_type) WHERE subagent_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trail_messages_source_tool ON trail_messages(source_tool_assistant_uuid) WHERE source_tool_assistant_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trail_sessions_start ON trail_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_trail_session_costs_session ON trail_session_costs(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_daily_counts_date ON trail_daily_counts(date);
CREATE INDEX IF NOT EXISTS idx_trail_daily_counts_kind ON trail_daily_counts(kind);
CREATE INDEX IF NOT EXISTS idx_trail_session_commits_session ON trail_session_commits(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_session_commits_committed_at ON trail_session_commits(committed_at);
CREATE INDEX IF NOT EXISTS idx_trail_session_commits_repo_committed_at ON trail_session_commits(repo_name, committed_at);
CREATE INDEX IF NOT EXISTS idx_trail_session_commits_repo_hash ON trail_session_commits(repo_name, commit_hash);
CREATE INDEX IF NOT EXISTS idx_trail_commit_files_hash ON trail_commit_files(commit_hash);
CREATE INDEX IF NOT EXISTS idx_trail_commit_files_repo_hash ON trail_commit_files(repo_name, commit_hash);
CREATE INDEX IF NOT EXISTS idx_trail_releases_released_at ON trail_releases(released_at);
CREATE INDEX IF NOT EXISTS idx_trail_release_files_tag ON trail_release_files(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_release_features_tag ON trail_release_features(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_release_coverage_tag ON trail_release_coverage(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_release_code_graphs_tag ON trail_release_code_graphs(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_release_code_graph_communities_tag ON trail_release_code_graph_communities(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_mtc_session ON trail_message_tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_mtc_timestamp ON trail_message_tool_calls(timestamp);

-- Row Level Security ポリシー
--
-- 個人利用の trail データであり、publishable anon key は web app バンドル内で既に公開されている。
-- Supabase ダッシュボードの警告を避けるため RLS は有効化した上で、anon/authenticated ロールに
-- 全操作を許可する permissive ポリシーを付与する。
-- 拡張機能の SyncService は anon key で upsert/delete を行うため、この許可がないと RLS 違反になる。

ALTER TABLE trail_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_sessions_all" ON trail_sessions;
CREATE POLICY "trail_sessions_all" ON trail_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_messages_all" ON trail_messages;
CREATE POLICY "trail_messages_all" ON trail_messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_session_commits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_session_commits_all" ON trail_session_commits;
CREATE POLICY "trail_session_commits_all" ON trail_session_commits FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_commit_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_commit_files_all" ON trail_commit_files;
CREATE POLICY "trail_commit_files_all" ON trail_commit_files FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_session_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_session_costs_all" ON trail_session_costs;
CREATE POLICY "trail_session_costs_all" ON trail_session_costs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_daily_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_daily_counts_all" ON trail_daily_counts;
CREATE POLICY "trail_daily_counts_all" ON trail_daily_counts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_graphs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_graphs_all" ON trail_release_graphs;
CREATE POLICY "trail_release_graphs_all" ON trail_release_graphs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_current_graphs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_current_graphs_all" ON trail_current_graphs;
CREATE POLICY "trail_current_graphs_all" ON trail_current_graphs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_releases_all" ON trail_releases;
CREATE POLICY "trail_releases_all" ON trail_releases FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_files_all" ON trail_release_files;
CREATE POLICY "trail_release_files_all" ON trail_release_files FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_features_all" ON trail_release_features;
CREATE POLICY "trail_release_features_all" ON trail_release_features FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_message_tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_message_tool_calls_all" ON trail_message_tool_calls;
CREATE POLICY "trail_message_tool_calls_all" ON trail_message_tool_calls FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_c4_manual_elements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_c4_manual_elements_all" ON trail_c4_manual_elements;
CREATE POLICY "trail_c4_manual_elements_all" ON trail_c4_manual_elements FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_c4_manual_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_c4_manual_relationships_all" ON trail_c4_manual_relationships;
CREATE POLICY "trail_c4_manual_relationships_all" ON trail_c4_manual_relationships FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_c4_manual_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_c4_manual_groups_all" ON trail_c4_manual_groups;
CREATE POLICY "trail_c4_manual_groups_all" ON trail_c4_manual_groups FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_current_coverage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_current_coverage_all" ON trail_current_coverage;
CREATE POLICY "trail_current_coverage_all" ON trail_current_coverage FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_coverage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_coverage_all" ON trail_release_coverage;
CREATE POLICY "trail_release_coverage_all" ON trail_release_coverage FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_current_file_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_current_file_analysis_all" ON trail_current_file_analysis;
CREATE POLICY "trail_current_file_analysis_all" ON trail_current_file_analysis FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_file_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_file_analysis_all" ON trail_release_file_analysis;
CREATE POLICY "trail_release_file_analysis_all" ON trail_release_file_analysis FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_current_function_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_current_function_analysis_all" ON trail_current_function_analysis;
CREATE POLICY "trail_current_function_analysis_all" ON trail_current_function_analysis FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_function_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_function_analysis_all" ON trail_release_function_analysis;
CREATE POLICY "trail_release_function_analysis_all" ON trail_release_function_analysis FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_current_code_graphs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_current_code_graphs_all" ON trail_current_code_graphs;
CREATE POLICY "trail_current_code_graphs_all" ON trail_current_code_graphs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_current_code_graph_communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_current_code_graph_communities_all" ON trail_current_code_graph_communities;
CREATE POLICY "trail_current_code_graph_communities_all" ON trail_current_code_graph_communities FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_code_graphs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_code_graphs_all" ON trail_release_code_graphs;
CREATE POLICY "trail_release_code_graphs_all" ON trail_release_code_graphs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE trail_release_code_graph_communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_release_code_graph_communities_all" ON trail_release_code_graph_communities;
CREATE POLICY "trail_release_code_graph_communities_all" ON trail_release_code_graph_communities FOR ALL USING (true) WITH CHECK (true);


-- =====================================================================
-- 性能改善 Phase 1 (2026-05-06): trail-viewer の getQualityMetrics 改善
-- =====================================================================

-- type+timestamp 複合 index: assistant message の type+range filter を index 内で完結
CREATE INDEX IF NOT EXISTS idx_trail_messages_type_timestamp
    ON trail_messages (type, timestamp);

-- session_id+type+timestamp 複合 index: per-session の type filter (RPC / fetchUserMessages 用)
CREATE INDEX IF NOT EXISTS idx_trail_messages_session_type_timestamp
    ON trail_messages (session_id, type, timestamp);

-- quality-metrics RPC: assistant message を直前の user message に紐付け、user_uuid 単位で
-- (model 別) token を集約する。cost は per-model breakdown で TS 側 calculateCost に渡す。
-- 引数は text。trail_messages.timestamp が TEXT (ISO 8601 文字列) のため、
-- timestamptz と比較できない。ISO 8601 文字列同士の lexicographic 比較で
-- chronological 順を担保する。
CREATE OR REPLACE FUNCTION trail_quality_metrics_user_token_aggregates(
    time_from text,
    time_to text,
    session_ids text[]
)
RETURNS TABLE (
    user_uuid text,
    cost_breakdown jsonb
)
LANGUAGE sql
STABLE
AS $$
WITH
assistants AS (
    SELECT
        session_id,
        timestamp,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        COALESCE(model, '') AS model
    FROM trail_messages
    WHERE type = 'assistant'
      AND session_id = ANY(session_ids)
      AND timestamp BETWEEN time_from AND time_to
),
user_msgs AS (
    SELECT uuid, session_id, timestamp
    FROM trail_messages
    WHERE type = 'user'
      AND session_id = ANY(session_ids)
),
matched AS (
    SELECT DISTINCT ON (a.session_id, a.timestamp)
        a.input_tokens,
        a.output_tokens,
        a.cache_read_tokens,
        a.cache_creation_tokens,
        a.model,
        u.uuid AS user_uuid
    FROM assistants a
    JOIN user_msgs u
      ON u.session_id = a.session_id
     AND u.timestamp <= a.timestamp
    ORDER BY a.session_id, a.timestamp, u.timestamp DESC
),
per_user_model AS (
    SELECT
        user_uuid,
        model,
        SUM(input_tokens)::bigint AS sum_input,
        SUM(output_tokens)::bigint AS sum_output,
        SUM(cache_read_tokens)::bigint AS sum_cache_read,
        SUM(cache_creation_tokens)::bigint AS sum_cache_creation
    FROM matched
    WHERE user_uuid IS NOT NULL
    GROUP BY user_uuid, model
)
SELECT
    user_uuid,
    jsonb_agg(
        jsonb_build_object(
            'model', model,
            'input', sum_input,
            'output', sum_output,
            'cache_read', sum_cache_read,
            'cache_creation', sum_cache_creation
        )
    ) AS cost_breakdown
FROM per_user_model
GROUP BY user_uuid;
$$;

-- =====================================================================
-- Phase 5d: Materialized View for quality-metrics performance
-- =====================================================================
-- Phase 1 の trail_quality_metrics_user_token_aggregates RPC は DISTINCT ON join で
-- 3.25 秒かかる。Materialized View で事前計算することで 1 秒以下を狙う。
-- REFRESH は trail-db の import 完了 hook で行う。

CREATE MATERIALIZED VIEW IF NOT EXISTS trail_user_message_costs AS
WITH matched AS (
    SELECT DISTINCT ON (a.session_id, a.timestamp)
        u.uuid AS user_uuid,
        a.session_id,
        u.timestamp AS user_timestamp,
        COALESCE(a.model, '') AS model,
        a.input_tokens,
        a.output_tokens,
        a.cache_read_tokens,
        a.cache_creation_tokens
    FROM trail_messages a
    JOIN trail_messages u
      ON a.session_id = u.session_id
     AND u.type = 'user'
     AND u.timestamp <= a.timestamp
    WHERE a.type = 'assistant'
    ORDER BY a.session_id, a.timestamp, u.timestamp DESC
)
SELECT
    user_uuid,
    session_id,
    user_timestamp,
    model,
    SUM(input_tokens)::bigint AS input_tokens,
    SUM(output_tokens)::bigint AS output_tokens,
    SUM(cache_read_tokens)::bigint AS cache_read_tokens,
    SUM(cache_creation_tokens)::bigint AS cache_creation_tokens
FROM matched
GROUP BY user_uuid, session_id, user_timestamp, model;

CREATE INDEX IF NOT EXISTS idx_trail_user_message_costs_session_ts
    ON trail_user_message_costs (session_id, user_timestamp);
CREATE INDEX IF NOT EXISTS idx_trail_user_message_costs_user
    ON trail_user_message_costs (user_uuid);
-- CONCURRENTLY refresh のため UNIQUE index 必須 (PostgreSQL 制約)。
-- (user_uuid, model) で一意 (上記 GROUP BY で保証される)。
CREATE UNIQUE INDEX IF NOT EXISTS uq_trail_user_message_costs
    ON trail_user_message_costs (user_uuid, model);

-- import 完了後に呼ぶ refresh function。
-- SECURITY DEFINER + statement_timeout=0 で anon キーから RPC 呼び出ししても
-- PostgREST のクエリタイムアウトに引っ掛からず完走する (postgres 権限で実行)。
-- pg_class.relispopulated で MV が初回 (未 populate) かを判定し、
-- 初回は非 CONCURRENT、以降は CONCURRENT で REFRESH する
-- (CONCURRENTLY は populate 済 MV にしか使えない PostgreSQL 仕様への対処)。
CREATE OR REPLACE FUNCTION refresh_trail_user_message_costs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = 0
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'trail_user_message_costs'
          AND relkind = 'm'
          AND relispopulated
    ) THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY trail_user_message_costs;
    ELSE
        REFRESH MATERIALIZED VIEW trail_user_message_costs;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION refresh_trail_user_message_costs() TO anon, authenticated;

-- =====================================================================
-- Phase 5e: trail_user_messages_meta Materialized View
-- =====================================================================
-- Phase 5d で fetchUserTokenAggregates を 16x 高速化したが、
-- 並列の fetchUserMessageHeaders が ~2.46s で新ボトルネック。
-- user message メタデータ (uuid / session_id / timestamp) を事前計算して
-- pagination + per-session batch のオーバーヘッドを排除する。
-- assistant 応答の有無に関係なく全 user message を含むため、
-- computeUserTokens の動作は完全に維持される (Approach A)。

CREATE MATERIALIZED VIEW IF NOT EXISTS trail_user_messages_meta AS
SELECT
    uuid,
    session_id,
    timestamp
FROM trail_messages
WHERE type = 'user';

-- session_id で範囲検索 (in 句) が主用途
CREATE INDEX IF NOT EXISTS idx_trail_user_messages_meta_session
    ON trail_user_messages_meta (session_id);

-- CONCURRENTLY refresh のため UNIQUE index 必須 (PostgreSQL 制約)。
-- uuid は trail_messages の主キー (一意) を継承するため UNIQUE で問題ない。
CREATE UNIQUE INDEX IF NOT EXISTS uq_trail_user_messages_meta
    ON trail_user_messages_meta (uuid);

-- complexity overlay: tool_calls の JSON を DB 側で展開し、ツール名とファイルパスのみ返す。
-- old_string / new_string / content などの大容量フィールドを Netlify 関数に転送しないため
-- OOM → 502 を防止する。SECURITY DEFINER + statement_timeout=0 でタイムアウトを回避。
CREATE OR REPLACE FUNCTION get_complexity_tool_summary()
RETURNS TABLE(
  output_tokens INTEGER,
  tool_names TEXT[],
  edited_file_paths TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout = 0
AS $$
  SELECT
    m.output_tokens,
    ARRAY(
      SELECT tc->>'name'
      FROM jsonb_array_elements(m.tool_calls::jsonb) AS tc
      WHERE (tc->>'name') IS NOT NULL
    ) AS tool_names,
    ARRAY(
      SELECT tc->'input'->>'file_path'
      FROM jsonb_array_elements(m.tool_calls::jsonb) AS tc
      WHERE (tc->>'name') IN ('Edit', 'Write', 'NotebookEdit')
        AND (tc->'input'->>'file_path') IS NOT NULL
    ) AS edited_file_paths
  FROM trail_messages m
  WHERE m.type = 'assistant'
    AND m.tool_calls IS NOT NULL;
$$;

-- import 完了後に呼ぶ refresh function。
-- SECURITY DEFINER + statement_timeout=0 で anon キーから RPC 呼び出ししても
-- PostgREST のクエリタイムアウトに引っ掛からず完走する (postgres 権限で実行)。
-- pg_class.relispopulated で MV が初回 (未 populate) かを判定し、
-- 初回は非 CONCURRENT、以降は CONCURRENT で REFRESH する
-- (CONCURRENTLY は populate 済 MV にしか使えない PostgreSQL 仕様への対処)。
CREATE OR REPLACE FUNCTION refresh_trail_user_messages_meta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = 0
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'trail_user_messages_meta'
          AND relkind = 'm'
          AND relispopulated
    ) THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY trail_user_messages_meta;
    ELSE
        REFRESH MATERIALIZED VIEW trail_user_messages_meta;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION refresh_trail_user_messages_meta() TO anon, authenticated;
