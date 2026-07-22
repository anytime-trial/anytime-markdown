# 変更履歴

"Anytime Database" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.3.4] - 2026-07-22

### 修正

- Codex セッションの `messages` が消失する `@anytime-markdown/trail-db` の修正を同梱。Codex 取り込み経路は `messages.uuid` を `codex-${seq}`（`seq` はセッションごとに 0 リセット）で採番しており、`messages.uuid` は全セッション横断の PRIMARY KEY で `INSERT OR REPLACE` されるため、後から取り込んだセッションが先行セッションの行を無言で上書きしていた（Codex 243 セッション中 23 件しか `messages` が残っておらず、trail-viewer のエージェントタブに Codex のバーが描画されなかった）。uuid 採番にセッション ID を含めるよう修正し、旧採番の残骸を除去する migration を追加。
- 同一修正に対するマージ前レビュー指摘の対処として、依存テーブル `message_tool_calls` の削除漏れ（FK 無効化のため orphan が静かに蓄積し、再取り込みでツール呼び出しが二重計上され得た）と、uuid を導出する 2 経路（取り込み経路とコミット突合経路）が `event_msg` を含む rollout で `seq` の進み方が食い違っていた問題を修正。

### Database Core (database-core / database-viewer)

- 機能変更なし（依存更新のみ）。

## [0.3.3] - 2026-07-17

### Database Core (database-core / database-viewer)

- `FileBackupManager` が 2 GiB 以上のファイルを全読み込みせずに扱えるようになり、非圧縮世代を世代系列として扱うようになりました。バックアップサフィックス指定と失敗ラッチ無効化のオプションを追加しています。

## [0.3.2] - 2026-07-14

### 修正

- 拡張機能が表示する日時をローカルタイムゾーンで表示するようにしました。WSL の Extension Host は `TZ=UTC` で動くため、`Date` のローカル getter が UTC 値を返していました。

## [0.3.1] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.3.0] - 2026-06-08

### 変更

- `database-viewer` の自前テーマ化に追随し、冗長な MUI ラッパを除去。

### 修正

- VS Code Node 24 ターゲット（Node 24 ABI）向けにビルドした `better-sqlite3` を同梱し、`prepare-native` の reuse をターゲット一致時のみに限定。

### Database Core (database-core / database-viewer)

- `database-viewer` の `@mui` を全廃し自前 `ui/` キットへ置換（MUI 削減 Phase3d）。

## [0.2.5] - 2026-05-27

### Database Core (database-core / database-viewer)

- SonarCloud コード品質改善（認知的複雑度削減・機械的安全修正）。

## [0.2.4] - 2026-05-24

### 変更

- `storagePath` / `docsPath` の設定を trail 拡張から database 拡張側へ移行

### Database Core (database-core / database-viewer)

- `database-core`: `limitDetection` の正規表現から二重 `\s*` による多項式 ReDoS を除去

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
