# 変更履歴

"Anytime Agent" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

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
