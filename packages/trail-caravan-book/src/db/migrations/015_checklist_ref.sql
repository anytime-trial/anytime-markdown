-- P1 (proposal 20260718-review-findings-checklist-loop): 観点キー checklist_ref を追加
-- code-review-checklist スキルの章番号 ('§14' 等) / 'none' (該当章なし) / NULL (未記録)。
-- additive な列追加のため 12-step 再作成は不要 (既存行は NULL で CHECK を満たす)。
ALTER TABLE memory_review_findings ADD COLUMN checklist_ref TEXT
  CHECK (checklist_ref IS NULL OR checklist_ref = 'none' OR checklist_ref GLOB '§[0-9]*');

CREATE INDEX IF NOT EXISTS idx_memory_review_findings_checklist
  ON memory_review_findings(checklist_ref);
