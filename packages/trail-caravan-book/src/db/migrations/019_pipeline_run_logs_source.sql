ALTER TABLE pipeline_run_logs
  ADD COLUMN source TEXT NOT NULL DEFAULT 'daemon' CHECK (source IN ('extension','daemon'));

CREATE INDEX IF NOT EXISTS idx_pipeline_run_logs_source
  ON pipeline_run_logs(source, timestamp);
