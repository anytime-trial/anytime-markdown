# Anytime Agent

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-agent-extension/README.md)

**すべての Claude Code セッションを一目で把握 — VS Code だけで完結。**

複数の Claude Code セッションを worktree やブランチをまたいで動かしていると、どのセッションが何をしているのか、どれが肥大化しているのかが分かりにくくなります。

Anytime Agent は、すべての Claude Code セッションを一覧するアクティビティバーパネルを追加し、肥大化したセッションを文脈を保持したまま新セッションへ引き継ぎ、AI ノートで視覚情報を AI に共有します。


## 1. できること

- **Agent マッピング** — すべての Claude Code セッションを最近のアクティビティ順のフラットな一覧で表示し、ブランチ・worktree・コミット情報をホバーで確認
- **セッション引き継ぎ** — 文脈が肥大化したセッションを、作業の圧縮要約を保持したまま新しいセッションへ移行
- **AI ノート** — 画像・表・メモを AI ツールに共有し、視覚情報をもとに作業させる


## 2. はじめかた

アクティビティバーの **Anytime Agent** アイコンを開きます。パネルには **AI ノート**・**Agent マッピング** の 2 つのビューがあります。

本拡張は有効化時に Claude Code のフックを `~/.claude/settings.json` へ自動登録します。フックはセッションの活動（編集・ブランチ・コミット）を拡張同梱の agent-status ワーカーへ報告し、Agent マッピングビューがそれを読み取って表示します。他の拡張は不要です。

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


## 5. AI ノート

画像・表・自由記述のメモといった視覚情報を、画面を直接見られない AI ツールに共有します。

- **複数ページのノート** — ノートページの追加・削除が可能。各ページは Anytime Markdown エディタで開く
- **ワークスペースローカル保存** — ノートはワークスペースの `.anytime/notes/` に保存
- **同梱スキル** — `.claude/skills/` に `anytime-note` スキルを配置し、AI が依頼に応じてノートを読み取れる


## 6. 同梱スキル

拡張は有効化時にワークスペースの `.claude/skills/` へ Claude Code スキルを配置します:

| スキル | 用途 |
| --- | --- |
| `anytime-note` | AI が AI ノートのページ（画像・表・メモ）を読み取って作業する |
| `anytime-agent-rotation` | 長い多段作業をサブエージェントに任せるときのコストを抑える |
| `anytime-cross-review` | Claude と Codex が同一 diff を独立レビューし、指摘を相互検証する |
| `anytime-ollama-delegation` | ローカル ollama へ委譲できるタスクかを実測ベンチで判定する |
| `anytime-dev-cycle` | 提案 → 仕様 → 計画 → 実装 → レビュー → マージを一気通貫で回す |
| `anytime-impl-test-design` | 実装後にどのテストを書くかを決める（配線・mount・i18n の検知ギャップ対策） |
| `anytime-proposal` | 提案書（RFC / ADR / 軽量提案）を思考法ガイド付きで生成する |
| `codex-delegation` | Codex（`codex exec`）へ作業を委任する際の委任契約ルール |


## 7. 設定

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeAgent.contextWarnTokens` | `160000` | セッションのコンテキストトークンがこの値を超えたら引き継ぎ推奨の ⚠️ バッジを表示 |
| `anytimeAgent.sessionRetentionDays` | `7` | 未使用セッションを DB から自動削除するまでの未使用日数。Codex セッションの表示範囲もこの日数で絞り込む |
| `anytimeAgent.showCodexSessions` | `true` | Agent マッピングに読み取り専用の **Codex** セッショングループを表示する |
| `anytimeAgent.budget.dailyLimitTokens` | `null` | 日次トークン上限。`null` で無効 |
| `anytimeAgent.budget.sessionLimitTokens` | `null` | セッションあたりのトークン上限。`null` で無効 |
| `anytimeAgent.budget.alertThresholdPct` | `80` | 上限に対する警告閾値（%） |


## 8. ライセンス

MIT
