-- 025: File → Function の帰属述語 `defines` を追加する。
--
-- astFunctionLevel は Function エンティティを生成する一方、辺の端点は常に File / Library
-- だったため、コード解析由来の Function は生成された時点で次数 0 が確定していた
-- （2026-08-08 実測: Function 12,779 件中 12,764 件が孤立）。File が自分の中で定義する
-- シンボルを指す辺を張り、コードグラフを File 単位からシンボル単位へ接続する。

INSERT OR IGNORE INTO caravan_relation_types (predicate, cardinality, directionality, description) VALUES
  ('defines', 'multiple_active', 'subject_to_object', 'File → その中で定義される Function / class / interface');

-- 既存の孤立 Function へ辺を張り直すためのバックフィル。
--
-- ingestAstFacts は毎回コードグラフ全量を受け取る（runCodeIncremental が
-- activity_current_graphs から丸ごと読む）ため、専用のバックフィル処理は要らない。
-- ウォーターマークを初期値へ戻せば次サイクルの本番取込パスが全 Function へ辺を張る。
-- 辺 id は決定的なので再実行しても重複しない。
UPDATE caravan_pipeline_state
   SET last_processed_at = '1970-01-01T00:00:00.000Z'
 WHERE scope = 'code_incremental';
