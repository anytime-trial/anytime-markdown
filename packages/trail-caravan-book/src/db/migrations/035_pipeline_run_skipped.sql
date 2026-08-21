-- 035: caravan_pipeline_runs.status へ 'skipped' を追加する。
--
-- LLM pre-flight でスコープを起動しない判断をしたとき、これまでは wave_skipped イベントと
-- ログしか残らず、台帳には行が 1 つも生まれなかった。その結果「まだ動いていない」と
-- 「動いて 0 件だった」が利用側から区別できず、レビュー取込が全期間にわたり全損していた
-- ことに誰も気づけなかった（2026-08-21 anytime-trade 実測: review_incremental の run 行が
-- 全期間 0 行、caravan_reviews も 0 行）。
--
-- 既存 status を流用して 'partial' + error_detail で表す案は採らない。集計側が
-- 「部分成功」と「起動しなかった」を区別できず、依頼の意図（skip を数える）を満たさない。
-- 理由コードは error_detail の先頭へ入れる（例 'skipped: llm_unavailable — chat: ...'）。
--
-- CHECK 制約の変更は ALTER で書けないため 12-step 再作成になる。全体を単一トランザクションに
-- 閉じてあるので、稼働中 DB で SQLITE_BUSY に当たっても部分完了せずロールバックし、
-- _migrations へも記帳されないため次回 open で再実行される（冪等・リトライ可能）。
-- 念のため前回の残骸を先に落としてから始める。
--
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS caravan_pipeline_runs__new;

BEGIN TRANSACTION;

CREATE TABLE caravan_pipeline_runs__new (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL,
  started_at          TEXT NOT NULL CHECK (started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR started_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  finished_at         TEXT CHECK (finished_at IS NULL OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR finished_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  status              TEXT NOT NULL CHECK (status IN ('running','success','partial','error','skipped')),
  items_processed     INTEGER NOT NULL DEFAULT 0,
  entities_inserted   INTEGER NOT NULL DEFAULT 0,
  entities_updated    INTEGER NOT NULL DEFAULT 0,
  edges_inserted      INTEGER NOT NULL DEFAULT 0,
  edges_invalidated   INTEGER NOT NULL DEFAULT 0,
  drifts_detected     INTEGER NOT NULL DEFAULT 0,
  items_failed        INTEGER NOT NULL DEFAULT 0,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  error_detail        TEXT NOT NULL DEFAULT '',
  last_heartbeat_at   TEXT CHECK (last_heartbeat_at IS NULL OR last_heartbeat_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z' OR last_heartbeat_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
  wave                TEXT NOT NULL DEFAULT 'memory' CHECK (wave IN ('sources', 'primary', 'memory', 'derived', 'system')),
  tier                INTEGER NOT NULL DEFAULT 3 CHECK (tier BETWEEN 0 AND 4)
) STRICT;

INSERT INTO caravan_pipeline_runs__new (
  id, scope, started_at, finished_at, status,
  items_processed, entities_inserted, entities_updated,
  edges_inserted, edges_invalidated, drifts_detected,
  items_failed, duration_ms, error_detail, last_heartbeat_at, wave, tier
)
SELECT
  id, scope, started_at, finished_at, status,
  items_processed, entities_inserted, entities_updated,
  edges_inserted, edges_invalidated, drifts_detected,
  items_failed, duration_ms, error_detail, last_heartbeat_at, wave, tier
FROM caravan_pipeline_runs;

DROP TABLE caravan_pipeline_runs;
ALTER TABLE caravan_pipeline_runs__new RENAME TO caravan_pipeline_runs;

-- 索引は DROP TABLE で消えるため作り直す。名前は 017 が付けた実体名を維持する
-- （023 の改名は索引名を変えていない）。
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON caravan_pipeline_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_wave ON caravan_pipeline_runs(wave, started_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_scope_status ON caravan_pipeline_runs(scope, status, started_at);

COMMIT;

PRAGMA foreign_keys = ON;
