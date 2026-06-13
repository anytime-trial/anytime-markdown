# 変更履歴

"Anytime Agent" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

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
