# 変更履歴

"mcp-trail" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

### 修正

- 配布した `anytime-trail` VSIX で DB 系ツールが全滅し、`Cannot read properties of undefined (reading 'indexOf')` を返していた。production の webpack ビルドが vendored な `bindings` を minify し、native バイナリの解決に使う副作用の無い `dummy.stack` 参照を落としていたため。DB の open を `openBetterSqlite3` へ集約し、バンドル済みの `.node` を `nativeBinding` で明示して `bindings` の解決経路を通らないようにした。
- `list_open_instructions` の caravan-book → activity フォールバックが、無関係な 2 件のエラーとして見えていた。両 DB は open 経路を共有するため、共通原因を `describeDbOpenFailure` 経由で 1 度だけ返す。

### 追加

- `runStartupDbSelfCheck` を追加した。起動時に各 DB を 1 回 readonly で開き、1 つも開けなければ stderr へ明示的に警告する。DB 系ツールの全滅が、個々のツールの 1 行エラーではなく起動時に見える。

### 変更

- ADR の脅威分類・検知プロンプトのツールを追加した（スキーマは trail-core 側）。
- DB 改名に追従し、活動・記憶データベースを `activity.db` / `caravan-book.db` として解決するようにした。
- ワークスペースルートの解決を `resolveWorkspacePath`（`src/dbPath.ts`）へ一元化した（2026-08-02）。優先順は `workspacePath` 引数 > `TRAIL_WORKSPACE_PATH` > `process.cwd()`。各ツールが個別に `process.env` を読む重複を除去した
- 全ツールに任意の `workspacePath` 引数を追加した。memory-core 系 13 ツールはこれまで引数を持たず cwd 固定で、別ワークスペースから呼ぶと他プロジェクトの DB を掴み得た
- cwd へフォールバックした場合に stderr へ警告を出すようにした（暗黙のフォールバックをやめる）
- SQLite アクセスを `sql.js` (WASM) から `better-sqlite3` (ネイティブ) に置換。memory-core / trail-db / trail-server も同時に better-sqlite3 一本化済みであり、`vsce package --no-dependencies` 配布の制約も解消したため WASM 経由は不要になった。`openTrailDb` の `tmp + rename` による atomic 書き出しは、better-sqlite3 の close 時 WAL checkpoint に置き換わった。

## [0.10.1] - 2026-05-08

### 追加

- 読み取り系ツール（`get_c4_model` / `list_elements` / `list_groups` / `list_relationships` / `list_communities`）を SQLite 直アクセス化。Anytime Trail サイドバー未起動環境でも MCP ツールが動作する
- 書き込み系ツールに probe ベースの自動切替を追加。TrailDataServer 生存時は HTTP 経由、未起動時は SQLite 直書き（WAL モード + 指数バックオフリトライ）にフォールバック
- 環境変数 `TRAIL_DB_PATH` / `TRAIL_WORKSPACE_PATH` / `MCP_TRAIL_FORCE_DIRECT` を追加（CI / ヘッドレス用途）
- VS Code 拡張が mcp-trail サーバ起動時に `TRAIL_WORKSPACE_PATH` を渡すよう改修

### 修正

- sql.js ローダを `sql-asm.js`（asm.js、16 MB ヒープ固定）から `sql-wasm.js`/`sql-wasm.wasm`（WASM、最大 2 GB ヒープ）に切替。大規模コードグラフ保存時の OOM を回避

### 変更

- `analyze_*` 系ツールは引き続き TrailDataServer 必須。未起動時は明示的なエラーで誘導
- `vsce package --no-dependencies` の配布モデルと整合させるため `sql.js` WASM バックエンドを採用（`better-sqlite3` 不採用）

## [0.10.0] - 2026-05-04

### 追加

- インメモリ DB 競合を回避するコミュニティ書き込みツール（`upsert_community_mappings`・`upsert_community_summaries`）
- 解析パイプライントリガーツールと HTTP API エンドポイントを追加

## [0.9.1] - 2026-05-02

### 変更

- モノレポのワークスペースに追加し、Jest カバレッジ設定を整備
