# @anytime-markdown/mcp-trail

Anytime Trail（VS Code 拡張）の Trail DB (`trail.db`) を MCP 経由で操作するためのサーバー。\
C4 モデル要素・関係・グループの CRUD と、コード解析パイプラインの起動を MCP ツールとして公開します。

[English](./README.md) | 日本語


## 1. 前提

- 読み取り系・書き込み系ツールは `trail.db` (SQLite) に直接アクセスするため、Anytime Trail サイドバーが起動していなくても動作します。
- ただし `analyze_*` 系（コード解析パイプライン）は VS Code 拡張側のロジックを呼び出すため、`TrailDataServer` が起動していることが必要です。
    - 既定: `http://localhost:19841`（`anytimeTrail.viewer.port` で変更可）
- 書き込み系は `TrailDataServer` 起動時は HTTP 経由（in-memory 整合性維持）、未起動時は `better-sqlite3` でファイルを直接開いて WAL モードで書き込み、close 時に checkpoint します。
- Node 22 以上（`fetch` AbortSignal.timeout / WebSocket）。


## 2. MCP サーバー登録

`/anytime-markdown/.mcp.json` または各環境の MCP 設定に登録します。

```json
{
  "mcpServers": {
    "mcp-trail": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-trail/src/stdio.ts"],
      "cwd": "/anytime-markdown"
    }
  }
}
```

環境変数で既定値を上書き可能:

| 変数 | 用途 |
| --- | --- |
| `TRAIL_SERVER_URL` | `serverUrl` の既定値（例: `http://localhost:19842`） |
| `TRAIL_REPO_NAME` | `repoName` の既定値（例: `anytime-markdown`） |
| `TRAIL_HOME` | Trail 関連ファイル一式の格納ルート（既定: `<workspace>/.anytime/trail`） |
| `TRAIL_WORKSPACE_PATH` | ワークスペースの絶対パス。`TRAIL_HOME` 未設定時のフォールバック基点と `repoName` 既定値（basename）に使用 |
| `MCP_TRAIL_FORCE_DIRECT` | `1` で `TrailDataServer` 生存チェックを skip し、書き込みも常に SQLite 直書きにする（CI / バッチ向け） |
| `OLLAMA_BASE_URL` | Ollama API のベース URL（`search_memory` のベクトル検索で使用。例: `http://localhost:11434`） |

> [!NOTE]
> `trail.db` / `memory-core.db` の格納先は `${TRAIL_HOME}/db/` に統一されており、個別の `*_DB_PATH` 環境変数は廃止されています。

DB パスの解決先:

- `${TRAIL_HOME}/db/trail.db`（既定: `<workspace>/.anytime/trail/db/trail.db`）
- `TRAIL_HOME` 未設定時は `TRAIL_WORKSPACE_PATH`（または `process.cwd()`）配下に解決される


## 3. 共通パラメータ

ほぼ全てのツールで以下を受け取ります（省略可）。

| パラメータ | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `serverUrl` | string | `http://localhost:19841` | TrailDataServer の URL |
| `repoName` | string | カレントディレクトリの basename | 対象リポジトリ名（C4 モデル参照キー） |


## 4. ツール一覧

全 32 ツール。カテゴリ別に整理しています。

### 4.1 C4 モデル参照（読み取り）

| ツール | 用途 |
| --- | --- |
| `get_c4_model` | 現在の C4 モデル全体（要素・関係・グループ）を取得する |
| `list_elements` | C4 要素の ID / type / name 一覧を簡略表示する。関係追加前の ID 確認に有用 |
| `list_relationships` | 手動定義の C4 関係を ID 付きで一覧する。削除前の ID 確認に有用 |
| `list_groups` | 手動定義のグループを ID と所属要素付きで一覧する |


### 4.2 C4 要素の編集

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `add_element` | `type`（`person` / `system` / `container` / `component`）/ `name` / `parentId` / `description?` / `external?` / `serviceType?` | 手動 C4 要素を追加する |
| `update_element` | `id` / 任意の `name` / `description` / `external` / `serviceType` | 既存要素を更新する |
| `remove_element` | `id` | 要素を削除する（関連する関係も削除される） |


### 4.3 C4 関係の編集

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `add_relationship` | `fromId` / `toId` / `label?` / `technology?` | 2 つの C4 要素間に関係を追加する |
| `remove_relationship` | `id` | 関係を削除する |

> [!NOTE]
> 関係に関する更新ツールはありません。変更したい場合は削除 + 再追加で対応します。


