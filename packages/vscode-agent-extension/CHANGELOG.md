# Change Log

All notable changes to the "Anytime Agent" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
