# 変更履歴

"Anytime Database" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.2.3] - 2026-05-21

### 変更

- `database-core` / `database-viewer` 0.2.3 に合わせたバージョン更新（拡張固有のソース変更なし）

### Database Core (database-core / database-viewer)

- `database-core`: ユニットテストカバレッジを 99% に改善（各 Adapter を 90%+ に）

## [0.2.2] - 2026-05-20

### セキュリティ

- `makeTransport` の `postMessage` データ形状を検証してからリスナーへ通知するよう修正: `typeof === 'object'` および `typeof type === 'string'` ガードを追加し `InsufficientPostmessageValidation`（SnykCode）を解消

### Database Core (database-core / database-viewer)

- バージョン同期のみ (ソース変更なし)

## [0.2.1] - 2026-05-17

### 追加

- VSIX に MIT `LICENSE` ファイルを同梱。`package.json` では `"license": "MIT"` を宣言済みだったが、公開拡張機能本体にライセンス全文が含まれていなかったため追加

### Database Core (database-core / database-viewer)

- バージョン同期のみ (ソース変更なし)

## [0.2.0] - 2026-05-16

### 追加

- `anytime-database.uploadBackupToS3` コマンド: TreeView の最新世代 `.bak.1.gz` を AWS S3 へ手動アップロード
- 設定 `anytimeDatabase.s3.bucket` / `s3.region` / `s3.prefix` / `s3.accessKeyId` / `s3.secretAccessKey` を追加
- ワークスペース内の全 DB ファイルを SQLite ツリーノードに一覧表示

### 変更

- バックアップ UI を `vscode-trail-extension` から `vscode-database-extension` に移管
- `BackupTreeItem` の `contextValue` を分割し、バックアップ種別単位でコマンドを差し向け可能に

### セキュリティ

- 多項式バックトラッキング（ReDoS）対策として正規表現リテラルを強化
- 4 件の webview message listener で origin 検証を追加

### Database Core (database-core)

- `trail-db` から `FileBackupManager` を `database-core` に分離し、ローリングバックアップ処理を共通化

## [0.1.0] - 2026-05-15

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

### 変更

- 拡張機能バンドルから `sql.js` を撤去し、ネイティブ `better-sqlite3` のみに統一（Phase 4）
- `database-viewer` の自己完結 i18n 移行に合わせて webview の shim を更新

### 修正

- webview バンドルでの `navigator` アクセスと動的 import 解決の不整合を解消

### Database Core (database-core / database-viewer)

- SQLite アダプタ層 (`BetterSqlite3Adapter`, `SqlJsAdapter`, `PaginatedSqlSheetAdapter`) とデータベース UI (`DatabaseEditor`, `ErdView`, `TableTree`, `ResultGrid`, `SqlEditorPanel`) を初回リリース。詳細は `packages/database-core/CHANGELOG.ja.md` および `packages/database-viewer/CHANGELOG.ja.md` を参照
- `database-viewer` を自己完結 i18n に移行（公開 API 経由でメッセージを参照）
