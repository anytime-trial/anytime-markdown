-- バグ修正履歴・乖離イベントへワークスペース識別を追加する。
--
-- memory-core.db は複数ワークスペース(anytime-markdown / anytime-trade / anytime-lab)の
-- 記録を 1 つの DB に集約している(016_review_workspace.sql と同じ前提)。016 で
-- memory_reviews にだけ workspace を入れたため、Flight Record の Bug Fixed / Drift タブは
-- 他ワークスペースの行が混ざったまま出る。指示一覧・Review だけ絞れて残り 2 タブが
-- 絞れない状態は、「絞り込んだ結果」と「絞り込めていない結果」を同じ画面に並べることになる。
--
-- entity 経由で解決しない理由: memory_entities.repo_name は 2026-08-05 時点で
-- 97,340 件が NULL、drift の subject entity は 2,256 件すべて NULL で、join では
-- 1 件も解決できない(実測)。値は生成側(バグ履歴取込・drift レポート)が持っているので、
-- 列を足して書き込む側で埋める。
--
-- '' = 未解決(取込時に決まらなかった)。016 と同じ規約で、推測で埋めない。
-- additive な列追加のため 12-step 再作成は不要(既存行は既定値で制約を満たす)。

-- バグ修正が行われたリポジトリの repo_name。
ALTER TABLE memory_bug_fixes ADD COLUMN workspace TEXT NOT NULL DEFAULT '';

-- 乖離イベントの出所ワークスペースの repo_name。
ALTER TABLE memory_drift_events ADD COLUMN workspace TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_memory_bug_fixes_workspace
  ON memory_bug_fixes(workspace);

CREATE INDEX IF NOT EXISTS idx_memory_drift_events_workspace
  ON memory_drift_events(workspace);

-- レビュー由来の drift(review_unfixed / recurring_review_finding)は detail_json の
-- 指摘 ID から memory_reviews.workspace を確定できるため、ここで backfill する。
-- バグ由来(recurring_root_cause / regression_cluster)と package 名しか持たない
-- spec_violation_cluster は埋めない。バグ履歴取込 → drift レポートの再実行で埋まる。

-- review_unfixed: 単一の finding_id。
UPDATE memory_drift_events
SET workspace = COALESCE((
  SELECT r.workspace
  FROM memory_review_findings f
  JOIN memory_reviews r ON r.id = f.review_id
  WHERE f.id = json_extract(memory_drift_events.detail_json, '$.finding_id')
), '')
WHERE workspace = ''
  AND json_extract(detail_json, '$.finding_id') IS NOT NULL;

-- recurring_review_finding: finding_ids 配列。属する指摘が単一のワークスペースへ
-- 収束するときだけ埋める。跨っていたら '' のまま残す(片方へ寄せると、絞り込みで
-- もう片方のワークスペースからこの乖離が消える)。
UPDATE memory_drift_events
SET workspace = COALESCE((
  SELECT CASE WHEN COUNT(DISTINCT r.workspace) = 1 THEN MIN(r.workspace) ELSE '' END
  FROM json_each(memory_drift_events.detail_json, '$.finding_ids') je
  JOIN memory_review_findings f ON f.id = je.value
  JOIN memory_reviews r ON r.id = f.review_id
), '')
WHERE workspace = ''
  AND json_extract(detail_json, '$.finding_ids') IS NOT NULL;
