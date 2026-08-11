-- 031: 知識グラフ画面検索の計測ログ（screen spec §2.4・proposal 20260810）。
--
-- 検索 UI は「有効情報を取得できるか」の実測装置であり、記録が受け入れ条件。
-- kind: search = 検索実行（query・ヒット件数）/ ego_open = 結果選択（entity_id）/
-- clear = 全体表示へ復帰。
--
-- entity_id へ FK を張らない: 検索対象の実体が後から soft delete / 削除されても
-- 計測記録は残す（記録は行動ログであり参照整合の対象ではない）。

CREATE TABLE IF NOT EXISTS caravan_search_events (
  id           TEXT PRIMARY KEY,
  occurred_at  TEXT NOT NULL CHECK (
    occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  ),
  kind         TEXT NOT NULL CHECK (kind IN ('search', 'ego_open', 'clear')),
  query        TEXT NOT NULL,
  result_count INTEGER,
  entity_id    TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_caravan_search_events_occurred_at
  ON caravan_search_events(occurred_at);
