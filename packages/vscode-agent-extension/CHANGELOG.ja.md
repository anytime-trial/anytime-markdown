# 変更履歴

"Anytime Agent" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [1.4.0] - 2026-07-13

### 追加

- ワークスペース `CLAUDE.md` への `anytime-dev-cycle` 誘導ブロックを追加しました。activate 時に管理マーカー内のみを冪等 upsert し、開発指示の基本スキルを同スキルにします。`anytimeAgent.claudeMdGuidance` で無効化できます。
- `anytime-dev-cycle` プリフライト（`preflight.cjs`）を追加しました。必須前提（git/develop・docs リポ・スキル完全性）と任意の委譲ランタイム（codex CLI・ollama プロファイル・agent-core）、事前調査（未完了プラン・git 概況）を検査します。マーカー `.anytime/dev-cycle-preflight.json` による初回必須実行とスキル更新時の再実行を持ち、`--check` で診断のみ実行できます。

### 変更

- 旧 `anytime-agent-rotation` と `anytime-delegation` スキルを `anytime-dev-cycle` へ統合しました。旧スキル名は同梱スキルの移行 alias で掃除されます。
- サブエージェントの用途別モデル表（haiku / sonnet / opus / fable）をグローバル `CLAUDE.md` から `anytime-dev-cycle` §3.1 へ移管しました。モデル・effort の階層化がスキルと一緒に配布されます。

### セキュリティ

- `agent-core` のトランスクリプト env 行伏字化に含まれる ReDoS を解消しました（CodeQL 指摘）。
- `agent-core` でユーザー入力をログのフォーマット文字列として渡さないようにしました。

## [1.3.0] - 2026-07-12

### 追加

- AGENT マッピングにアカウントごとの Claude Code 使用量（%）を表示するようにしました。消費率はローカルファイルに存在しないため `/api/oauth/usage` から取得します。未知の使用量枠種別は黙って捨てず warn ログに出します。
- Codex グループにも Claude グループと同様に Usage（%）と Today を表示するようにしました。
- 同梱スキルを 4 本追加しました（`anytime-delegation`: Codex CLI / ローカル ollama への委譲、`anytime-dev-cycle`、`anytime-impl-test-design`、`anytime-proposal`）。`.claude/skills/` へ自動配置されるため、グローバル環境がなくても利用できます。

### 変更

- `codex-delegation` と `anytime-ollama-delegation` を `anytime-delegation` へ統合しました。委譲先の選択・委譲契約 6 点・中断（abstain）の出口を 1 スキルで扱います。

### 修正

- `limits` を解釈できない時に使用量表示ごと消えてしまう問題を修正しました（フォールバック表示に切り替わります）。
- `rate_limits` を持たない Codex rollout ファイルで、スキャンのたびに tail を 1MB まで読み上げていた性能問題を修正しました。

### セキュリティ

- 使用量取得の外側 catch でもトークンをサニタイズし、失敗経路からログへ漏れないようにしました。

## [1.2.0] - 2026-07-12

### 追加

- AGENT マッピングをワークスペース単位で階層表示するようにしました。複数ワークスペースのセッションがフラットに並ばなくなり、hover のワークスペース名も見出しと同じ解決済みパスを表示します。
- ローカル ollama へのタスク委譲スキル `anytime-ollama-delegation` を同梱しました。PC の実効 VRAM とモデルの capability を実測し、実証テスト（スモークベンチ）の合否で委譲可否を判定します。モデルを入れ替えると判定が自動的に更新され、結果はレポートとして出力されます。

### 変更

- 同梱の `anytime-cross-review` スキルの参照を、改名後の指摘書式 `anytime-trail-review` へ更新しました。
- 同梱スキルの `.cjs` テストを jest のゲート対象に含めました（従来 `roots` が `src` のみだったため、`codex-review.test.cjs` は実行されていませんでした）。

## [1.1.1] - 2026-07-11

### 修正

- agent-status hook を hook 実行時の cwd からの walk-up 解決に変更（`settings.json` への絶対パス焼き込みを撤廃）し、複数ワークスペース同時起動時のステータス誤配信を修正。報告するブランチも cwd 基準（worktree 対応）にしました。

