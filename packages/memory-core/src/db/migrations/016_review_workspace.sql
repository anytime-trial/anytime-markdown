-- レビュー記録へワークスペース／対象リポジトリの識別を追加する。
--
-- memory-core.db は複数ワークスペース(anytime-markdown / anytime-trade / anytime-lab)の
-- レビューを 1 つの DB に集約しているのに、どのワークスペースのものか判別する情報が
-- 無かった。そのため (a) UI で他ワークスペースの指摘が混ざって見え、
-- (b) 対処コミットの照合が単一リポジトリ固定になり他ワークスペースは永久に
-- リンクできず、(c) リポジトリ名を含まない相対パスが別リポジトリの同名ファイルへ
-- 誤リンクし得た。
--
-- 2 列に分けるのは、「レビューが行われたワークスペース」と「指摘対象のリポジトリ」が
-- 別物だから。レビュー文書は docs リポジトリに在りながら code リポジトリの
-- packages/... を指摘する(review_doc 184 件がこの形)。1 列では表現できない。
--
-- additive な列追加のため 12-step 再作成は不要(既存行は既定値／NULL で制約を満たす)。

-- レビューが行われたワークスペースの repo_name。'' は未解決(取込時に決まらなかった)。
ALTER TABLE memory_reviews ADD COLUMN workspace TEXT NOT NULL DEFAULT '';

-- 指摘対象が実在すると確認できたリポジトリの repo_name。
-- NULL は「解決できなかった」を意味し、対処コミットの照合対象から外れる(fail-closed)。
-- 推測で埋めない列であるため NOT NULL にしない。
ALTER TABLE memory_review_findings ADD COLUMN target_repo TEXT;

CREATE INDEX IF NOT EXISTS idx_memory_reviews_workspace
  ON memory_reviews(workspace);

CREATE INDEX IF NOT EXISTS idx_memory_review_findings_target_repo
  ON memory_review_findings(target_repo);
