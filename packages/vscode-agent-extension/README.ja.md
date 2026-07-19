# Anytime Agent

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.md)

**すべての Claude Code セッションを一目で把握 — VS Code だけで完結。**

複数の Claude Code セッションを worktree やブランチをまたいで動かしていると、どのセッションが何をしているのか、どれが肥大化しているのかが分かりにくくなります。

Anytime Agent は、すべての Claude Code セッションを一覧するアクティビティバーパネルを追加し、肥大化したセッションを文脈を保持したまま新セッションへ引き継ぎ、AI ノートで視覚情報を AI に共有します。


## 1. できること

- **Agent マッピング** — すべての Claude Code / Codex セッションを最近のアクティビティ順の一覧で表示し、ブランチ・worktree・コミット情報をホバーで確認
- **セッション引き継ぎ** — 文脈が肥大化したセッションを、作業の圧縮要約を保持したまま新しいセッションへ移行
- **Git 活動の追跡** — AI が実行した git 操作を記録し、破壊的操作だけを絞り込んで復元コマンドを取り出す
- **Worktree 所有状況** — どの worktree をどのセッションが使っているかを一覧し、並行作業の衝突を防ぐ
- **作業スナップショット** — 未コミットの作業を定期的に `refs/anytime/snapshots/` へ非破壊で退避
- **AI ノート** — 画像・表・メモを AI ツールに共有し、視覚情報をもとに作業させる
- **Ollama 連携** — ローカル LLM の起動をサイドバーから行う


## 2. はじめかた

アクティビティバーの **Anytime Agent** アイコンを開きます。パネルには **AI ノート**・**Agent マッピング**・**Git 活動**・**Worktree 所有状況**・**Ollama** の 5 つのビューがあります。

本拡張は有効化時に Claude Code のフックを `~/.claude/settings.json` へ自動登録し、スクリプトを `~/.claude/scripts/` へ配置します。フックはセッションの活動（編集・Bash 実行・コミット・トークン消費）を拡張同梱の agent-status ワーカーへ報告し、各ビューがそれを読み取って表示します。他の拡張は不要です。

**自動登録されるフック:**

| イベント | 対象 | 用途 |
| --- | --- | --- |
| `SessionStart` | — | 同じ作業ツリーに他の生存セッションがあれば worktree 分離を助言する |
| `PreToolUse` / `PostToolUse` | `Edit`・`Write` | 編集の開始・終了を記録（Markdown 拡張のエディタロック、C4 グラフのアクティビティ表示に利用） |
| `PreToolUse` / `PostToolUse` | `Bash` | 実行中の cwd を記録し、テスト実行中も worktree を特定可能にする |
| `PreToolUse` | 全ツール | Kill Switch 発動中はツール実行を遮断する |
| `PostToolUse` | 全ツール | ループ（同一操作の反復）を検知して警告する |
| `PostToolUse` | `Bash` | `commit-tracker.sh` が git commit を検出して記録する |
| `UserPromptSubmit` | — | `session-guard.sh`（時間・ターン数の警告）・`handoff-inject.sh`（引き継ぎ注入）・`user-feedback.sh`（事後修正指示の記録） |
| `Stop` | — | `token-budget.sh`（トークン消費集計）・`safe-point.sh`（セーフポイント記録）・`flight-review.sh`（デブリーフ集計） |

> Claude Code がインストールされていない場合（`~/.claude/` 不在時）は登録をスキップします。

セッションが表示されない場合:

- Claude Code がインストールされているか確認してください（`~/.claude/` が無い場合はフック登録がスキップされます）。
- セッションはワークスペースで Claude Code が操作（編集・コマンド・コミット）を行うと表示されます。


## 3. Agent マッピング

セッションを **Claude Code**・**Codex** の見出しでグループ分けし、各グループ内を最近のアクティビティ順で表示します。行はシンプルに保ち、詳細はホバー（ツールチップ）で確認します。

- **最近順の一覧** — 最後にアクティブだったセッションがグループの先頭に並ぶ
- **コンテキスト警告バッジ** — コンテキストトークンが `anytimeAgent.contextWarnTokens`（既定 160,000）を超えたセッションに引き継ぎ推奨の ⚠️ を表示

Claude セッションを右クリックすると **新セッションへ引き継ぎ**・**セッション ID をコピー**・**ステータスファイルを削除** が利用できます。

### Codex セッション（読み取り専用）

現ワークスペースの Codex（OpenAI CLI）セッションを、`~/.codex/sessions` の rollout ファイルをスキャンして表示します。保持期間内かつ作業ディレクトリが現ワークスペースの worktree 配下にあるセッションのみが対象です。

Codex には agent-status のライフサイクルフックが無いため、Codex は **読み取り専用**です。**最終アクティビティ**と**コンテキストトークン**（⚠️ バッジ）のみ表示し、編集中ロック・コミット数・新セッションへの引き継ぎは Claude 専用です。右クリックメニューは **セッション ID をコピー** のみ。**今日**の集計も Claude 専用で *Today (Claude)* と表示します。グループの表示は `anytimeAgent.showCodexSessions` で切り替えられます。


## 4. セッション引き継ぎ

セッションが肥大化したら、これまでの作業を要約して新しいセッションへ引き継ぎます。文脈をゼロからやり直さずに済みます。

セッションを右クリックして **新セッションへ引き継ぎ** を選択:

- **ワンクリック起動** — ターミナルで新しい `claude` セッションを起動し、引き継ぎ内容を自動注入
- **クリップボードフォールバック** — または引き継ぎドキュメントのパスをコピーして新セッションの冒頭に貼り付け


## 5. 作業の保護（Git 活動・Worktree 所有状況・スナップショット）

