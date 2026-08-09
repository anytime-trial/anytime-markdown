-- 029: コード由来の辺を述語で分離する（call → `calls` / inheritance → `extends`）。
--
-- ingestAstFacts は call / inheritance / 内部 import をすべて `relates_to` で保存していたため、
-- 「この File が誰を呼ぶか」「何を継承するか」をグラフから区別できなかった。fact 側
-- （caravan_code_facts）は種別を持っているのに、辺へ写す時点で潰れていた。
-- 2026-08-09 実測: source_type='code' の辺 33,893 本のうち relates_to が 16,642 本。
-- fact は calls 74,156 / imports 40,341 / extends 114。

INSERT OR IGNORE INTO caravan_relation_types (predicate, cardinality, directionality, description) VALUES
  ('calls',   'multiple_active', 'subject_to_object', 'File → 呼び出し先を含む File'),
  ('extends', 'multiple_active', 'subject_to_object', 'File → 継承元を含む File');

-- 呼び出し / 継承に由来する既存の relates_to を無効化する。
--
-- 辺 id は sha1(subject:predicate:object:ast) で述語を含むため、述語を変えれば id も変わる。
-- SQL 内で sha1 を再計算できない以上、既存行を in-place で移し替えることはできない。
-- そこで「無効化 → ウォーターマーク巻き戻しによる全量再取込」で正しい述語の辺を作り直す
-- （migration 025 と同じ手法）。
--
-- 対象を source_ref の fact 種別で絞るのは、1 本の File 間の辺に import / call / inheritance の
-- fact が畳まれ得るためである。source_ref は最初に辺を作った fact しか保持しないので、
-- 「call が最初だったが import でもある」辺もここで無効化される。これは再取込時に import fact が
-- 同一 id を再挿入し、ingestAstFacts の復活経路（ON CONFLICT DO UPDATE で valid_to を NULL へ
-- 戻し source_ref を張り替える）が無効化を剥がすことで自己是正する。
-- **復活経路が無いと、この UPDATE は File 間リンクを恒久的に消す。**
--
-- import を伴わない「呼び出しだけ」の File 対は relates_to が無効のまま残るが、これは正しい。
-- その対のリンクは新しい `calls` 辺が引き継ぐのであって、消えるわけではない。
--
-- caravan_edge_invalidations へは記録しない。readActiveEdges（runKnowledgeGraphLayout）が
-- 無効化記録のある辺を valid_to と無関係に恒久除外するため、記録すると復活後もレイアウトから
-- 消えたままになる。ここでの無効化は述語の付け替えに伴う一時的なもので、監査対象の意味的な
-- 無効化（rule_exclusive / spec_updated 等）とは別種である。
--
-- 前提: この UPDATE は「ウォーターマークを巻き戻せば次サイクルが全量再取込する」ことに依存する。
-- runCodeIncremental は ingestAstFacts が完走した run でのみウォーターマークを前進させる。
UPDATE caravan_edges
   SET valid_to = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE source_type = 'code'
   AND predicate = 'relates_to'
   AND valid_to IS NULL
   AND source_ref LIKE 'code_fact:%'
   AND substr(source_ref, 11) IN (
         SELECT id FROM caravan_code_facts WHERE fact_type IN ('calls', 'extends')
       );

-- 全量再取込のためウォーターマークを巻き戻す（025 と同じ）。ingestAstFacts は
-- runCodeIncremental からコードグラフ全量を受け取るため、専用のバックフィルは要らない。
UPDATE caravan_pipeline_state
   SET last_processed_at = '1970-01-01T00:00:00.000Z'
 WHERE scope = 'code_incremental';