### 4.4 C4 グループの編集

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `add_group` | `memberIds`（2 件以上）/ `label?` | 視覚的なグループを作成する。要素自体は変更しない |
| `update_group` | `id` / `memberIds?`（2 件以上）/ `label?`（`null` でクリア） | グループのラベルや所属要素を更新する |
| `remove_group` | `id` | グループを削除する。所属要素は削除されない |


### 4.5 解析パイプライン起動

VS Code 拡張のコマンド（`Anytime Trail: コード解析` 等）と同じ処理を HTTP 経由で起動します。VS Code 拡張が稼働中である必要があります。\
並行起動は `analysisInProgress` で排他制御され、進行中の場合は `409 Conflict` が返ります。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `analyze_current_code` | `workspacePath?` / `tsconfigPath?` / `includeProgress?`（既定 `true`） | C4 / コードグラフ解析を起動する。`Anytime Trail: コード解析` 相当。`includeProgress = true` のとき WebSocket 進捗ログを応答に同梱する |
| `analyze_release_code` | （共通のみ） | リリース別 C4 / コードグラフ解析。`release_code_graphs` を全削除して再生成する。`Anytime Trail: リリース別コード解析` 相当 |
| `analyze_all` | （共通のみ） | `~/.claude/projects` から JSONL を取り込み、コミット・リリース・カバレッジを Trail DB に書き込む。`Anytime Trail: 全データ解析` 相当 |
| `get_analyze_status` | （共通のみ） | 現在進行中の解析タスク種別と開始時刻を取得する |

> [!IMPORTANT]
> `analyze_current_code` の `includeProgress` を有効化すると、Node 22 のグローバル `WebSocket` でサーバーに接続し `analysis-progress` イベントを購読します。\
> 結果オブジェクトに `progressLog: { phase, percent, ts }[]` が追加されます。WS 利用不可環境では空配列で返ります。


### 4.6 コミュニティ命名・mapping 書き込み

`anytime-reverse-engineer` スキルから AI 生成結果を Trail DB に保存する用途。\
拡張プロセスの `TrailDataServer` を経由するため、スキルと拡張で in-memory DB が分裂する事故（過去 sql.js 採用時に発生）を回避できる。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `list_communities` | （共通のみ） | `current_code_graph_communities` の `label` / `name` / `summary` / `mappings_json` を取得する。スキルの cache 判定・命名済み判定に使用 |
| `upsert_community_summaries` | `summaries: [{ communityId, name, summary }]` | 各コミュニティに AI 生成した name/summary を upsert する。`mappings_json` は保持される |
| `upsert_community_mappings` | `mappings: [{ communityId, mappings: [{ elementId, elementType, role }] }]` | 各コミュニティの `mappings_json`（C4 要素 role）を upsert する。`mappings_json` カラム未存在時は自動 ALTER で追加。`name` / `summary` は保持される |

> [!NOTE]
> 書き込み完了後、TrailDataServer は `model-updated` を WebSocket 通知するため、Trail Viewer 側のキャッシュも自動再取得される（Reload Window 不要）。


### 4.7 ドリフト検出（memory-core）

設計仕様とコード実装の乖離（ドリフト）を管理する。\
memory-core DB（`${TRAIL_HOME}/db/memory-core.db`）を直接読み書きする。TrailDataServer は不要。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `detect_drift` | `unresolved_only?` / `severity?`（`info`/`warn`/`error`）/ `drift_type?` / `subject_id?` / `since?` / `limit?` | 保存済みドリフトイベントをフィルタ付きで照会する。既定は未解決のみ返す |
| `explain_drift` | `event_id` | 特定ドリフトイベントの 5 ソース（会話・仕様・コード・バグ履歴・レビュー）エビデンスを返す |
| `resolve_drift` | `event_id` / `resolution_note` / `resolved_at?` | ドリフトイベントを解決済みとしてマークし、解決メモを記録する |


### 4.8 レビューエージェント（memory-core）

AI レビューエージェントの実行管理とレビュー対象の優先順位付け。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `run_review_agent` | `trigger_kind`（`mcp` 固定）/ `target_kind`（`spec`/`code`/`package`/`mixed`）/ `target_refs` / `prompt_kind`（`a11y`/`security`/`perf`/`spec_drift`/`naming`/`logic`/`multi`）/ `model?` | レビュー実行リクエストを登録し `run_id` を即時返す |
| `get_review_run_status` | `run_id` | `run_review_agent` が返した `run_id` で実行ステータスを取得する |
| `list_review_runs` | `trigger_kind?` / `status?` / `target_kind?` / `model?` / `since?` / `limit?` | レビュー実行履歴をフィルタ付きで一覧する |
| `list_review_target_hints` | `limit?` | ドリフトイベント・バグ修正・未レビューファイルに基づく優先レビュー対象候補を返す |


