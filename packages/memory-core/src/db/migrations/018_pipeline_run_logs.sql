-- Pipeline run に紐づく自由文ログ
-- extension_logs は保持期限で刈られるため、run の調査に必要なログを
-- pipeline_runs の子テーブルとして残せるようにする。
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

CREATE TABLE IF NOT EXISTS pipeline_run_logs (
  id        INTEGER PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL CHECK (
    timestamp GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR timestamp GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  level     TEXT NOT NULL CHECK (level IN ('debug','info','warn','error')),
  component TEXT NOT NULL DEFAULT '',
  message   TEXT NOT NULL,
  metadata  TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  stack     TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_pipeline_run_logs_run
  ON pipeline_run_logs(run_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_pipeline_run_logs_level
  ON pipeline_run_logs(level, timestamp);
