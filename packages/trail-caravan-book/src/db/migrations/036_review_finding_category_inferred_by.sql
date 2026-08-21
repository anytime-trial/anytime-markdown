-- 036: 指摘の category を「誰が決めたか」で区別する。
--
-- レビュー取込の構造化パースは決定論だが、見出しから category を決められなかった指摘だけは
-- LLM 推論（refineCategories）に頼っている。chat model が居ない環境ではその推論だけができず、
-- 従来はスコープ全体が skip されて取込がゼロになっていた。決定論部分は動かし、推論待ちの
-- 指摘に印を付けて後で埋め直せるようにする。
--
-- 'other' で確定させる案は採らない。source_hash が一致する限りその md は二度と再処理されず、
-- chat が不在だった期間の指摘が永久に 'other' で固まる（誤りが直る経路が無くなる）。
--
-- ''            = 見出し規則で確定した（既定・既存行）。
-- 'llm'         = LLM が推論して確定した。
-- 'pending_llm' = 見出しから決められず、chat 不在のため未確定。次に chat が使える run で埋める。
--
-- additive な列追加のため 12-step 再作成は不要（既存行は既定値で制約を満たす）。
ALTER TABLE caravan_review_findings ADD COLUMN category_inferred_by TEXT NOT NULL DEFAULT ''
  CHECK (category_inferred_by IN ('', 'llm', 'pending_llm'));

CREATE INDEX IF NOT EXISTS idx_caravan_review_findings_category_inferred_by
  ON caravan_review_findings(category_inferred_by);
