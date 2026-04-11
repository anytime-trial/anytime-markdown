-- supabase/migrations/003_trail_cost_accuracy.sql

-- 1. sessions テーブルからカラム削除
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS git_branch;
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS cwd;
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS permission_mode;
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS input_tokens;
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS output_tokens;
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS cache_read_tokens;
ALTER TABLE trail_sessions DROP COLUMN IF EXISTS cache_creation_tokens;

-- 2. session_costs テーブル作成
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

-- 3. daily_costs テーブル作成
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

-- 4. messages テーブルにカラム追加
ALTER TABLE trail_messages ADD COLUMN IF NOT EXISTS permission_mode TEXT;
ALTER TABLE trail_messages ADD COLUMN IF NOT EXISTS skill TEXT;
ALTER TABLE trail_messages ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE trail_messages ADD COLUMN IF NOT EXISTS system_command TEXT;

-- 5. インデックス
CREATE INDEX IF NOT EXISTS idx_trail_session_costs_session ON trail_session_costs(session_id);
CREATE INDEX IF NOT EXISTS idx_trail_daily_costs_date ON trail_daily_costs(date);
CREATE INDEX IF NOT EXISTS idx_trail_daily_costs_type ON trail_daily_costs(cost_type);
