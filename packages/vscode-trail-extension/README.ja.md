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
- トークンバジェットの消費状況をタブバーでリアルタイム監視
- セッション一覧・Analytics・Prompts の3タブ構成で多角的に分析
- ローカル SQLite を Supabase / PostgreSQL に同期して複数開発者でデータ統合

**使い方:** **Dashboard** サイドバーパネル → **Open Trail Viewer**（または `Anytime Trail: Open Trail Viewer`）でブラウザ（`http://localhost:19841`）が開きます。


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

- `coverage-final.json` のデータを C4 図に重ねて表示し、テスト不足モジュールを一目で特定
- ファイル変更を自動検出してカバレッジを更新
- カバレッジ履歴をスナップショットとして保存し変化を追跡
- C4 ツリー L4 ノードの右クリックからカバレッジ付きテストを直接実行

**使い方:** `anytimeTrail.coverage.path` に `coverage-final.json` のパスを設定します。


## 4. 視覚情報での意思疎通（Anytime Agent 拡張へ移行しました）

Note パネルと `/anytime-note` 連携は **Anytime Agent** VS Code 拡張
（`anytime-trial.anytime-agent`）に移行しました。\
Marketplace から導入すれば従来通り利用できます。\
既存ノート（`.anytime/notes/`）と `.claude/skills/anytime-note/` の
スキルはそのまま引き継がれます。


## 5. Claude Code との連携（スキル・フック）

拡張機能の起動時に、Claude Code のスキル・フックを `~/.claude/` 配下へ自動登録します。\
手動設定なしで、セッション情報・編集状態・コミット履歴・トークン消費が Trail に流れ込みます。

**自動登録されるフック（**`~/.claude/settings.json`**）:**

| イベント | スクリプト | 用途 |
| --- | --- | --- |
| `PreToolUse` / `PostToolUse` | `claude-code-status.json` 書き込み | 編集中ファイルの状態を記録（Markdown 拡張のエディタロック・C4 グラフのアクティビティ表示に利用） |
| `PostToolUse` | `commit-tracker.sh` | Bash ツール実行後の git commit を検知し Trail DB に記録 |
| `Stop` | `token-budget.sh` | セッション終了時のトークン消費を集計しバジェット監視に反映 |
| `UserPromptSubmit` | `session-guard.sh` | セッション時間・ターン数が閾値を超えた場合に警告 |

> フックスクリプトは `~/.claude/scripts/` に配置されます。\
> Claude Code がインストールされていない場合（`~/.claude/` 不在時）は登録をスキップします。


## 6. リポジトリの解析手順

現在 VS Code で開いているワークスペースの C4 アーキテクチャ図・コードグラフを解析し、各コミュニティに AI 要約を付与してカテゴライズするまでの一連の手順を示します。

**前提**

- 解析対象が TypeScript プロジェクトであり、`tsconfig.json` を含むこと
- Step 2 を実行する場合、Claude Code 本体と `/anytime-reverse-engineer` スキルがインストールされていること

**実施手順**

1. **コード解析を実行する**
   - コマンドパレットで `Anytime Trail: コード解析` を実行する。
   - 対象リポジトリ配下に複数の `tsconfig.json` がある場合は QuickPick で選択する（プロジェクトルートを選ぶと配下の全パッケージを解析）。
2. **コミュニティ要約を AI 生成する（カテゴライズ）**
   - Claude Code で `/anytime-reverse-engineer` スキルを実行する。
   - 各コミュニティに対して、人間が読んで意味のある名前と要約が AI で自動生成される。
3. **Trail Viewer で結果を確認する**
   - コマンドパレットで `Anytime Trail: Trail ビューアを開く` を実行し、Trail Viewer（`http://localhost:19841`）を開く。
   - C4 タブで C4 モデルが表示される。要素を選択すると、所属コミュニティの名前と要約が画面に表示される。

> [!IMPORTANT]
> Step 2 の AI 要約は外部 API（Anthropic）への送信を伴う。機密リポジトリで利用する場合は、ファイルパスやモジュール名等のコード構造情報が外部送信されることを事前確認すること。


## 7. 設定一覧

### 7.1 ワークスペース

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.workspace.path` | `""` | 解析対象ワークスペースの絶対パス。Code Graph と C4 Model 両方の解析で使用される。空欄の場合は現在 VS Code で開いているワークスペースを使用する |
| `anytimeTrail.workspace.docsPath` | `""` | C4 ドキュメントリンク用のドキュメントディレクトリ絶対パス。設定すると `c4Scope` フロントマターを持つ Markdown が C4 ビューアでインデックスされる |


### 7.2 ビューア

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.viewer.port` | `19841` | Trail Viewer サーバーのポート番号 |


### 7.3 データベース

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.database.storagePath` | `""` | `trail.db` の保存ディレクトリ。絶対パスまたはワークスペースルートからの相対パス。空の場合は `.vscode/` を使用 |
| `anytimeTrail.database.backupGenerations` | `1` | `trail.db` のバックアップ世代数。各世代は `.bak.N.gz` として DB ファイルと同じディレクトリに gzip 圧縮で保存される（範囲: 1〜10） |


### 7.4 Claude Code 連携

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.claudeStatus.directory` | `.anytime/trail/agent-status` | `claude-code-status.json` の保存ディレクトリ。絶対パスまたはワークスペースルートからの相対パス。 |


### 7.5 トークンバジェット

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.budget.dailyLimitTokens` | `null` | 日次トークン上限。`null` で無効 |
| `anytimeTrail.budget.sessionLimitTokens` | `null` | セッションあたりのトークン上限。`null` で無効 |
| `anytimeTrail.budget.alertThresholdPct` | `80` | 上限に対する警告閾値（%、範囲 1〜100） |


## 8. ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
