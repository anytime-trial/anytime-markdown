---
name: sqlite-table-definition-trail-core
effort: low
description: anytime-markdown（trail.db / trail-core）固有の SQLite テーブル定義の補足。スキーマ配置パス・マイグレーションスクリプト規約・本番 DB 運用を定義する。汎用 SQLite 規約（STRICT / CHECK / FK ON DELETE / 12-step migration）は global スキル `sqlite-table-definition` に集約。trail-core のテーブル・制約・インデックス・マイグレーションを追加/変更する時に使用する。
---

# SQLite テーブル定義（trail-core 固有補足）

更新日: 2026-06-20

anytime-markdown の SQLite 永続化（主に `trail.db`）でテーブルを定義・変更する際の**プロジェクト固有の補足**。\
STRICT・CHECK・FK ON DELETE・timestamp GLOB・インデックス命名・12-step テーブル再作成といった**汎用ルールは global スキル `sqlite-table-definition` に集約**しているため、本スキルと併用すること。

> [!IMPORTANT]
> 汎用 SQLite 規約は global `~/.claude/skills/sqlite-table-definition/SKILL.md` を参照。本スキルは trail-core 固有の配置・運用差分のみを定義する。

## 適用範囲（trail-core 固有のパス）

| 対象 | 場所 |
| --- | --- |
| 新規テーブル定義 | `packages/trail-core/src/domain/schema/tables.ts` への CREATE TABLE 追加 |
| マイグレーションスクリプト | `scripts/migrate-*.mts`（`tables.ts` から DDL を直接 import） |
| 既存 DB へのインデックス追加 | 初期化処理に `CREATE INDEX IF NOT EXISTS` を追加（次回起動時に冪等適用。VS Code 拡張ではユーザーの Extension Host 再起動が必要） |

## trail-core 固有の運用メモ

- **マイグレーションは `.mts` で書く**: `tables.ts` の DDL を `import` して drift を防ぐ。`.mjs` での DDL inline 複製は禁止。実行は `node --experimental-strip-types scripts/migrate-X.mts <db-path>`。
- **本番 `trail.db` への適用**: 直接実行せず、`cp` でコピー → 動作確認（integrity_check / foreign_key_check / row counts）→ VACUUM → 原子的 swap（`*.before-X-YYYYMMDD` でバックアップ）の順。詳細手順は global スキル §9.6 を参照。
- **既存データ保持が前提**: trail.db は既存データを保持するため `ALTER TABLE` / 12-step migration を使う（Supabase の洗い替え方式とは異なる。`code-quality.md` §21 参照）。
- **`sql.js`（WASM SQLite）のクエリ設計**: trail-viewer 等の sql.js 経由クエリは CTE + window 関数 + 非等値 JOIN + GROUP BY の組み合わせで性能崩壊する。シンプル範囲スキャン + JS 側集計に分解する（`code-quality.md` §16 参照）。

## 関連

- global `sqlite-table-definition` — 汎用 SQLite テーブル定義ルール（本スキルの前提）
- `code-quality.md` §15（日時データの UTC 統一）・§16（sql.js クエリ設計）・§21（Supabase スキーマ運用）
