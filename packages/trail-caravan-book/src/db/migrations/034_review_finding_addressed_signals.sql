-- 034: 対処コミットとの自動リンクが「どの根拠で成立したか」を残す。
--
-- 第 3 段で、リンクの受理条件へコミットメッセージの類似度以外の根拠を 2 つ足した。
-- 同一セッション（レビューを取り込んだセッションと同じセッションのコミットか）と、
-- レビュー対処マーカー（`fix(x): …（レビュー指摘対応）` のような対処の明示）である。
--
-- 根拠を残さないと、対処率が上がったときに「実態が改善した」のか「照合を緩めた」のかを
-- 後から切り分けられない。緩和の影響は緩和した本人以外には見えないため、数字だけが残ると
-- 指標として信用できなくなる。値は 'text' / 'same_session' / 'review_marker' の JSON 配列で、
-- 受理したコミット 1 件について寄与したシグナルを列挙する。
--
-- NULL = 第 3 段より前にリンクされた行（根拠は 'text' 相当だが、遡って断定はしない）。
-- 個々の値の CHECK は置かない（配列要素は SQLite の CHECK で検査できないため、
-- json_valid と配列であることまでを検査し、語彙は書き込み側の型が担保する）。

ALTER TABLE caravan_review_findings
  ADD COLUMN addressed_signals_json TEXT
    CHECK (addressed_signals_json IS NULL
           OR (json_valid(addressed_signals_json) AND json_type(addressed_signals_json) = 'array'));
