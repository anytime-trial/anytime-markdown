-- 026: 知識グラフの座標とコミュニティを保存する。
--
-- クライアント側レイアウトは全ノードを毎回計算するため、規模に比例して初回描画が伸びる
-- （実測: 10,000 ノードで 2.1 秒・50,000 で 14.9 秒・100,000 は約 30 秒でクライアントが停止する）。
-- サーバがグラフ全体の座標を 1 度だけ計算して持てば、閲覧時は視野に入る分だけを座標付きで
-- 配れるようになり、クライアントの負荷がグラフ全体の大きさから独立する。
--
-- `graph_version` はレイアウトの計算元になったエッジ集合のハッシュ。値が変わらない限り
-- 再計算しない（ForceAtlas2 は 100,000 ノードで 72.7 秒かかるため、毎サイクル回せない）。

CREATE TABLE IF NOT EXISTS caravan_entity_layout (
  entity_id     TEXT PRIMARY KEY REFERENCES caravan_entities(id) ON DELETE CASCADE,
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  -- Louvain のコミュニティ番号。ズームアウト時に畳む単位として使う。
  community_id  INTEGER NOT NULL,
  graph_version TEXT NOT NULL,
  recorded_at   TEXT NOT NULL CHECK (
    recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
    OR recorded_at GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
  )
) STRICT;

-- 視野（bbox）で絞る問い合わせが主用途。x を先頭に置き、y は同一 x 範囲内の絞り込みに使う。
CREATE INDEX IF NOT EXISTS idx_caravan_entity_layout_xy ON caravan_entity_layout(x, y);
CREATE INDEX IF NOT EXISTS idx_caravan_entity_layout_community ON caravan_entity_layout(community_id);
CREATE INDEX IF NOT EXISTS idx_caravan_entity_layout_version ON caravan_entity_layout(graph_version);
