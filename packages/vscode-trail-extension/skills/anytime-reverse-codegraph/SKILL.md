---
name: anytime-reverse-codegraph
description: "Trail DB に保存済みのコードグラフ・コミュニティに対し、AI で name / summary を付与し、各コミュニティに属する C4 要素の role（primary / secondary / dependency）を判定して mappings_json に保存する後処理スキル。将来的にソースコードから設計書まで生成するリバースエンジニアリングパイプラインに発展させる。コードグラフ生成自体は VS Code 拡張 (Anytime Trail) 側で完了している前提。"
trigger: /anytime-reverse-codegraph
---

# /anytime-reverse-codegraph

VS Code 拡張機能 (Anytime Trail) で Trail DB に保存されたコードグラフ・コミュニティ群に対し、AI 後処理として以下を実施する。

- 各コミュニティに `name`**（3 語以内）と** `summary`**（1 文・60 文字以内）** を Haiku サブエージェント並列で生成
- 各コミュニティに属する C4 要素の役割（**primary / secondary / dependency**）を判定して `mappings_json` カラムへ保存

> [!IMPORTANT]
> 本スキルは **Step 1 で必ず `mcp__mcp-trail__analyze_current_code` を実行**して `current_code_graphs` / `current_code_graph_communities` を最新化してから後段の AI 後処理に進む。スキル単体でコードグラフを生成するわけではなく、VS Code 拡張内のパイプラインを MCP 経由で起動する点に注意。


## 事前準備: VS Code 設定の取得と接続確認

mcp-trail は VS Code 拡張内の TrailDataServer に HTTP 接続する。\
**VS Code 設定 `anytimeTrail.viewer.port`（既定 `19841`）** がポートを決め、MCP 登録時の `TRAIL_SERVER_URL` 環境変数と一致している必要がある。不一致だと `analyze_current_code` などすべての MCP ツールが接続エラーになる。\
あわせて `anytimeTrail.workspace.path` も読み取り、Step 1 で `workspacePath` 引数として MCP に明示的に渡す。

以下 3 つを順に確認する。

### 1. VS Code 設定の取得（viewer.port + workspace.path）

VS Code の以下 2 設定を読み取り、後続 MCP 呼び出しの引数として保持する。

- `anytimeTrail.viewer.port`（既定 `19841`）→ `serverUrl` の組み立てに使用
- `anytimeTrail.workspace.path` → Step 1 の `workspacePath` 引数に**明示指定**する（MCP `analyze_current_code` は省略時に **mcp-trail サーバの cwd**（多くは VS Code 起動 cwd）を使うため、`anytimeTrail.workspace.path` の値は自動では反映されない）

```bash
node -e "
const fs = require('fs');
const path = require('path');
const stripJsonc = (s) => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'\$1');
const settings = {};
for (const f of [
  path.join(process.cwd(), '.vscode/settings.json'),
  path.join(process.env.HOME || '', '.vscode-server/data/User/settings.json'),
  path.join(process.env.HOME || '', '.config/Code/User/settings.json'),
]) {
  if (!fs.existsSync(f)) continue;
  try { Object.assign(settings, JSON.parse(stripJsonc(fs.readFileSync(f, 'utf8')))); } catch {}
}
console.log('viewer.port:    ', settings['anytimeTrail.viewer.port'] ?? 19841);
console.log('workspace.path: ', settings['anytimeTrail.workspace.path'] ?? '(not set)');
"
```

> [!NOTE]
> `workspace.path` が未設定の場合は、ユーザーに解析対象ワークスペースの絶対パスを確認する（`tsconfig.json` を持つルート）。

