-- 032: 検索イベントへ発行主体・起点動線・ヒット実体を追加（screen spec §2.5）。
--
-- source: 'screen' = 画面 UI / 'agent' = MCP search_caravan_book（エージェント照会）。
-- origin: ego_open の起点動線（search = 画面検索 / citation = Chat 引用チップ /
--         agent_history = エージェント照会リスト）。search / clear と既存行は NULL。
-- hit_entity_ids: 照会ヒット実体 ID の JSON 配列（上位 20 件で打ち切り）。エージェント
--   回答の「その箇所」を後から画面で開くための鍵。FK を張らないのは 031 と同じ理由
--   （記録は行動ログであり参照整合の対象ではない）。
--
-- kind の CHECK は変えない（STRICT テーブルの CHECK 変更は 12-step 再作成になる。
-- 動線の区別は origin 列が担う）。ADD COLUMN の CHECK は挿入・更新時にのみ効く。

ALTER TABLE caravan_search_events
  ADD COLUMN source TEXT NOT NULL DEFAULT 'screen' CHECK (source IN ('screen', 'agent'));

ALTER TABLE caravan_search_events
  ADD COLUMN origin TEXT CHECK (origin IS NULL OR origin IN ('search', 'citation', 'agent_history'));

ALTER TABLE caravan_search_events
  ADD COLUMN hit_entity_ids TEXT CHECK (hit_entity_ids IS NULL OR json_valid(hit_entity_ids));
