# 変更履歴

"database-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づき、[セマンティックバージョニング](https://semver.org/) に準拠します。

## [Unreleased]

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
