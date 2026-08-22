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
-- category_refine_attempts は埋め直しの試行回数。恒久的に推論が失敗する指摘を
-- 母集合から外すために要る。回数を持たずに 'pending_llm' だけで選ぶと、失敗行が
-- 上限件数ぶん溜まった時点で毎回同じ先頭集合を引き直し、その背後の行へ永久に到達しない
-- （head-of-line blocking。Claude / Codex 双方が独立に指摘）。失敗を即座に終端状態へ
-- 移さないのは、Ollama の一時障害まで恒久失敗として確定させてしまうため。
--
-- additive な列追加のため 12-step 再作成は不要（既存行は既定値で制約を満たす）。
ALTER TABLE caravan_review_findings ADD COLUMN category_inferred_by TEXT NOT NULL DEFAULT ''
  CHECK (category_inferred_by IN ('', 'llm', 'pending_llm'));

ALTER TABLE caravan_review_findings ADD COLUMN category_refine_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (category_refine_attempts >= 0);

-- 埋め直しの母集合を引く索引。選択条件（状態 + 試行回数）と並び順をそのまま覆う。
CREATE INDEX IF NOT EXISTS idx_caravan_review_findings_category_pending
  ON caravan_review_findings(category_inferred_by, category_refine_attempts, recorded_at);