### 変更

- 同梱の `anytime-cross-review` スキルを、改名された `anytime-review` 指摘書式の参照へ更新。

## [1.1.0] - 2026-07-11

### 追加

- `anytime-cross-review` スキルを同梱し、`.claude/skills/` へ自動配置するようにしました。異なるエージェント（Claude / Codex）による相互レビューを目的とするスキルのため、配布元を Anytime Trail 拡張から本拡張へ移行しました。

## [1.0.1] - 2026-07-02

### 追加

- Agent 委任契約: 返却契約に abstention 出口（`taskStatus` / `abstainReason`、additive optional）を追加し、委任先サブエージェントがタスクを辞退できるようにした。`anytime-agent-rotation` スキルに対応するハンドリングを追加。

## [1.0.0] - 2026-06-27

### 変更

- Stop フックスクリプト `trail-token-budget.sh` を `token-budget.sh` にリネーム。setup 時に旧スクリプトと stale なフックエントリを掃除する。
- Agent マッピングツリーを、worktree/ブランチでグルーピングせずセッションをフラットに（最近使用順・新しい順で）並べるようにした。各セッションの hover（tooltip）に最後に利用したブランチ名と worktree 名を表示する。worktree ノードとその `Open Worktree` / `Copy Worktree Path` コマンドは削除した。
- Agent マッピングツリーのセッション経過時間を、1 時間以上は `Xh Ymin ago` 形式で表示するようにした（従来は分のみ。例 `135 min ago`）。
- Agent マッピングツリーのセッション行からコミット数（`committed(N)`）の表示を削除した。コミット数はセッションの hover（tooltip）と Today サマリ行には引き続き表示する。
- セッションのタイトル/最終ファイル名を Agent マッピングツリーの行から削除した。タイトルは hover（tooltip）に **タイトル** として表示し、最終ファイル名はツリーに表示しない。

### 追加

- セッション引き継ぎ: セッションツリーの **新セッションへ引き継ぎ** コマンドで、圧縮した文脈保持ステート（決定論的な recall 抽出）を agent-status ワーカーの `/handoff` エンドポイント経由で fresh な Claude Code セッションへ引き継ぐ。コンテキストが肥大したセッションには引き継ぎ推奨バッジを表示する。
- Agent マッピングツリーをソース別に **Claude Code** と **Codex** の見出しでグルーピング。現在のワークスペースの Codex（OpenAI CLI）セッションを Codex rollout ファイル（`~/.codex/sessions`）の読み取り専用スキャンで表示する（保持期間内かつ作業ディレクトリが現ワークスペースの worktree 配下のもののみ）。Codex はライフサイクルフックを持たないため **最終アクティビティ** と **コンテキストトークン**（⚠️ handoff ヒントバッジ）のみ利用可能で、編集ロック・コミット数・引き継ぎは Claude 限定。`anytimeAgent.showCodexSessions`（既定 on）で切替。**Today** サマリは Claude 限定として明記。
- 未使用セッションの定期削除: agent-status ワーカーが、最終アクティビティから保持期間を超えたセッションを起動時および 1 日ごとに DB から削除します。保持期間は `anytimeAgent.sessionRetentionDays`（既定 7 日）で設定可能です。

### 削除

- 「セッション編集履歴を表示」（セッションツリー右クリックの QuickPick とツールチップの **Edits:** 一覧）を削除。編集履歴は分かりづらいため撤去しました。内部の `session_edits` 記録は維持します（handoff の変更ファイルは transcript から独立して導出するため影響なし）。

## [0.3.3] - 2026-06-24

### 変更

- `anytimeAgent.claudeStatus.directory` 設定を削除。エージェントのステータスは agent-status データベースで管理するようになり、旧 `claude-code-status.json` ファイルパスは不要になりました。
- `session-guard.sh` の警告デデュープ state ファイル（`claude-session-guard.json`）を `.anytime/trail/state/` から `.anytime/agent/` 配下へ移動し、エージェント所有の state を agent ホーム配下へ集約。

