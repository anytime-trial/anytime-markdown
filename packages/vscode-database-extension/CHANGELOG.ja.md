# 変更履歴

"Anytime Database" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.1.0] - 2026-05-07

### 追加

- 初回リリース。VS Code 用 SQLite データベースブラウザ
- `*.db` / `*.sqlite` / `*.sqlite3` / `*.db3` ファイルの Custom Editor
- Activity Bar `Anytime Database` パネル（SQLite / Supabase / PostgreSQL バックエンド、ステータス、最終インポート時刻、Backups ツリー）
- 設定:
  - `anytimeDatabase.openMode` (readwrite / readonly)
  - `anytimeDatabase.query.maxRows` (既定 1000)
  - `anytimeDatabase.query.warnThresholdMs` (既定 5000)
- コマンド:
  - `anytime-database.syncToSupabase`
  - `anytime-database.reconnectSupabase`
- per-platform VSIX 配布（linux/darwin/win32 × x64/arm64）。`better-sqlite3` ネイティブバイナリ向け
- read-write モードで `BEGIN IMMEDIATE` → `COMMIT` / `ROLLBACK` のトランザクション分離方式 Save
- WebView ↔ Extension Host IPC ブリッジ（ready ハンドシェイク方式で取りこぼし防止）
- l10n バンドル (`l10n/bundle.l10n.json` + `l10n/bundle.l10n.ja.json`) を導入。ツリーアイテムラベルを多言語化
- `DbLogger` (`Anytime Database` Output チャンネル) に timestamp と `Error.stack` を出力

### Database Core (database-core / database-viewer)

- SQLite アダプタ層 (`BetterSqlite3Adapter`, `SqlJsAdapter`, `PaginatedSqlSheetAdapter`) とデータベース UI (`DatabaseEditor`, `ErdView`, `TableTree`, `ResultGrid`, `SqlEditorPanel`) を初回リリース。詳細は `packages/database-core/CHANGELOG.ja.md` および `packages/database-viewer/CHANGELOG.ja.md` を参照
