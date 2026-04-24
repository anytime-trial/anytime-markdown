# Anytime Trail

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-trail?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

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

![C4 Mermaid ダイアグラムの例](images/c4-mermaid.png)

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


## 4. 視覚情報での意思疎通（Note Panel）

**最終ビジョン:** AI と人間の双方向通信路として、テキストでは伝わらない視覚情報・引き継ぎ資料・指示書をやり取りする。

**現在できること:**

- 複数ページのノートを管理し、UI スクリーンショット・デザインモック・図表を Claude Code に直接渡す
- セッションをまたぐ作業引き継ぎ資料として活用
- `/anytime-note` スキル経由で AI が画像を読み取って作業を実行

**使い方:** サイドバー **Note** で `+` ボタン → Anytime Markdown でノートを開いて画像を貼り付け → Claude Code で `/anytime-note 〜` のように指示。


## 5. Claude Code との連携（スキル・フック）

拡張機能の起動時に、Claude Code のスキル・フックを `~/.claude/` 配下へ自動登録します。\
手動設定なしで、セッション情報・編集状態・コミット履歴・トークン消費が Trail に流れ込みます。

**自動登録されるフック（**`~/.claude/settings.json`**）:**

| イベント | スクリプト | 用途 |
| --- | --- | --- |
| `PreToolUse` / `PostToolUse` | `claude-code-status.json` 書き込み | 編集中ファイルの状態を記録（Markdown 拡張のエディタロック・C4 グラフのアクティビティ表示に利用） |
| `PostToolUse` | `commit-tracker.sh` | Bash ツール実行後の git commit を検知し Trail DB に記録 |
| `Stop` | `trail-token-budget.sh` | セッション終了時のトークン消費を集計しバジェット監視に反映 |
| `UserPromptSubmit` | `session-guard.sh` | セッション時間・ターン数が閾値を超えた場合に警告 |

**自動生成されるスキル（**`~/.claude/skills/`**）:**

| スキル | 用途 |
| --- | --- |
| `/anytime-note` | Note パネルのノート（`anytime-note-N.md`）を読み込んで指示された作業を実行。最初のノート作成時に自動生成 |

> フックスクリプトは `~/.claude/scripts/` に配置されます。\
> Claude Code がインストールされていない場合（`~/.claude/` 不在時）は登録をスキップします。


## 6. 設定一覧

| 設定キー | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeTrail.trailServer.port` | `19841` | サーバーのポート番号 |
| `anytimeTrail.c4.analyzeExcludePatterns` | `[".worktrees", ...]` | C4 解析から除外するディレクトリ名パターン |
| `anytimeTrail.docsPath` | `""` | C4 ドキュメントリンク用ドキュメントディレクトリの絶対パス |
| `anytimeTrail.coverage.path` | `""` | `coverage-final.json` へのパス（ワークスペースルートからの相対パス） |
| `anytimeTrail.coverage.historyLimit` | `50` | カバレッジ履歴スナップショットの最大保存件数 |
| `anytimeTrail.test.e2eCommand` | `cd packages/web-app && npm run e2e` | E2E テスト実行コマンド |
| `anytimeTrail.test.coverageCommand` | `npx jest --coverage --maxWorkers=1` | カバレッジ付きテスト実行コマンド |
| `anytimeTrail.database.storagePath` | `""` | `trail.db` の保存先（空の場合は `.vscode/`） |
| `anytimeTrail.database.backupGenerations` | `1` | `trail.db` バックアップの保持世代数 |
| `anytimeTrail.claudeStatus.directory` | `""` | `claude-code-status.json` の保存先（空の場合は `.vscode/`） |
| `anytimeTrail.remote.provider` | `none` | リモート DB プロバイダー（`none` / `supabase` / `postgres`） |
| `anytimeTrail.remote.supabaseUrl` | `""` | Supabase プロジェクト URL |
| `anytimeTrail.remote.supabaseAnonKey` | `""` | Supabase anon キー |
| `anytimeTrail.remote.postgresUrl` | `""` | PostgreSQL 接続文字列 |


## 7. ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