### 2. 実際の稼働確認 (probe)

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:19841/api/analyze/status
# 200 → 拡張稼働中
# Connection refused → 拡張未起動 or ポート不一致 (VS Code を起動して Anytime Trail サイドバーを開く)
```

### 3. MCP 登録の env と一致確認

```bash
claude mcp get mcp-trail | grep TRAIL_SERVER_URL
# 出力例: TRAIL_SERVER_URL=http://localhost:19841
# → 1. で確認したポートと一致していることを確認
```

不一致なら VS Code コマンド `Anytime Trail: MCP サーバーを登録 (.mcp.json を更新)` を再実行し、Claude Code を再起動 (`/clear`) する（`.mcp.json` の `TRAIL_SERVER_URL` は登録時の viewer.port が焼き付けられるため、ポート変更後は再登録が必要。Copilot Chat 側の経路は拡張側で自動追従するため対応不要）。


## 処理フロー


### Step 1: コード解析の実行（current_code_graphs の取得・最新化）

`mcp__mcp-trail__analyze_current_code` を実行して `current_code_graphs` / `current_code_graph_communities` を最新化する。Trail DB が空でも、最新コミット反映済みでも、**毎回必ず実行**する（後段の Step 2 / Step 3 が参照するグラフを最新化する責務はこの Step にある）。

- ツール: `mcp__mcp-trail__analyze_current_code`
- 引数:
  - `workspacePath`（**必須扱い**）: 解析対象の絶対パス。事前準備で取得した `anytimeTrail.workspace.path` の値を**毎回明示的に渡す**。省略すると mcp-trail サーバの cwd が使われ、意図と異なるディレクトリ（`tsconfig.json` が無い）で 500 エラーになる
  - `tsconfigPath`（任意）: 特定の tsconfig 指定。省略時は最上位（root）を自動採用 — v0.19+ の VS Code コマンドと同じ挙動
  - `includeProgress`（任意、既定 true）: WebSocket 進捗ログをレスポンスに含める
- 戻り値: `{ repoName, fileCount, nodeCount, edgeCount, commitId, durationMs, warnings, progressLog }`
- 動作: VS Code 拡張内の TrailDataServer に `POST /api/analyze/current` を送り、`Anytime Trail: コード解析` と同じパイプラインを起動する。並行実行中は 409 で拒否されるため、`mcp__mcp-trail__get_analyze_status` で事前確認しておく

**呼び出し例**

```text
ツール: mcp__mcp-trail__analyze_current_code
引数:
{
  "serverUrl": "http://localhost:19845",      // 事前準備の viewer.port
  "workspacePath": "/Shared/tiptap",          // 事前準備の anytimeTrail.workspace.path
  "includeProgress": true
}
```

> [!NOTE]
> `mcp-trail` 経由を使うには VS Code 拡張 (Anytime Trail) が稼働中である必要がある。\
> 拡張未起動・パイプライン進行中の場合は、`mcp__mcp-trail__get_analyze_status` を先に呼んで状態を確認する。

> [!IMPORTANT]
> `mcp-trail` ツールが利用できない場合は、まず `claude mcp get mcp-trail` で登録状態を確認する。\
> 未登録の場合は VS Code コマンドパレットから以下を実行:
>
> ```text
> Anytime Trail: MCP サーバーを登録 (.mcp.json を更新)
> ```
>
> ワークスペースルートに `.mcp.json` が生成・更新され、`mcpServers.mcp-trail` エントリに現在の `anytimeTrail.viewer.port` を反映した `TRAIL_SERVER_URL` が書き込まれる。\
> 登録後は Claude Code を再起動 (`/clear`) してから再実行する。
>
> 注意:
> - Anytime Trail 拡張がインストールされていない場合は、先に拡張をインストールする
> - `.mcp.json` はマシン依存の絶対パス（Node バイナリ・拡張インストール先）を含むため、git commit せず `.gitignore` に追加する運用を推奨
> - Copilot Chat 等 VS Code 内 AI 拡張からの利用は別経路（拡張が `vscode.lm.registerMcpServerDefinitionProvider` で自動登録）で済むため、本コマンドの実行は不要


### Step 2: コミュニティ要約（AI 命名）

`current_code_graph_communities` の各コミュニティに `name` + `summary` を生成して書き戻す。

**処理フロー**

1. **コミュニティ一覧取得**: `mcp__mcp-trail__list_communities` で `community_id` / `label` / `name` / `summary` / `mappings_json` を取得する（既に命名済みなら飛ばすため）。
2. **コミュニティ別ノード取得**: `mcp__mcp-trail__list_community_nodes` で `{ communityId, nodes: [{ id, label, package }] }` をコミュニティ単位で取得する（DB 読み取りは MCP に集約）。
3. **対象選別**: ノード数 3 以上 かつ `name` 未設定のコミュニティのみ要約対象とする。残りは `label` のみで運用するか命名済みとしてスキップ。
4. **キャッシュ確認**: コミュニティ内ノード ID をソート + 連結 → SHA-256 でハッシュ化する。`${workspaceFolder}/.anytime/.community_summary_cache.json` に同ハッシュのエントリがあれば再利用する。
5. **バッチ作成**: 未キャッシュのコミュニティを **10 件ずつ** に分割し、各バッチを 1 サブエージェントへ渡す。
6. **サブエージェント実行**: `model: haiku` で並列実行する（`free -h` の結果で 2〜3 並列を判定）。
7. **DB 書き込み**: `mcp__mcp-trail__upsert_community_summaries` で結果をまとめて upsert する。**better-sqlite3 による直接書き込みは禁止**（拡張プロセスとの in-memory 不整合を招く）。
8. **キャッシュ更新**: 新規エントリを同キャッシュファイルに書き戻す。

**サブエージェントへのプロンプト**

```text
以下のファイルクラスタ群から、各クラスタの簡潔な name と summary を JSON で返してください。