### 4.9 バグ履歴（memory-core）

コミット単位のバグ修正履歴と繰り返しバグのパターン分析。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `get_bug_history` | `package?` / `file_path?` / `category?` / `limit?` | バグ修正履歴（影響ファイルパス・根本原因エンティティ参照付き）を取得する |
| `list_recurring_bugs` | `package?` / `file_path?` / `caused_by_entity_id?` / `windowDays?` / `minCount?` | 一定期間内に繰り返し発生しているバググループを一覧する |


### 4.10 レビュー所見（memory-core）

レビュー結果の追跡と対応済みコミットのリンク管理。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `list_unaddressed_review_findings` | `severity?` / `daysSinceMin?` / `target_file_path?` / `category?` / `limit?` | 未対応のレビュー所見を severity・経過日数・カテゴリでフィルタして一覧する |
| `get_review_history` | `target_file_path?` / `package?` / `category?` / `include_precedes_bugs?` / `limit?` | レビュー履歴（所見付き）を取得する。`include_precedes_bugs` を有効にすると `precedes` エッジ経由のバグエンティティ ID も含む |
| `link_review_to_commit` | `finding_id` / `commit_sha` / `addressed_at?` / `override_auto?` | レビュー所見を特定コミットで対応済みとしてマークし、`addresses` エッジを挿入する |


### 4.11 メモリグラフ検索（memory-core）

memory-core に蓄積されたエンティティ・関係・会話エピソードをクエリで検索する。\
`OLLAMA_BASE_URL` 未設定時はキーワードマッチのみ（ベクトル検索なし）。

| ツール | 主要パラメータ | 用途 |
| --- | --- | --- |
| `search_memory` | `query` / `entity_types?` / `source_type?` / `since?` / `limit?` / `hops?` | メモリグラフでクエリに関連するエンティティ・関係・会話エピソードを検索する。`hops=1` でグラフ隣接ノードまで展開 |


## 5. 使用例

### 5.1 C4 モデルの取得

```
ツール: mcp__mcp-trail__get_c4_model
引数: { repoName: "anytime-markdown" }
```

### 5.2 手動 C4 要素の追加

```
ツール: mcp__mcp-trail__add_element
引数: {
  type: "container",
  name: "Cache Layer",
  parentId: "sys_anytime-markdown",
  description: "Redis ベースのアプリケーションキャッシュ",
  serviceType: "redis",
  repoName: "anytime-markdown"
}
```

### 5.3 解析の起動と進捗確認

1. `analyze_current_code` を起動

   ```
   引数: { workspacePath: "/anytime-markdown", includeProgress: true }
   ```

2. 並行起動が拒否された場合、`get_analyze_status` で進行中タスクを確認

   ```
   応答例: { "inProgress": { "kind": "current", "startedAt": 1714808400000 } }
   ```

3. 完了応答に `progressLog` が含まれる

   ```json
   {
     "repoName": "anytime-markdown",
     "fileCount": 1234,
     "nodeCount": 5678,
     "edgeCount": 9012,
     "commitId": "abc123...",
     "durationMs": 45678,
     "warnings": [],
     "progressLog": [
       { "phase": "Loading project...", "percent": 0, "ts": 1714808400123 },
       { "phase": "Extracting symbols...", "percent": 25, "ts": 1714808410234 },
       { "phase": "Extracting dependencies...", "percent": 50, "ts": 1714808420345 },
       { "phase": "Filtering results...", "percent": 75, "ts": 1714808430456 },
       { "phase": "", "percent": 100, "ts": 1714808445789 }
     ]
   }
   ```


## 6. 関連スキル

| スキル | 連携内容 |
| --- | --- |
| `/anytime-reverse-engineer` | Step 0 で `analyze_current_code` を起動し、Trail DB にコードグラフを保存。Step 2 以降で AI コミュニティ要約を生成する |


## 7. 関連ドキュメント

- VS Code 拡張: [`packages/vscode-trail-extension/README.ja.md`](../vscode-trail-extension/README.ja.md)
- 変更履歴: [`CHANGELOG.ja.md`](./CHANGELOG.ja.md)
- 実装プラン（mcp-trail 解析ツール追加）: `/Shared/anytime-markdown-docs/plan/2026-05-04-mcp-trail-analyze-tools.ja.md`


## 8. ライセンス

[MIT](../../LICENSE)
