---
name: supabase-schema-sync
effort: low
description: anytime-markdown の Supabase スキーマ変更と同期方式の規約。マイグレーションファイルを新規追加せず supabase/migrations/001_schema.sql を直接編集する運用と、拡張機能 (SyncService) から Supabase への洗い替え（wash-away）同期方式を定義する。Supabase のテーブル・カラムを追加/変更する時、001_schema.sql を編集する時、SyncService の同期処理を実装・変更・レビューする時に使用する。
---

# Supabase スキーマ・同期規約

更新日: 2026-07-18

anytime-markdown の Supabase 永続化における**プロジェクト固有の運用規約**。

> [!IMPORTANT]
> ローカル SQLite（拡張機能の `trail.db`）には本規約を適用しない。trail.db は既存データ保持が前提のため `ALTER TABLE` / 12-step migration を使う（`sqlite-table-definition-trail-core` および global `sqlite-table-definition` を参照）。

## 1. スキーマ変更

- **マイグレーションファイルを新規追加しない**。`supabase/migrations/001_schema.sql` を直接編集する
- 理由: テーブルを毎回すべて削除して再作成する運用のため、連番マイグレーションの履歴管理は不要
- 新規テーブル・カラム追加時は `001_schema.sql` の適切な位置に追記する。関連テーブルはコメントで役割を明記する

## 2. 同期方式

- 拡張機能 (`SyncService`) から Supabase への同期は **洗い替え（wash-away）方式** を原則とする
- 「対象テーブルを DELETE → ローカル DB の全行を upsert」の順
- 差分同期（追加/更新/削除の判定）は行わない。一貫性を優先し毎回置き換える
- 例: `current_graphs` → `trail_current_c4_models` は `clearCurrentC4Models()` 後に全行 `upsertCurrentC4Model()`

## 関連

- global `~/.claude/rules/code-quality.md` — 汎用コード品質規約
- global `sqlite-table-definition` — 汎用 SQLite テーブル定義ルール
- `sqlite-table-definition-trail-core` — trail.db（ローカル SQLite）側の規約。本スキルとは方針が異なる