注意:
- 推測はファイル名・パス・パッケージ・現在のラベルからのみ行う（不明な場合は label をそのまま name に採用）
- name: 3 語以内、日本語の体言止め
- summary: 1 文・60 文字以内・体言止め

入力:
[
  {
    "communityId": 8,
    "currentLabel": "utils",
    "package": "markdown-core",
    "nodes": ["latexToExpr", "mermaidExpr", "mathParse"]
  },
  ...
]

出力（JSON のみ、説明文不要）:
{"summaries":[
  {"communityId":8,"name":"数式変換","summary":"Mermaid/LaTeX/MathJax の数式表現を AST に変換するユーティリティ群。"}
]}
```

**DB 書き込み（MCP ツール経由）**

```text
ツール: mcp__mcp-trail__upsert_community_summaries
引数:
{
  "summaries": [
    { "communityId": 8, "name": "数式変換", "summary": "Mermaid/LaTeX/MathJax の数式表現を AST に変換するユーティリティ群。" },
    ...
  ]
}
```

応答 `{ updated: number }` が件数として返る。`mappings_json` カラムは保持される（書き換えられない）。


### Step 3: コミュニティ別 C4 要素 role 判定

Step 2 で命名済みのコミュニティを「フィーチャー」とみなし、各コミュニティに属する C4 component / code 要素の役割を AI で判定して同テーブルに保存する。

**処理フロー**

1. **DB から命名済みコミュニティを取得**: `mcp__mcp-trail__list_communities` のレスポンスから `name !== ''` の行を抽出する（Step 2 で書き戻した結果が反映済み）。

2. **グラフノードをコミュニティ別に取得**: `mcp__mcp-trail__list_community_nodes` で `{ communityId, nodes: [{ id, label, package }] }` を取得し、各ノードの `id` / `package` から C4 component を導出する。

   ノード ID → C4 component への変換ルール:

   ```
   ノード id 例: "trail-core/src/coverage/aggregateCoverage"
   → package: "trail-core"
   → src 以降の第 1 ディレクトリ: "coverage"
   → C4 component: "pkg_trail-core/coverage"
   
   ```

   `src/` を含まない場合はコンテナレベル `pkg_{package}` にフォールバックする。

3. **バッチ作成**: コミュニティを **5 件ずつ** に分割し、各バッチを 1 サブエージェントへ渡す（`free -h` で 2〜3 並列）。

4. **サブエージェント実行**: `model: haiku` で role を判定する。

5. **DB 書き込み**: `mcp__mcp-trail__upsert_community_mappings` で各コミュニティの `mappings_json` を upsert する。**better-sqlite3 による直接書き込みは禁止**。

**role 判定基準**

| role | 基準 |
| --- | --- |
| `primary` | コア処理・アルゴリズム・UI コンポーネントを含む（主要実装） |
| `secondary` | 設定・ユーティリティ・型定義など補助的サポート |
| `dependency` | このコミュニティの機能を呼び出す側（ホスト・統合レイヤー・ラッパー） |

**サブエージェントへのプロンプト**

```text
以下のコミュニティ（フィーチャー）ごとに、各 C4 コンポーネントの role を JSON で返してください。

