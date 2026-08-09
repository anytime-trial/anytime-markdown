-- 028: コミュニティ要約（T-22・spec §6.6）。
--
-- Louvain コミュニティへ LLM が後付けする name / summary の保存先。
-- 主キーは community_id ではなく stable_key（メンバー集合のコンテンツハッシュ・
-- trail-activity computeStableKey v1）。layout（026）は洗い替えで community_id を
-- 再採番するため、番号を鍵にすると再レイアウトごとに要約が孤立する。
--
-- graph_version / community_id は「最後に観測した版での所属」のキャッシュで、
-- 検索・API がリクエスト毎のハッシュ計算なしに (graph_version, community_id) の
-- 等結合で名前を引くためにある。再レイアウト後は listCaravanCommunities の実行時に
-- 現行版の値へ更新される（再関連付け）。
--
-- FK は張らない: 参照先（コミュニティ）は caravan_entity_layout の集計結果であり
-- 行として存在しないため、参照整合はアプリ層（upsert 時の現行版照合）で担保する。

CREATE TABLE IF NOT EXISTS caravan_community_summaries (
  stable_key    TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  member_count  INTEGER NOT NULL DEFAULT 0,
  graph_version TEXT NOT NULL,
  community_id  INTEGER NOT NULL,
  generated_at  TEXT NOT NULL CHECK (
    generated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR generated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  updated_at    TEXT NOT NULL CHECK (
    updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_caravan_community_summaries_version_community
  ON caravan_community_summaries(graph_version, community_id);
