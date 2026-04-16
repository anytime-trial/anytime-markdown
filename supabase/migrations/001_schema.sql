-- supabase/migrations/001_schema.sql
-- Trail viewer tables (consolidated schema)
--
-- 本プロジェクトでは Supabase のテーブルを毎回すべて削除してから再作成する運用のため、
-- 先頭で全テーブルを DROP し、その後に CREATE TABLE を実行する。
-- FK 依存順序に注意し、子テーブル → 親テーブルの順で DROP する。

DROP TABLE IF EXISTS trail_message_tool_calls CASCADE;
DROP TABLE IF EXISTS trail_release_features CASCADE;
DROP TABLE IF EXISTS trail_release_files CASCADE;
DROP TABLE IF EXISTS trail_releases CASCADE;
DROP TABLE IF EXISTS trail_current_graphs CASCADE;
DROP TABLE IF EXISTS trail_release_graphs CASCADE;
-- Legacy tables (to be removed after migration)
DROP TABLE IF EXISTS trail_current_c4_models CASCADE;
DROP TABLE IF EXISTS trail_c4_models CASCADE;
DROP TABLE IF EXISTS trail_daily_costs CASCADE;
DROP TABLE IF EXISTS trail_session_costs CASCADE;
DROP TABLE IF EXISTS trail_session_commits CASCADE;
DROP TABLE IF EXISTS trail_messages CASCADE;
DROP TABLE IF EXISTS trail_sessions CASCADE;

CREATE TABLE IF NOT EXISTS trail_sessions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT '',
    project TEXT NOT NULL DEFAULT '',
    repo_name TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    entrypoint TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL DEFAULT '',
    end_time TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT '',
    commits_resolved_at TEXT,
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
    timestamp TEXT NOT NULL DEFAULT '',
    is_sidechain INTEGER NOT NULL DEFAULT 0,
    is_meta INTEGER NOT NULL DEFAULT 0,
    cwd TEXT,
    git_branch TEXT
);

CREATE TABLE IF NOT EXISTS trail_session_commits (
    session_id TEXT NOT NULL REFERENCES trail_sessions(id) ON DELETE CASCADE,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    committed_at TEXT NOT NULL DEFAULT '',
    is_ai_assisted INTEGER NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0,
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, commit_hash)
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

CREATE TABLE IF NOT EXISTS trail_daily_costs (
    date TEXT NOT NULL,
    model TEXT NOT NULL,
    cost_type TEXT NOT NULL DEFAULT 'actual',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (date, model, cost_type)
);

-- リリース版 TrailGraph（id=release tag）。
-- 取得時に trailToC4() で C4Model へ、buildSourceMatrix() で DSM へ変換する。
CREATE TABLE IF NOT EXISTS trail_release_graphs (
    tag        TEXT PRIMARY KEY,
    graph_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT '',
    synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- リポジトリ別 current TrailGraph（拡張機能の current_graphs と対応）
CREATE TABLE IF NOT EXISTS trail_current_graphs (
    repo_name  TEXT PRIMARY KEY,
    commit_id  TEXT NOT NULL DEFAULT '',
    graph_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT '',
    synced_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trail_releases (
    tag TEXT PRIMARY KEY,
    released_at TEXT NOT NULL DEFAULT '',
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

-- インデックス
CREATE INDEX IF NOT EXISTS idx_trail_messages_session ON trail_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_messages_type ON trail_messages(type);
CREATE INDEX IF NOT EXISTS idx_trail_messages_timestamp ON trail_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_trail_sessions_start ON trail_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_trail_session_costs_session ON trail_session_costs(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_daily_costs_date ON trail_daily_costs(date);
CREATE INDEX IF NOT EXISTS idx_trail_daily_costs_type ON trail_daily_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_trail_session_commits_session ON trail_session_commits(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_releases_released_at ON trail_releases(released_at);
CREATE INDEX IF NOT EXISTS idx_trail_release_files_tag ON trail_release_files(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_release_features_tag ON trail_release_features(release_tag);
CREATE INDEX IF NOT EXISTS idx_trail_mtc_session ON trail_message_tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_mtc_timestamp ON trail_message_tool_calls(timestamp);
