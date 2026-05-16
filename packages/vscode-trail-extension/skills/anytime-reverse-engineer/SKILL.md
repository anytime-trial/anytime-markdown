---
name: anytime-reverse-engineer
description: "Trail DB に保存済みのコードグラフ・コミュニティに対し、AI で name / summary を付与し、各コミュニティに属する C4 要素の role（primary / secondary / dependency）を判定して mappings_json に保存する後処理スキル。将来的にソースコードから設計書まで生成するリバースエンジニアリングパイプラインに発展させる。コードグラフ生成自体は VS Code 拡張 (Anytime Trail) 側で完了している前提。"
trigger: /anytime-reverse-engineer
---

# /anytime-reverse-engineer

VS Code 拡張機能 (Anytime Trail) で Trail DB に保存されたコードグラフ・コミュニティ群に対し、AI 後処理として以下を実施する。

- 各コミュニティに `name`**（3 語以内）と** `summary`**（1 文・60 文字以内）** を Haiku サブエージェント並列で生成
- 各コミュニティに属する C4 要素の役割（**primary / secondary / dependency**）を判定して `mappings_json` カラムへ保存

> [!IMPORTANT]
> 本スキルは **Step 1 で必ず `mcp__mcp-trail__analyze_current_code` を実行**して `current_code_graphs` / `current_code_graph_communities` を最新化してから後段の AI 後処理に進む。スキル単体でコードグラフを生成するわけではなく、VS Code 拡張内のパイプラインを MCP 経由で起動する点に注意。


## 処理フロー


### Step 1: コード解析の実行（current_code_graphs の取得・最新化）

`mcp__mcp-trail__analyze_current_code` を実行して `current_code_graphs` / `current_code_graph_communities` を最新化する。Trail DB が空でも、最新コミット反映済みでも、**毎回必ず実行**する（後段の Step 3 / Step 4 が参照するグラフを最新化する責務はこの Step にある）。

- ツール: `mcp__mcp-trail__analyze_current_code`
- 引数:
  - `workspacePath`（任意）: 解析対象の絶対パス。省略時は VS Code 拡張の現在ワークスペース
  - `tsconfigPath`（任意）: 特定の tsconfig 指定。省略時は最上位（root）を自動採用 — v0.19+ の VS Code コマンドと同じ挙動
  - `includeProgress`（任意、既定 true）: WebSocket 進捗ログをレスポンスに含める
- 戻り値: `{ repoName, fileCount, nodeCount, edgeCount, commitId, durationMs, warnings, progressLog }`
- 動作: VS Code 拡張内の TrailDataServer に `POST /api/analyze/current` を送り、`Anytime Trail: コード解析` と同じパイプラインを起動する。並行実行中は 409 で拒否されるため、`mcp__mcp-trail__get_analyze_status` で事前確認しておく

> [!NOTE]
> `mcp-trail` 経由を使うには VS Code 拡張 (Anytime Trail) が稼働中である必要がある。\
> 拡張未起動・パイプライン進行中の場合は、`mcp__mcp-trail__get_analyze_status` を先に呼んで状態を確認する。

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


### Step 2: 前提値の解決

VS Code 設定から以下 2 値を取得する。

| 値 | 取得元設定キー | 既定値（未設定時） |
| --- | --- | --- |
| `trailDbPath` | `anytimeTrail.database.storagePath` | `${workspaceFolder}/.anytime/trail/db/trail.db`（v0.19.0 で `.vscode/` から移行） |
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

const dbDir = settings['anytimeTrail.database.storagePath'] || '.anytime/trail/db';
const trailDbPath = path.isAbsolute(dbDir)
  ? path.join(dbDir, 'trail.db')
  : path.join(ws, dbDir, 'trail.db');

const wsPath = settings['anytimeTrail.workspace.path'] || ws;
const repoName = path.basename(wsPath);

const cacheDir = path.join(ws, '.anytime');
const cachePath = path.join(cacheDir, '.community_summary_cache.json');

console.log(JSON.stringify({ trailDbPath, repoName, cachePath }, null, 2));
"
```


### Step 3: コミュニティ要約（AI 命名）

`current_code_graph_communities` の各コミュニティに `name` + `summary` を生成して書き戻す。

**処理フロー**

1. **コミュニティ一覧取得**: `mcp__mcp-trail__list_communities` で `community_id` / `label` / `name` / `summary` / `mappings_json` を取得する（既に命名済みなら飛ばすため）。
2. **コミュニティ別ノード取得**: `mcp__mcp-trail__list_community_nodes` で `{ communityId, nodes: [{ id, label, package }] }` をコミュニティ単位で取得する（DB 読み取りは MCP に集約）。
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


### Step 4: コミュニティ別 C4 要素 role 判定

Step 3 で命名済みのコミュニティを「フィーチャー」とみなし、各コミュニティに属する C4 component / code 要素の役割を AI で判定して同テーブルに保存する。

**処理フロー**

1. **DB から命名済みコミュニティを取得**: `mcp__mcp-trail__list_communities` のレスポンスから `name !== ''` の行を抽出する（Step 3 で書き戻した結果が反映済み）。

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
> Step 3 の DB 書き込み後に実行すること（`name` が確定してから role 判定を行うため）。\
> 除外コンポーネント（`packages` / `testUtils` / `__mocks__` / `exports`）はノード集約時にフィルタする。\
> Step 3 / Step 4 の DB アクセスはすべて MCP ツール経由（読み取りは `list_communities` / `list_community_nodes`、書き込みは `upsert_community_summaries` / `upsert_community_mappings`）。Trail Viewer は Reload Window なしに反映される（拡張側 `model-updated` 通知）。\
> better-sqlite3 / sql.js 等で `trail.db` を直接開くことは禁止（v0.19.0 で MCP 経由に統一）。


## 完了報告

実行後に以下をユーザーへ報告する。

- 解析結果（Step 1）: `fileCount` / `nodeCount` / `edgeCount` / `commitId` / `durationMs`
- 要約生成したコミュニティ数（Step 3）
- role 判定したコミュニティ数 / mapping 件数（Step 4）
- スキップしたコミュニティ数の内訳（ノード数 3 未満 / キャッシュ命中）


## 出力先

| 保存先 | 内容 |
| --- | --- |
| `trail.db` の `current_code_graphs.graph_json` | コードグラフ本体（Step 1） |
| `trail.db` の `current_code_graph_communities.name` / `summary` | コミュニティ名と要約（Step 3） |
| `trail.db` の `current_code_graph_communities.mappings_json` | C4 要素 role マッピング（Step 4） |
| `${workspaceFolder}/.anytime/.community_summary_cache.json` | コミュニティ要約のキャッシュ（再実行時の高速化用、v0.19.0 で `.vscode/` から移行） |