複数の AI セッションが同じリポジトリを触るときに、取り返しのつかない操作を防ぎ、起きてしまった操作から復旧するためのビュー群です。

### Git 活動

AI が実行した git 操作の履歴を表示します。

- **破壊的操作のみ表示** — `reset --hard` ・ `clean -f` ・ `branch -D` ・ `push --force` 系だけに絞り込む
- **実行者・期間で絞り込み** — 誰の・いつの操作かで絞る
- **復元コマンドをコピー** — 該当操作から復旧するための git コマンドをクリップボードへ
- 記録の保持日数は `anytimeAgent.gitActivityRetentionDays`（既定 90 日）

### Worktree 所有状況

どの worktree をどのセッションが使用中かを一覧します。並行作業を始める前に、同じ作業ツリーに別セッションがいないかを確認できます。worktree の作成・切替コマンドはコンテキストメニューからコピーできます。

### 作業スナップショット

未コミットの作業（untracked ファイルを含む）を `refs/anytime/snapshots/` へ定期的に退避します。**作業ツリーには一切触れない非破壊方式**で、`git stash` のように編集中の内容を引き剥がしません。

- 取得間隔は `anytimeAgent.workSnapshotIntervalMinutes`（既定 15 分。`0` で無効）
- 保持日数は `anytimeAgent.workSnapshotRetentionDays`（既定 7 日）
- コマンドパレットの `Anytime Agent: 作業スナップショットを表示` から一覧・復元


## 6. AI ノート

画像・表・自由記述のメモといった視覚情報を、画面を直接見られない AI ツールに共有します。

- **複数ページのノート** — ノートページの追加・削除が可能。各ページは Anytime Markdown エディタで開く
- **ワークスペースローカル保存** — ノートはワークスペースの `.anytime/notes/` に保存
- **同梱スキル** — `.claude/skills/` に `anytime-note` スキルを配置し、AI が依頼に応じてノートを読み取れる


## 7. 同梱スキル

拡張は有効化時にワークスペースの `.claude/skills/` へ Claude Code スキルを配置します:

| スキル | 用途 |
| --- | --- |
| `anytime-note` | AI が AI ノートのページ（画像・表・メモ）を読み取って作業する |
| `anytime-dev-cycle` | 開発フロー全体、サブエージェント回転、Codex / ollama 委譲を統合した基本スキル |
| `anytime-cross-review` | Claude と Codex が同一 diff を独立レビューし、指摘を相互検証する |
| `anytime-impl-test-design` | 実装後にどのテストを書くかを決める（配線・mount・i18n の検知ギャップ対策） |
| `anytime-proposal` | 提案書（RFC / ADR / 軽量提案）を思考法ガイド付きで生成する |
| `anytime-debrief` | セッションを締めて構造化デブリーフ（達成度・未解決事項・懸念点）を出力する |
| `anytime-dev-audit` | PC 環境と Claude Code 設定を read-only で診断し、最適化プランを提示する |
| `anytime-build-webapp` | Web アプリ・フルスタック MVP の雛形を新規生成する |
| `anytime-loop-start` / `anytime-loop-stop` | `.tickets/` のチケットを 1 件ずつ自動実行するループを開始・停止する |


## 8. 設定

### 8.1 セッション表示

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeAgent.contextWarnTokens` | `160000` | セッションのコンテキストトークンがこの値を超えたら引き継ぎ推奨の ⚠️ バッジを表示 |
| `anytimeAgent.sessionRetentionDays` | `7` | 未使用セッションを agent-status DB から自動削除するまでの保持日数。Codex セッションの表示範囲もこの日数で絞り込む |
| `anytimeAgent.showCodexSessions` | `true` | Agent マッピングに読み取り専用の **Codex** セッショングループを表示する |
| `anytimeAgent.showUsage` | `true` | Claude Code グループにサブスクリプション使用量を表示する |
| `anytimeAgent.usageRefreshSeconds` | `600` | 使用量の再取得間隔（秒）。300 秒未満は 300 秒に丸められる。レート制限回避のため 10 分間の共有キャッシュを使う |

### 8.2 トークンバジェット

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeAgent.budget.dailyLimitTokens` | `null` | 日次トークン上限。`null` で無効 |
| `anytimeAgent.budget.sessionLimitTokens` | `null` | セッションあたりのトークン上限。`null` で無効 |
| `anytimeAgent.budget.alertThresholdPct` | `80` | 上限に対する警告閾値（%） |

### 8.3 作業の保護

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeAgent.gitActivityRetentionDays` | `90` | git 活動の記録を agent-status DB に保持する日数 |
| `anytimeAgent.workSnapshotIntervalMinutes` | `15` | 未コミット作業を `refs/anytime/snapshots/` へ退避する間隔（分）。`0` で無効。1〜4 は 5 として扱う |
| `anytimeAgent.workSnapshotRetentionDays` | `7` | スナップショットの ref を保持する日数 |

### 8.4 スキル・チケット連携

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeAgent.claudeMdGuidance` | `true` | 有効化時にワークスペースの `CLAUDE.md` へ管理ブロックを upsert し、開発指示の基本スキルを `anytime-dev-cycle` にする。書き換えはマーカー内のみで本文には触れない |
| `anytimeAgent.tickets.directory` | `""` | `anytime-loop-start` が使うチケットリポジトリの場所。未設定時はワークスペース直下の `.tickets/` → 環境変数 `ANYTIME_TICKETS_DIR` の順で解決 |
| `anytimeAgent.tickets.workspace` | `""` | 自動実行の対象を絞り込むワークスペース識別子。未設定時はワークスペースルートのディレクトリ名で判定するため通常は設定不要 |


## 9. ライセンス

MIT
