---
name: anytime-reverse-engineer
description: "Trail DB に保存済みのコードグラフ・コミュニティに対し、AI で name / summary を付与し、各コミュニティに属する C4 要素の role（primary / secondary / dependency）を判定して mappings_json に保存する後処理スキル。将来的にソースコードから設計書まで生成するリバースエンジニアリングパイプラインに発展させる。コードグラフ生成自体は VS Code 拡張 (Anytime Trail) 側で完了している前提。"
trigger: /anytime-reverse-engineer
---

# /anytime-reverse-engineer

VS Code 拡張機能 (Anytime Trail) の `Anytime Trail: コード解析` で Trail DB に保存されたコミュニティ群に対し、AI 後処理として以下を実施する。

- 各コミュニティに **`name`（3 語以内）と `summary`（1 文・60 文字以内）** を Haiku サブエージェント並列で生成
- 各コミュニティに属する C4 要素の役割（**primary / secondary / dependency**）を判定して `mappings_json` カラムへ保存

> [!IMPORTANT]
> 本スキル単体ではコードグラフを生成しない。実行前に Trail DB の `current_code_graphs` / `current_code_graph_communities` にグラフが保存されている必要がある。\
> 未保存の場合は **Step 0** で `mcp-trail` 経由（または VS Code コマンド）で生成する。


## 処理フロー


### Step 0: コード解析の起動（Trail DB が空の場合）

`current_code_graphs` が空、または最新コミット反映のため再解析が必要な場合に実行する。\
既に最新の解析結果が DB に保存済みなら省略可。

選択肢 A: `mcp-trail` 経由（推奨・skill 内で完結）

- ツール: `mcp__mcp-trail__analyze_current_code`
- 引数: `workspacePath`（解析対象の絶対パス、省略時は VS Code 拡張の現在ワークスペース） / `tsconfigPath`（特定の tsconfig 指定、省略時は最上位を自動選択）
- 戻り値: `{ repoName, fileCount, nodeCount, edgeCount, commitId, durationMs, warnings, progressLog }`
- 動作: VS Code 拡張内の TrailDataServer に `POST /api/analyze/current` を送り、`Anytime Trail: コード解析` と同じパイプラインを起動する。WebSocket 経由で進捗を購読し、完了時に progress ログ付きで返す。並行実行中は 409 で拒否される

選択肢 B: VS Code コマンド経由（GUI ユーザー向け）

- コマンドパレットで `Anytime Trail: コード解析` を実行する

> [!NOTE]
> `mcp-trail` 経由を使うには VS Code 拡張 (Anytime Trail) が稼働中である必要がある。\
> `get_analyze_status` ツールで現在の解析進行状態を確認できる（並行実行回避用）。

> [!IMPORTANT]
> `mcp-trail` ツールが利用できない場合は、まず `claude mcp get mcp-trail` で登録状態を確認する。\
> 未登録の場合は以下のコマンドで Claude Code に登録する（拡張機能 v0.16.0 以上が必要）:
>
> ```bash
> SERVER_PATH=$(ls -t /home/node/.vscode-server/extensions/anytime-trial.anytime-trail-*/dist/mcp-trail-server.js 2>/dev/null | head -1)
> claude mcp add --scope project mcp-trail -- node "$SERVER_PATH"
> ```
>
> 登録後は `/clear` でセッションを再起動してから再実行する。\
> `mcp-trail-server.js` が存在しない場合は Anytime Trail 拡張 v0.16.0 以上をインストールする必要がある。


### Step 1: 前提値の解決

VS Code 設定から以下 2 値を取得する。

| 値 | 取得元設定キー | 既定値（未設定時） |
| --- | --- | --- |
| `trailDbPath` | `anytimeTrail.database.storagePath` | `${workspaceFolder}/.vscode/trail.db` |
| `repoName` | `anytimeTrail.workspace.path` の basename | ワークスペースフォルダ名 |

