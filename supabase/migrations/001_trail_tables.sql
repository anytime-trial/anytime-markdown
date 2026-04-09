-- supabase/migrations/001_trail_tables.sql

CREATE TABLE IF NOT EXISTS trail_sessions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT '',
    project TEXT NOT NULL DEFAULT '',
    git_branch TEXT NOT NULL DEFAULT '',
    cwd TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    entrypoint TEXT NOT NULL DEFAULT '',
    permission_mode TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL DEFAULT '',
    end_time TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT '',
    peak_context_tokens INTEGER,
    initial_context_tokens INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_trail_messages_session ON trail_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_messages_type ON trail_messages(type);
CREATE INDEX IF NOT EXISTS idx_trail_messages_timestamp ON trail_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_trail_sessions_start ON trail_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_trail_commits_session ON trail_session_commits(session_id);
