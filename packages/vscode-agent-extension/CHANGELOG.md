# Change Log

All notable changes to the "Anytime Agent" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.3.0] - 2026-06-03

### Added

- Spawn an agent-status worker and display per-agent commit information (committed count / last commit).
- Route Claude hooks and the status watcher through the agent-status worker (`vscode-common`).

### Agent Core (agent-core)

- Added a `node:sqlite` agent-status store with worker and client.
- Carry `committedCount` / `lastCommit` through the agent mapping; seed commits without a phantom `last_commit`.
- Partial-update edit semantics and a delete endpoint.

## [0.2.2] - 2026-05-24

### Changed

- `agent-core` now re-exports the Ollama throttle governor / decorator, making throttle control available to agent-side consumers

## [0.2.1] - 2026-05-20

### Security

- Replaced polynomial-redos trailing-slash regex in `claudeHookSetup` with an O(n) `charCodeAt` scan (CodeQL #818, `vscode-common`)

### Agent Core (agent-core / ollama-core)

- Fixed Ollama split-brain: health-check and ingest now resolve `baseUrl` via a unified `resolveOllamaBaseUrl` helper (priority: `OLLAMA_BASE_URL` env > explicit config > Dev Container auto-detect > localhost). Re-exported from `agent-core` for downstream consumers
- Fixed polynomial-redos in `OllamaChatProvider` / `OllamaEmbeddingProvider` trailing-slash handling — replaced `/\/+$/` regex with O(n) `charCodeAt` scan via `stringUtils.stripTrailingSlashes` (CodeQL #815/#816)

## [0.2.0] - 2026-05-17

### Added

- AI Note panel migrated from Anytime Trail. The `anytimeAgent.aiNote`
  view appears at the top of the Agent activity bar and exposes 7
  `anytime-agent.openAiNote*` commands. Notes are stored under the
  workspace `.anytime/notes/` and a templated `anytime-note` Claude Code
  skill is installed at `.claude/skills/anytime-note/SKILL.md` (paths
  unchanged from trail extension to preserve existing notes).
- Bundled MIT `LICENSE` file in the VSIX. `package.json` already declared `"license": "MIT"`, but the file itself was missing from the published extension

### Changed

- Documentation references to AI Note now point to this extension

## [0.1.0] - 2026-05-16

### Added

- Initial release. VS Code extension that surfaces Anytime agent state in the Activity Bar
- Activity Bar `Anytime Agent` panel with two views:
  - `anytimeAgent.mapping`: Agent ↔ worktree / session mapping with stale-filter toggle
  - `anytimeAgent.ollama`: Local Ollama runtime status with start command
- Commands:
  - `anytime-agent.mapping.refresh`
  - `anytime-agent.mapping.cleanupStale`
  - `anytime-agent.mapping.toggleStale`
  - `anytime-agent.mapping.openWorktree`
  - `anytime-agent.mapping.copyWorktreePath`
  - `anytime-agent.mapping.showSessionEdits`
  - `anytime-agent.mapping.copySessionId`
  - `anytime-agent.mapping.deleteStatusFile`
  - `anytime-agent.startOllama`
- Configuration:
  - `anytimeAgent.claudeStatus.directory` (default `.anytime/trail/agent-status`)
  - `anytimeAgent.budget.dailyLimitTokens`
  - `anytimeAgent.budget.sessionLimitTokens`
  - `anytimeAgent.budget.alertThresholdPct` (default 80)
- Agent mapping moved into the new `@anytime-markdown/agent-core` package (extracted from `trail-core`)
