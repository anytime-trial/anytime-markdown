# 変更履歴

"database-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づき、[セマンティックバージョニング](https://semver.org/) に準拠します。

## [Unreleased]

## [0.3.0] - 2026-06-08

### 変更

- database 系統のバージョン整合のための bump。アダプタ層の機能変更なし。

## [0.2.5] - 2026-05-27

### 変更

- SonarCloud 機械的安全修正。機能変更なし。

## [0.2.4] - 2026-05-24

### セキュリティ

- `limitDetection` の正規表現から二重 `\s*` による多項式 ReDoS を除去

## [0.2.3] - 2026-05-21

### 変更

- ユニットテストカバレッジを 99% に改善（各 Adapter を 90%+ に）

## [0.2.2] - 2026-05-20

### 変更

- `anytime-database` 0.2.2 と同期するためのバージョンアップ (`database-core` 自体のソース変更なし)

## [0.2.1] - 2026-05-17

### 変更

- `anytime-database` 0.2.1 と同期するためのバージョンアップ (`database-core` 自体のソース変更なし)

## [0.2.0] - 2026-05-16

### 追加

- `trail-db` から `FileBackupManager` を `database-core` に分離し、ローリングバックアップ処理を共通化

### セキュリティ

- 多項式バックトラッキング（ReDoS）対策として正規表現リテラルを強化

## [0.1.0] - 2026-05-07

### 追加

- 初回リリース。VS Code 拡張・Web アプリ共通の SQLite アダプタ層
- `DatabaseAdapter` インタフェース（`listSchema` / `selectRows` / `countRows` / `executeSql` / `save` / `revert` / `dispose`）
- `BetterSqlite3Adapter`（VS Code Extension Host 用、`nativeBinding` 直接指定方式）
- `SqlJsAdapter`（Web アプリ用、sql.js WASM）
- `RemoteDatabaseAdapter`（VS Code WebView ↔ Extension Host ブリッジ）
- `PaginatedSqlSheetAdapter`（ページング対応クエリ層、`applyQueryResult` / `loadPage`）
- スキーマ取得（テーブル / ビュー / カラム / 外部キー、複合 FK 対応）
- `assertSafeIdentifier` による識別子バリデーション
- `isMutationSql` による更新系 SQL 判定
- `hasTopLevelLimit` によるトップレベル LIMIT 検出
- ER 図向け FK 推定

### 修正

- 複合主キーの 2 番目以降のカラムが PK と認識されないバグを修正（`pk > 0` で判定）
