# Anytime Trail

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-trail-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-trail-extension/README.md)

**Claude Code を安全に見守る管制システム。**

複数の AI エージェントが同じコードベースで並行作業する時代に、ファイル編集の競合・設計逸脱・コスト膨張・意思決定の不透明性を防ぎます。\
本ドキュメントでは、最終ビジョンに対して**現在利用できる機能**を機能領域別に紹介します。

[**オンラインビューアで試す**](https://www.anytime-trial.com/trail)


## 1. 行動の可視化（Trail Viewer）

**最終ビジョン:** 全エージェントの操作履歴・意思決定・コスト・品質結果を完全記録し、いつでも振り返り・監査できる状態を作る。

**現在できること:**

- Claude Code の JSONL ログを SQLite に取り込み、セッション・プロンプト・ツール呼び出し・コミットを時系列で可視化
- DORA 4 メトリクス（デプロイ頻度・リードタイム・プロンプト成功率・変更失敗率）でチームの開発プロセスを定量評価
- トークンバジェットの消費状況をタブバーでリアルタイム監視（上限値の設定は [Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) 拡張の `anytimeAgent.budget.*`）
- セッション一覧・Analytics・Prompts の3タブ構成で多角的に分析
- ローカル SQLite を Supabase / PostgreSQL に同期して複数開発者でデータ統合

**使い方:** **ダッシュボード** サイドバーパネル → **Trail Viewer を開く**（または `Anytime Trail: Trail ビューアを開く`）でブラウザ（`http://localhost:19841`）が開きます。

> [!IMPORTANT]
> セッション・編集状態・コミット・トークン消費を Trail へ流し込む Claude Code フックは **Anytime Agent 拡張が登録します**（第 5 節）。本節の機能を使うには Anytime Agent の併用が必要です。


## 2. 構造の可視化（C4 アーキテクチャ図 & DSM）

**最終ビジョン:** AI が設計意図から逸脱した変更を行う前に、編集対象がプロジェクト全体のどこに位置し、何に影響するかを把握できるようにする。

**現在できること:**

- TypeScript プロジェクトを解析して C4 アーキテクチャ図と DSM（依存構造マトリクス）を自動生成
- L1（システム全体）から L4（ファイル単位）まで4段階のドリルダウン
- 循環依存を赤枠でハイライト、削除要素を取り消し線で表示
- Claude Code が編集中のファイルを C4 グラフ上にリアルタイム表示
- 手動グルーピング（ManualGroups）でドメイン境界・サービス分類を表現
- ミニマップで大規模グラフの俯瞰
- F-C Map（Feature-Component 対応マトリクス）で機能と実装の対応を可視化
- Markdown ドキュメントの `c4Scope` フロントマターで設計書を C4 要素と紐付け

**使い方:** `Ctrl+Shift+P` → `C4: Analyze Code` でブラウザビューアが起動します。


## 3. 品質の可視化（カバレッジ統合）

**最終ビジョン:** テスト未到達・品質低下領域を構造マップ上で発見し、AI に修正を促す。

**現在できること:**

- カバレッジを C4 図に重ねて表示し、テスト不足モジュールを一目で特定
- リリース時点のカバレッジと比較して変化を追跡

**使い方:** 各パッケージでカバレッジ付きのテストを実行し、`packages/<パッケージ名>/coverage/coverage-summary.json` を生成します（Jest なら `--coverage --coverageReporters=json-summary`）。\
解析時にこのファイルが自動で取り込まれ、C4 図に反映されます。パスの設定は不要です。


## 4. 視覚情報での意思疎通（Anytime Agent 拡張へ移行しました）

Note パネルと `/anytime-note` 連携は **Anytime Agent** VS Code 拡張
（`anytime-trial.anytime-agent`）に移行しました。\
Marketplace から導入すれば従来通り利用できます。\
既存ノート（`.anytime/notes/`）と `.claude/skills/anytime-note/` の
スキルはそのまま引き継がれます。


## 5. Claude Code との連携（スキル・フック）

拡張機能の起動時に、Trail 用の Claude Code スキルをワークスペースの `.claude/skills/` へ配置します。

| スキル | 用途 |
| --- | --- |
| `anytime-reverse-codegraph` | コードグラフのコミュニティに AI で名前・要約を付与し、C4 要素の role を判定する |
| `anytime-reverse-spec` | コードグラフ・DB スキーマ・外部 I/F・画面定義から基本設計書一式を生成する |
| `anytime-dev-retro` | Trail の 3 DB を横断分析し、開発健全性レポートと改善提案を生成する |
| `anytime-trail-review` | レビュー指摘を memory-core が取り込める書式で出力する |

> 配置し直す場合はコマンドパレットで `Anytime Trail: スキル再インストール` を実行します。

> [!IMPORTANT]
> **Claude Code フック（**`~/.claude/settings.json`**）の登録は本拡張では行いません。**\
> セッション情報・編集状態・コミット履歴・トークン消費を Trail へ流し込むフックは
> [Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) 拡張が
> `~/.claude/scripts/` へ配置・登録します。行動の可視化・コミット追跡・バジェット監視を利用する場合は
> Anytime Agent を併せて導入してください。


## 6. リポジトリの解析手順

現在 VS Code で開いているワークスペースの C4 アーキテクチャ図・コードグラフを解析し、各コミュニティに AI 要約を付与してカテゴライズするまでの一連の手順を示します。

**前提**

- 解析対象が TypeScript プロジェクトであり、`tsconfig.json` を含むこと
- Step 2 を実行する場合、Claude Code 本体と `anytime-reverse-codegraph` スキルがインストールされていること（第 5 節のとおり拡張の起動時に自動配置されます）

**実施手順**

1. **コード解析を実行する**
   - コマンドパレットで `Anytime Trail: コード解析` を実行する。
   - 対象リポジトリ配下に複数の `tsconfig.json` がある場合は QuickPick で選択する（プロジェクトルートを選ぶと配下の全パッケージを解析）。
2. **コミュニティ要約を AI 生成する（カテゴライズ）**
   - Claude Code で `/anytime-reverse-codegraph` スキルを実行する。
   - 各コミュニティに対して、人間が読んで意味のある名前と要約が AI で自動生成される。
3. **Trail Viewer で結果を確認する**
   - コマンドパレットで `Anytime Trail: Trail ビューアを開く` を実行し、Trail Viewer（`http://localhost:19841`）を開く。
   - C4 タブで C4 モデルが表示される。要素を選択すると、所属コミュニティの名前と要約が画面に表示される。

> [!IMPORTANT]
> Step 2 の AI 要約は外部 API（Anthropic）への送信を伴う。機密リポジトリで利用する場合は、ファイルパスやモジュール名等のコード構造情報が外部送信されることを事前確認すること。


## 7. 主なコマンド

コマンドパレット（`Ctrl+Shift+P`）から実行します。

| コマンド | 用途 |
| --- | --- |
| `Anytime Trail: コード解析` | 現ワークスペースを解析して C4 図・コードグラフを生成 |
| `Anytime Trail: コード解析 (tsconfig を選択)` | 解析対象の `tsconfig.json` を QuickPick で選ぶ |
| `Anytime Trail: Trail ビューアを開く` | ブラウザで Trail Viewer を開く |
| `Anytime Trail: 設計書追随チェック (作業ツリー)` | 作業ツリーの変更に対し設計書が追随しているかを判定 |
| `Anytime Trail: 全データ解析` | AnalyzeAll パイプラインを実行（`analyzeAll.enabled` が必要） |
| `Anytime Trail: セーフポイントを記録` / `セーフポイントへロールバック` | HEAD をセーフポイントとして記録し、recover ブランチで復旧 |
| `Anytime Trail: Kill Switch（Claude ツール実行を遮断）` / `Kill Switch 解除` | 暴走時に Claude のツール実行を緊急遮断・解除 |
| `Anytime Trail: 知識ベーススナップショットを復元` | `trail.db` 全体をスナップショットから復元 |
| `Anytime Trail: メモリインデックスを再構築` | memory-core の索引を作り直す |
| `Anytime Trail: MCP サーバーを登録` | `.mcp.json` に `mcp-trail` を書き出す |


## 8. 設定一覧

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.workspace.path` | `""` | 解析対象ワークスペースの絶対パス。Code Graph と C4 Model 両方の解析で使用される。空欄の場合は現在 VS Code で開いているワークスペースを使用する |
| `anytimeTrail.viewer.port` | `19841` | Trail Viewer サーバーのポート番号 |
| `anytimeTrail.daemon.useExternalDaemon` | `false` | 外部で起動済みの trail-server デーモンを利用する。先に `npx anytime-trail-server start` を起動しておく必要がある |
| `anytimeTrail.analyzeAll.enabled` | `false` | AnalyzeAll パイプライン（importAll + memory-core runOnce）を有効化する。OFF のときパイプラインツリービューは非表示になり、自動実行・手動実行ともに行われない |
| `anytimeTrail.lep.configPath` | `""` | `lep.json` の代替パス。指定時はこのファイルのみを読み込む（標準の `.anytime/trail/lep.json` 探索はスキップ）。反映には Reload Window が必要 |

> **DB の保存先について**: `trail.db` ほか各 DB の保存先は VS Code 設定ではなく `lep.json` の
> `database.storagePath`（既定 `.anytime/trail/db`）で決まります。既定構成での実体は
> `<ワークスペース>/.anytime/trail/db/trail.db` です。

> **トークンバジェットの上限値について**: `anytimeAgent.budget.dailyLimitTokens` ほかの
> バジェット設定は [Anytime Agent](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) 拡張側にあります。
> Trail Viewer は集計結果の表示のみを担当します。


## 9. ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
