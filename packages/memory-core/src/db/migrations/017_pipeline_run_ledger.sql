-- 全 Wave 実行台帳への一般化
-- memory_pipeline_runs を pipeline_runs へ改称し、LEP の全 Wave (tier 1..4) と
-- daemon/拡張本体 (wave='system', tier=0) の実行を 1 つの台帳で扱えるようにする。
-- 既存行はすべて Wave 3 (memory) の実行なので、DEFAULT のままで意味が通る。
--
-- 台帳を trail.db へ移さないのは、pipelineWatchdog の orphan 検出が
-- memory_pipeline_state との相関サブクエリで成り立っており、DB を跨ぐと壊れるため。

ALTER TABLE memory_pipeline_runs RENAME TO pipeline_runs;

ALTER TABLE pipeline_runs ADD COLUMN wave TEXT NOT NULL DEFAULT 'memory' CHECK (
  wave IN ('sources', 'primary', 'memory', 'derived', 'system')
);

ALTER TABLE pipeline_runs ADD COLUMN tier INTEGER NOT NULL DEFAULT 3 CHECK (
  tier BETWEEN 0 AND 4
);

-- RENAME TABLE は索引を旧名のまま引き継ぐため、名前を実体へ揃え直す。
DROP INDEX IF EXISTS idx_memory_runs_started;
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_wave ON pipeline_runs(wave, started_at);