## [0.3.2] - 2026-06-13

### 変更

- 拡張機能アイコンとアクティビティバーアイコンを camel ブランディングに変更。

## [0.3.1] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.3.0] - 2026-06-03

### 追加

- agent-status ワーカーを起動し、エージェントごとのコミット情報 (コミット数 / 最終コミット) を表示。
- Claude hooks とステータスウォッチャーを agent-status ワーカー経由に変更 (`vscode-common`)。

### Agent Core (agent-core)

- `node:sqlite` ベースの agent-status ストア・ワーカー・クライアントを追加。
- `committedCount` / `lastCommit` をエージェントマッピングに貫通。phantom な `last_commit` なしでコミットを seed。
- 部分更新の編集セマンティクスと delete エンドポイントを追加。

## [0.2.2] - 2026-05-24

### 変更

- `agent-core` が Ollama throttle governor / decorator を re-export するようになり、エージェント側からスロットル制御を利用可能に

## [0.2.1] - 2026-05-20

### セキュリティ

- `claudeHookSetup` の末尾スラッシュ正規表現を O(n) の `charCodeAt` スキャンに置き換え (CodeQL #818, `vscode-common`)

### Agent Core (agent-core / ollama-core)

- Ollama split-brain を解消: ヘルスチェックと実取込で共通の `resolveOllamaBaseUrl` ヘルパーを使用するよう統一 (優先順位: `OLLAMA_BASE_URL` env > 明示設定 > Dev Container 自動検出 > localhost)。`agent-core` から re-export 済み
- `OllamaChatProvider` / `OllamaEmbeddingProvider` の末尾スラッシュ処理で polynomial-redos を修正 — `/\/+$/` 正規表現を `stringUtils.stripTrailingSlashes` による O(n) の `charCodeAt` スキャンに置き換え (CodeQL #815/#816)

## [0.2.0] - 2026-05-17

### 追加

- Anytime Trail 拡張から AI ノートパネルを移行しました。
  `anytimeAgent.aiNote` view が Agent アクティビティバー先頭に表示され、
  7 個の `anytime-agent.openAiNote*` コマンドを提供します。\
  ノートはワークスペース直下 `.anytime/notes/` に保存され、テンプレ
  ート展開された `anytime-note` Claude Code スキルが
  `.claude/skills/anytime-note/SKILL.md` に配置されます（保存先パスは
  trail 拡張と同一で、既存ノートをそのまま引き継げます）。
- VSIX に MIT `LICENSE` ファイルを同梱。`package.json` では `"license": "MIT"` を宣言済みだったが、公開拡張機能本体にライセンス全文が含まれていなかったため追加

### 変更

- AI ノートに関するドキュメントリンクを本拡張に向け直し

## [0.1.0] - 2026-05-16

### 追加

- 初回リリース。Anytime エージェントの状態をアクティビティバーに表示する VS Code 拡張
- Activity Bar `Anytime Agent` パネル（2 ビュー構成）:
  - `anytimeAgent.mapping`: エージェント ↔ worktree / session マッピング（stale フィルタ切替対応）
  - `anytimeAgent.ollama`: ローカル Ollama ランタイムの状態と起動コマンド
- コマンド:
  - `anytime-agent.mapping.refresh`
  - `anytime-agent.mapping.cleanupStale`
  - `anytime-agent.mapping.toggleStale`
  - `anytime-agent.mapping.openWorktree`
  - `anytime-agent.mapping.copyWorktreePath`
  - `anytime-agent.mapping.showSessionEdits`
  - `anytime-agent.mapping.copySessionId`
  - `anytime-agent.mapping.deleteStatusFile`
  - `anytime-agent.startOllama`
- 設定:
  - `anytimeAgent.claudeStatus.directory` (既定 `.anytime/trail/agent-status`)
  - `anytimeAgent.budget.dailyLimitTokens`
  - `anytimeAgent.budget.sessionLimitTokens`
  - `anytimeAgent.budget.alertThresholdPct` (既定 80)
- エージェントマッピングを新パッケージ `@anytime-markdown/agent-core` に移動（`trail-core` から分離）