role 判定基準:
- primary: コア処理・アルゴリズム・UI コンポーネントを含む主要実装
- secondary: 設定・ユーティリティ・型定義など補助的サポート
- dependency: このコミュニティの機能を呼び出す側（ホスト・統合レイヤー）

注意:
- 判定はコンポーネント名・ノードラベル・パッケージ名からのみ行う
- 1 コミュニティにつき primary は 1〜2 個を目安とする
- 除外: ノードラベルが packages / testUtils / __mocks__ / exports のコンポーネント

入力:
[
  {
    "communityId": 5,
    "communityName": "カバレッジ計算",
    "components": [
      { "elementId": "pkg_trail-core/coverage", "nodes": ["aggregateCoverage", "computeCoverageDiff"] },
      { "elementId": "pkg_trail-viewer/hooks", "nodes": ["useCoverage", "useCoverageDiff"] }
    ]
  },
  ...
]

出力（JSON のみ、説明文不要）:
{"mappings":[
  {"communityId":5,"elementId":"pkg_trail-core/coverage","elementType":"component","role":"primary"},
  {"communityId":5,"elementId":"pkg_trail-viewer/hooks","elementType":"component","role":"dependency"}
]}
```

**DB 書き込み（MCP ツール経由）**

```text
ツール: mcp__mcp-trail__upsert_community_mappings
引数:
{
  "mappings": [
    {
      "communityId": 5,
      "mappings": [
        { "elementId": "pkg_trail-core/coverage", "elementType": "component", "role": "primary" },
        { "elementId": "pkg_trail-viewer/hooks", "elementType": "component", "role": "dependency" }
      ]
    },
    ...
  ]
}
```

応答 `{ updated: number, inserted: number }` で件数が返る。`name` / `summary` は保持される。

> [!NOTE]
> Step 2 の DB 書き込み後に実行すること（`name` が確定してから role 判定を行うため）。\
> 除外コンポーネント（`packages` / `testUtils` / `__mocks__` / `exports`）はノード集約時にフィルタする。


## 完了報告

実行後に以下をユーザーへ報告する。

- 解析結果（Step 1）: `fileCount` / `nodeCount` / `edgeCount` / `commitId` / `durationMs`
- 要約生成したコミュニティ数（Step 2）
- role 判定したコミュニティ数 / mapping 件数（Step 3）
- スキップしたコミュニティ数の内訳（ノード数 3 未満 / キャッシュ命中）


## 出力先

| 保存先 | 内容 |
| --- | --- |
| `trail.db` の `current_code_graphs.graph_json` | コードグラフ本体（Step 1） |
| `trail.db` の `current_code_graph_communities.name` / `summary` | コミュニティ名と要約（Step 2） |
| `trail.db` の `current_code_graph_communities.mappings_json` | C4 要素 role マッピング（Step 3） |
| `${workspaceFolder}/.anytime/.community_summary_cache.json` | コミュニティ要約のキャッシュ（再実行時の高速化用） |
