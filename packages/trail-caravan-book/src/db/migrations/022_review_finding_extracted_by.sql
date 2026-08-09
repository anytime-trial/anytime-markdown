-- 指摘の抽出元を記録する。
--
-- 書式非準拠のレビュー本文から LLM で再抽出した finding（runReviewFindingExtraction）と、
-- 書式準拠で取り込んだ finding を区別できるようにする。前者は重大度・対象パスの精度が
-- 劣るため、集計や「未対処」判定で扱いを分けられる必要がある。取り消す場合も
-- `DELETE ... WHERE extracted_by LIKE 'llm:%'` で一括で戻せる。
--
-- '' = 書式準拠のパーサが抽出（既定）。'llm:<model>' = LLM 再抽出。
-- additive な列追加のため 12-step 再作成は不要（既存行は既定値で制約を満たす）。
ALTER TABLE memory_review_findings ADD COLUMN extracted_by TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_memory_review_findings_extracted_by
  ON memory_review_findings(extracted_by);