```bash
WS=$(pwd) node -e "
const fs = require('fs');
const path = require('path');
const ws = process.env.WS;
const stripJsonc = (s) => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'\$1');

const settings = {};
const candidates = [
  path.join(ws, '.vscode/settings.json'),
  path.join(process.env.HOME || '', '.vscode-server/data/User/settings.json'),
  path.join(process.env.HOME || '', '.config/Code/User/settings.json'),
];
for (const f of candidates) {
  if (!fs.existsSync(f)) continue;
  try {
    Object.assign(settings, JSON.parse(stripJsonc(fs.readFileSync(f, 'utf8'))));
  } catch {}
}

const dbDir = settings['anytimeTrail.database.storagePath'] || '.vscode';
const trailDbPath = path.isAbsolute(dbDir)
  ? path.join(dbDir, 'trail.db')
  : path.join(ws, dbDir, 'trail.db');

const wsPath = settings['anytimeTrail.workspace.path'] || ws;
const repoName = path.basename(wsPath);

const cacheDir = path.join(ws, '.vscode');
const cachePath = path.join(cacheDir, '.community_summary_cache.json');

console.log(JSON.stringify({ trailDbPath, repoName, cachePath }, null, 2));
"
```


### Step 2: コミュニティ要約（AI 命名）

`current_code_graph_communities` の各コミュニティに `name` + `summary` を生成して書き戻す。

**処理フロー**

1. **コミュニティ一覧取得**: `mcp__mcp-trail__list_communities` で `community_id` / `label` / `name` / `summary` / `mappings_json` を取得する（既に命名済みなら飛ばすため）。
2. **graph_json 読み込み**: `trailDbPath` を better-sqlite3 で**読み取りのみ**で開き、`current_code_graphs.graph_json` を `JSON.parse` して各コミュニティに属するノード ID を集約する（読み取り専用なので競合しない）。
3. **対象選別**: ノード数 3 以上 かつ `name` 未設定のコミュニティのみ要約対象とする。残りは `label` のみで運用するか命名済みとしてスキップ。
4. **キャッシュ確認**: コミュニティ内ノード ID をソート + 連結 → SHA-256 でハッシュ化する。`cachePath` に同ハッシュのエントリがあれば再利用する。
5. **バッチ作成**: 未キャッシュのコミュニティを **10 件ずつ** に分割し、各バッチを 1 サブエージェントへ渡す。
6. **サブエージェント実行**: `model: haiku` で並列実行する（`free -h` の結果で 2〜3 並列を判定）。
7. **DB 書き込み**: `mcp__mcp-trail__upsert_community_summaries` で結果をまとめて upsert する。**better-sqlite3 による直接書き込みは禁止**（拡張プロセスとの in-memory 不整合を招く）。
8. **キャッシュ更新**: 新規エントリを `cachePath` に書き戻す。

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
2. **グラフノードをコミュニティ別に集約**: `current_code_graphs.graph_json` の `nodes` を better-sqlite3 で**読み取り**、各ノードの `community` / `package` / `id` から C4 component を導出する。

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
5. **DB 書き込み**: `mcp__mcp-trail__upsert_community_mappings` で各コミュニティの `mappings_json` を upsert する（カラム未存在時は拡張側で自動 ALTER）。**better-sqlite3 による直接書き込みは禁止**。

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
> 除外コンポーネント（`packages` / `testUtils` / `__mocks__` / `exports`）はノード集約時にフィルタする。\
> Step 2 / Step 3 の DB 書き込みは MCP ツール経由なので、Trail Viewer は Reload Window なしに反映される（拡張側 `model-updated` 通知）。\
> `better-sqlite3` は graph_json の**読み取りのみ**で使う（Step 2 のノード集約用）。書き込みは絶対に行わない。


## 完了報告

実行後に以下をユーザーへ報告する。

- 要約生成したコミュニティ数（Step 2）
- role 判定したコミュニティ数 / mapping 件数（Step 3）
- スキップしたコミュニティ数の内訳（ノード数 3 未満 / キャッシュ命中）


## 出力先

| 保存先 | 内容 |
| --- | --- |
| `trail.db` の `current_code_graph_communities.name` / `summary` | コミュニティ名と要約（Step 2） |
| `trail.db` の `current_code_graph_communities.mappings_json` | C4 要素 role マッピング（Step 3） |
| `${workspaceFolder}/.vscode/.community_summary_cache.json` | コミュニティ要約のキャッシュ（再実行時の高速化用） |
